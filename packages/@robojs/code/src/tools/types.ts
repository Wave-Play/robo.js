/**
 * Tool types for @robojs/code SDK
 *
 * These types define the structure for tools that can be used by the agent.
 * Tools are LangGraph-compatible and use Zod for schema validation.
 */

import { z } from 'zod'
import type { ExecutionProvider } from '../types/execution.js'
import type { AgentPolicy } from '../types/policy.js'
import type { AgentEvent } from '../types/events.js'
import type { FileChange, FileDiff } from '../types/changes.js'
import type { FileReadTracker } from './tracking/file-tracker.js'

// ============================================================================
// Tool Definition Types
// ============================================================================

/**
 * Context provided to tool execution
 */
export interface ToolContext {
	/**
	 * The execution provider for filesystem and command operations
	 */
	provider: ExecutionProvider

	/**
	 * Agent policy for security and behavior constraints
	 */
	policy: AgentPolicy

	/**
	 * Unique identifier for the current run
	 */
	runId: string

	/**
	 * Optional callback for emitting agent events
	 */
	onEvent?: (event: AgentEvent) => void

	/**
	 * Abort signal for cancellation
	 */
	signal?: AbortSignal

	/**
	 * Tracks file state from reads for stale detection
	 *
	 * When present, read operations record file metadata (mtime, size)
	 * and write operations check for staleness before overwriting.
	 */
	fileTracker?: FileReadTracker
}

/**
 * Result from a tool execution
 */
export interface ToolResult<T = unknown> {
	/**
	 * Whether the tool execution succeeded
	 */
	success: boolean

	/**
	 * The result data (only present on success)
	 */
	data?: T

	/**
	 * Error message (only present on failure)
	 */
	error?: string

	/**
	 * Error code for programmatic handling
	 */
	errorCode?: string

	/**
	 * Whether the error is recoverable (agent can retry)
	 */
	recoverable?: boolean

	/**
	 * Whether approval is required to proceed
	 */
	requiresApproval?: boolean

	/**
	 * Changes pending approval (when requiresApproval is true)
	 */
	pendingChanges?: FileChange[]

	/**
	 * Diffs for pending changes (when requiresApproval is true)
	 */
	pendingDiffs?: FileDiff[]

	/**
	 * Reason for requiring approval
	 */
	approvalReason?: string

	/**
	 * Command details for terminal approval
	 */
	pendingCommand?: {
		executable: string
		args: string[]
		cwd?: string
	}
}

/**
 * Definition of a tool that can be executed by the agent
 */
export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
	/**
	 * Unique name of the tool (e.g., 'fs_read', 'terminal_run')
	 */
	name: string

	/**
	 * Human-readable description for LLM understanding
	 */
	description: string

	/**
	 * Zod schema for input validation and JSON schema generation
	 * Uses ZodType with any input to allow default values and transforms
	 */
	schema: z.ZodType<TInput, z.ZodTypeDef, unknown>

	/**
	 * Execute the tool with validated input
	 */
	execute: (input: TInput, context: ToolContext) => Promise<ToolResult<TOutput>>

	/**
	 * Whether this tool can modify the filesystem
	 */
	mutates?: boolean

	/**
	 * Whether this tool requires approval before execution
	 */
	requiresApproval?: boolean
}

// ============================================================================
// Tool Executor Types
// ============================================================================

/**
 * A pending tool call waiting to be executed
 */
export interface PendingToolCall {
	/**
	 * Unique ID for this tool call (from LLM)
	 */
	callId: string

	/**
	 * Name of the tool to execute
	 */
	toolName: string

	/**
	 * Arguments for the tool (pre-validation)
	 */
	args: unknown

	/**
	 * Timestamp when the call was queued
	 */
	queuedAt: number
}

/**
 * Result of a tool call including metadata
 */
export interface ToolCallResult {
	/**
	 * ID of the tool call
	 */
	callId: string

	/**
	 * Name of the tool
	 */
	toolName: string

	/**
	 * The tool result
	 */
	result: ToolResult

	/**
	 * Execution duration in milliseconds
	 */
	durationMs: number

	/**
	 * Timestamp when execution started
	 */
	startedAt: number

	/**
	 * Timestamp when execution completed
	 */
	completedAt: number
}

/**
 * Configuration for the tool executor
 */
export interface ToolExecutorConfig {
	/**
	 * Tool context for execution
	 */
	context: ToolContext

	/**
	 * Whether to enforce serial execution (default: true)
	 */
	serialize?: boolean

	/**
	 * Maximum time to wait for a tool to complete (ms)
	 */
	timeout?: number
}

// ============================================================================
// Tool Registry Types
// ============================================================================

/**
 * Registry of available tools
 */
export interface ToolRegistry {
	/**
	 * Register a tool
	 */
	register<TInput, TOutput>(tool: ToolDefinition<TInput, TOutput>): void

	/**
	 * Get a tool by name
	 */
	get(name: string): ToolDefinition | undefined

	/**
	 * Get all registered tools
	 */
	getAll(): ToolDefinition[]

	/**
	 * Get tool schemas for LLM binding
	 */
	getSchemas(): ToolSchema[]

	/**
	 * Check if a tool exists
	 */
	has(name: string): boolean
}

/**
 * Tool schema for LLM binding (JSON Schema format)
 */
export interface ToolSchema {
	/**
	 * Tool name
	 */
	name: string

	/**
	 * Tool description
	 */
	description: string

	/**
	 * JSON Schema for parameters
	 */
	parameters: Record<string, unknown>
}

// ============================================================================
// Policy Check Types
// ============================================================================

/**
 * Result of a policy check
 */
export interface PolicyCheckResult {
	/**
	 * Whether the action is allowed
	 */
	allowed: boolean

	/**
	 * Reason for denial (if not allowed)
	 */
	reason?: string

	/**
	 * Whether approval can override the denial
	 */
	canApprove?: boolean
}

/**
 * Command policy check request
 */
export interface CommandPolicyCheck {
	/**
	 * Command to execute
	 */
	command: string

	/**
	 * Arguments for the command
	 */
	args: string[]
}

/**
 * File policy check request
 */
export interface FilePolicyCheck {
	/**
	 * Path to check
	 */
	path: string

	/**
	 * Operation type
	 */
	operation: 'read' | 'write' | 'delete' | 'list'

	/**
	 * Size in bytes (for write operations)
	 */
	size?: number
}

// ============================================================================
// Serializer Types
// ============================================================================

/**
 * Queue item for serialized execution
 */
export interface QueuedExecution<T = unknown> {
	/**
	 * Unique ID for this execution
	 */
	id: string

	/**
	 * The async function to execute
	 */
	execute: () => Promise<T>

	/**
	 * Promise that resolves with the result
	 */
	promise: Promise<T>

	/**
	 * Resolve function for the promise
	 */
	resolve: (value: T) => void

	/**
	 * Reject function for the promise
	 */
	reject: (error: Error) => void

	/**
	 * Timestamp when queued
	 */
	queuedAt: number
}

/**
 * Stats for the execution queue
 */
export interface ExecutionQueueStats {
	/**
	 * Number of items currently in queue
	 */
	queueLength: number

	/**
	 * Whether currently executing
	 */
	isExecuting: boolean

	/**
	 * Total items processed
	 */
	totalProcessed: number

	/**
	 * Total execution time (ms)
	 */
	totalExecutionTime: number
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a successful tool result
 */
export function successResult<T>(data: T): ToolResult<T> {
	return {
		success: true,
		data
	}
}

/**
 * Create a failed tool result
 */
export function errorResult<T = never>(
	error: string,
	options?: {
		errorCode?: string
		recoverable?: boolean
	}
): ToolResult<T> {
	return {
		success: false,
		error,
		errorCode: options?.errorCode,
		recoverable: options?.recoverable ?? true
	} as ToolResult<T>
}

/**
 * Create a result requiring approval
 */
export function approvalRequired<T = never>(changes: FileChange[], diffs: FileDiff[], reason: string): ToolResult<T> {
	return {
		success: false,
		requiresApproval: true,
		pendingChanges: changes,
		pendingDiffs: diffs,
		approvalReason: reason
	} as ToolResult<T>
}
