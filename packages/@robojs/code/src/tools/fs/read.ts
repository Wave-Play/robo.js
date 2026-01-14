/**
 * fs_read tool - Read file content
 */

import { z } from 'zod'
import type { ToolDefinition, ToolContext, ToolResult } from '../types.js'
import { successResult, errorResult } from '../types.js'
import { checkFilePolicy } from '../runtime/policy.js'
import { CodeAgentError } from '../../errors/index.js'

/**
 * Input schema for fs_read
 */
export const fsReadSchema = z.object({
	path: z.string().describe('Path to the file to read')
})

export type FsReadInput = z.infer<typeof fsReadSchema>

/**
 * Default max read bytes (64KB)
 */
const DEFAULT_MAX_READ_BYTES = 65536

/**
 * Output type for fs_read
 */
export interface FsReadOutput {
	path: string
	content: string
	size: number
	/**
	 * Total file size in bytes (may differ from size if truncated)
	 */
	totalSize?: number
	/**
	 * Whether the content was truncated due to size limits
	 */
	truncated?: boolean
	/**
	 * Guidance for accessing full content if truncated
	 */
	truncationNote?: string
}

/**
 * fs_read tool definition
 */
export const fsReadTool: ToolDefinition<FsReadInput, FsReadOutput> = {
	name: 'fs_read',
	description: 'Read the content of a file. Returns the file content as a string.',
	schema: fsReadSchema,

	async execute(input: FsReadInput, context: ToolContext): Promise<ToolResult<FsReadOutput>> {
		const { path } = input

		// Check policy
		const policyCheck = checkFilePolicy({ path, operation: 'read' }, context.policy)
		if (!policyCheck.allowed) {
			return errorResult(policyCheck.reason!, {
				errorCode: 'POLICY_VIOLATION',
				recoverable: false
			})
		}

		// Get max read bytes from policy (default 64KB)
		const maxReadBytes = context.policy.fileEviction?.maxReadBytes ?? DEFAULT_MAX_READ_BYTES

		try {
			// Get file stat for size check and stale detection
			let mtimeMs: number | null = null
			let totalSize: number | null = null
			try {
				const stat = await context.provider.stat(path)
				mtimeMs = stat.mtimeMs ?? null
				totalSize = stat.size ?? null
			} catch {
				// Stat failed but file might still be readable
			}

			const content = await context.provider.readFile(path)
			const contentBytes = new TextEncoder().encode(content)
			const actualSize = contentBytes.length

			// Check if truncation is needed
			let finalContent = content
			let finalSize = actualSize
			let truncated = false
			let truncationNote: string | undefined

			if (actualSize > maxReadBytes) {
				// Truncate to maxReadBytes
				const truncatedBytes = contentBytes.slice(0, maxReadBytes)
				finalContent = new TextDecoder().decode(truncatedBytes)
				finalSize = maxReadBytes
				truncated = true
				truncationNote =
					`File is ${actualSize} bytes (${Math.round(actualSize / 1024)}KB). ` +
					`Showing first ${maxReadBytes} bytes (${Math.round(maxReadBytes / 1024)}KB). ` +
					`Use fs_read_range to read specific sections, or fs_read_head/fs_read_tail for previews.`
			}

			// Record read snapshot for stale detection
			if (context.fileTracker) {
				context.fileTracker.record({
					path,
					mtimeMs,
					size: actualSize,
					readAt: Date.now(),
					exists: true
				})
			}

			// Build result
			const result: FsReadOutput = {
				path,
				content: finalContent,
				size: finalSize
			}

			if (truncated) {
				result.totalSize = actualSize
				result.truncated = true
				result.truncationNote = truncationNote
			}

			return successResult(result)
		} catch (error) {
			// Record non-existence for stale detection (file not found)
			if (context.fileTracker) {
				// Check if error indicates file doesn't exist
				const errorMessage = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
				const isNotFound =
					errorMessage.includes('not found') || errorMessage.includes('no such file') || errorMessage.includes('enoent')
				if (isNotFound) {
					context.fileTracker.record({
						path,
						mtimeMs: null,
						size: null,
						readAt: Date.now(),
						exists: false
					})
				}
			}

			if (CodeAgentError.isCodeAgentError(error)) {
				return errorResult(error.message, {
					errorCode: error.code,
					recoverable: error.recoverable
				})
			}

			return errorResult(`Failed to read file: ${error instanceof Error ? error.message : String(error)}`, {
				errorCode: 'EXECUTION_FAILED',
				recoverable: true
			})
		}
	}
}
