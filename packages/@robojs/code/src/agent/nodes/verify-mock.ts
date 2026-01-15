/**
 * Verify mock node - runs mock server scenarios
 *
 * Uses MockRunner to manage @robojs/mock server sessions and execute
 * mock scenarios for verification.
 */

import type { AgentState, AgentStateUpdate } from '../state.js'
import type { MockVerificationResult, MockScenarioResult, VerificationResult } from '../../types/robo.js'
import type { CodeAgentContext } from '../types.js'
import type { ScenarioSpec } from '../../types/acceptance.js'
import { codeLogger } from '../../core/logger.js'
import { MockRunner } from '../../verification/mock-runner.js'
import { createVerificationDetailEvent } from '../events/debug-events.js'

/**
 * Creates the verify_mock node
 *
 * Runs mock server validation when @robojs/mock is available.
 * This node:
 * 1. Starts mock server as a terminal session
 * 2. Creates a test session via Control API
 * 3. Runs each mock scenario
 * 4. Collects results and cleanup
 */
export function verifyMockNode(context: CodeAgentContext) {
	return async (state: AgentState): Promise<AgentStateUpdate> => {
		codeLogger.debug('Node: verify_mock')

		// Check if mock is available
		if (!state.projectProfile?.hasMock) {
			codeLogger.debug('Mock not available, skipping mock verification')

			// Mark mock as skipped (success) so reviewer doesn't loop
			const verification: VerificationResult = {
				success: (state.lastVerification?.build?.success ?? true) && (state.lastVerification?.tests?.success ?? true),
				build: state.lastVerification?.build,
				tests: state.lastVerification?.tests,
				mock: {
					success: true,
					sessionId: 'none',
					scenarios: [],
					durationMs: 0
				},
				timestamp: new Date().toISOString()
			}

			return {
				lastVerification: verification,
				phase: 'verify_mock_skip'
			}
		}

		// Check if there are mock scenarios
		const mockScenarios = state.acceptance?.scenarios.filter((s) => s.kind === 'mock') ?? []
		if (mockScenarios.length === 0) {
			codeLogger.debug('No mock scenarios, skipping mock verification')

			// Mark mock as skipped (success) so reviewer doesn't loop
			const verification: VerificationResult = {
				success: (state.lastVerification?.build?.success ?? true) && (state.lastVerification?.tests?.success ?? true),
				build: state.lastVerification?.build,
				tests: state.lastVerification?.tests,
				mock: {
					success: true,
					sessionId: 'none',
					scenarios: [],
					durationMs: 0
				},
				timestamp: new Date().toISOString()
			}

			return {
				lastVerification: verification,
				phase: 'verify_mock_skip'
			}
		}

		const startTime = Date.now()

		// Emit phase event
		context.onEvent?.({ type: 'phase', phase: 'verify_mock' })

		try {
			// Run mock scenarios using MockRunner
			const scenarioResults = await runMockScenarios(state, context, mockScenarios)

			const durationMs = Date.now() - startTime

			const success = scenarioResults.every((r) => r.passed)

			const mockResult: MockVerificationResult = {
				success,
				sessionId: `mock_${Date.now()}`,
				scenarios: scenarioResults,
				durationMs
			}

			// Emit mock events
			context.onEvent?.({
				type: 'mock',
				event: {
					type: 'session_end',
					sessionId: mockResult.sessionId,
					success
				}
			})

			// Update verification result
			const verification: VerificationResult = {
				success: (state.lastVerification?.build?.success ?? true) && success,
				build: state.lastVerification?.build,
				tests: state.lastVerification?.tests,
				mock: mockResult,
				timestamp: new Date().toISOString()
			}

			codeLogger.info('Mock verification complete', {
				success,
				scenarios: scenarioResults.length,
				durationMs
			})

			// Debug event: emit verification detail
			if (context.debugMode) {
				// Build summary output from scenario results
				const summaryOutput = scenarioResults
					.map((r) => `${r.passed ? '✓' : '✗'} ${r.title}${r.error ? `: ${r.error}` : ''}`)
					.join('\n')
				context.onEvent?.(createVerificationDetailEvent('mock', summaryOutput, success ? 0 : 1, durationMs))
			}

			return {
				lastVerification: verification,
				phase: 'verify_mock_done'
			}
		} catch (error) {
			const durationMs = Date.now() - startTime

			codeLogger.error('Mock verification failed:', error)

			const mockResult: MockVerificationResult = {
				success: false,
				sessionId: `mock_${Date.now()}`,
				scenarios: [
					{
						id: 'error',
						title: 'Mock execution',
						passed: false,
						assertions: [],
						error: error instanceof Error ? error.message : String(error)
					}
				],
				durationMs
			}

			const verification: VerificationResult = {
				success: false,
				build: state.lastVerification?.build,
				tests: state.lastVerification?.tests,
				mock: mockResult,
				timestamp: new Date().toISOString()
			}

			// Debug event: emit verification detail for error
			if (context.debugMode) {
				context.onEvent?.(
					createVerificationDetailEvent('mock', error instanceof Error ? error.message : String(error), -1, durationMs)
				)
			}

			return {
				lastVerification: verification,
				phase: 'verify_mock_error'
			}
		}
	}
}

/**
 * Run mock scenarios using MockRunner
 *
 * This function manages the full mock validation lifecycle:
 * 1. Start mock server
 * 2. Create session
 * 3. Run each scenario
 * 4. Cleanup (always, even on error)
 */
async function runMockScenarios(
	state: AgentState,
	context: CodeAgentContext,
	scenarios: ScenarioSpec[]
): Promise<MockScenarioResult[]> {
	const { provider } = context

	codeLogger.debug('Running mock scenarios', { count: scenarios.length })

	// Create MockRunner
	const runner = new MockRunner({
		provider,
		onEvent: context.onEvent,
		serverTimeout: 60000, // 60s for server startup
		requestTimeout: 10000 // 10s per request
	})

	try {
		// Start mock server and create session
		const session = await runner.start({
			name: 'code-agent-verification',
			botUser: { username: 'TestBot' },
			guilds: [{ name: 'Test Guild' }]
		})

		const results: MockScenarioResult[] = []

		// Run each scenario
		for (const scenario of scenarios) {
			const result = await runner.runScenario(session, {
				id: scenario.id,
				title: scenario.title,
				steps: scenario.steps,
				assertions: scenario.assertions
			})
			results.push(result)
		}

		// Cleanup
		await runner.stop(session)

		return results
	} catch (error) {
		// Ensure cleanup on error
		await runner.cleanup()
		throw error
	}
}
