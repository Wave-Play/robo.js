/**
 * Approval Gate node - pauses for user approval when changes need review
 *
 * Uses a state-based approach for browser compatibility:
 * - If awaitingApproval is true and no approval yet, throw NodeInterrupt to pause
 * - When resumed, the SDK's resume() method sets approved on state
 * - On next execution, we detect approval and continue
 */

import { NodeInterrupt } from '@langchain/langgraph/web'
import { AIMessage, ToolMessage } from '@langchain/core/messages'
import type { AgentState, AgentStateUpdate } from '../state.js'
import type { CodeAgentContext } from '../types.js'
import { codeLogger } from '../../core/logger.js'

/**
 * LangGraph config passed to nodes for custom streaming
 */
interface LangGraphConfig {
	/** Writer for custom stream mode - emits events immediately to stream */
	writer?: (data: unknown) => void
}

/**
 * Creates the approval_gate node
 *
 * Browser-compatible implementation using state-based pause:
 * 1. Check if we're awaiting approval
 * 2. If we have an approval response (from resume), apply changes and continue
 * 3. If no approval yet, emit event and throw NodeInterrupt to pause
 *
 * The SDK's resume() method sets approved on state, which is detected
 * on the next execution of this node.
 */
export function approvalGateNode(context: CodeAgentContext) {
	return async (state: AgentState, config?: LangGraphConfig): Promise<AgentStateUpdate> => {
		codeLogger.debug('[ApprovalGate] Node entered', {
			awaitingApproval: state.awaitingApproval,
			hasApproved: !!state.approved,
			pendingChangesCount: state.pendingChanges?.length ?? 0,
			approvalReason: state.approvalReason
		})

		// Not awaiting approval - pass through
		if (!state.awaitingApproval) {
			codeLogger.debug('[ApprovalGate] Not awaiting approval, passing through')
			return { phase: 'approval_gate_skip' }
		}

		// Check if we have an approval response (from resume)
		if (state.approved) {
			const approved = state.approved.approved
			codeLogger.debug('[ApprovalGate] Approval received', { approved })

			if (approved) {
				// User approved - apply the pending changes
				codeLogger.info('[ApprovalGate] Changes approved, applying')

				// Move pending changes to applied
				const appliedChanges = [...(state.appliedChanges ?? []), ...(state.pendingChanges ?? [])]
				const appliedDiffs = [...(state.appliedDiffs ?? []), ...(state.pendingDiffs ?? [])]

				// Emit file_applied events
				for (const change of state.pendingChanges ?? []) {
					context.onEvent?.({ type: 'file_applied', path: change.path })
				}

				// Find the tool call ID from the last AIMessage to create a proper ToolMessage
				// This is required because the LLM expects a tool_result for every tool_use
				const lastAIMessage = [...state.messages].reverse().find((m) => m instanceof AIMessage) as AIMessage | undefined
				const toolCalls = lastAIMessage?.tool_calls ?? []
				const applyChangesCall = toolCalls.find((tc) => tc.name === 'apply_changes')

				// Create ToolMessage with the approval result
				const toolMessages = applyChangesCall
					? [
							new ToolMessage({
								tool_call_id: applyChangesCall.id!,
								content: JSON.stringify({
									success: true,
									message: `Applied ${appliedChanges.length} changes`,
									appliedFiles: (state.pendingChanges ?? []).map((c) => c.path)
								})
							})
					  ]
					: []

				if (!applyChangesCall) {
					codeLogger.warn('[ApprovalGate] No apply_changes tool call found in last AIMessage')
				}

				return {
					awaitingApproval: false,
					approved: null,
					approvalReason: null,
					pendingChanges: [],
					pendingDiffs: [],
					appliedChanges,
					appliedDiffs,
					messages: toolMessages,
					phase: 'approval_gate_approved'
				}
			} else {
				// User rejected - clear pending and continue
				codeLogger.info('[ApprovalGate] Changes rejected')

				// Find the tool call ID from the last AIMessage to create a proper ToolMessage
				const lastAIMessage = [...state.messages].reverse().find((m) => m instanceof AIMessage) as AIMessage | undefined
				const toolCalls = lastAIMessage?.tool_calls ?? []
				const applyChangesCall = toolCalls.find((tc) => tc.name === 'apply_changes')

				// Create ToolMessage with the rejection result
				const toolMessages = applyChangesCall
					? [
							new ToolMessage({
								tool_call_id: applyChangesCall.id!,
								content: JSON.stringify({
									success: false,
									message: 'User rejected the proposed changes',
									rejectedFiles: (state.pendingChanges ?? []).map((c) => c.path)
								})
							})
					  ]
					: []

				return {
					awaitingApproval: false,
					approved: null,
					approvalReason: null,
					pendingChanges: [],
					pendingDiffs: [],
					messages: toolMessages,
					phase: 'approval_gate_rejected'
				}
			}
		}

		// Emit approval_required event before pausing
		// Use config.writer() for guaranteed delivery before interrupt
		const approvalEvent = {
			type: 'approval_required' as const,
			runId: context.runId,
			changes: state.pendingChanges ?? [],
			diffs: state.pendingDiffs ?? [],
			reason: state.approvalReason ?? 'Changes require approval',
			command: state.pendingCommand ?? undefined
		}

		if (config?.writer) {
			// Use custom stream mode for immediate delivery
			config.writer(approvalEvent)
		} else {
			// Fallback to context.onEvent (may not reach stream before interrupt)
			context.onEvent?.(approvalEvent)
		}

		// Throw NodeInterrupt to pause graph execution
		// The SDK's resume() method will set approved and re-invoke the graph
		codeLogger.debug('[ApprovalGate] Throwing NodeInterrupt to pause', {
			pendingChangesCount: state.pendingChanges?.length ?? 0,
			reason: state.approvalReason
		})
		throw new NodeInterrupt(`Awaiting approval: ${state.approvalReason ?? 'Changes require approval'}`)
	}
}
