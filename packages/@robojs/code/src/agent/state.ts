/**
 * Agent state annotation for @robojs/code SDK
 *
 * Defines the LangGraph state schema with Annotation + reducers.
 * This is the foundation for the orchestration graph.
 */

import { Annotation } from '@langchain/langgraph/web'
import type { BaseMessage } from '@langchain/core/messages'
import type { RunMode, TaskStep, QuestionChoice, QuestionAnswer, ApprovalResponse, Question } from '../types/run.js'
import type { AcceptanceCriteria, AcceptanceStatus } from '../types/acceptance.js'
import type { ProjectProfile, VerificationResult } from '../types/robo.js'
import type { ProjectIndex, ProjectOverview } from '../types/scale.js'
import type { FileChange, FileDiff } from '../types/changes.js'

/**
 * Token usage tracking for budget management
 */
export interface TokenUsage {
	/**
	 * Total prompt tokens consumed across all LLM calls
	 */
	totalPromptTokens: number

	/**
	 * Total completion tokens consumed across all LLM calls
	 */
	totalCompletionTokens: number

	/**
	 * Total tokens (prompt + completion) across all LLM calls
	 */
	totalTokens: number

	/**
	 * Prompt tokens from the last LLM call
	 */
	lastCallPromptTokens: number

	/**
	 * Completion tokens from the last LLM call
	 */
	lastCallCompletionTokens: number

	/**
	 * Peak context tokens seen during the run (for monitoring)
	 */
	peakContextTokens: number
}

/**
 * Default token usage values
 */
export const DEFAULT_TOKEN_USAGE: TokenUsage = {
	totalPromptTokens: 0,
	totalCompletionTokens: 0,
	totalTokens: 0,
	lastCallPromptTokens: 0,
	lastCallCompletionTokens: 0,
	peakContextTokens: 0
}

/**
 * Pending question state for Question Gate interrupt
 */
export interface PendingQuestion {
	/**
	 * Question text to display (legacy single-question support)
	 */
	text?: string

	/**
	 * Optional choices for the user (legacy single-question support)
	 */
	choices?: QuestionChoice[]

	/**
	 * Array of questions for multi-question support (1-4 questions)
	 */
	questions?: Question[]

	/**
	 * When the question was asked
	 */
	askedAt: string
}

/**
 * Reducer that replaces the current value with the next value
 */
function replaceReducer<T>(current: T, next: T): T {
	return next
}

/**
 * Reducer that appends arrays
 */
function appendReducer<T>(current: T[], next: T[]): T[] {
	return [...current, ...next]
}

/**
 * Agent state annotation for the CodeAgent graph.
 *
 * Uses LangGraph Annotation.Root with custom reducers.
 * Messages use an append-only reducer for LangGraph compatibility.
 *
 * State categories:
 * - Core execution: mode, phase, instruction
 * - Plan and acceptance: plan, currentStep, acceptance, acceptanceStatus
 * - Question Gate: pendingQuestion, lastAnswer
 * - Project understanding: projectProfile, projectIndex, projectOverview
 * - Changes and verification: pendingChanges, pendingDiffs, lastVerification, appliedChanges, appliedDiffs
 * - Context compaction: summary
 * - Approval state: awaitingApproval, approved
 * - Termination: aborted, abortReason, completionSummary
 * - Iteration tracking: iterations, budgetExceeded
 * - Messages: chat history (append-only)
 */
export const AgentStateAnnotation = Annotation.Root({
	// === Core execution state ===

	/**
	 * Current run mode (explain | plan | execute)
	 */
	mode: Annotation<RunMode>({
		reducer: replaceReducer,
		default: () => 'execute'
	}),

	/**
	 * Current phase in the graph (for debugging/UI)
	 */
	phase: Annotation<string>({
		reducer: replaceReducer,
		default: () => 'init'
	}),

	/**
	 * User's original instruction
	 */
	instruction: Annotation<string>({
		reducer: replaceReducer,
		default: () => ''
	}),

	// === Plan and acceptance ===

	/**
	 * Planned steps for execution
	 */
	plan: Annotation<TaskStep[]>({
		reducer: replaceReducer,
		default: () => []
	}),

	/**
	 * Current step index (0-based)
	 */
	currentStep: Annotation<number>({
		reducer: replaceReducer,
		default: () => 0
	}),

	/**
	 * Acceptance criteria from planner
	 */
	acceptance: Annotation<AcceptanceCriteria | null>({
		reducer: replaceReducer,
		default: () => null
	}),

	/**
	 * Current acceptance status (scenario results)
	 */
	acceptanceStatus: Annotation<AcceptanceStatus | null>({
		reducer: replaceReducer,
		default: () => null
	}),

	// === Question Gate state ===

	/**
	 * Pending question for interrupt
	 */
	pendingQuestion: Annotation<PendingQuestion | null>({
		reducer: replaceReducer,
		default: () => null
	}),

	/**
	 * Answer from user (set on resume)
	 */
	lastAnswer: Annotation<QuestionAnswer | null>({
		reducer: replaceReducer,
		default: () => null
	}),

	// === Project understanding ===

	/**
	 * Detected project profile
	 */
	projectProfile: Annotation<ProjectProfile | null>({
		reducer: replaceReducer,
		default: () => null
	}),

	/**
	 * Project index (file listing + fingerprint)
	 */
	projectIndex: Annotation<ProjectIndex | null>({
		reducer: replaceReducer,
		default: () => null
	}),

	/**
	 * Project overview (mental model)
	 */
	projectOverview: Annotation<ProjectOverview | null>({
		reducer: replaceReducer,
		default: () => null
	}),

	// === Changes and verification ===

	/**
	 * Pending changes awaiting approval
	 */
	pendingChanges: Annotation<FileChange[]>({
		reducer: replaceReducer,
		default: () => []
	}),

	/**
	 * Pending diffs for UI display
	 */
	pendingDiffs: Annotation<FileDiff[]>({
		reducer: replaceReducer,
		default: () => []
	}),

	/**
	 * Pending command awaiting approval (for terminal commands)
	 */
	pendingCommand: Annotation<{ executable: string; args: string[]; cwd?: string } | null>({
		reducer: replaceReducer,
		default: () => null
	}),

	/**
	 * Last verification result
	 */
	lastVerification: Annotation<VerificationResult | null>({
		reducer: replaceReducer,
		default: () => null
	}),

	/**
	 * All applied changes (cumulative, append-only)
	 */
	appliedChanges: Annotation<FileChange[]>({
		reducer: appendReducer,
		default: () => []
	}),

	/**
	 * All applied diffs (cumulative, append-only)
	 * Parallel to appliedChanges but stores diff representation for UI
	 */
	appliedDiffs: Annotation<FileDiff[]>({
		reducer: appendReducer,
		default: () => []
	}),

	// === Context compaction ===

	/**
	 * Compacted summary of previous context (when compaction triggered)
	 * Contains: goals, decisions, progress, changed files, last verification status
	 */
	summary: Annotation<string | null>({
		reducer: replaceReducer,
		default: () => null
	}),

	// === Token budget tracking ===

	/**
	 * Cumulative token usage across the run.
	 * Updated after each LLM call with response.usage values.
	 */
	tokenUsage: Annotation<TokenUsage>({
		reducer: replaceReducer,
		default: () => DEFAULT_TOKEN_USAGE
	}),

	/**
	 * Current context tokens (messages + system prompt + tools).
	 * Updated before each LLM call using actual token counting.
	 */
	currentContextTokens: Annotation<number>({
		reducer: replaceReducer,
		default: () => 0
	}),

	// === Approval state ===

	/**
	 * Whether we're awaiting user approval
	 */
	awaitingApproval: Annotation<boolean>({
		reducer: replaceReducer,
		default: () => false
	}),

	/**
	 * Latest approval response
	 */
	approved: Annotation<ApprovalResponse | null>({
		reducer: replaceReducer,
		default: () => null
	}),

	/**
	 * Reason for requiring approval (for UI display)
	 */
	approvalReason: Annotation<string | null>({
		reducer: replaceReducer,
		default: () => null
	}),

	// === Termination state ===

	/**
	 * Whether the run was aborted
	 */
	aborted: Annotation<boolean>({
		reducer: replaceReducer,
		default: () => false
	}),

	/**
	 * Reason for abort
	 */
	abortReason: Annotation<string | null>({
		reducer: replaceReducer,
		default: () => null
	}),

	/**
	 * Completion summary (set when done successfully)
	 */
	completionSummary: Annotation<string | null>({
		reducer: replaceReducer,
		default: () => null
	}),

	// === Iteration tracking ===

	/**
	 * Number of verify/fix iterations
	 */
	iterations: Annotation<number>({
		reducer: replaceReducer,
		default: () => 0
	}),

	/**
	 * Whether budget has been exceeded
	 */
	budgetExceeded: Annotation<boolean>({
		reducer: replaceReducer,
		default: () => false
	}),

	// === Limit pause state ===

	/**
	 * Whether we hit the recursion limit (set by stream catch)
	 */
	limitReached: Annotation<boolean>({
		reducer: replaceReducer,
		default: () => false
	}),

	/**
	 * Whether user wants to continue after hitting limit (set on resume)
	 */
	limitContinue: Annotation<boolean>({
		reducer: replaceReducer,
		default: () => false
	}),

	// === Messages (append-only) ===

	/**
	 * Chat messages with append-only reducer for LangGraph compatibility.
	 * Messages include: HumanMessage, AIMessage, ToolMessage
	 */
	messages: Annotation<BaseMessage[]>({
		reducer: appendReducer,
		default: () => []
	})
})

/**
 * Type for the full agent state
 */
export type AgentState = typeof AgentStateAnnotation.State

/**
 * Type for partial state updates returned by nodes
 */
export type AgentStateUpdate = Partial<AgentState>

/**
 * Type for input to the agent graph
 */
export type AgentInput = {
	instruction: string
	mode?: RunMode
}

/**
 * Options for creating initial state
 */
export interface CreateInitialStateOptions extends AgentInput {
	/**
	 * Optional state overrides (e.g., from continueFrom previous run)
	 */
	overrides?: Partial<AgentState>
}

/**
 * Helper to create initial state from input
 */
export function createInitialState(input: CreateInitialStateOptions): Partial<AgentState> {
	return {
		// Apply any inherited state first
		...input.overrides,
		// Then set the core values (instruction and mode always come from current request)
		instruction: input.instruction,
		mode: input.mode ?? 'execute',
		phase: 'started'
	}
}

/**
 * Helper to check if the run is complete
 */
export function isComplete(state: AgentState): boolean {
	return state.aborted || !!state.completionSummary || state.budgetExceeded
}

/**
 * Helper to check if we're waiting for user input
 */
export function isWaitingForUser(state: AgentState): boolean {
	return state.awaitingApproval || !!state.pendingQuestion || !!state.limitReached
}
