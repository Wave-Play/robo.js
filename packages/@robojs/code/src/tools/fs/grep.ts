/**
 * fs_grep tool - Search for content within files
 */

import { z } from 'zod'
import type { ToolDefinition, ToolContext, ToolResult } from '../types.js'
import { successResult, errorResult } from '../types.js'
import { matchesDenyPath } from '../../providers/utils/path.js'
import { CodeAgentError } from '../../errors/index.js'

/**
 * Input schema for fs_grep
 */
export const fsGrepSchema = z.object({
	pattern: z.string().describe('Pattern to search for (string or regex)'),
	path: z.string().optional().describe('Directory to search in'),
	glob: z.string().optional().describe('File pattern to match (e.g., "*.ts")'),
	maxResults: z.number().optional().default(50).describe('Maximum number of matches'),
	contextLines: z.number().optional().default(0).describe('Number of context lines around matches'),
	ignoreCase: z.boolean().optional().default(false).describe('Case-insensitive search')
})

export type FsGrepInput = z.infer<typeof fsGrepSchema>

/**
 * Grep match type
 */
export interface GrepMatch {
	path: string
	line: number
	column: number
	text: string
	context?: {
		before: string[]
		after: string[]
	}
}

/**
 * Output type for fs_grep
 */
export interface FsGrepOutput {
	pattern: string
	matches: GrepMatch[]
	fileCount: number
	matchCount: number
	truncated: boolean
}

/**
 * fs_grep tool definition
 */
export const fsGrepTool: ToolDefinition<FsGrepInput, FsGrepOutput> = {
	name: 'fs_grep',
	description: 'Search for content within files (like grep). Returns matches with file paths and line numbers.',
	schema: fsGrepSchema,

	async execute(input: FsGrepInput, context: ToolContext): Promise<ToolResult<FsGrepOutput>> {
		const { pattern, path, glob, maxResults, contextLines, ignoreCase } = input

		try {
			// First find files
			const searchPath = path ?? '/'
			const files = await context.provider.readdir(searchPath, { recursive: true })

			const matches: GrepMatch[] = []
			const matchedFiles = new Set<string>()
			const regex = new RegExp(pattern, ignoreCase ? 'gi' : 'g')

			for (const file of files) {
				if (matches.length >= maxResults) break
				if (!file.isFile) continue

				// Skip denied paths
				if (matchesDenyPath(file.path, context.policy.denyPaths ?? [])) {
					continue
				}

				// Apply glob filter
				if (glob) {
					const globRegex = new RegExp('^' + glob.replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i')
					if (!globRegex.test(file.name)) continue
				}

				try {
					const content = await context.provider.readFile(file.path)
					const lines = content.split('\n')

					for (let i = 0; i < lines.length && matches.length < maxResults; i++) {
						const line = lines[i]
						let match: RegExpExecArray | null

						regex.lastIndex = 0
						while ((match = regex.exec(line)) !== null && matches.length < maxResults) {
							matchedFiles.add(file.path)

							const grepMatch: GrepMatch = {
								path: file.path,
								line: i + 1,
								column: match.index + 1,
								text: line.trim()
							}

							// Add context lines if requested
							if (contextLines > 0) {
								grepMatch.context = {
									before: lines.slice(Math.max(0, i - contextLines), i),
									after: lines.slice(i + 1, Math.min(lines.length, i + 1 + contextLines))
								}
							}

							matches.push(grepMatch)
						}
					}
				} catch {
					// Skip files that can't be read (binary, etc.)
					continue
				}
			}

			return successResult({
				pattern,
				matches,
				fileCount: matchedFiles.size,
				matchCount: matches.length,
				truncated: matches.length >= maxResults
			})
		} catch (error) {
			if (CodeAgentError.isCodeAgentError(error)) {
				return errorResult(error.message, {
					errorCode: error.code,
					recoverable: error.recoverable
				})
			}

			return errorResult(`Grep failed: ${error instanceof Error ? error.message : String(error)}`, {
				errorCode: 'EXECUTION_FAILED',
				recoverable: true
			})
		}
	}
}
