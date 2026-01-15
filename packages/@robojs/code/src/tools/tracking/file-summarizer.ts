/**
 * File content summarizer for @robojs/code SDK
 *
 * Generates compact summaries of file content for context eviction.
 * Used during compaction to replace full file content with structural summaries.
 */

/**
 * Summary of a file's content
 */
export interface FileSummary {
	/**
	 * Original file path
	 */
	path: string

	/**
	 * Detected programming language
	 */
	language: string

	/**
	 * Total file size in bytes
	 */
	totalSize: number

	/**
	 * Structural outline (for code files)
	 */
	outline?: OutlineSymbol[]

	/**
	 * Key points extracted from the file
	 */
	keyPoints?: string[]

	/**
	 * First few lines of content (preview)
	 */
	headPreview?: string

	/**
	 * Whether the original content was truncated
	 */
	wasTruncated: boolean

	/**
	 * Timestamp when summary was created
	 */
	summarizedAt: number
}

/**
 * Outline symbol from file structure
 */
export interface OutlineSymbol {
	/**
	 * Symbol type (function, class, interface, etc.)
	 */
	type: string

	/**
	 * Symbol name
	 */
	name: string

	/**
	 * Line number in the file
	 */
	line: number

	/**
	 * Whether the symbol is exported
	 */
	isExported: boolean
}

/**
 * File summarizer for generating compact representations
 */
export class FileSummarizer {
	private readonly maxSummaryChars: number
	private readonly maxPreviewLines: number

	constructor(options?: { maxSummaryChars?: number; maxPreviewLines?: number }) {
		this.maxSummaryChars = options?.maxSummaryChars ?? 500
		this.maxPreviewLines = options?.maxPreviewLines ?? 10
	}

	/**
	 * Summarize file content based on file type
	 */
	summarize(path: string, content: string): FileSummary {
		const language = this.detectLanguage(path)
		const totalSize = new TextEncoder().encode(content).length

		switch (language) {
			case 'typescript':
			case 'javascript':
				return this.summarizeCode(path, content, language, totalSize)
			case 'json':
				return this.summarizeJson(path, content, totalSize)
			case 'markdown':
				return this.summarizeMarkdown(path, content, totalSize)
			case 'css':
			case 'scss':
				return this.summarizeCss(path, content, language, totalSize)
			default:
				return this.summarizeGeneric(path, content, language, totalSize)
		}
	}

	/**
	 * Format a summary for inclusion in LLM context
	 */
	formatForContext(summary: FileSummary): string {
		const parts: string[] = []

		parts.push(`[File Summary: ${summary.path}]`)
		parts.push(`Size: ${summary.totalSize} bytes | Language: ${summary.language}`)

		if (summary.outline && summary.outline.length > 0) {
			parts.push('Structure:')
			const maxSymbols = 10
			for (const sym of summary.outline.slice(0, maxSymbols)) {
				const prefix = sym.isExported ? 'export ' : ''
				parts.push(`  - ${prefix}${sym.type} ${sym.name} (line ${sym.line})`)
			}
			if (summary.outline.length > maxSymbols) {
				parts.push(`  ... and ${summary.outline.length - maxSymbols} more symbols`)
			}
		}

		if (summary.keyPoints && summary.keyPoints.length > 0) {
			parts.push('Key points:')
			for (const point of summary.keyPoints.slice(0, 5)) {
				parts.push(`  - ${point}`)
			}
		}

		if (summary.headPreview) {
			parts.push('Preview:')
			parts.push(summary.headPreview)
		}

		if (summary.wasTruncated) {
			parts.push(`[Content summarized - use fs_read_range for specific sections]`)
		}

		// Truncate if too long
		let result = parts.join('\n')
		if (result.length > this.maxSummaryChars) {
			result = result.slice(0, this.maxSummaryChars - 3) + '...'
		}

		return result
	}

	/**
	 * Detect programming language from file extension
	 */
	private detectLanguage(path: string): string {
		const ext = path.split('.').pop()?.toLowerCase() ?? ''

		const languageMap: Record<string, string> = {
			ts: 'typescript',
			tsx: 'typescript',
			js: 'javascript',
			jsx: 'javascript',
			mjs: 'javascript',
			cjs: 'javascript',
			json: 'json',
			md: 'markdown',
			mdx: 'markdown',
			css: 'css',
			scss: 'scss',
			sass: 'scss',
			less: 'css',
			py: 'python',
			rb: 'ruby',
			go: 'go',
			rs: 'rust',
			java: 'java',
			kt: 'kotlin',
			swift: 'swift',
			c: 'c',
			cpp: 'cpp',
			h: 'c',
			hpp: 'cpp',
			sh: 'shell',
			bash: 'shell',
			yaml: 'yaml',
			yml: 'yaml',
			toml: 'toml',
			xml: 'xml',
			html: 'html',
			htm: 'html',
			vue: 'vue',
			svelte: 'svelte'
		}

		return languageMap[ext] ?? 'text'
	}

	/**
	 * Summarize TypeScript/JavaScript code
	 */
	private summarizeCode(path: string, content: string, language: string, totalSize: number): FileSummary {
		const outline = this.parseCodeOutline(content)
		const headPreview = this.getHeadPreview(content)

		return {
			path,
			language,
			totalSize,
			outline,
			headPreview,
			wasTruncated: true,
			summarizedAt: Date.now()
		}
	}

	/**
	 * Parse code structure to extract symbols
	 */
	private parseCodeOutline(content: string): OutlineSymbol[] {
		const symbols: OutlineSymbol[] = []
		const lines = content.split('\n')

		// Patterns for common code structures
		const patterns = [
			// Functions (including arrow functions assigned to const/let/var)
			{ regex: /^(export\s+)?(?:async\s+)?function\s+(\w+)/, type: 'function' },
			{ regex: /^(export\s+)?(const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/, type: 'function' },
			{ regex: /^(export\s+)?(const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\w+\s*=>\s*/, type: 'function' },
			// Classes
			{ regex: /^(export\s+)?class\s+(\w+)/, type: 'class' },
			// Interfaces and types
			{ regex: /^(export\s+)?interface\s+(\w+)/, type: 'interface' },
			{ regex: /^(export\s+)?type\s+(\w+)/, type: 'type' },
			// Enums
			{ regex: /^(export\s+)?enum\s+(\w+)/, type: 'enum' }
		]

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].trim()

			for (const pattern of patterns) {
				const match = line.match(pattern.regex)
				if (match) {
					const isExported = !!match[1]
					// Name is in different capture groups depending on pattern
					const name = match[3] ?? match[2]
					if (name) {
						symbols.push({
							type: pattern.type,
							name,
							line: i + 1,
							isExported
						})
					}
					break
				}
			}
		}

		return symbols
	}

	/**
	 * Summarize JSON content
	 */
	private summarizeJson(path: string, content: string, totalSize: number): FileSummary {
		const keyPoints: string[] = []

		try {
			const parsed = JSON.parse(content)

			if (typeof parsed === 'object' && parsed !== null) {
				const topKeys = Object.keys(parsed).slice(0, 10)
				keyPoints.push(`Top-level keys: ${topKeys.join(', ')}`)

				// Special handling for package.json
				if (path.endsWith('package.json')) {
					if (parsed.name) keyPoints.push(`Package: ${parsed.name}`)
					if (parsed.version) keyPoints.push(`Version: ${parsed.version}`)
					if (parsed.dependencies) {
						const depCount = Object.keys(parsed.dependencies).length
						keyPoints.push(`Dependencies: ${depCount}`)
					}
					if (parsed.devDependencies) {
						const devDepCount = Object.keys(parsed.devDependencies).length
						keyPoints.push(`DevDependencies: ${devDepCount}`)
					}
				}

				// Special handling for tsconfig.json
				if (path.endsWith('tsconfig.json')) {
					if (parsed.compilerOptions) {
						const opts = Object.keys(parsed.compilerOptions).slice(0, 5)
						keyPoints.push(`Compiler options: ${opts.join(', ')}...`)
					}
				}
			}
		} catch {
			keyPoints.push('Invalid JSON or parsing failed')
		}

		return {
			path,
			language: 'json',
			totalSize,
			keyPoints,
			headPreview: this.getHeadPreview(content),
			wasTruncated: true,
			summarizedAt: Date.now()
		}
	}

	/**
	 * Summarize Markdown content
	 */
	private summarizeMarkdown(path: string, content: string, totalSize: number): FileSummary {
		const keyPoints: string[] = []

		// Extract headings
		const headings = content.match(/^#{1,3}\s+.+$/gm) ?? []
		if (headings.length > 0) {
			keyPoints.push(
				`Headings: ${headings
					.slice(0, 5)
					.map((h) => h.replace(/^#+\s+/, ''))
					.join(', ')}`
			)
		}

		// Count code blocks
		const codeBlocks = content.match(/```[\s\S]*?```/g) ?? []
		if (codeBlocks.length > 0) {
			keyPoints.push(`Code blocks: ${codeBlocks.length}`)
		}

		return {
			path,
			language: 'markdown',
			totalSize,
			keyPoints,
			headPreview: this.getHeadPreview(content),
			wasTruncated: true,
			summarizedAt: Date.now()
		}
	}

	/**
	 * Summarize CSS/SCSS content
	 */
	private summarizeCss(path: string, content: string, language: string, totalSize: number): FileSummary {
		const keyPoints: string[] = []

		// Count selectors
		const selectors = content.match(/[.#][\w-]+(?=\s*\{)/g) ?? []
		const uniqueSelectors = [...new Set(selectors)]
		if (uniqueSelectors.length > 0) {
			keyPoints.push(`Selectors: ${uniqueSelectors.slice(0, 10).join(', ')}${uniqueSelectors.length > 10 ? '...' : ''}`)
		}

		// Count media queries
		const mediaQueries = content.match(/@media\s*\([^)]+\)/g) ?? []
		if (mediaQueries.length > 0) {
			keyPoints.push(`Media queries: ${mediaQueries.length}`)
		}

		return {
			path,
			language,
			totalSize,
			keyPoints,
			headPreview: this.getHeadPreview(content),
			wasTruncated: true,
			summarizedAt: Date.now()
		}
	}

	/**
	 * Generic file summary for unknown types
	 */
	private summarizeGeneric(path: string, content: string, language: string, totalSize: number): FileSummary {
		const lines = content.split('\n')

		return {
			path,
			language,
			totalSize,
			keyPoints: [`${lines.length} lines`],
			headPreview: this.getHeadPreview(content),
			wasTruncated: true,
			summarizedAt: Date.now()
		}
	}

	/**
	 * Get first N lines as preview
	 */
	private getHeadPreview(content: string): string {
		const lines = content.split('\n')
		const previewLines = lines.slice(0, this.maxPreviewLines)
		let preview = previewLines.join('\n')

		if (lines.length > this.maxPreviewLines) {
			preview += `\n... (${lines.length - this.maxPreviewLines} more lines)`
		}

		return preview
	}
}

/**
 * Create a file summarizer with optional configuration
 */
export function createFileSummarizer(options?: { maxSummaryChars?: number; maxPreviewLines?: number }): FileSummarizer {
	return new FileSummarizer(options)
}
