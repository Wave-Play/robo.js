/**
 * Context compaction engine for @robojs/code SDK
 *
 * Compacts chat history to stay within context limits while preserving
 * critical information. Per spec requirements:
 * - Trims only `messages` array
 * - Never drops structured fields (plan, profile, verification, projectOverview, acceptance)
 * - Never drops incomplete tool-call turns (AIMessage with tool_calls + all ToolMessages)
 * - Summary includes: goals, decisions, changed files, last verification status
 *
 * Supports both:
 * - Token-based compaction (preferred): Triggers at % of model context limit
 * - Message-based compaction (fallback): Triggers at message count threshold
 */

import { AIMessage, ToolMessage, HumanMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages'
import type { AgentState } from '../state.js'
import type { ContextPolicy } from '../../types/policy.js'
import { codeLogger } from '../../core/logger.js'
import { countMessageTokens } from '../token-counter.js'
import {
	getModelContextLimit,
	calculateTokenThreshold,
	calculateTargetAfterCompaction,
	DEFAULT_TOKEN_POLICY
} from '../token-limits.js'

/**
 * Result of a compaction operation
 */
export interface CompactionResult {
	/**
	 * Structured summary of dropped messages
	 */
	summary: string

	/**
	 * Messages to keep (replacing original messages array)
	 */
	trimmedMessages: BaseMessage[]

	/**
	 * Number of messages dropped
	 */
	droppedCount: number

	/**
	 * Token count before compaction (if token-based)
	 */
	beforeTokens?: number

	/**
	 * Token count after compaction (if token-based)
	 */
	afterTokens?: number
}

/**
 * A group of messages that form a complete tool-call turn.
 * Never split a turn - AIMessage with tool_calls must stay with its ToolMessages.
 */
interface MessageTurn {
	messages: BaseMessage[]
	isToolCallTurn: boolean
}

/**
 * Default compaction policy values
 */
const DEFAULT_COMPACTION_POLICY: ContextPolicy = {
	enableCompaction: true, // Enabled by default for safety
	maxMessagesBeforeCompaction: 50,
	keepLastMessages: 10,
	maxSummaryChars: 2000,
	modelContextLimit: 200000, // Claude default
	tokenThresholdPercent: 0.7,
	reservedOutputTokens: 8192,
	minTokensAfterCompaction: 10000
}

/**
 * Context compactor for long-running sessions.
 *
 * Compaction rules:
 * 1. Only trim the `messages` array
 * 2. Preserve structured fields (plan, profile, verification, etc.)
 * 3. Group messages into "turns" (complete tool-call groups)
 * 4. Never split a turn in the middle
 * 5. Keep the last N turns as specified by policy
 * 6. Summarize dropped turns into a structured summary
 *
 * Token-based compaction (preferred):
 * - Triggers at % of model context limit
 * - Compacts to target % to give headroom
 */
export class ContextCompactor {
	private readonly policy: ContextPolicy
	private readonly modelContextLimit: number

	constructor(policy?: Partial<ContextPolicy>, modelId?: string) {
		this.policy = { ...DEFAULT_COMPACTION_POLICY, ...policy }
		// Use policy limit if provided, otherwise detect from model ID
		this.modelContextLimit = this.policy.modelContextLimit ?? getModelContextLimit(modelId)
	}

	/**
	 * Check if compaction is needed.
	 *
	 * Priority:
	 * 1. Token-based check (if currentTokens provided or modelContextLimit configured)
	 * 2. Fallback to message count check
	 */
	shouldCompact(state: AgentState, currentTokens?: number): boolean {
		if (!this.policy.enableCompaction) {
			return false
		}

		// Token-based check (preferred)
		if (this.modelContextLimit > 0) {
			const threshold = this.getTokenThreshold()
			const tokens = currentTokens ?? this.countMessagesTokens(state.messages)

			if (tokens >= threshold) {
				codeLogger.debug('Token-based compaction triggered', {
					currentTokens: tokens,
					threshold,
					modelLimit: this.modelContextLimit
				})
				return true
			}
		}

		// Fallback to message count
		return state.messages.length > this.policy.maxMessagesBeforeCompaction
	}

	/**
	 * Get the token threshold for triggering compaction.
	 */
	getTokenThreshold(): number {
		return calculateTokenThreshold(
			this.modelContextLimit,
			this.policy.tokenThresholdPercent ?? DEFAULT_TOKEN_POLICY.tokenThresholdPercent,
			this.policy.reservedOutputTokens ?? DEFAULT_TOKEN_POLICY.reservedOutputTokens
		)
	}

	/**
	 * Get the target token count after compaction.
	 */
	getTargetTokensAfterCompaction(): number {
		return calculateTargetAfterCompaction(
			this.modelContextLimit,
			DEFAULT_TOKEN_POLICY.targetAfterCompactionPercent,
			this.policy.reservedOutputTokens ?? DEFAULT_TOKEN_POLICY.reservedOutputTokens,
			this.policy.minTokensAfterCompaction ?? DEFAULT_TOKEN_POLICY.minTokensAfterCompaction
		)
	}

	/**
	 * Get the model context limit being used.
	 */
	getModelContextLimit(): number {
		return this.modelContextLimit
	}

	/**
	 * Count tokens in messages array.
	 */
	private countMessagesTokens(messages: BaseMessage[]): number {
		let total = 0
		for (const msg of messages) {
			total += countMessageTokens(msg)
		}
		return total
	}

	/**
	 * Perform compaction on the state
	 *
	 * Returns a CompactionResult with:
	 * - summary: Structured summary of dropped content
	 * - trimmedMessages: Messages to keep
	 * - droppedCount: Number of messages removed
	 */
	compact(state: AgentState): CompactionResult {
		const { messages } = state
		const keepCount = this.policy.keepLastMessages

		// Calculate tokens before compaction
		const beforeTokens = this.countMessagesTokens(messages)

		codeLogger.debug(`Compacting messages: ${messages.length} -> keep last ${keepCount} turns`)

		// Group messages into turns (complete tool-call groups)
		const turns = this.groupMessagesIntoTurns(messages)

		// Calculate how many turns to keep
		const turnsToKeep = Math.min(turns.length, keepCount)
		const keepTurns = turns.slice(-turnsToKeep)
		const dropTurns = turns.slice(0, turns.length - turnsToKeep)

		// Flatten kept turns back into messages
		const trimmedMessages = keepTurns.flatMap((t) => t.messages)

		// Count dropped messages
		const droppedCount = dropTurns.reduce((sum, t) => sum + t.messages.length, 0)

		// Calculate tokens after compaction
		const afterTokens = this.countMessagesTokens(trimmedMessages)

		// Generate summary from dropped turns and state
		const summary = this.generateSummary(state, dropTurns)

		codeLogger.debug(`Compaction complete: dropped ${droppedCount} messages, ${dropTurns.length} turns`, {
			beforeTokens,
			afterTokens,
			tokensSaved: beforeTokens - afterTokens
		})

		return {
			summary,
			trimmedMessages,
			droppedCount,
			beforeTokens,
			afterTokens
		}
	}

	/**
	 * Perform token-aware compaction to reach a target token count.
	 *
	 * Drops turns from the beginning until the total is under the target,
	 * while respecting keepLastMessages as a minimum.
	 */
	compactWithTokenTarget(state: AgentState, targetTokens?: number): CompactionResult {
		const { messages } = state
		const target = targetTokens ?? this.getTargetTokensAfterCompaction()
		const minKeepTurns = this.policy.keepLastMessages

		// Calculate tokens before compaction
		const beforeTokens = this.countMessagesTokens(messages)

		codeLogger.debug(`Token-aware compaction: ${beforeTokens} tokens -> target ${target}`)

		// Group messages into turns
		const turns = this.groupMessagesIntoTurns(messages)

		// Calculate tokens per turn
		const turnTokens: Array<{ turn: MessageTurn; tokens: number }> = turns.map((turn) => ({
			turn,
			tokens: turn.messages.reduce((sum, msg) => sum + countMessageTokens(msg), 0)
		}))

		// Keep turns from the end until we hit the target or minimum
		let keptTokens = 0
		let keepIndex = turnTokens.length

		for (let i = turnTokens.length - 1; i >= 0; i--) {
			const turnInfo = turnTokens[i]

			// Always keep minimum turns
			if (turnTokens.length - i <= minKeepTurns) {
				keptTokens += turnInfo.tokens
				keepIndex = i
				continue
			}

			// Check if adding this turn would exceed target
			if (keptTokens + turnInfo.tokens > target) {
				break
			}

			keptTokens += turnInfo.tokens
			keepIndex = i
		}

		const keepTurns = turns.slice(keepIndex)
		const dropTurns = turns.slice(0, keepIndex)

		const trimmedMessages = keepTurns.flatMap((t) => t.messages)
		const droppedCount = dropTurns.reduce((sum, t) => sum + t.messages.length, 0)
		const afterTokens = keptTokens

		const summary = this.generateSummary(state, dropTurns)

		codeLogger.debug(`Token-aware compaction complete`, {
			droppedMessages: droppedCount,
			droppedTurns: dropTurns.length,
			beforeTokens,
			afterTokens,
			targetTokens: target,
			tokensSaved: beforeTokens - afterTokens
		})

		return {
			summary,
			trimmedMessages,
			droppedCount,
			beforeTokens,
			afterTokens
		}
	}

	/**
	 * Group messages into turns.
	 *
	 * A "turn" is a logical unit:
	 * - HumanMessage or SystemMessage: standalone turn
	 * - AIMessage without tool_calls: standalone turn
	 * - AIMessage with tool_calls + all following ToolMessages: combined turn
	 *
	 * This ensures we never split a tool-call in the middle.
	 */
	private groupMessagesIntoTurns(messages: BaseMessage[]): MessageTurn[] {
		const turns: MessageTurn[] = []
		let currentTurn: BaseMessage[] = []
		let expectingToolMessages = false

		for (const msg of messages) {
			if (msg instanceof HumanMessage || msg instanceof SystemMessage) {
				// Start a new turn for human/system messages
				if (currentTurn.length > 0) {
					turns.push({
						messages: currentTurn,
						isToolCallTurn: expectingToolMessages
					})
				}
				turns.push({
					messages: [msg],
					isToolCallTurn: false
				})
				currentTurn = []
				expectingToolMessages = false
			} else if (msg instanceof AIMessage) {
				// Check if this AI message has tool calls
				const hasToolCalls = msg.tool_calls && msg.tool_calls.length > 0

				if (currentTurn.length > 0 && !expectingToolMessages) {
					// Previous non-tool-call turn is complete
					turns.push({
						messages: currentTurn,
						isToolCallTurn: false
					})
					currentTurn = []
				}

				if (hasToolCalls) {
					// Start a new tool-call turn
					if (currentTurn.length > 0) {
						turns.push({
							messages: currentTurn,
							isToolCallTurn: expectingToolMessages
						})
					}
					currentTurn = [msg]
					expectingToolMessages = true
				} else {
					// Standalone AI message
					if (expectingToolMessages) {
						// Previous tool-call turn is complete
						turns.push({
							messages: currentTurn,
							isToolCallTurn: true
						})
						currentTurn = []
					}
					turns.push({
						messages: [msg],
						isToolCallTurn: false
					})
					expectingToolMessages = false
				}
			} else if (msg instanceof ToolMessage) {
				// Add to current tool-call turn
				currentTurn.push(msg)
			} else {
				// Unknown message type - treat as standalone
				if (currentTurn.length > 0) {
					turns.push({
						messages: currentTurn,
						isToolCallTurn: expectingToolMessages
					})
					currentTurn = []
				}
				turns.push({
					messages: [msg],
					isToolCallTurn: false
				})
				expectingToolMessages = false
			}
		}

		// Don't forget any remaining messages
		if (currentTurn.length > 0) {
			turns.push({
				messages: currentTurn,
				isToolCallTurn: expectingToolMessages
			})
		}

		return turns
	}

	/**
	 * Generate a structured summary from dropped turns and state.
	 *
	 * Summary includes:
	 * - Goals (original instruction)
	 * - Key decisions made (extracted from AI messages)
	 * - Changed files
	 * - Last verification status
	 */
	private generateSummary(state: AgentState, droppedTurns: MessageTurn[]): string {
		const parts: string[] = []

		// 1. Goals (original instruction)
		if (state.instruction) {
			parts.push(`## Goals\n${state.instruction}`)
		}

		// 2. Plan steps (if available)
		if (state.plan && state.plan.length > 0) {
			const planSummary = state.plan.map((step) => `${step.step}. ${step.title} [${step.status}]`).join('\n')
			parts.push(`\n## Plan\n${planSummary}`)
		}

		// 3. Key decisions (extract from dropped AI messages)
		const decisions = this.extractDecisions(droppedTurns)
		if (decisions.length > 0) {
			parts.push(`\n## Key Decisions\n${decisions.map((d) => `- ${d}`).join('\n')}`)
		}

		// 4. Changed files
		if (state.appliedChanges && state.appliedChanges.length > 0) {
			const filesList = state.appliedChanges.map((c) => `- ${c.path} (${c.type})`).join('\n')
			parts.push(`\n## Files Changed\n${filesList}`)
		}

		// 5. Last verification status
		if (state.lastVerification) {
			const status = state.lastVerification.success ? 'PASSED' : 'FAILED'
			const verificationParts = [`\n## Last Verification: ${status}`]

			if (!state.lastVerification.success) {
				if (state.lastVerification.build?.errors?.length) {
					verificationParts.push(`- Build errors: ${state.lastVerification.build.errors.length}`)
				}
				if (state.lastVerification.tests?.failures?.length) {
					verificationParts.push(`- Test failures: ${state.lastVerification.tests.failures.length}`)
				}
				if (state.lastVerification.mock?.scenarios?.some((s) => s.error)) {
					const failedCount = state.lastVerification.mock.scenarios.filter((s) => s.error).length
					verificationParts.push(`- Mock failures: ${failedCount}`)
				}
			}

			parts.push(verificationParts.join('\n'))
		}

		// 6. Iteration count
		if (state.iterations && state.iterations > 1) {
			parts.push(`\n## Progress\nCompleted ${state.iterations} verification iterations`)
		}

		// Combine and truncate if needed
		let summary = parts.join('\n')

		if (summary.length > this.policy.maxSummaryChars) {
			summary = summary.slice(0, this.policy.maxSummaryChars - 3) + '...'
		}

		return summary
	}

	/**
	 * Extract key decisions from dropped AI messages.
	 *
	 * Looks for patterns that indicate decisions:
	 * - "I will..." / "I'll..."
	 * - "Let me..."
	 * - "I've decided..."
	 * - First sentence of non-tool AI responses
	 */
	private extractDecisions(droppedTurns: MessageTurn[]): string[] {
		const decisions: string[] = []
		const maxDecisions = 10 // Limit to avoid summary bloat

		for (const turn of droppedTurns) {
			if (decisions.length >= maxDecisions) break

			for (const msg of turn.messages) {
				if (decisions.length >= maxDecisions) break

				if (msg instanceof AIMessage) {
					const content =
						typeof msg.content === 'string'
							? msg.content
							: Array.isArray(msg.content)
							? msg.content
									.filter((c) => typeof c === 'object' && 'text' in c)
									.map((c) => (c as { text: string }).text)
									.join(' ')
							: ''

					if (!content) continue

					// Look for decision patterns
					const patterns = [
						/^I (?:will|'ll) (.+?)\.$/m,
						/^Let me (.+?)\.$/m,
						/^I(?:'ve)? decided to (.+?)\.$/m,
						/^(?:First|Next), I (?:will|'ll) (.+?)\.$/m
					]

					for (const pattern of patterns) {
						const match = content.match(pattern)
						if (match && match[1]) {
							const decision = match[1].trim()
							if (decision.length > 10 && decision.length < 200) {
								decisions.push(decision)
								break // Only one decision per message
							}
						}
					}
				}
			}
		}

		return decisions
	}
}

/**
 * Create a context compactor with optional policy override
 */
export function createContextCompactor(policy?: Partial<ContextPolicy>): ContextCompactor {
	return new ContextCompactor(policy)
}
