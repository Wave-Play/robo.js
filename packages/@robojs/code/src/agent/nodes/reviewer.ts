/**
 * Reviewer node - evaluates completion and routes to next action
 */

import type { AgentState, AgentStateUpdate } from '../state.js'
import type { AcceptanceStatus, ScenarioStatus } from '../../types/acceptance.js'
import type { CodeAgentContext } from '../types.js'
import { codeLogger } from '../../core/logger.js'

/**
 * Review decision for routing
 */
export interface ReviewDecision {
	needsBuild: boolean
	needsTests: boolean
	needsMock: boolean
	needsMoreWork: boolean
	allPassed: boolean
	budgetExceeded: boolean
}

/**
 * Creates the reviewer node
 *
 * Evaluates whether the task is complete or needs more work.
 * Checks:
 * 1. Are all mustPass scenarios satisfied?
 * 2. Has build/test/mock verification passed?
 * 3. Is the budget exceeded?
 */
export function reviewerNode(context: CodeAgentContext) {
	return async (state: AgentState): Promise<AgentStateUpdate> => {
		codeLogger.debug('[Reviewer] Node entered', {
			iterations: state.iterations,
			mode: state.mode,
			appliedChangesCount: state.appliedChanges?.length ?? 0,
			lastVerificationSuccess: state.lastVerification?.success,
			hasAcceptance: !!state.acceptance
		})

		const { policy } = context

		// Increment iteration count
		const iterations = state.iterations + 1

		// Check budget
		if (iterations >= policy.maxIterations) {
			codeLogger.info('Budget exceeded', { iterations, max: policy.maxIterations })

			// Emit retry event with budget info
			context.onEvent?.({
				type: 'retry',
				iteration: iterations,
				reason: `Budget exceeded (${iterations}/${policy.maxIterations} iterations)`
			})

			return {
				iterations,
				budgetExceeded: true,
				phase: 'reviewer_budget_exceeded'
			}
		}

		// Determine what's needed
		const decision = evaluateCompletion(state, context)

		// Update acceptance status
		const acceptanceStatus = updateAcceptanceStatus(state, decision)

		// Check if we're done
		if (decision.allPassed && acceptanceStatus.satisfied) {
			// CRITICAL FIX: In execute mode, validate that changes were actually made
			// This prevents the agent from "completing" without doing anything
			if (state.mode === 'execute' && (state.appliedChanges?.length ?? 0) === 0) {
				codeLogger.warn('[Reviewer] All verifications passed but NO CHANGES WERE MADE!')
				codeLogger.warn('[Reviewer] Sending back to agent to make changes')

				// Emit retry event explaining the issue
				context.onEvent?.({
					type: 'retry',
					iteration: iterations,
					reason: 'No changes were made - agent needs to implement the requested changes'
				})

				return {
					iterations,
					acceptanceStatus,
					phase: 'reviewer_continue'
				}
			}

			codeLogger.info('[Reviewer] All scenarios passed, completing', {
				appliedChangesCount: state.appliedChanges?.length ?? 0
			})

			const summary = generateCompletionSummary(state)

			// Emit complete event
			context.onEvent?.({
				type: 'complete',
				summary,
				changes: state.appliedChanges,
				verification: state.lastVerification ?? undefined
			})

			return {
				iterations,
				acceptanceStatus,
				completionSummary: summary,
				phase: 'reviewer_complete'
			}
		}

		// Emit retry event
		context.onEvent?.({
			type: 'retry',
			iteration: iterations,
			reason: decision.needsBuild
				? 'Build verification needed'
				: decision.needsTests
				? 'Test verification needed'
				: decision.needsMock
				? 'Mock verification needed'
				: 'More work needed'
		})

		return {
			iterations,
			acceptanceStatus,
			phase: 'reviewer_continue'
		}
	}
}

/**
 * Evaluate what's needed for completion
 */
function evaluateCompletion(state: AgentState, context: CodeAgentContext): ReviewDecision {
	const decision: ReviewDecision = {
		needsBuild: false,
		needsTests: false,
		needsMock: false,
		needsMoreWork: false,
		allPassed: true,
		budgetExceeded: false
	}

	// If no acceptance criteria, default to just needing build
	if (!state.acceptance) {
		decision.needsBuild = !state.lastVerification?.build?.success
		decision.allPassed = state.lastVerification?.build?.success ?? false
		return decision
	}

	// Check each mustPass scenario
	for (const scenarioId of state.acceptance.mustPass) {
		const scenario = state.acceptance.scenarios.find((s) => s.id === scenarioId)
		if (!scenario) continue

		const status = state.acceptanceStatus?.scenarios.find((s) => s.id === scenarioId)

		// If already passed, skip
		if (status?.status === 'passed') continue

		// Mark as not all passed
		decision.allPassed = false

		// Determine what's needed based on scenario kind
		switch (scenario.kind) {
			case 'build':
				if (!state.lastVerification?.build?.success) {
					decision.needsBuild = true
				}
				break

			case 'test':
				if (!state.lastVerification?.tests?.success) {
					decision.needsTests = true
				}
				break

			case 'mock':
				if (state.projectProfile?.hasMock && !state.lastVerification?.mock?.success) {
					decision.needsMock = true
				}
				break

			case 'manual':
				// Manual scenarios need user confirmation
				decision.needsMoreWork = true
				break
		}
	}

	// If verification ran and all passed, update allPassed
	if (state.lastVerification?.success) {
		const allMustPassDone = state.acceptance.mustPass.every((id) => {
			const scenario = state.acceptance?.scenarios.find((s) => s.id === id)
			if (!scenario) return true

			switch (scenario.kind) {
				case 'build':
					return state.lastVerification?.build?.success
				case 'test':
					return state.lastVerification?.tests?.success
				case 'mock':
					return state.lastVerification?.mock?.success
				case 'manual':
					return false // Manual always needs confirmation
			}
		})

		if (allMustPassDone) {
			decision.allPassed = true
		}
	}

	return decision
}

/**
 * Update acceptance status based on verification results
 */
function updateAcceptanceStatus(state: AgentState, decision: ReviewDecision): AcceptanceStatus {
	const scenarios: ScenarioStatus[] = []

	for (const scenario of state.acceptance?.scenarios ?? []) {
		const existing = state.acceptanceStatus?.scenarios.find((s) => s.id === scenario.id)

		let status: ScenarioStatus['status'] = existing?.status ?? 'pending'

		// Update status based on verification results
		if (state.lastVerification) {
			switch (scenario.kind) {
				case 'build':
					status = state.lastVerification.build?.success ? 'passed' : 'failed'
					break
				case 'test':
					status = state.lastVerification.tests?.success ? 'passed' : 'failed'
					break
				case 'mock':
					status = state.lastVerification.mock?.success ? 'passed' : 'failed'
					break
			}
		}

		scenarios.push({
			id: scenario.id,
			status,
			attempts: (existing?.attempts ?? 0) + (status === 'failed' ? 1 : 0),
			lastAttemptAt: new Date().toISOString()
		})
	}

	// Check if all mustPass are satisfied
	const satisfied = (state.acceptance?.mustPass ?? []).every((id) => {
		const status = scenarios.find((s) => s.id === id)
		return status?.status === 'passed'
	})

	return {
		satisfied,
		scenarios,
		iterations: state.iterations + 1,
		budgetExceeded: decision.budgetExceeded,
		updatedAt: new Date().toISOString()
	}
}

/**
 * Generate completion summary
 */
function generateCompletionSummary(state: AgentState): string {
	const parts: string[] = []

	parts.push('Task completed successfully.')

	if (state.acceptance) {
		parts.push(`\nRequirements met:`)
		for (const bullet of state.acceptance.requirements.featureBullets) {
			parts.push(`- ${bullet}`)
		}
	}

	if (state.appliedChanges.length > 0) {
		parts.push(`\nFiles modified: ${state.appliedChanges.length}`)
		for (const change of state.appliedChanges.slice(0, 5)) {
			parts.push(`- ${change.path} (${change.type})`)
		}
		if (state.appliedChanges.length > 5) {
			parts.push(`... and ${state.appliedChanges.length - 5} more`)
		}
	}

	if (state.lastVerification) {
		parts.push(`\nVerification: ${state.lastVerification.success ? 'PASSED' : 'FAILED'}`)
	}

	return parts.join('\n')
}
