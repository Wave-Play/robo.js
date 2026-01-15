/**
 * Verify tests node - runs test command and captures results
 */

import type { AgentState, AgentStateUpdate } from '../state.js'
import type { TestVerificationResult, TestFailure, VerificationResult } from '../../types/robo.js'
import type { CodeAgentContext } from '../types.js'
import { codeLogger } from '../../core/logger.js'
import { createVerificationDetailEvent } from '../events/debug-events.js'

/**
 * Test runners to detect and use
 */
const TEST_RUNNERS = [
	{ script: 'test', pattern: /vitest|jest|mocha/ },
	{ script: 'test:unit', pattern: /.*/ },
	{ script: 'test:all', pattern: /.*/ }
]

/**
 * Creates the verify_tests node
 *
 * Runs the test command and captures results.
 * Parses output for test failures.
 */
export function verifyTestsNode(context: CodeAgentContext) {
	return async (state: AgentState): Promise<AgentStateUpdate> => {
		codeLogger.debug('Node: verify_tests')

		const { provider } = context
		const startTime = Date.now()

		// Determine test command
		const testCommand = determineTestCommand(state, context)

		if (!testCommand) {
			codeLogger.info('No test command found, skipping test verification')

			// Mark tests as skipped (success) so reviewer doesn't loop
			const verification: VerificationResult = {
				success: state.lastVerification?.build?.success ?? true,
				build: state.lastVerification?.build,
				tests: {
					success: true,
					command: 'none',
					args: [],
					exitCode: 0,
					output: 'No test command configured - skipped',
					passed: 0,
					failed: 0,
					skipped: 0,
					durationMs: 0,
					failures: []
				},
				mock: state.lastVerification?.mock,
				timestamp: new Date().toISOString()
			}

			return {
				lastVerification: verification,
				phase: 'verify_tests_skip'
			}
		}

		codeLogger.info('Running tests', { cmd: testCommand.cmd, args: testCommand.args })

		// Emit phase event
		context.onEvent?.({ type: 'phase', phase: 'verify_tests' })

		try {
			// Run the test command
			const result = await provider.run(testCommand.cmd, testCommand.args, {
				timeout: 180_000 // 3 minute timeout for tests
			})

			const durationMs = Date.now() - startTime

			// Parse test results from output
			const { passed, failed, skipped, failures } = parseTestOutput(result.output)

			const testResult: TestVerificationResult = {
				success: result.exitCode === 0,
				command: testCommand.cmd,
				args: testCommand.args,
				exitCode: result.exitCode,
				output: truncateOutput(result.output, 10000),
				passed,
				failed,
				skipped,
				durationMs,
				failures
			}

			// Emit terminal output
			context.onEvent?.({
				type: 'terminal',
				chunk: {
					type: 'output',
					text: result.output.slice(0, 5000),
					stream: 'combined'
				}
			})

			// Update verification result
			// Overall success: tests must pass, and build must pass if it exists
			const buildSuccess = state.lastVerification?.build?.success ?? true
			const verification: VerificationResult = {
				success: buildSuccess && testResult.success,
				build: state.lastVerification?.build,
				tests: testResult,
				mock: state.lastVerification?.mock,
				timestamp: new Date().toISOString()
			}

			codeLogger.info('Tests complete', {
				success: testResult.success,
				passed,
				failed,
				skipped,
				durationMs
			})

			// Debug event: emit verification detail
			if (context.debugMode) {
				context.onEvent?.(createVerificationDetailEvent('tests', result.output, result.exitCode, durationMs))
			}

			return {
				lastVerification: verification,
				phase: 'verify_tests_done'
			}
		} catch (error) {
			const durationMs = Date.now() - startTime

			codeLogger.error('Tests failed with exception:', error)

			const testResult: TestVerificationResult = {
				success: false,
				command: testCommand.cmd,
				args: testCommand.args,
				exitCode: -1,
				output: error instanceof Error ? error.message : String(error),
				passed: 0,
				failed: 1,
				skipped: 0,
				durationMs,
				failures: [
					{
						name: 'Test execution',
						message: error instanceof Error ? error.message : String(error)
					}
				]
			}

			const verification: VerificationResult = {
				success: false,
				build: state.lastVerification?.build,
				tests: testResult,
				mock: state.lastVerification?.mock,
				timestamp: new Date().toISOString()
			}

			// Debug event: emit verification detail for error
			if (context.debugMode) {
				context.onEvent?.(
					createVerificationDetailEvent('tests', error instanceof Error ? error.message : String(error), -1, durationMs)
				)
			}

			return {
				lastVerification: verification,
				phase: 'verify_tests_error'
			}
		}
	}
}

/**
 * Determine the test command to use
 */
function determineTestCommand(state: AgentState, context: CodeAgentContext): { cmd: string; args: string[] } | null {
	// Check for configured test command
	if (context.roboConfig?.testCommand) {
		return context.roboConfig.testCommand
	}

	// Check package scripts
	const scripts = state.projectOverview?.package.scripts
	if (!scripts) {
		return null
	}

	// Find a test script
	for (const runner of TEST_RUNNERS) {
		if (scripts[runner.script]) {
			return { cmd: 'npm', args: ['run', runner.script] }
		}
	}

	return null
}

/**
 * Parse test output for results
 */
function parseTestOutput(output: string): {
	passed: number
	failed: number
	skipped: number
	failures: TestFailure[]
} {
	let passed = 0
	let failed = 0
	let skipped = 0
	const failures: TestFailure[] = []

	const lines = output.split('\n')

	// Jest/Vitest style
	const jestSummary = output.match(/Tests:\s+(\d+)\s+passed,\s+(\d+)\s+failed/i)
	if (jestSummary) {
		passed = parseInt(jestSummary[1]) || 0
		failed = parseInt(jestSummary[2]) || 0
	}

	const jestSummaryAlt = output.match(/(\d+)\s+passed,?\s*(\d+)?\s*failed?/i)
	if (jestSummaryAlt && !jestSummary) {
		passed = parseInt(jestSummaryAlt[1]) || 0
		failed = parseInt(jestSummaryAlt[2]) || 0
	}

	// Parse failures
	let currentFailure: Partial<TestFailure> | null = null

	for (const line of lines) {
		// Jest/Vitest failure pattern
		const failMatch = line.match(/✕\s+(.+)$|FAIL\s+(.+)$|failed\s+(.+)$/i)
		if (failMatch) {
			if (currentFailure?.name) {
				failures.push(currentFailure as TestFailure)
			}
			currentFailure = {
				name: failMatch[1] || failMatch[2] || failMatch[3] || 'Unknown test',
				message: ''
			}
			continue
		}

		// Error message
		if (currentFailure && /Error:|AssertionError:|expect\(/.test(line)) {
			currentFailure.message = (currentFailure.message || '') + line.trim() + '\n'
		}

		// Stack trace
		if (currentFailure && /at\s+/.test(line) && /:\d+:\d+/.test(line)) {
			currentFailure.stack = (currentFailure.stack || '') + line.trim() + '\n'

			// Extract file from stack
			const fileMatch = line.match(/at\s+(?:.+\s+)?\(?([\w./\\-]+):(\d+):\d+\)?/)
			if (fileMatch && !currentFailure.file) {
				currentFailure.file = fileMatch[1]
			}
		}

		// Skipped tests
		if (/skipped|pending|todo/i.test(line)) {
			const skipMatch = line.match(/(\d+)\s+(?:skipped|pending|todo)/i)
			if (skipMatch) {
				skipped = parseInt(skipMatch[1]) || 0
			}
		}
	}

	// Add last failure
	if (currentFailure?.name) {
		failures.push(currentFailure as TestFailure)
	}

	return { passed, failed, skipped, failures }
}

/**
 * Truncate output to a maximum length
 */
function truncateOutput(output: string, maxLength: number): string {
	if (output.length <= maxLength) {
		return output
	}

	const half = Math.floor(maxLength / 2)
	return output.slice(0, half) + '\n...[truncated]...\n' + output.slice(-half)
}
