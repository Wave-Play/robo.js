/**
 * Run mode and metadata types for @robojs/code SDK
 */

import type { BrandedModelAlias } from './llm.js'

/**
 * Agent run modes
 *
 * - explain: Answer questions grounded in project facts (no edits)
 * - plan: Produce acceptance criteria + plan, ask clarifying questions (no edits)
 * - execute: Implement + verify + iterate until acceptance criteria pass or budget exceeded
 *
 * Default behavior: Plan → (Question Gate if needed) → Execute
 */
export type RunMode = 'explain' | 'plan' | 'execute'

/**
 * Run status
 */
export type RunStatus = 'running' | 'paused' | 'completed' | 'aborted'

/**
 * Metadata for a run (conversation).
 *
 * Hard requirement: runId maps 1:1 to LangGraph thread_id.
 *
 * For "come back later" functionality, you need:
 * - A durable checkpointer (LangGraph checkpoints)
 * - A durable run store (list and load runs)
 */
export interface RunMeta {
	/**
	 * Unique run identifier (maps 1:1 to LangGraph thread_id)
	 */
	runId: string

	/**
	 * LangGraph thread ID.
	 * Equals runId unless explicitly provided in StartRunRequest.
	 */
	threadId: string

	/**
	 * When the run was created
	 */
	createdAt: string

	/**
	 * When the run was last updated
	 */
	updatedAt: string

	/**
	 * Current status
	 */
	status: RunStatus

	/**
	 * Original user instruction
	 */
	instruction: string

	/**
	 * Run mode
	 */
	mode: RunMode

	/**
	 * Last phase the agent was in
	 */
	lastPhase?: string

	/**
	 * Requested model alias (client-side branding)
	 */
	modelAlias?: BrandedModelAlias

	/**
	 * Resolved model from backend (e.g., "openai/gpt-4")
	 */
	resolvedModel?: string

	/**
	 * Number of iterations completed
	 */
	iterations?: number

	/**
	 * Brief summary of current state
	 */
	summary?: string
}

/**
 * Filter options for listing runs
 */
export interface RunFilter {
	status?: RunStatus
	mode?: RunMode
	since?: string
	limit?: number
}

/**
 * A step in the agent's plan
 */
export interface TaskStep {
	/**
	 * Step number (1-indexed)
	 */
	step: number

	/**
	 * Brief title for the step
	 */
	title: string

	/**
	 * Detailed description
	 */
	description: string

	/**
	 * Current status
	 */
	status: 'pending' | 'in_progress' | 'completed' | 'skipped'

	/**
	 * Files this step will likely touch
	 */
	files?: string[]
}

/**
 * A question choice for the Question Gate
 */
export interface QuestionChoice {
	/**
	 * Unique identifier for the choice
	 */
	id: string

	/**
	 * Display label
	 */
	label: string

	/**
	 * Optional description
	 */
	description?: string
}

/**
 * Single question in a multi-question set.
 * Supports 1-4 questions per prompt for gathering related information.
 */
export interface Question {
	/**
	 * Question text to display
	 */
	text: string

	/**
	 * Short header/label for the question (max 12 chars)
	 * Used for compact UI display
	 */
	header?: string

	/**
	 * Available choices for the question (2-4 options)
	 */
	choices?: QuestionChoice[]

	/**
	 * If true, user can select multiple choices
	 */
	multiSelect?: boolean
}

/**
 * Answer to a single question in a multi-question set.
 */
export interface QuestionSetAnswer {
	/**
	 * Question ID (q1, q2, etc.)
	 */
	questionId: string

	/**
	 * Selected choice ID(s)
	 */
	choiceIds: string[]

	/**
	 * Free-text response if "Other" was selected
	 */
	freeText?: string
}

/**
 * Answer to a question from the Question Gate
 */
export interface QuestionAnswer {
	/**
	 * Free-text answer (legacy single-question support)
	 */
	text?: string

	/**
	 * Selected choice ID (legacy single-question support)
	 */
	choiceId?: string

	/**
	 * Answers to multiple questions (new multi-question support)
	 */
	answers?: QuestionSetAnswer[]
}

/**
 * Approval response for file changes
 */
export interface ApprovalResponse {
	/**
	 * Whether the changes are approved
	 */
	approved: boolean

	/**
	 * Optional feedback if not approved
	 */
	feedback?: string
}

/**
 * Request to start a new run
 */
export interface StartRunRequest {
	/**
	 * User instruction
	 */
	input: string

	/**
	 * Run mode (defaults to execute with plan phase)
	 */
	mode?: RunMode

	/**
	 * Preferred model alias
	 */
	modelAlias?: BrandedModelAlias

	/**
	 * Run ID to continue from (e.g., accept plan from Plan mode).
	 * When provided, copies acceptance criteria, plan, and project context
	 * from the previous run to the new run.
	 */
	continueFrom?: string

	/**
	 * Enable debug mode for deep inspection.
	 * When true, the agent emits verbose debug events for tools, LLM calls,
	 * state changes, and decisions.
	 */
	debugMode?: boolean

	/**
	 * Thread ID for multi-turn conversation continuity.
	 * If provided, this run shares LangGraph thread state with other runs using the same threadId.
	 * If omitted, defaults to runId (single-run behavior).
	 */
	threadId?: string
}

/**
 * Result from starting a run
 */
export interface StartRunResult {
	/**
	 * The run ID (use this to stream, resume, or abort)
	 */
	runId: string

	/**
	 * The resolved thread ID.
	 * Equals runId if not explicitly provided in the request.
	 */
	threadId: string
}

/**
 * Request to resume a paused run
 */
export interface ResumeRunRequest {
	/**
	 * Run ID to resume
	 */
	runId: string

	/**
	 * Approval response (if paused for approval)
	 */
	approval?: ApprovalResponse

	/**
	 * Answer to a question (if paused for question)
	 */
	answer?: QuestionAnswer

	/**
	 * Continue after hitting the iteration limit (if paused for limit)
	 */
	continueAfterLimit?: boolean
}

/**
 * Request to abort a run
 */
export interface AbortRunRequest {
	/**
	 * Run ID to abort
	 */
	runId: string

	/**
	 * Reason for aborting
	 */
	reason: string
}

/**
 * Message format for thread hydration
 */
export interface HydrationMessage {
	/**
	 * Message role
	 */
	role: 'user' | 'assistant' | 'system'

	/**
	 * Message content
	 */
	content: string
}

/**
 * Request to hydrate a thread with historical context
 *
 * Use this to restore conversation history after reload without a durable checkpointer.
 * Call this after start() but before stream() to seed the thread's message history.
 */
export interface HydrateThreadRequest {
	/**
	 * Thread ID to hydrate. Must match a threadId used in start().
	 */
	threadId: string

	/**
	 * Messages to seed into the thread's history.
	 * Converted to LangGraph message types internally.
	 */
	messages?: HydrationMessage[]

	/**
	 * Summary of previous context (compacted history).
	 */
	summary?: string
}
