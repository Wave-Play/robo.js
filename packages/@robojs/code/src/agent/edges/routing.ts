/**
 * Conditional edge routing functions for the CodeAgent graph
 */

import { END } from '@langchain/langgraph/web'
import { AIMessage, type BaseMessage } from '@langchain/core/messages'
import { codeLogger } from '../../core/logger.js'
import type { AgentState } from '../state.js'
import type { ScenarioSpec } from '../../types/acceptance.js'

/**
 * Node names for routing
 */
export const NODE = {
	DETECT_PROFILE: 'detect_profile',
	REFRESH_INDEX: 'refresh_index',
	REFRESH_OVERVIEW: 'refresh_overview',
	PLANNER: 'planner',
	QUESTION_GATE: 'question_gate',
	APPROVAL_GATE: 'approval_gate',
	AGENT: 'agent',
	TOOLS: 'tools',
	REVIEWER: 'reviewer',
	VERIFY_BUILD: 'verify_build',
	VERIFY_TESTS: 'verify_tests',
	VERIFY_MOCK: 'verify_mock'
} as const

export type NodeName = (typeof NODE)[keyof typeof NODE]

/**
 * Route after planner node
 *
 * - If mode is 'explain', go to END (explain mode uses agent directly)
 * - If mode is 'plan' and done, go to END
 * - If pending question, go to question_gate
 * - Otherwise go to agent
 */
export function routeAfterPlanner(state: AgentState): NodeName | typeof END {
	// Check for abort
	if (state.aborted) {
		return END
	}

	// Explain mode skips planning and goes straight to agent
	if (state.mode === 'explain') {
		return NODE.AGENT
	}

	// Plan mode - if we have acceptance criteria and no questions, we're done
	if (state.mode === 'plan' && state.acceptance && !state.pendingQuestion) {
		return END
	}

	// Need clarification
	if (state.pendingQuestion) {
		return NODE.QUESTION_GATE
	}

	// Execute mode - continue to agent
	return NODE.AGENT
}

/**
 * Route after agent node
 *
 * - If aborted, go to END
 * - If tool_calls exist in last message, go to tools (all tool-enabled modes)
 * - If explain mode with no tool calls, go to END
 * - Otherwise go to reviewer
 */
export function routeAfterAgent(state: AgentState): NodeName | typeof END {
	// Check for abort
	if (state.aborted) {
		return END
	}

	// Check if LLM wants to use tools (applies to explain and execute modes)
	const lastMessage = state.messages[state.messages.length - 1]

	if (hasToolCalls(lastMessage)) {
		return NODE.TOOLS
	}

	// Explain mode - after agent produces answer (no tool calls), end
	if (state.mode === 'explain') {
		return END
	}

	// No tools, go to reviewer
	return NODE.REVIEWER
}

/**
 * Route after question_gate node
 *
 * - If no acceptance criteria yet, go back to planner (planner asked the question)
 * - If has acceptance criteria, go to agent (agent asked the question)
 */
export function routeAfterQuestionGate(state: AgentState): NodeName | typeof END {
	// Check for abort
	if (state.aborted) {
		codeLogger.debug('[routeAfterQuestionGate] Aborted, going to END')
		return END
	}

	// If we don't have acceptance criteria yet, go back to planner
	// This is the case when planner asked a clarifying question
	if (!state.acceptance) {
		codeLogger.debug('[routeAfterQuestionGate] No acceptance yet, routing back to PLANNER')
		return NODE.PLANNER
	}

	// We have acceptance, so agent asked the question - go to agent
	codeLogger.debug('[routeAfterQuestionGate] Has acceptance, routing to AGENT')
	return NODE.AGENT
}

/**
 * Route after tools node
 *
 * - If aborted, go to END
 * - If explain mode, always loop back to agent (skip approval gate, no verification)
 * - If awaiting approval, go to approval_gate (will pause there)
 * - Otherwise go back to agent
 */
export function routeAfterTools(state: AgentState): NodeName | typeof END {
	// Check for abort
	if (state.aborted) {
		return END
	}

	// Explain mode - always loop back to agent (skip approval gate and verification)
	if (state.mode === 'explain') {
		return NODE.AGENT
	}

	// If awaiting approval, go to approval gate (which will throw NodeInterrupt)
	if (state.awaitingApproval) {
		return NODE.APPROVAL_GATE
	}

	// Continue to agent
	return NODE.AGENT
}

/**
 * Route after approval_gate node
 *
 * After approval is processed, go back to agent to continue
 */
export function routeAfterApprovalGate(state: AgentState): NodeName | typeof END {
	// Check for abort
	if (state.aborted) {
		return END
	}

	// Continue to agent after approval is processed
	return NODE.AGENT
}

/**
 * Route after reviewer node
 *
 * Evaluates completion and routes to verification or retry.
 */
export function routeAfterReviewer(state: AgentState): NodeName | typeof END {
	// Check for abort
	if (state.aborted) {
		return END
	}

	// Budget exceeded - end with status
	if (state.budgetExceeded) {
		return END
	}

	// Completed successfully
	if (state.completionSummary) {
		return END
	}

	// Determine verification needs based on phase and acceptance status

	// Need build verification?
	if (needsBuildVerification(state)) {
		return NODE.VERIFY_BUILD
	}

	// Need test verification?
	if (needsTestVerification(state)) {
		return NODE.VERIFY_TESTS
	}

	// Need mock verification?
	if (needsMockVerification(state)) {
		return NODE.VERIFY_MOCK
	}

	// After verification, refresh overview if changes were applied
	if (state.appliedChanges.length > 0 && shouldRefreshOverview(state)) {
		return NODE.REFRESH_OVERVIEW
	}

	// Still have work to do, go back to agent
	return NODE.AGENT
}

/**
 * Route after verification nodes
 *
 * All verification nodes route back to reviewer.
 */
export function routeAfterVerification(): NodeName {
	return NODE.REVIEWER
}

/**
 * Check if message has tool calls
 */
function hasToolCalls(msg: BaseMessage | undefined): boolean {
	if (!msg) return false
	if (!(msg instanceof AIMessage)) return false
	if (!msg.tool_calls) return false
	if (!Array.isArray(msg.tool_calls)) return false
	return msg.tool_calls.length > 0
}

/**
 * Check if build verification is needed
 */
function needsBuildVerification(state: AgentState): boolean {
	// If we already have a passing build, skip
	if (state.lastVerification?.build?.success) {
		return false
	}

	// If no acceptance criteria, always run build
	if (!state.acceptance) {
		return true
	}

	// Check if any mustPass scenarios need build
	return state.acceptance.mustPass.some((id: string) => {
		const scenario = state.acceptance?.scenarios.find((s: ScenarioSpec) => s.id === id)
		return scenario?.kind === 'build'
	})
}

/**
 * Check if test verification is needed
 */
function needsTestVerification(state: AgentState): boolean {
	// If we already have passing tests, skip
	if (state.lastVerification?.tests?.success) {
		return false
	}

	// If no acceptance criteria, skip tests
	if (!state.acceptance) {
		return false
	}

	// Check if any mustPass scenarios need tests
	return state.acceptance.mustPass.some((id: string) => {
		const scenario = state.acceptance?.scenarios.find((s: ScenarioSpec) => s.id === id)
		return scenario?.kind === 'test'
	})
}

/**
 * Check if mock verification is needed
 */
function needsMockVerification(state: AgentState): boolean {
	// If mock not available, skip
	if (!state.projectProfile?.hasMock) {
		return false
	}

	// If we already have passing mock, skip
	if (state.lastVerification?.mock?.success) {
		return false
	}

	// If no acceptance criteria, skip mock
	if (!state.acceptance) {
		return false
	}

	// Check if any mustPass scenarios need mock
	return state.acceptance.mustPass.some((id: string) => {
		const scenario = state.acceptance?.scenarios.find((s: ScenarioSpec) => s.id === id)
		return scenario?.kind === 'mock'
	})
}

/**
 * Check if we should refresh overview
 */
function shouldRefreshOverview(state: AgentState): boolean {
	// Refresh after every 5 changes or after verification
	const changeCount = state.appliedChanges.length
	return changeCount > 0 && changeCount % 5 === 0
}
