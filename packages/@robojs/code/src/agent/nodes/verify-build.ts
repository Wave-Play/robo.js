/**
 * Verify build node - runs build command and captures results
 */

import type { AgentState, AgentStateUpdate } from '../state.js'
import type { BuildVerificationResult, BuildError, BuildWarning, VerificationResult } from '../../types/robo.js'
import type { CodeAgentContext } from '../types.js'
import { codeLogger } from '../../core/logger.js'
import { createVerificationDetailEvent } from '../events/debug-events.js'

/**
 * Default build commands to try
 */
const DEFAULT_BUILD_COMMANDS = [
	{ cmd: 'robo', args: ['build'] },
	{ cmd: 'npm', args: ['run', 'build'] },
	{ cmd: 'pnpm', args: ['run', 'build'] },
	{ cmd: 'yarn', args: ['build'] }
]

/**
 * Creates the verify_build node
 *
 * Runs the build command and captures results.
 * Parses output for errors and warnings.
 */
export function verifyBuildNode(context: CodeAgentContext) {
	return async (state: AgentState): Promise<AgentStateUpdate> => {
		codeLogger.debug('Node: verify_build')

		const { provider, policy } = context
		const startTime = Date.now()

		// Determine build command
		const buildCommand = determineBuildCommand(state, context)

		// No build command needed - skip verification (simple projects)
		if (!buildCommand) {
			codeLogger.info('No build command configured - skipping build verification')

			const verification: VerificationResult = {
				success: true,
				build: {
					success: true,
					command: 'none',
					args: [],
					exitCode: 0,
					output: 'No build step configured',
					errors: [],
					warnings: [],
					durationMs: 0
				},
				tests: state.lastVerification?.tests,
				mock: state.lastVerification?.mock,
				timestamp: new Date().toISOString()
			}

			return {
				lastVerification: verification,
				phase: 'verify_build_done'
			}
		}

		codeLogger.info('Running build', { cmd: buildCommand.cmd, args: buildCommand.args })

		// Emit phase event
		context.onEvent?.({ type: 'phase', phase: 'verify_build' })

		try {
			// Run the build command
			const result = await provider.run(buildCommand.cmd, buildCommand.args, {
				timeout: 120_000 // 2 minute timeout for builds
			})

			const durationMs = Date.now() - startTime

			// Parse errors and warnings from output
			const { errors, warnings } = parseOutput(result.output)

			const buildResult: BuildVerificationResult = {
				success: result.exitCode === 0,
				command: buildCommand.cmd,
				args: buildCommand.args,
				exitCode: result.exitCode,
				output: truncateOutput(result.output, 10000),
				errors,
				warnings,
				durationMs
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
			const verification: VerificationResult = {
				success: buildResult.success,
				build: buildResult,
				tests: state.lastVerification?.tests,
				mock: state.lastVerification?.mock,
				timestamp: new Date().toISOString()
			}

			codeLogger.info('Build complete', {
				success: buildResult.success,
				errors: errors.length,
				warnings: warnings.length,
				durationMs
			})

			// Debug event: emit verification detail
			if (context.debugMode) {
				context.onEvent?.(createVerificationDetailEvent('build', result.output, result.exitCode, durationMs))
			}

			return {
				lastVerification: verification,
				phase: 'verify_build_done'
			}
		} catch (error) {
			const durationMs = Date.now() - startTime
			const errorOutput = error instanceof Error ? error.message : String(error)

			codeLogger.error('Build failed with exception:', error)

			// Debug event: emit verification detail for error
			if (context.debugMode) {
				context.onEvent?.(createVerificationDetailEvent('build', errorOutput, -1, durationMs))
			}

			const buildResult: BuildVerificationResult = {
				success: false,
				command: buildCommand.cmd,
				args: buildCommand.args,
				exitCode: -1,
				output: errorOutput,
				errors: [{ message: errorOutput }],
				warnings: [],
				durationMs
			}

			const verification: VerificationResult = {
				success: false,
				build: buildResult,
				tests: state.lastVerification?.tests,
				mock: state.lastVerification?.mock,
				timestamp: new Date().toISOString()
			}

			return {
				lastVerification: verification,
				phase: 'verify_build_error'
			}
		}
	}
}

/**
 * Determine the build command to use
 * Returns null if no build is needed (simple projects without build step)
 */
function determineBuildCommand(state: AgentState, context: CodeAgentContext): { cmd: string; args: string[] } | null {
	// Check for configured build command in policy
	if (context.roboConfig?.buildCommand) {
		return context.roboConfig.buildCommand
	}

	// Check for Robo project
	if (state.projectProfile?.kind !== 'unknown') {
		return { cmd: 'robo', args: ['build'] }
	}

	// Check package scripts for build command
	if (state.projectOverview?.package.scripts?.build) {
		// Use npm/pnpm/yarn based on lock file (default to npm)
		return { cmd: 'npm', args: ['run', 'build'] }
	}

	// No build command available - simple project without build step
	return null
}

/**
 * Parse build output for errors and warnings
 */
function parseOutput(output: string): { errors: BuildError[]; warnings: BuildWarning[] } {
	const errors: BuildError[] = []
	const warnings: BuildWarning[] = []

	const lines = output.split('\n')

	for (const line of lines) {
		// TypeScript errors
		const tsMatch = line.match(/^(.+?)\((\d+),(\d+)\):\s*(error|warning)\s+(TS\d+):\s*(.+)$/)
		if (tsMatch) {
			const entry = {
				file: tsMatch[1],
				line: parseInt(tsMatch[2]),
				column: parseInt(tsMatch[3]),
				code: tsMatch[5],
				message: tsMatch[6]
			}
			if (tsMatch[4] === 'error') {
				errors.push(entry)
			} else {
				warnings.push(entry)
			}
			continue
		}

		// ESLint-style errors
		const eslintMatch = line.match(/^(.+?):(\d+):(\d+):\s*(error|warning)\s+(.+)$/)
		if (eslintMatch) {
			const entry = {
				file: eslintMatch[1],
				line: parseInt(eslintMatch[2]),
				column: parseInt(eslintMatch[3]),
				message: eslintMatch[5]
			}
			if (eslintMatch[4] === 'error') {
				errors.push(entry)
			} else {
				warnings.push(entry)
			}
			continue
		}

		// Generic error patterns
		if (/error/i.test(line) && !/warning/i.test(line)) {
			errors.push({ message: line.trim() })
		} else if (/warning/i.test(line)) {
			warnings.push({ message: line.trim() })
		}
	}

	return { errors, warnings }
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
