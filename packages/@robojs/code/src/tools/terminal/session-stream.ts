/**
 * terminal_session_stream tool - Stream output from a session
 */

import { z } from 'zod'
import type { ToolDefinition, ToolContext, ToolResult } from '../types.js'
import { successResult, errorResult } from '../types.js'
import { CodeAgentError } from '../../errors/index.js'

/**
 * Input schema for terminal_session_stream
 */
export const terminalSessionStreamSchema = z.object({
	sessionId: z.string().describe('Session ID from terminal_session_start'),
	maxChunks: z.number().optional().default(100).describe('Maximum number of chunks to collect'),
	timeout: z.number().optional().default(5000).describe('Maximum time to wait for output (ms)')
})

export type TerminalSessionStreamInput = z.infer<typeof terminalSessionStreamSchema>

/**
 * Output type for terminal_session_stream
 */
export interface TerminalSessionStreamOutput {
	sessionId: string
	output: string
	chunkCount: number
	exited: boolean
	exitCode?: number
}

/**
 * terminal_session_stream tool definition
 */
export const terminalSessionStreamTool: ToolDefinition<TerminalSessionStreamInput, TerminalSessionStreamOutput> = {
	name: 'terminal_session_stream',
	description: 'Stream output from a running terminal session. Useful for monitoring dev server or mock server output.',
	schema: terminalSessionStreamSchema,

	async execute(
		input: TerminalSessionStreamInput,
		context: ToolContext
	): Promise<ToolResult<TerminalSessionStreamOutput>> {
		const { sessionId, maxChunks, timeout } = input

		try {
			let output = ''
			let chunkCount = 0
			let exited = false
			let exitCode: number | undefined

			const stream = context.provider.streamSession({ id: sessionId })

			// Set up timeout
			const timeoutPromise = new Promise<void>((resolve) => {
				setTimeout(resolve, timeout)
			})

			// Collect chunks until timeout or maxChunks
			const collectPromise = (async () => {
				for await (const chunk of stream) {
					if (chunk.type === 'output') {
						output += chunk.text ?? ''
						chunkCount++

						// Emit terminal event
						context.onEvent?.({
							type: 'terminal',
							chunk
						})

						if (chunkCount >= maxChunks) break
					} else if (chunk.type === 'exit') {
						exited = true
						exitCode = chunk.exitCode
						break
					}
				}
			})()

			// Race between timeout and collection
			await Promise.race([collectPromise, timeoutPromise])

			return successResult({
				sessionId,
				output,
				chunkCount,
				exited,
				exitCode
			})
		} catch (error) {
			if (CodeAgentError.isCodeAgentError(error)) {
				return errorResult(error.message, {
					errorCode: error.code,
					recoverable: error.recoverable
				})
			}

			return errorResult(`Failed to stream session: ${error instanceof Error ? error.message : String(error)}`, {
				errorCode: 'EXECUTION_FAILED',
				recoverable: true
			})
		}
	}
}
