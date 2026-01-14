/**
 * Debug event creation helpers for @robojs/code SDK
 *
 * Centralized helpers for creating debug events with proper typing.
 * These are only emitted when debugMode is enabled on a run.
 */

import type { DebugEvent } from '../../types/events.js'
import type { TokenUsage } from '../state.js'

/**
 * Create a tool timing debug event
 */
export function createToolTimingEvent(toolName: string, durationMs: number, callId: string): DebugEvent {
	return { type: 'debug_tool_timing', toolName, durationMs, callId }
}

/**
 * Create a system prompt debug event
 */
export function createSystemPromptEvent(prompt: string, tokenCount?: number): DebugEvent {
	return { type: 'debug_system_prompt', prompt, tokenCount }
}

/**
 * Create an LLM metadata debug event
 */
export function createLlmMetaEvent(
	model: string,
	finishReason: string,
	durationMs: number,
	temperature?: number
): DebugEvent {
	return { type: 'debug_llm_meta', model, finishReason, durationMs, temperature }
}

/**
 * Create a token usage debug event with optional cumulative data
 */
export function createTokenUsageEvent(
	promptTokens: number,
	completionTokens: number,
	totalTokens: number,
	model: string,
	cumulative?: TokenUsage
): DebugEvent {
	const event: DebugEvent = {
		type: 'debug_token_usage',
		promptTokens,
		completionTokens,
		totalTokens,
		model
	}

	if (cumulative) {
		return {
			...event,
			cumulative: {
				totalPromptTokens: cumulative.totalPromptTokens,
				totalCompletionTokens: cumulative.totalCompletionTokens,
				totalTokens: cumulative.totalTokens,
				peakContextTokens: cumulative.peakContextTokens
			}
		}
	}

	return event
}

/**
 * Create a graph decision debug event
 */
export function createDecisionEvent(node: string, decision: string, reason: string): DebugEvent {
	return { type: 'debug_decision', node, decision, reason }
}

/**
 * Create a verification detail debug event
 */
export function createVerificationDetailEvent(
	kind: 'build' | 'tests' | 'mock',
	rawOutput: string,
	exitCode: number,
	durationMs: number
): DebugEvent {
	return { type: 'debug_verification_detail', kind, rawOutput, exitCode, durationMs }
}

/**
 * Create a context compaction debug event with optional token info
 */
export function createContextCompactedEvent(
	droppedCount: number,
	summary: string,
	beforeMessageCount: number,
	afterMessageCount: number,
	beforeTokens?: number,
	afterTokens?: number
): DebugEvent {
	return {
		type: 'debug_context_compacted',
		droppedCount,
		summary,
		beforeMessageCount,
		afterMessageCount,
		beforeTokens,
		afterTokens
	}
}

/**
 * Create a state update debug event
 */
export function createStateUpdateEvent(
	field: string,
	oldValue: unknown,
	newValue: unknown,
	timestamp: number = Date.now()
): DebugEvent {
	return { type: 'debug_state_update', field, oldValue, newValue, timestamp }
}

/**
 * Create a policy check debug event
 */
export function createPolicyCheckEvent(
	rule: string,
	result: 'allowed' | 'blocked',
	reason?: string,
	path?: string
): DebugEvent {
	return { type: 'debug_policy_check', rule, result, reason, path }
}

/**
 * Create an LLM thinking debug event
 */
export function createLlmThinkingEvent(content: string, tokenCount?: number): DebugEvent {
	return { type: 'debug_llm_thinking', content, tokenCount }
}
