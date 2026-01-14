/**
 * fs_search tool - Search for files by pattern
 */

import { z } from 'zod'
import type { ToolDefinition, ToolContext, ToolResult } from '../types.js'
import { successResult, errorResult } from '../types.js'
import { CodeAgentError } from '../../errors/index.js'
import { matchesDenyPath } from '../../providers/utils/path.js'

/**
 * Input schema for fs_search
 */
export const fsSearchSchema = z.object({
	pattern: z.string().describe('Search pattern (filename or content)'),
	path: z.string().optional().describe('Directory to search in'),
	glob: z.string().optional().describe('Glob pattern for file matching'),
	maxResults: z.number().optional().default(100).describe('Maximum number of results')
})

export type FsSearchInput = z.infer<typeof fsSearchSchema>

/**
 * Search match type
 */
export interface SearchMatch {
	line: number
	column: number
	text: string
}

/**
 * Search result entry
 */
export interface SearchEntry {
	path: string
	matches?: SearchMatch[]
}

/**
 * Output type for fs_search
 */
export interface FsSearchOutput {
	pattern: string
	results: SearchEntry[]
	count: number
	truncated: boolean
}

/**
 * fs_search tool definition
 */
export const fsSearchTool: ToolDefinition<FsSearchInput, FsSearchOutput> = {
	name: 'fs_search',
	description: 'Search for files matching a pattern. Returns file paths and optionally content matches.',
	schema: fsSearchSchema,

	async execute(input: FsSearchInput, context: ToolContext): Promise<ToolResult<FsSearchOutput>> {
		const { pattern, path, glob, maxResults } = input
		const denyPaths = context.policy.denyPaths ?? []

		try {
			const searchResults = await context.provider.search(pattern, {
				path,
				glob,
				maxResults,
				includeContent: true
			})

			// Filter out deny paths at tool layer (policy enforcement)
			const filteredResults = searchResults.filter((result) => !matchesDenyPath(result.path, denyPaths))

			const results: SearchEntry[] = filteredResults.map((result) => ({
				path: result.path,
				matches: result.matches
			}))

			return successResult({
				pattern,
				results,
				count: results.length,
				truncated: results.length >= maxResults
			})
		} catch (error) {
			if (CodeAgentError.isCodeAgentError(error)) {
				return errorResult(error.message, {
					errorCode: error.code,
					recoverable: error.recoverable
				})
			}

			return errorResult(`Search failed: ${error instanceof Error ? error.message : String(error)}`, {
				errorCode: 'EXECUTION_FAILED',
				recoverable: true
			})
		}
	}
}
