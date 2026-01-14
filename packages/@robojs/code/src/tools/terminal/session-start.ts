/**
 * terminal_session_start tool - Start a long-running terminal session
 */

import { z } from 'zod'
import type { ToolDefinition, ToolContext, ToolResult } from '../types.js'
import { successResult, errorResult } from '../types.js'
import { checkCommandPolicy } from '../runtime/policy.js'
import { CodeAgentError } from '../../errors/index.js'

/**
 * Input schema for terminal_session_start
 */
export const terminalSessionStartSchema = z.object({
	command: z.string().describe('Command to execute'),
	args: z.array(z.string()).describe('Arguments to pass to the command'),
	cwd: z.string().optional().describe('Working directory'),
	env: z.record(z.string(), z.string()).optional().describe('Environment variables')
})

export type TerminalSessionStartInput = z.infer<typeof terminalSessionStartSchema>

/**
 * Output type for terminal_session_start
 */
export interface TerminalSessionStartOutput {
	sessionId: string
	command: string
	args: string[]
	pid?: number
}

/**
 * terminal_session_start tool definition
 */
export const terminalSessionStartTool: ToolDefinition<TerminalSessionStartInput, TerminalSessionStartOutput> = {
	name: 'terminal_session_start',
	description:
		'Start a long-running terminal session (like dev server, mock server). Returns a session ID for later streaming or stopping.',
	schema: terminalSessionStartSchema,

	async execute(
		input: TerminalSessionStartInput,
		context: ToolContext
	): Promise<ToolResult<TerminalSessionStartOutput>> {
		const { command, args, cwd, env } = input

		// Check command policy
		const policyCheck = checkCommandPolicy({ command, args }, context.policy)
		if (!policyCheck.allowed) {
			if (policyCheck.canApprove && !context.policy.autoApprove) {
				return {
					success: false,
					requiresApproval: true,
					approvalReason: policyCheck.reason,
					pendingCommand: {
						executable: command,
						args: args ?? [],
						cwd
					}
				}
			}
			return errorResult(policyCheck.reason!, {
				errorCode: 'COMMAND_DENIED',
				recoverable: false
			})
		}

		try {
			const handle = await context.provider.startSession(command, args, {
				cwd,
				env
			})

			return successResult({
				sessionId: handle.id,
				command,
				args,
				pid: handle.pid
			})
		} catch (error) {
			if (CodeAgentError.isCodeAgentError(error)) {
				return errorResult(error.message, {
					errorCode: error.code,
					recoverable: error.recoverable
				})
			}

			return errorResult(`Failed to start session: ${error instanceof Error ? error.message : String(error)}`, {
				errorCode: 'EXECUTION_FAILED',
				recoverable: true
			})
		}
	}
}
