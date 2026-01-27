/**
 * Agent event types for @robojs/code SDK
 *
 * Events are the UI contract - derived from LangGraph stream updates
 * and SDK hooks for terminal/session output.
 */

import type { FileChange, FileDiff } from './changes.js'
import type { ProjectProfile, MockEvent, VerificationResult } from './robo.js'
import type { TaskStep, QuestionChoice } from './run.js'
import type { TerminalChunk } from './terminal.js'
import type { AcceptanceCriteria } from './acceptance.js'

/**
 * Options for controlling which event families are streamed.
 *
 * Allows UIs to opt into/out of event families for performance
 * or display preferences.
 */
export interface StreamOptions {
	/**
	 * Include LLM text deltas (default: true)
	 */
	includeText?: boolean

	/**
	 * Include plan events
	 */
	includePlan?: boolean

	/**
	 * Include progress events
	 */
	includeProgress?: boolean

	/**
	 * Include rationale summaries (brief, user-facing reasoning - NOT chain-of-thought)
	 */
	includeRationales?: boolean

	/**
	 * Include core tool call events
	 */
	includeToolCalls?: boolean

	/**
	 * Include core tool result events
	 */
	includeToolResults?: boolean

	/**
	 * Include MCP tool call events
	 */
	includeMcpCalls?: boolean

	/**
	 * Include MCP tool result events
	 */
	includeMcpResults?: boolean

	/**
	 * Include debug events (verbose mode for deep inspection).
	 * When true, emits: debug_llm_thinking, debug_system_prompt, debug_tool_timing,
	 * debug_verification_detail, debug_policy_check, debug_state_update,
	 * debug_context_compacted, debug_decision, debug_token_usage, debug_llm_meta
	 */
	includeDebugEvents?: boolean
}

/**
 * Default stream options
 */
export const DEFAULT_STREAM_OPTIONS: StreamOptions = {
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
 * Agent event types for UI streaming.
 *
 * Events are categorized by:
 * - Lifecycle: start, phase, complete, abort
 * - Progress: plan, progress, rationale
 * - LLM: llm_text
 * - Tools: tool_call, tool_result (core), mcp_call, mcp_result (MCP)
 * - Files: file_proposed, approval_required, file_applied
 * - Terminal: terminal, terminal_truncated
 * - Interrupts: question
 * - Validation: mock, retry
 */
export type AgentEvent =
	// Lifecycle events
	| { type: 'start'; runId: string; instruction: string; mode: 'explain' | 'plan' | 'execute' }
	| { type: 'profile'; profile: ProjectProfile }
	| { type: 'phase'; phase: string }
	| { type: 'complete'; summary: string; changes: FileChange[]; diffs?: FileDiff[]; verification?: VerificationResult }
	| { type: 'abort'; reason: string }

	// Progress events (safe summaries, not chain-of-thought)
	| { type: 'plan'; steps: TaskStep[] }
	| { type: 'plan_complete'; runId: string; acceptance: AcceptanceCriteria; plan: TaskStep[] }
	| { type: 'progress'; step: number; of: number; label: string }
	| { type: 'rationale'; markdown: string }

	// LLM text streaming
	| { type: 'llm_text'; delta: string }

	// Core tool events
	| { type: 'tool_call'; source: 'core'; name: string; args: unknown; callId?: string }
	| { type: 'tool_result'; source: 'core'; name: string; result: unknown; callId?: string }

	// MCP tool events (distinguished from core)
	| { type: 'mcp_call'; source: 'mcp'; serverId: string; tool: string; args: unknown; callId?: string }
	| { type: 'mcp_result'; source: 'mcp'; serverId: string; tool: string; result: unknown; callId?: string }

	// File change events
	| { type: 'file_proposed'; changes: FileChange[]; diffs?: FileDiff[] }
	| {
			type: 'approval_required'
			runId: string
			changes: FileChange[]
			diffs?: FileDiff[]
			reason?: string
			/** Command details for terminal approvals */
			command?: {
				executable: string
				args: string[]
				cwd?: string
			}
	  }
	| { type: 'file_applied'; path: string }

	// Terminal events
	| { type: 'terminal'; chunk: TerminalChunk }
	| { type: 'terminal_truncated'; sessionId: string; droppedBytes: number }

	// Question Gate interrupt
	| { type: 'question'; runId: string; text: string; choices?: QuestionChoice[] }

	// Limit reached interrupt (graceful pause when iterations hit limit)
	| {
			type: 'limit_reached'
			runId: string
			iteration: number
			limit: number
			phase: string
			stepProgress?: { current: number; total: number; label: string }
			message: string
	  }

	// Validation events
	| { type: 'mock'; event: MockEvent }
	| { type: 'retry'; iteration: number; reason: string }

	// Debug events (only emitted when includeDebugEvents is true)
	| DebugEvent

/**
 * Debug event types for deep inspection mode.
 * Only emitted when debugMode is enabled on the run.
 */
export type DebugEvent =
	// LLM reasoning/thinking (if model supports extended thinking)
	| { type: 'debug_llm_thinking'; content: string; tokenCount?: number }

	// System prompt being sent to LLM
	| { type: 'debug_system_prompt'; prompt: string; tokenCount?: number }

	// Tool execution timing
	| { type: 'debug_tool_timing'; toolName: string; durationMs: number; callId: string }

	// Full verification results with raw output
	| {
			type: 'debug_verification_detail'
			kind: 'build' | 'tests' | 'mock'
			rawOutput: string
			exitCode: number
			durationMs: number
	  }

	// Policy check results
	| { type: 'debug_policy_check'; rule: string; result: 'allowed' | 'blocked'; reason?: string; path?: string }

	// State field changes with before/after
	| { type: 'debug_state_update'; field: string; oldValue: unknown; newValue: unknown; timestamp: number }

	// Context compaction happened (with optional token info)
	| {
			type: 'debug_context_compacted'
			droppedCount: number
			summary: string
			beforeMessageCount: number
			afterMessageCount: number
			beforeTokens?: number
			afterTokens?: number
	  }

	// Graph routing decision
	| { type: 'debug_decision'; node: string; decision: string; reason: string }

	// Token usage tracking (with optional cumulative data)
	| {
			type: 'debug_token_usage'
			promptTokens: number
			completionTokens: number
			totalTokens: number
			model: string
			cumulative?: {
				totalPromptTokens: number
				totalCompletionTokens: number
				totalTokens: number
				peakContextTokens: number
			}
	  }

	// LLM response metadata
	| { type: 'debug_llm_meta'; model: string; finishReason: string; temperature?: number; durationMs: number }

/**
 * Type guard for debug events
 */
export function isDebugEvent(event: { type: string }): event is DebugEvent {
	return event.type.startsWith('debug_')
}

/**
 * Debug event type names
 */
export type DebugEventType = DebugEvent['type']

/**
 * Extract the type field from an AgentEvent
 */
export type AgentEventType = AgentEvent['type']

/**
 * Get the event payload for a specific event type
 */
export type AgentEventPayload<T extends AgentEventType> = Extract<AgentEvent, { type: T }>
