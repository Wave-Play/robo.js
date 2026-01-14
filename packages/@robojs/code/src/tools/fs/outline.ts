/**
 * fs_outline tool - Get structural outline of files
 */

import { z } from 'zod'
import type { ToolDefinition, ToolContext, ToolResult } from '../types.js'
import { successResult, errorResult } from '../types.js'
import { checkFilePolicy } from '../runtime/policy.js'
import { CodeAgentError } from '../../errors/index.js'

/**
 * Input schema for fs_outline
 */
export const fsOutlineSchema = z.object({
	path: z.string().describe('Path to the file'),
	includePrivate: z.boolean().optional().default(false).describe('Include private members')
})

export type FsOutlineInput = z.infer<typeof fsOutlineSchema>

/**
 * Symbol types
 */
export type SymbolType =
	| 'class'
	| 'interface'
	| 'function'
	| 'method'
	| 'property'
	| 'const'
	| 'let'
	| 'var'
	| 'type'
	| 'enum'
	| 'import'
	| 'export'

/**
 * Outline symbol
 */
export interface OutlineSymbol {
	name: string
	type: SymbolType
	line: number
	signature?: string
	children?: OutlineSymbol[]
	isExported?: boolean
	isPrivate?: boolean
}

/**
 * Output type for fs_outline
 */
export interface FsOutlineOutput {
	path: string
	language: string
	symbols: OutlineSymbol[]
	symbolCount: number
}

/**
 * Simple regex-based outline parser for TypeScript/JavaScript
 * This is a basic implementation - production would use a proper parser
 */
function parseOutline(content: string, includePrivate: boolean): OutlineSymbol[] {
	const symbols: OutlineSymbol[] = []
	const lines = content.split('\n')

	// Regex patterns for common constructs
	const patterns: Array<{ type: SymbolType; regex: RegExp; exported: boolean }> = [
		// Export patterns
		{ type: 'function', regex: /^export\s+(?:async\s+)?function\s+(\w+)/m, exported: true },
		{ type: 'class', regex: /^export\s+(?:abstract\s+)?class\s+(\w+)/m, exported: true },
		{ type: 'interface', regex: /^export\s+interface\s+(\w+)/m, exported: true },
		{ type: 'type', regex: /^export\s+type\s+(\w+)/m, exported: true },
		{ type: 'const', regex: /^export\s+const\s+(\w+)/m, exported: true },
		{ type: 'enum', regex: /^export\s+enum\s+(\w+)/m, exported: true },

		// Non-export patterns
		{ type: 'function', regex: /^(?:async\s+)?function\s+(\w+)/m, exported: false },
		{ type: 'class', regex: /^(?:abstract\s+)?class\s+(\w+)/m, exported: false },
		{ type: 'interface', regex: /^interface\s+(\w+)/m, exported: false },
		{ type: 'type', regex: /^type\s+(\w+)/m, exported: false },
		{ type: 'const', regex: /^const\s+(\w+)/m, exported: false },
		{ type: 'let', regex: /^let\s+(\w+)/m, exported: false },
		{ type: 'var', regex: /^var\s+(\w+)/m, exported: false },
		{ type: 'enum', regex: /^enum\s+(\w+)/m, exported: false }
	]

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim()

		// Skip empty lines and comments
		if (!line || line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) {
			continue
		}

		// Check for private (starts with _ or has private keyword)
		const isPrivate = line.includes('private ') || /^\s*_\w+/.test(line)
		if (isPrivate && !includePrivate) {
			continue
		}

		for (const pattern of patterns) {
			const match = line.match(pattern.regex)
			if (match) {
				symbols.push({
					name: match[1],
					type: pattern.type,
					line: i + 1,
					signature: line.slice(0, 100), // First 100 chars as signature
					isExported: pattern.exported,
					isPrivate
				})
				break
			}
		}
	}

	return symbols
}

/**
 * Detect language from file path
 */
function detectLanguage(path: string): string {
	const ext = path.split('.').pop()?.toLowerCase()
	const langMap: Record<string, string> = {
		ts: 'typescript',
		tsx: 'typescript',
		js: 'javascript',
		jsx: 'javascript',
		mjs: 'javascript',
		cjs: 'javascript',
		json: 'json',
		md: 'markdown',
		py: 'python',
		rs: 'rust',
		go: 'go'
	}
	return langMap[ext ?? ''] ?? 'unknown'
}

/**
 * fs_outline tool definition
 */
export const fsOutlineTool: ToolDefinition<FsOutlineInput, FsOutlineOutput> = {
	name: 'fs_outline',
	description:
		'Get a structural outline of a file showing classes, functions, exports, etc. Useful for understanding file structure without reading all content.',
	schema: fsOutlineSchema,

	async execute(input: FsOutlineInput, context: ToolContext): Promise<ToolResult<FsOutlineOutput>> {
		const { path, includePrivate } = input

		// Check policy
		const policyCheck = checkFilePolicy({ path, operation: 'read' }, context.policy)
		if (!policyCheck.allowed) {
			return errorResult(policyCheck.reason!, {
				errorCode: 'POLICY_VIOLATION',
				recoverable: false
			})
		}

		try {
			const content = await context.provider.readFile(path)
			const language = detectLanguage(path)
			const symbols = parseOutline(content, includePrivate)

			return successResult({
				path,
				language,
				symbols,
				symbolCount: symbols.length
			})
		} catch (error) {
			if (CodeAgentError.isCodeAgentError(error)) {
				return errorResult(error.message, {
					errorCode: error.code,
					recoverable: error.recoverable
				})
			}

			return errorResult(`Failed to get outline: ${error instanceof Error ? error.message : String(error)}`, {
				errorCode: 'EXECUTION_FAILED',
				recoverable: true
			})
		}
	}
}
