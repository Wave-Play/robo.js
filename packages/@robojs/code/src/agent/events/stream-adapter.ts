/**
 * Stream adapter for converting LangGraph events to AgentEvents
 *
 * Transforms the raw LangGraph stream updates into the UI-facing
 * AgentEvent protocol.
 */

import { AIMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages'
import type { AgentEvent, StreamOptions, DebugEvent } from '../../types/events.js'
import { isDebugEvent } from '../../types/events.js'
import type { AgentState } from '../state.js'
import { codeLogger } from '../../core/logger.js'

/**
 * LangGraph stream event structure
 * Matches the events emitted by graph.streamEvents()
 */
export interface StreamEvent {
	event: string
	data: unknown
	name?: string
}

/**
 * Stream adapter configuration
 */
export interface StreamAdapterConfig {
	/**
	 * Run ID for event attribution
	 */
	runId: string

	/**
	 * Run mode (plan, execute, explain)
	 * Used to initialize mode tracking for plan_complete detection
	 */
	mode: string

	/**
	 * Stream options for filtering events
	 */
	options?: StreamOptions

	/**
	 * Debug mode for deep inspection
	 * When true, emits additional debug events
	 */
	debugMode?: boolean

	/**
	 * Callback for emitting events
	 */
	onEvent: (event: AgentEvent) => void
}

/**
 * Default stream options
 */
const DEFAULT_OPTIONS: Required<StreamOptions> = {
	includeText: true,
	includePlan: true,
	includeProgress: true,
	includeRationales: true,
	includeToolCalls: true,
	includeToolResults: true,
	includeMcpCalls: true,
	includeMcpResults: true,
	includeDebugEvents: false
}

/**
 * Stream adapter for LangGraph events
 *
 * Converts LangGraph stream updates into AgentEvents:
 * - on_chain_start/end → phase events
 * - on_chat_model_stream → llm_text events
 * - on_tool_start → tool_call events
 * - on_tool_end → tool_result events
 * - State updates → progress, plan, question, etc.
 */
export class StreamAdapter {
	private readonly runId: string
	private readonly options: Required<StreamOptions>
	private readonly onEvent: (event: AgentEvent) => void
	private readonly debugMode: boolean
	private lastPhase: string | null = null
	private lastMode: string | null = null
	private lastStep: number = -1
	private emittedMessageIds: Set<string> = new Set()
	private planCompleteEmitted: boolean = false
	private previousState: Partial<AgentState> = {}

	constructor(config: StreamAdapterConfig) {
		this.runId = config.runId
		this.options = { ...DEFAULT_OPTIONS, ...config.options }
		this.onEvent = config.onEvent
		this.debugMode = config.debugMode ?? false
		// Initialize lastMode from config so plan_complete can be detected
		// even when nodes don't return mode in their partial state updates
		this.lastMode = config.mode
	}

	/**
	 * Process a LangGraph stream event
	 */
	processStreamEvent(event: StreamEvent): void {
		const { event: eventType, data, name } = event

		switch (eventType) {
			case 'on_chain_start':
				this.handleChainStart(name, data)
				break

			case 'on_chain_end':
				this.handleChainEnd(name, data)
				break

			case 'on_chat_model_stream':
				this.handleChatModelStream(data)
				break

			case 'on_tool_start':
				this.handleToolStart(name, data)
				break

			case 'on_tool_end':
				this.handleToolEnd(name, data)
				break

			case 'on_chain_stream':
				// State updates come through chain stream
				this.handleChainStream(data)
				break
		}
	}

	/**
	 * Process a state update directly
	 */
	processStateUpdate(state: Partial<AgentState>): void {
		// Track mode changes (need to persist across partial updates)
		if (state.mode) {
			this.lastMode = state.mode
		}

		// Phase change
		if (state.phase && state.phase !== this.lastPhase) {
			this.lastPhase = state.phase
			this.emit({ type: 'phase', phase: state.phase })
		}

		// Extract text from new AIMessages (for explain mode and final responses)
		if (state.messages && this.options.includeText) {
			this.emitNewMessageContent(state.messages)
		}

		// Plan update
		if (state.plan && state.plan.length > 0 && this.options.includePlan) {
			this.emit({ type: 'plan', steps: state.plan })
		}

		// Plan complete - emit when plan mode finishes with acceptance criteria
		// This signals that user can "accept" the plan and continue to execute mode
		// Note: Use lastMode because partial state updates may not include mode
		const currentMode = state.mode ?? this.lastMode

		// Debug logging for plan_complete detection (gated behind debugMode)
		if (this.debugMode && (state.acceptance || state.phase === 'planner_done')) {
			codeLogger.debug('[StreamAdapter] Plan complete check', {
				currentMode,
				lastMode: this.lastMode,
				hasAcceptance: !!state.acceptance,
				hasPendingQuestion: !!state.pendingQuestion,
				planCompleteEmitted: this.planCompleteEmitted,
				includePlan: this.options.includePlan,
				phase: state.phase
			})
		}

		if (
			currentMode === 'plan' &&
			state.acceptance &&
			!state.pendingQuestion &&
			!this.planCompleteEmitted &&
			this.options.includePlan
		) {
			if (this.debugMode) {
				codeLogger.debug('[StreamAdapter] Emitting plan_complete')
			}
			this.planCompleteEmitted = true
			this.emit({
				type: 'plan_complete',
				runId: this.runId,
				acceptance: state.acceptance,
				plan: state.plan ?? []
			})
		}

		// Progress update
		if (state.currentStep !== undefined && state.currentStep !== this.lastStep && this.options.includeProgress) {
			this.lastStep = state.currentStep
			const step = state.plan?.[state.currentStep]
			if (step) {
				this.emit({
					type: 'progress',
					step: state.currentStep + 1,
					of: state.plan?.length ?? 1,
					label: step.title
				})
			}
		}

		// Question interrupt
		if (state.pendingQuestion) {
			this.emit({
				type: 'question',
				runId: this.runId,
				text: state.pendingQuestion.text,
				choices: state.pendingQuestion.choices
			})
		}

		// Approval required
		if (state.awaitingApproval && state.pendingChanges && state.pendingChanges.length > 0) {
			this.emit({
				type: 'approval_required',
				runId: this.runId,
				changes: state.pendingChanges,
				diffs: state.pendingDiffs
			})
		}

		// File proposed
		if (state.pendingChanges && state.pendingChanges.length > 0 && !state.awaitingApproval) {
			this.emit({
				type: 'file_proposed',
				changes: state.pendingChanges,
				diffs: state.pendingDiffs
			})
		}

		// Completion
		if (state.completionSummary) {
			this.emit({
				type: 'complete',
				summary: state.completionSummary,
				changes: state.appliedChanges ?? [],
				verification: state.lastVerification ?? undefined
			})
		}

		// Abort
		if (state.aborted && state.abortReason) {
			this.emit({
				type: 'abort',
				reason: state.abortReason
			})
		}

		// Budget exceeded
		if (state.budgetExceeded) {
			this.emit({
				type: 'abort',
				reason: `Budget exceeded after ${state.iterations} iterations`
			})
		}

		// Profile detected
		if (state.projectProfile) {
			this.emit({
				type: 'profile',
				profile: state.projectProfile
			})
		}

		// Retry
		if (state.iterations && state.iterations > 1 && state.lastVerification) {
			// Extract error reason from verification results
			let reason = 'Verification failed'
			if (state.lastVerification.build?.errors?.length) {
				reason = state.lastVerification.build.errors[0].message
			} else if (state.lastVerification.tests?.failures?.length) {
				reason = state.lastVerification.tests.failures[0].message
			} else if (state.lastVerification.mock?.scenarios?.some((s) => s.error)) {
				const failedScenario = state.lastVerification.mock.scenarios.find((s) => s.error)
				reason = failedScenario?.error ?? 'Mock scenario failed'
			}
			this.emit({
				type: 'retry',
				iteration: state.iterations,
				reason
			})
		}

		// Debug mode: Emit state update events for changed fields
		if (this.debugMode && this.options.includeDebugEvents) {
			this.emitDebugStateUpdates(state)
		}

		// Update previous state for next comparison
		this.previousState = { ...this.previousState, ...state }
	}

	/**
	 * Emit debug state update events for changed fields
	 */
	private emitDebugStateUpdates(state: Partial<AgentState>): void {
		const timestamp = Date.now()

		// Fields to track for state updates (excluding messages which can be large)
		const trackableFields: (keyof AgentState)[] = [
			'mode',
			'phase',
			'instruction',
			'plan',
			'currentStep',
			'acceptance',
			'acceptanceStatus',
			'pendingQuestion',
			'lastAnswer',
			'projectProfile',
			'projectIndex',
			'projectOverview',
			'pendingChanges',
			'pendingDiffs',
			'lastVerification',
			'appliedChanges',
			'appliedDiffs',
			'summary',
			'awaitingApproval',
			'approved',
			'approvalReason',
			'aborted',
			'abortReason',
			'completionSummary',
			'iterations',
			'budgetExceeded',
			'limitReached',
			'limitContinue'
		]

		for (const field of trackableFields) {
			if (field in state) {
				const newValue = state[field]
				const oldValue = this.previousState[field]

				// Only emit if value actually changed (simple comparison for primitives)
				// For objects, we always emit since deep comparison is expensive
				const isPrimitive = typeof newValue !== 'object' || newValue === null
				const hasChanged = isPrimitive ? newValue !== oldValue : true // Always emit for objects since they likely changed

				if (hasChanged) {
					this.emit({
						type: 'debug_state_update',
						field,
						oldValue: oldValue ?? null,
						newValue,
						timestamp
					} as DebugEvent)
				}
			}
		}
	}

	/**
	 * Handle chain start events
	 */
	private handleChainStart(name: string | undefined, _data: unknown): void {
		if (name) {
			// Node names become phases
			this.emit({ type: 'phase', phase: name })
			this.lastPhase = name
		}
	}

	/**
	 * Handle chain end events
	 */
	private handleChainEnd(_name: string | undefined, _data: unknown): void {
		// Could emit phase completion if needed
	}

	/**
	 * Handle chat model stream events (LLM text deltas)
	 */
	private handleChatModelStream(data: unknown): void {
		if (!this.options.includeText) return

		// Extract text delta from various formats
		const chunk = data as { chunk?: { content?: string | Array<{ type: string; text?: string }> } }
		let text: string | undefined

		if (chunk?.chunk?.content) {
			if (typeof chunk.chunk.content === 'string') {
				text = chunk.chunk.content
			} else if (Array.isArray(chunk.chunk.content)) {
				// Handle content blocks (Anthropic format)
				for (const block of chunk.chunk.content) {
					if (block.type === 'text' && block.text) {
						text = block.text
						break
					}
				}
			}
		}

		if (text) {
			this.emit({ type: 'llm_text', delta: text })
		}
	}

	/**
	 * Handle tool start events
	 */
	private handleToolStart(name: string | undefined, data: unknown): void {
		if (!name) return

		const toolData = data as { input?: unknown }
		const args = toolData?.input ?? {}

		// Check if MCP tool (would have serverId in metadata)
		const isMcp = (data as { metadata?: { serverId?: string } })?.metadata?.serverId

		if (isMcp) {
			if (!this.options.includeMcpCalls) return
			this.emit({
				type: 'mcp_call',
				source: 'mcp',
				serverId: isMcp,
				tool: name,
				args
			})
		} else {
			if (!this.options.includeToolCalls) return
			this.emit({
				type: 'tool_call',
				source: 'core',
				name,
				args
			})
		}
	}

	/**
	 * Handle tool end events
	 */
	private handleToolEnd(name: string | undefined, data: unknown): void {
		if (!name) return

		const toolData = data as { output?: unknown }
		const result = toolData?.output ?? {}

		// Check if MCP tool
		const isMcp = (data as { metadata?: { serverId?: string } })?.metadata?.serverId

		if (isMcp) {
			if (!this.options.includeMcpResults) return
			this.emit({
				type: 'mcp_result',
				source: 'mcp',
				serverId: isMcp,
				tool: name,
				result
			})
		} else {
			if (!this.options.includeToolResults) return
			this.emit({
				type: 'tool_result',
				source: 'core',
				name,
				result
			})
		}
	}

	/**
	 * Handle chain stream events (state updates)
	 */
	private handleChainStream(data: unknown): void {
		// State updates flow through chain stream
		const state = data as Partial<AgentState>
		if (state && typeof state === 'object') {
			this.processStateUpdate(state)
		}
	}

	/**
	 * Emit text content from new AIMessages
	 *
	 * This handles cases where streaming doesn't work (e.g., explain mode)
	 * and we need to extract text from the final AIMessage in state.
	 */
	private emitNewMessageContent(messages: BaseMessage[]): void {
		for (const msg of messages) {
			// Only process AIMessages
			if (!(msg instanceof AIMessage)) continue

			// Skip if we already emitted this message
			const msgId = msg.id ?? `msg-${messages.indexOf(msg)}`
			if (this.emittedMessageIds.has(msgId)) continue

			// Skip messages with tool calls (those are handled separately)
			if (msg.tool_calls && msg.tool_calls.length > 0) continue

			// Extract text content
			const text = this.extractTextFromMessage(msg)
			if (text) {
				this.emit({ type: 'llm_text', delta: text })
				this.emittedMessageIds.add(msgId)
			}
		}
	}

	/**
	 * Extract text content from an AIMessage
	 */
	private extractTextFromMessage(msg: AIMessage): string | null {
		const content = msg.content

		// String content
		if (typeof content === 'string') {
			return content || null
		}

		// Array of content blocks (Anthropic format)
		if (Array.isArray(content)) {
			const textParts: string[] = []
			for (const block of content) {
				if (typeof block === 'string') {
					textParts.push(block)
				} else if (block && typeof block === 'object' && 'type' in block) {
					if (block.type === 'text' && 'text' in block && typeof block.text === 'string') {
						textParts.push(block.text)
					}
				}
			}
			return textParts.join('') || null
		}

		return null
	}

	/**
	 * Emit an event
	 */
	private emit(event: AgentEvent): void {
		this.onEvent(event)
	}
}

/**
 * Create a stream adapter
 */
export function createStreamAdapter(config: StreamAdapterConfig): StreamAdapter {
	return new StreamAdapter(config)
}

/**
 * Convert messages to tool events
 *
 * Useful for extracting tool events from message history.
 */
export function extractToolEventsFromMessages(messages: BaseMessage[], options: StreamOptions = {}): AgentEvent[] {
	const events: AgentEvent[] = []
	const opts = { ...DEFAULT_OPTIONS, ...options }

	for (const msg of messages) {
		if (msg instanceof AIMessage && msg.tool_calls) {
			for (const call of msg.tool_calls) {
				if (opts.includeToolCalls) {
					events.push({
						type: 'tool_call',
						source: 'core',
						name: call.name,
						args: call.args
					})
				}
			}
		}

		if (msg instanceof ToolMessage) {
			if (opts.includeToolResults) {
				events.push({
					type: 'tool_result',
					source: 'core',
					name: msg.name || 'unknown',
					result: msg.content
				})
			}
		}
	}

	return events
}
