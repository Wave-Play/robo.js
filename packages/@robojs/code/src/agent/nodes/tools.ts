/**
 * Tools node - executes tool calls from the agent
 */

import { ToolMessage, AIMessage, type BaseMessage } from '@langchain/core/messages'
import type { AgentState, AgentStateUpdate } from '../state.js'
import type { CodeAgentContext } from '../types.js'
import { createToolCall, type ToolExecutor } from '../../tools/runtime/executor.js'
import { codeLogger } from '../../core/logger.js'
import type { FileDiff, FileChange } from '../../types/changes.js'
import { createToolTimingEvent } from '../events/debug-events.js'

/**
 * LangGraph config passed to nodes for custom streaming
 */
interface LangGraphConfig {
	/** Writer for custom stream mode - emits events immediately to stream */
	writer?: (data: unknown) => void
}

/**
 * Creates the tools node
 *
 * Executes tool calls from the agent using the ToolExecutor from Phase 2.
 * Tool execution is serialized (one at a time) for determinism.
 * Converts tool results to ToolMessage format for LangGraph.
 */
export function toolsNode(context: CodeAgentContext) {
	return async (state: AgentState, config?: LangGraphConfig): Promise<AgentStateUpdate> => {
		codeLogger.debug('Node: tools')

		const { toolExecutor } = context

		// Get the last message (should be AIMessage with tool_calls)
		const lastMessage = state.messages[state.messages.length - 1]

		if (!isAIMessageWithToolCalls(lastMessage)) {
			// No tool calls to execute
			codeLogger.debug('No tool calls in last message')
			return { phase: 'tools_no_calls' }
		}

		const toolCalls = lastMessage.tool_calls
		const toolMessages: ToolMessage[] = []

		// Track applied diffs from apply_changes tool
		const collectedAppliedDiffs: FileDiff[] = []
		const collectedAppliedChanges: FileChange[] = []

		// Execute tools serially
		codeLogger.debug('[ToolsNode] Processing tool calls', {
			toolCallCount: toolCalls.length,
			tools: toolCalls.map((tc) => tc.name)
		})

		for (const tc of toolCalls) {
			const callId = tc.id ?? `tool_${Date.now()}`
			const toolName = tc.name
			const args = tc.args

			codeLogger.debug('[ToolsNode] Executing tool', {
				toolName,
				callId,
				argsPreview: JSON.stringify(args).slice(0, 300)
			})

			const pendingCall = createToolCall(callId, toolName, args)
			const toolStartTime = Date.now()

			try {
				const result = await toolExecutor.execute(pendingCall)
				const toolDurationMs = Date.now() - toolStartTime

				// Debug event: emit tool timing
				if (context.debugMode) {
					context.onEvent?.(createToolTimingEvent(toolName, toolDurationMs, callId))
				}

				// Check if approval is required
				if (result.result.requiresApproval) {
					codeLogger.debug('[ToolsNode] Tool requires approval', {
						toolName,
						pendingChangesCount: result.result.pendingChanges?.length ?? 0,
						reason: result.result.approvalReason
					})

					// CRITICAL: Add a placeholder ToolMessage for the pending tool
					// Anthropic requires every tool_use to have a corresponding tool_result
					// Without this, resuming would send invalid message history
					toolMessages.push(
						new ToolMessage({
							content: JSON.stringify({
								success: true,
								awaiting_approval: true,
								message: 'Changes are pending user approval',
								pendingChangesCount: result.result.pendingChanges?.length ?? 0
							}),
							tool_call_id: callId,
							name: toolName
						})
					)

					// Emit approval_required event
					// Use config.writer() for immediate delivery if available
					const approvalEvent = {
						type: 'approval_required' as const,
						runId: context.runId,
						changes: result.result.pendingChanges ?? [],
						diffs: result.result.pendingDiffs,
						reason: result.result.approvalReason,
						command: result.result.pendingCommand
					}

					if (config?.writer) {
						config.writer(approvalEvent)
					} else {
						context.onEvent?.(approvalEvent)
					}

					// Return state update with pending changes
					// The approval_gate node will handle the interrupt
					return {
						pendingChanges: result.result.pendingChanges ?? [],
						pendingDiffs: result.result.pendingDiffs ?? [],
						pendingCommand: result.result.pendingCommand ?? null,
						awaitingApproval: true,
						approvalReason: result.result.approvalReason ?? 'Changes require approval',
						messages: toolMessages,
						phase: 'tools_awaiting_approval'
					}
				}

				codeLogger.debug('[ToolsNode] Tool executed successfully', {
					toolName,
					callId,
					success: result.result.success,
					resultPreview: JSON.stringify(result.result).slice(0, 200)
				})

				// Create ToolMessage with result
				toolMessages.push(
					new ToolMessage({
						content: formatToolResult(result.result),
						tool_call_id: callId,
						name: toolName
					})
				)

				// Emit file_applied event for successful file write tools
				if (result.result.success && result.result.data && toolName === 'fs_write') {
					const writeData = result.result.data as { path?: string }
					if (writeData.path) {
						context.onEvent?.({ type: 'file_applied', path: writeData.path })
					}

					// Record the write as an applied change so reviewer/completion logic can verify work happened.
					// Note: apply_changes already reports structured changes/diffs; fs_write should still count.
					const writeArgs = args as { path?: string; content?: string }
					if (writeData.path && typeof writeArgs?.content === 'string') {
						const created = (result.result.data as { created?: boolean }).created ?? false
						collectedAppliedChanges.push({
							path: writeData.path,
							type: created ? 'create' : 'modify',
							content: writeArgs.content
						})
					}
				}

				// Record successful deletes as applied changes (apply_changes handles this too, but fs_delete should still count)
				if (result.result.success && result.result.data && toolName === 'fs_delete') {
					const deleteData = result.result.data as { path?: string; deleted?: boolean }
					if (deleteData.path && deleteData.deleted) {
						context.onEvent?.({ type: 'file_applied', path: deleteData.path })
						collectedAppliedChanges.push({
							path: deleteData.path,
							type: 'delete'
						})
					}
				}

				// Capture applied diffs from apply_changes tool
				if (result.result.success && result.result.data && toolName === 'apply_changes') {
					const applyData = result.result.data as {
						appliedDiffs?: FileDiff[]
						changes?: FileChange[]
					}
					if (applyData.appliedDiffs) {
						collectedAppliedDiffs.push(...applyData.appliedDiffs)
					}
					if (applyData.changes) {
						collectedAppliedChanges.push(...applyData.changes)
					}
				}
			} catch (error) {
				const toolDurationMs = Date.now() - toolStartTime

				// Debug event: emit tool timing even on error
				if (context.debugMode) {
					context.onEvent?.(createToolTimingEvent(toolName, toolDurationMs, callId))
				}

				// Convert exception to tool result (preserve tool_call_id)
				codeLogger.warn('Tool execution error:', { toolName, error })

				const errorMessage = error instanceof Error ? error.message : String(error)

				toolMessages.push(
					new ToolMessage({
						content: JSON.stringify({
							success: false,
							error: errorMessage,
							recoverable: true
						}),
						tool_call_id: callId,
						name: toolName
					})
				)
			}
		}

		// Build state update
		const stateUpdate: AgentStateUpdate = {
			messages: toolMessages,
			phase: 'tools_done'
		}

		// Include applied diffs/changes if any were collected
		if (collectedAppliedDiffs.length > 0) {
			stateUpdate.appliedDiffs = collectedAppliedDiffs
		}
		if (collectedAppliedChanges.length > 0) {
			stateUpdate.appliedChanges = collectedAppliedChanges
		}

		return stateUpdate
	}
}

/**
 * Type guard for AIMessage with tool_calls
 */
function isAIMessageWithToolCalls(
	msg: BaseMessage | undefined
): msg is AIMessage & { tool_calls: Array<{ id?: string; name: string; args: unknown }> } {
	if (!msg) return false
	if (!(msg instanceof AIMessage)) return false
	if (!msg.tool_calls) return false
	if (!Array.isArray(msg.tool_calls)) return false
	return msg.tool_calls.length > 0
}

/**
 * Format tool result for message content
 */
function formatToolResult(result: unknown): string {
	if (typeof result === 'string') {
		return result
	}

	if (result && typeof result === 'object') {
		const obj = result as Record<string, unknown>

		// If it has success/error fields, format nicely
		if ('success' in obj) {
			if (obj.success) {
				return JSON.stringify(obj.data ?? 'ok')
			} else {
				return JSON.stringify({
					error: obj.error ?? 'Unknown error',
					recoverable: obj.recoverable ?? true
				})
			}
		}
	}

	return JSON.stringify(result)
}
