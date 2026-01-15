/**
 * Agent node - main LLM reasoning loop
 */

import { AIMessage, HumanMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages'
import type { AgentState, AgentStateUpdate, TokenUsage } from '../state.js'
import { DEFAULT_TOKEN_USAGE } from '../state.js'
import type { ToolSchema } from '../../tools/types.js'
import type { CodeAgentContext } from '../types.js'
import { codeLogger } from '../../core/logger.js'
import { ContextCompactor } from '../compaction/index.js'
import {
	createSystemPromptEvent,
	createLlmMetaEvent,
	createTokenUsageEvent,
	createContextCompactedEvent
} from '../events/debug-events.js'
import { countContextTokens, countMessagesTokens } from '../token-counter.js'
import { getModelContextLimit } from '../token-limits.js'
import type { ChatRequest, ChatResponse, StreamChunk, ToolCall } from '../../types/llm.js'

/**
 * LangGraph config passed to nodes for custom streaming
 */
interface LangGraphConfig {
	/** Writer for custom stream mode - emits events immediately to stream */
	writer?: (data: unknown) => void
}

/**
 * Creates the agent node
 *
 * Sends messages to LLM, receives response with potential tool calls.
 * Does NOT execute tools - that's the tools node's job.
 */
export function agentNode(context: CodeAgentContext) {
	return async (state: AgentState, config?: LangGraphConfig): Promise<AgentStateUpdate> => {
		codeLogger.debug('[Agent] Node entered', {
			mode: state.mode,
			messageCount: state.messages.length,
			iteration: state.iterations,
			instruction: state.instruction?.slice(0, 100),
			hasAcceptance: !!state.acceptance,
			appliedChangesCount: state.appliedChanges?.length ?? 0,
			hasLastAnswer: !!state.lastAnswer,
			hasPendingQuestion: !!state.pendingQuestion
		})

		// Check for abort
		if (state.aborted) {
			return { phase: 'agent_aborted' }
		}

		const { llm, toolRegistry, policy } = context

		// Get model context limit for token tracking
		const modelContextLimit = policy.context?.modelContextLimit ?? getModelContextLimit(context.modelAlias)

		// Get tool schemas for binding (only in execute mode) - needed for token counting
		const toolSchemas: ToolSchema[] = state.mode === 'execute' ? toolRegistry.getSchemas() : []

		// Build system prompt for token counting (will rebuild after potential compaction)
		const stateForPrompt = state.summary ? state : state
		const systemPromptForCounting = buildSystemPrompt(stateForPrompt, context)

		// Count current context tokens BEFORE compaction decision
		const preCompactionTokens = countContextTokens(systemPromptForCounting, state.messages, toolSchemas)

		codeLogger.debug('[Agent] Pre-compaction token count', {
			systemPromptTokens: preCompactionTokens.systemPromptTokens,
			messagesTokens: preCompactionTokens.messagesTokens,
			toolSchemaTokens: preCompactionTokens.toolSchemaTokens,
			totalTokens: preCompactionTokens.totalTokens,
			modelLimit: modelContextLimit
		})

		// Context compaction check - token-based (preferred) or message-based (fallback)
		let messagesForContext = state.messages
		let newSummary: string | null = null
		let compactionResult: { beforeTokens?: number; afterTokens?: number } | null = null

		if (policy.context?.enableCompaction) {
			const compactor = new ContextCompactor(policy.context, context.modelAlias)

			// Check if compaction needed (token-based check with actual token count)
			if (compactor.shouldCompact(state, preCompactionTokens.totalTokens)) {
				codeLogger.debug('Token-based compaction triggered', {
					currentTokens: preCompactionTokens.totalTokens,
					threshold: compactor.getTokenThreshold(),
					modelLimit: modelContextLimit
				})

				// Use token-aware compaction to reach target
				const result = compactor.compactWithTokenTarget(state)

				// Use compacted messages for LLM context
				messagesForContext = result.trimmedMessages

				// Store summary for future reference
				newSummary = result.summary

				// Store token info for debug event
				compactionResult = {
					beforeTokens: result.beforeTokens,
					afterTokens: result.afterTokens
				}

				codeLogger.debug('Compaction complete', {
					originalCount: state.messages.length,
					compactedCount: result.trimmedMessages.length,
					droppedCount: result.droppedCount,
					beforeTokens: result.beforeTokens,
					afterTokens: result.afterTokens
				})

				// Debug event: emit context compaction details with token info
				if (context.debugMode) {
					context.onEvent?.(
						createContextCompactedEvent(
							result.droppedCount,
							result.summary,
							state.messages.length,
							result.trimmedMessages.length,
							result.beforeTokens,
							result.afterTokens
						)
					)
				}
			}
		}

		// Build system prompt based on mode and context
		// Note: If we have a new summary, create a modified state for prompt building
		const finalStateForPrompt = newSummary ? { ...state, summary: newSummary } : state
		const systemPrompt = buildSystemPrompt(finalStateForPrompt, context)

		// Convert messages to LLM format (use compacted messages if available)
		const llmMessages = convertMessages(messagesForContext)

		// Call LLM
		codeLogger.debug('[Agent] Calling LLM', {
			mode: state.mode,
			messageCount: llmMessages.length,
			toolCount: toolSchemas.length,
			systemPromptLength: systemPrompt.length,
			modelAlias: context.modelAlias
		})

		// Debug event: emit system prompt before LLM call
		if (context.debugMode) {
			context.onEvent?.(createSystemPromptEvent(systemPrompt))
		}

		const llmStartTime = Date.now()

		// Build request for streaming
		const toolChoice: 'auto' | 'none' = state.mode === 'explain' ? 'none' : 'auto'
		const chatRequest: ChatRequest = {
			messages: [{ role: 'system' as const, content: systemPrompt }, ...llmMessages],
			tools:
				toolSchemas.length > 0
					? toolSchemas.map((t) => ({
							type: 'function' as const,
							function: {
								name: t.name,
								description: t.description,
								parameters: t.parameters
							}
					  }))
					: undefined,
			toolChoice,
			modelAlias: context.modelAlias
		}

		// Stream LLM response for real-time text display
		let accumulatedContent = ''
		const accumulatedToolCalls: Map<string, { id: string; name: string; arguments: string }> = new Map()
		let finishReason: 'stop' | 'tool_calls' | 'length' | 'content_filter' = 'stop'
		let usage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined

		for await (const chunk of llm.stream(chatRequest)) {
			switch (chunk.type) {
				case 'text':
					if (chunk.text) {
						accumulatedContent += chunk.text
						// Emit text delta in real-time via custom stream mode
						// config.writer() delivers immediately, context.onEvent queues for node completion
						const textEvent = { type: 'llm_text' as const, delta: chunk.text }
						if (config?.writer) {
							config.writer(textEvent)
						} else {
							context.onEvent?.(textEvent)
						}
					}
					break

				case 'tool_call_start':
					if (chunk.toolCallId && chunk.toolName) {
						accumulatedToolCalls.set(chunk.toolCallId, {
							id: chunk.toolCallId,
							name: chunk.toolName,
							arguments: ''
						})
					}
					break

				case 'tool_call_delta':
					if (chunk.toolCallId && chunk.toolArgsDelta) {
						const existing = accumulatedToolCalls.get(chunk.toolCallId)
						if (existing) {
							existing.arguments += chunk.toolArgsDelta
						}
					}
					break

				case 'tool_call_end':
					// Tool call is complete, nothing special needed
					break

				case 'done':
					if (chunk.finishReason) {
						finishReason = chunk.finishReason
					}
					if (chunk.usage) {
						usage = chunk.usage
					}
					break
			}
		}

		// Build response from accumulated data
		const toolCalls: ToolCall[] = Array.from(accumulatedToolCalls.values()).map((tc) => ({
			id: tc.id,
			type: 'function' as const,
			function: {
				name: tc.name,
				arguments: tc.arguments
			}
		}))

		const response = {
			id: `stream-${Date.now()}`,
			content: accumulatedContent,
			toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
			finishReason,
			usage,
			model: undefined as string | undefined // Model info not available in streaming
		}

		const llmDurationMs = Date.now() - llmStartTime

		codeLogger.debug('[Agent] LLM streaming response complete', {
			contentLength: response.content?.length ?? 0,
			toolCallCount: response.toolCalls?.length ?? 0,
			toolNames: response.toolCalls?.map((tc) => tc.function.name),
			finishReason: response.finishReason,
			durationMs: llmDurationMs
		})

		// Calculate cumulative token usage
		const previousTokenUsage = state.tokenUsage ?? DEFAULT_TOKEN_USAGE
		const newTokenUsage: TokenUsage = {
			totalPromptTokens: previousTokenUsage.totalPromptTokens + (response.usage?.promptTokens ?? 0),
			totalCompletionTokens: previousTokenUsage.totalCompletionTokens + (response.usage?.completionTokens ?? 0),
			totalTokens: previousTokenUsage.totalTokens + (response.usage?.totalTokens ?? 0),
			lastCallPromptTokens: response.usage?.promptTokens ?? 0,
			lastCallCompletionTokens: response.usage?.completionTokens ?? 0,
			peakContextTokens: Math.max(previousTokenUsage.peakContextTokens, preCompactionTokens.totalTokens)
		}

		codeLogger.debug('[Agent] Token usage updated', {
			thisCall: {
				prompt: response.usage?.promptTokens ?? 0,
				completion: response.usage?.completionTokens ?? 0,
				total: response.usage?.totalTokens ?? 0
			},
			cumulative: {
				prompt: newTokenUsage.totalPromptTokens,
				completion: newTokenUsage.totalCompletionTokens,
				total: newTokenUsage.totalTokens,
				peak: newTokenUsage.peakContextTokens
			}
		})

		// Debug events: emit LLM metadata and token usage
		if (context.debugMode) {
			context.onEvent?.(
				createLlmMetaEvent(response.model ?? 'unknown', response.finishReason ?? 'unknown', llmDurationMs)
			)

			if (response.usage) {
				context.onEvent?.(
					createTokenUsageEvent(
						response.usage.promptTokens ?? 0,
						response.usage.completionTokens ?? 0,
						response.usage.totalTokens ?? 0,
						response.model ?? 'unknown',
						newTokenUsage
					)
				)
			}
		}

		// Note: LLM text is already emitted in real-time during streaming above

		// Build AI message with potential tool calls
		// Parse tool call arguments with error handling for malformed JSON
		const parsedToolCalls = response.toolCalls?.map((tc) => {
			let args: Record<string, unknown>
			try {
				args = JSON.parse(tc.function.arguments)
			} catch (parseError) {
				codeLogger.warn('[Agent] Failed to parse tool call arguments', {
					toolName: tc.function.name,
					callId: tc.id,
					rawArgs: tc.function.arguments?.slice(0, 200),
					error: parseError instanceof Error ? parseError.message : String(parseError)
				})
				// Return empty args - the tool will likely fail but at least we continue
				args = { _parseError: `Invalid JSON: ${tc.function.arguments?.slice(0, 100)}` }
			}
			return {
				id: tc.id,
				name: tc.function.name,
				args
			}
		})

		const aiMessage = new AIMessage({
			content: response.content,
			tool_calls: parsedToolCalls
		})

		// Calculate final context token count (after potential compaction)
		const finalContextTokens = compactionResult
			? compactionResult.afterTokens ?? preCompactionTokens.totalTokens
			: preCompactionTokens.totalTokens

		// Build state update
		const stateUpdate: AgentStateUpdate = {
			messages: [aiMessage],
			phase: 'agent_done',
			tokenUsage: newTokenUsage,
			currentContextTokens: finalContextTokens
		}

		// Include summary update if compaction occurred
		if (newSummary) {
			stateUpdate.summary = newSummary
		}

		return stateUpdate
	}
}

/**
 * Build context-aware system prompt
 */
function buildSystemPrompt(state: AgentState, context: CodeAgentContext): string {
	const parts: string[] = []

	// CRITICAL: Include the user's original instruction
	// This was missing before, causing the agent to not know what to do!
	if (state.instruction) {
		parts.push('## User Request')
		parts.push(state.instruction)
		parts.push('')
	}

	// Mode instructions
	switch (state.mode) {
		case 'explain':
			parts.push('You are a code assistant. Answer questions about this project accurately.')
			parts.push('You may NOT make any file changes or run commands.')
			parts.push('Base your answers on the project context provided.')
			break

		case 'plan':
			parts.push('You are a planning assistant. Analyze requirements and produce acceptance criteria.')
			parts.push('You may ask clarifying questions if the requirements are ambiguous.')
			parts.push('You may NOT make any file changes.')
			break

		case 'execute':
			parts.push('You are a coding agent. Implement the requested changes.')
			parts.push('Use tools to read files, make changes, and verify your work.')
			parts.push('After making changes, verify by running the build.')
			break
	}

	// Add project context
	if (state.projectOverview) {
		parts.push('\n## Project Context')
		parts.push(state.projectOverview.summary)

		if (state.projectOverview.robo) {
			parts.push(`\nThis is a Robo.js ${state.projectOverview.robo.kind} project.`)

			if (state.projectOverview.robo.commands?.length) {
				parts.push(`Existing commands: ${state.projectOverview.robo.commands.slice(0, 10).join(', ')}`)
			}

			if (state.projectOverview.robo.events?.length) {
				parts.push(`Event handlers: ${state.projectOverview.robo.events.slice(0, 5).join(', ')}`)
			}
		}

		// Add key files
		if (state.projectOverview.keyFiles.length > 0) {
			parts.push('\nKey files:')
			for (const kf of state.projectOverview.keyFiles.slice(0, 5)) {
				parts.push(`- ${kf.path}: ${kf.why}`)
			}
		}
	}

	// Add acceptance criteria in execute mode
	if (state.mode === 'execute' && state.acceptance) {
		parts.push('\n## Acceptance Criteria')
		parts.push('Your implementation must satisfy:')
		for (const bullet of state.acceptance.requirements.featureBullets) {
			parts.push(`- ${bullet}`)
		}

		if (state.acceptance.requirements.constraints?.length) {
			parts.push('\nConstraints:')
			for (const c of state.acceptance.requirements.constraints) {
				parts.push(`- ${c}`)
			}
		}

		if (state.acceptance.requirements.nonGoals?.length) {
			parts.push('\nNon-goals (do NOT implement):')
			for (const ng of state.acceptance.requirements.nonGoals) {
				parts.push(`- ${ng}`)
			}
		}
	}

	// Add current plan step
	if (state.plan.length > 0 && state.currentStep < state.plan.length) {
		const step = state.plan[state.currentStep]
		parts.push(`\n## Current Step`)
		parts.push(`Step ${step.step}: ${step.title}`)
		parts.push(step.description)
	}

	// Add verification status
	if (state.lastVerification) {
		parts.push('\n## Last Verification')
		if (state.lastVerification.success) {
			parts.push('Status: PASSED')
		} else {
			parts.push('Status: FAILED')
			if (state.lastVerification.build && !state.lastVerification.build.success) {
				parts.push(`Build errors: ${state.lastVerification.build.errors.length}`)
				for (const err of state.lastVerification.build.errors.slice(0, 3)) {
					parts.push(`  - ${err.message}`)
				}
			}
		}
	}

	// Add compacted summary if available
	if (state.summary) {
		parts.push('\n## Previous Context Summary')
		parts.push(state.summary)
	}

	return parts.join('\n')
}

/**
 * Convert state messages to LLM-compatible format
 */
interface LLMMessage {
	role: 'system' | 'user' | 'assistant' | 'tool'
	content: string
	toolCallId?: string
	toolCalls?: Array<{
		id: string
		type: 'function'
		function: {
			name: string
			arguments: string
		}
	}>
}

function convertMessages(messages: BaseMessage[]): LLMMessage[] {
	return messages.map((msg) => {
		if (msg instanceof HumanMessage) {
			return { role: 'user' as const, content: String(msg.content) }
		}
		if (msg instanceof AIMessage) {
			const result: LLMMessage = {
				role: 'assistant' as const,
				content: String(msg.content) || ''
			}
			// Preserve tool_calls so the LLM sees them with corresponding tool results
			if (msg.tool_calls && msg.tool_calls.length > 0) {
				result.toolCalls = msg.tool_calls.map((tc) => ({
					id: tc.id || '',
					type: 'function' as const,
					function: {
						name: tc.name,
						arguments: typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args)
					}
				}))
			}
			return result
		}
		if (msg instanceof ToolMessage) {
			return {
				role: 'tool' as const,
				content: String(msg.content),
				toolCallId: msg.tool_call_id
			}
		}
		return { role: 'user' as const, content: String(msg.content) }
	})
}
