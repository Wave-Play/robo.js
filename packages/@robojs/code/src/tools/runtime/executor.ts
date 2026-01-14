/**
 * Tool executor for @robojs/code SDK
 *
 * Executes tools with serialization, policy enforcement, and event emission.
 * This is the main runtime component that LangGraph interacts with.
 */

import { z } from 'zod'
import type {
	ToolContext,
	ToolDefinition,
	ToolResult,
	ToolCallResult,
	ToolExecutorConfig,
	PendingToolCall,
	ToolRegistry
} from '../types.js'
import { errorResult } from '../types.js'
import { SerialExecutionQueue } from './serializer.js'
import { PolicyValidator } from './policy.js'
import { codeLogger } from '../../core/logger.js'
import { CodeAgentError } from '../../errors/index.js'
import { FileReadTracker } from '../tracking/file-tracker.js'

/**
 * Tool executor that handles tool execution with serialization and policy enforcement.
 *
 * Key responsibilities:
 * - Validate tool arguments using Zod schemas
 * - Enforce policies before execution
 * - Serialize tool execution (one at a time)
 * - Convert exceptions to tool results
 * - Emit events for UI streaming
 */
export class ToolExecutor {
	private readonly registry: ToolRegistry
	private readonly context: ToolContext
	private readonly policyValidator: PolicyValidator
	private readonly queue: SerialExecutionQueue
	private readonly serialize: boolean
	private readonly timeout: number

	constructor(registry: ToolRegistry, config: ToolExecutorConfig) {
		this.registry = registry
		// Create FileReadTracker for stale detection if not already present
		const fileTracker = config.context.fileTracker ?? new FileReadTracker()
		this.context = {
			...config.context,
			fileTracker
		}
		this.policyValidator = new PolicyValidator(config.context.policy, config.context.runId)
		this.queue = new SerialExecutionQueue()
		this.serialize = config.serialize ?? true
		this.timeout = config.timeout ?? 30_000
	}

	/**
	 * Execute a single tool call
	 */
	async execute(toolCall: PendingToolCall): Promise<ToolCallResult> {
		const startedAt = Date.now()

		codeLogger.debug('[ToolExecutor] Executing tool', {
			toolName: toolCall.toolName,
			callId: toolCall.callId,
			argsPreview: JSON.stringify(toolCall.args).slice(0, 500)
		})

		// Emit tool_call event
		this.context.onEvent?.({
			type: 'tool_call',
			source: 'core',
			name: toolCall.toolName,
			args: toolCall.args
		})

		let result: ToolResult
		try {
			if (this.serialize) {
				// Execute through the serialization queue
				result = await this.queue.enqueue(() => this.executeInternal(toolCall.toolName, toolCall.args))
			} else {
				// Direct execution (not recommended)
				result = await this.executeInternal(toolCall.toolName, toolCall.args)
			}
		} catch (error) {
			// Convert exceptions to tool results
			result = this.exceptionToResult(error)
		}

		const completedAt = Date.now()

		codeLogger.debug('[ToolExecutor] Tool completed', {
			toolName: toolCall.toolName,
			callId: toolCall.callId,
			success: result.success,
			requiresApproval: result.requiresApproval ?? false,
			durationMs: completedAt - startedAt,
			resultPreview: JSON.stringify(result).slice(0, 300)
		})

		// Emit tool_result event
		this.context.onEvent?.({
			type: 'tool_result',
			source: 'core',
			name: toolCall.toolName,
			result
		})

		return {
			callId: toolCall.callId,
			toolName: toolCall.toolName,
			result,
			durationMs: completedAt - startedAt,
			startedAt,
			completedAt
		}
	}

	/**
	 * Execute multiple tool calls (serialized by default)
	 */
	async executeMany(toolCalls: PendingToolCall[]): Promise<ToolCallResult[]> {
		const results: ToolCallResult[] = []

		for (const toolCall of toolCalls) {
			const result = await this.execute(toolCall)
			results.push(result)

			// If a tool requires approval, stop processing further calls
			if (result.result.requiresApproval) {
				codeLogger.debug(`[${this.context.runId}] Stopping execution: tool ${toolCall.toolName} requires approval`)
				break
			}
		}

		return results
	}

	/**
	 * Internal tool execution logic
	 */
	private async executeInternal(toolName: string, args: unknown): Promise<ToolResult> {
		// Get tool from registry
		const tool = this.registry.get(toolName)
		if (!tool) {
			return errorResult(`Unknown tool: ${toolName}`, {
				errorCode: 'UNKNOWN_TOOL',
				recoverable: false
			})
		}

		// Validate arguments
		const parseResult = tool.schema.safeParse(args)
		if (!parseResult.success) {
			// Zod 4 uses 'issues' instead of 'errors'
			const issues =
				parseResult.error.issues ?? (parseResult.error as unknown as { errors?: z.ZodIssue[] }).errors ?? []
			const errorMessage = issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ')

			return errorResult(`Invalid arguments: ${errorMessage}`, {
				errorCode: 'INVALID_ARGS',
				recoverable: false
			})
		}

		// Note: Tools that require approval handle it internally by checking
		// context.policy.autoApprove and returning via approvalRequired() helper.
		// This allows tools to generate proper changes/diffs before requesting approval.

		// Execute with timeout
		const timeoutPromise = new Promise<ToolResult>((_, reject) => {
			setTimeout(() => reject(new Error(`Tool execution timed out after ${this.timeout}ms`)), this.timeout)
		})

		const executionPromise = tool.execute(parseResult.data, this.context)

		try {
			return await Promise.race([executionPromise, timeoutPromise])
		} catch (error) {
			return this.exceptionToResult(error)
		}
	}

	/**
	 * Convert an exception to a tool result
	 */
	private exceptionToResult(error: unknown): ToolResult {
		if (CodeAgentError.isCodeAgentError(error)) {
			return errorResult(error.message, {
				errorCode: error.code,
				recoverable: error.recoverable
			})
		}

		if (error instanceof Error) {
			return errorResult(error.message, {
				errorCode: 'EXECUTION_FAILED',
				recoverable: true
			})
		}

		return errorResult(String(error), {
			errorCode: 'UNKNOWN_ERROR',
			recoverable: true
		})
	}

	/**
	 * Get the policy validator
	 */
	getPolicyValidator(): PolicyValidator {
		return this.policyValidator
	}

	/**
	 * Get queue statistics
	 */
	getQueueStats() {
		return this.queue.getStats()
	}

	/**
	 * Wait for all pending executions to complete
	 */
	async drain(): Promise<void> {
		await this.queue.drain()
	}

	/**
	 * Abort all pending executions
	 */
	abort(reason: string): void {
		this.queue.abort(reason)
	}

	/**
	 * Check if the executor is idle
	 */
	isIdle(): boolean {
		return this.queue.isIdle()
	}

	/**
	 * Get the file read tracker for stale detection
	 */
	getFileTracker(): FileReadTracker {
		return this.context.fileTracker!
	}

	/**
	 * Update the event emitter for this executor.
	 *
	 * Useful because CodeAgent wires the per-run event sink when stream() begins.
	 */
	setOnEvent(onEvent?: ToolContext['onEvent']): void {
		this.context.onEvent = onEvent
	}

	/**
	 * Update the abort signal for this executor.
	 */
	setSignal(signal?: ToolContext['signal']): void {
		this.context.signal = signal
	}

	/**
	 * Create a new ToolExecutor with the same registry and settings, but a new context.
	 *
	 * This is used to bind a shared "template" executor to a specific runId and event sink.
	 * A fresh FileReadTracker is created by default to avoid cross-run leakage.
	 */
	fork(overrides: Partial<ToolContext> & Pick<ToolContext, 'runId'>): ToolExecutor {
		return new ToolExecutor(this.registry, {
			context: {
				...this.context,
				...overrides,
				fileTracker: overrides.fileTracker ?? new FileReadTracker()
			},
			serialize: this.serialize,
			timeout: this.timeout
		})
	}
}

/**
 * Create a tool executor
 */
export function createToolExecutor(registry: ToolRegistry, config: ToolExecutorConfig): ToolExecutor {
	return new ToolExecutor(registry, config)
}

/**
 * Helper to create a pending tool call
 */
export function createToolCall(callId: string, toolName: string, args: unknown): PendingToolCall {
	return {
		callId,
		toolName,
		args,
		queuedAt: Date.now()
	}
}
