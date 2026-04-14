import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { appendFile, mkdir, stat } from 'node:fs/promises'
import { basename, dirname, extname, resolve } from 'node:path'
import { ANSI_REGEX } from './logger.js'
import type { Logger, LogDrain, LogMetadata } from './logger.js'
import type { FileDrainOptions, TimestampFormat } from '../types/config.js'

// Default values
const DEFAULT_MAX_SIZE = 10 * 1024 * 1024 // 10MB
const DEFAULT_MAX_FILES = 5
const DEFAULT_MAX_SESSION_FILES = 10

// Session state - set by Robo.start() via setFileDrainSessionId()
let _currentSessionId: string | null = null

/**
 * Sets the current session ID for file drains.
 * Called by Robo.start() before creating file drains.
 */
export function setFileDrainSessionId(id: string): void {
	_currentSessionId = id
}

// Log level priority values (must match logger.ts)
const LogLevelValues: Record<string, number> = {
	trace: 0,
	debug: 1,
	info: 2,
	wait: 3,
	other: 4,
	event: 5,
	ready: 6,
	warn: 7,
	error: 8
}

// ============================================================================
// Color Map Types and Functions
// ============================================================================

/**
 * Represents a single ANSI escape code that was stripped from a log message.
 * Used for reconstructing colors from stripped logs.
 */
export interface ColorMapEntry {
	/** 1-indexed line number in the log file */
	line: number
	/** Character column (0-indexed) where the ANSI code was removed */
	col: number
	/** The original ANSI escape code (e.g., "\x1b[31m") */
	code: string
}

/**
 * Extracts ANSI codes from a message and returns both the stripped message
 * and an array of ColorMapEntry objects recording where each code was.
 *
 * @param message - The message containing ANSI codes
 * @param lineNumber - The 1-indexed line number for this entry in the log file
 * @returns Object with stripped message and array of color map entries
 */
export function extractAndStripAnsi(
	message: string,
	lineNumber: number
): { stripped: string; colors: ColorMapEntry[] } {
	const colors: ColorMapEntry[] = []
	let stripped = ''
	let lastIndex = 0
	let visibleCol = 0

	// Match ANSI escape sequences
	const pattern = /\x1b\[([0-9;]*)m/g
	let match: RegExpExecArray | null

	while ((match = pattern.exec(message)) !== null) {
		// Add text before this ANSI code to the stripped output
		const textBefore = message.slice(lastIndex, match.index)
		stripped += textBefore
		visibleCol += textBefore.length

		// Record the ANSI code position (where it would be in stripped output)
		colors.push({
			line: lineNumber,
			col: visibleCol,
			code: match[0]
		})

		lastIndex = pattern.lastIndex
	}

	// Add remaining text after the last ANSI code
	stripped += message.slice(lastIndex)

	return { stripped, colors }
}

/**
 * Applies a color map to a stripped message to reconstruct the original ANSI-colored text.
 * Entries should be for the same line and sorted by column ascending.
 *
 * @param stripped - The stripped message without ANSI codes
 * @param colors - Array of ColorMapEntry objects for this line
 * @returns The message with ANSI codes re-inserted
 */
export function applyColorMap(stripped: string, colors: ColorMapEntry[]): string {
	if (colors.length === 0) {
		return stripped
	}

	// Sort by column descending so we can insert from end to beginning
	// This way insertions don't affect the indices of earlier insertions
	// For codes at the same position, we reverse their original order so they end up
	// in the correct order after insertion (last inserted ends up first)
	const indexed = colors.map((c, i) => ({ ...c, originalIndex: i }))
	const sortedColors = indexed.sort((a, b) => {
		if (b.col !== a.col) return b.col - a.col
		// For same column, reverse original order (descending by index)
		// so when inserted from end to beginning, they end up in original order
		return b.originalIndex - a.originalIndex
	})

	let result = stripped
	for (const entry of sortedColors) {
		// Insert the ANSI code at the specified column
		const col = Math.min(entry.col, result.length)
		result = result.slice(0, col) + entry.code + result.slice(col)
	}

	return result
}

/**
 * Parses a colormap file content (JSON-lines format) into ColorMapEntry arrays grouped by line.
 *
 * @param content - The colormap file content (newline-separated JSON objects)
 * @returns Map from line number to array of ColorMapEntry for that line
 */
export function parseColorMapFile(content: string): Map<number, ColorMapEntry[]> {
	const result = new Map<number, ColorMapEntry[]>()

	const lines = content.trim().split('\n')
	for (const line of lines) {
		if (!line.trim()) continue
		try {
			const entry = JSON.parse(line) as ColorMapEntry
			const existing = result.get(entry.line) || []
			existing.push(entry)
			result.set(entry.line, existing)
		} catch {
			// Skip malformed lines
		}
	}

	return result
}

/**
 * Reconstructs colored log content from stripped logs and a colormap.
 *
 * @param strippedContent - The content of a stripped log file
 * @param colorMap - Map from line number to ColorMapEntry array
 * @returns The log content with ANSI colors restored
 */
export function reconstructColoredLogs(
	strippedContent: string,
	colorMap: Map<number, ColorMapEntry[]>
): string {
	const lines = strippedContent.split('\n')
	const result: string[] = []

	for (let i = 0; i < lines.length; i++) {
		const lineNum = i + 1 // 1-indexed
		const colors = colorMap.get(lineNum)
		if (colors && colors.length > 0) {
			result.push(applyColorMap(lines[i], colors))
		} else {
			result.push(lines[i])
		}
	}

	return result.join('\n')
}

/**
 * Formats a timestamp according to the specified format.
 *
 * @param date - The date to format
 * @param format - The timestamp format to use
 * @returns Formatted timestamp string, or null if format is false
 */
export function formatTimestamp(date: Date, format: TimestampFormat): string | null {
	if (!format) {
		return null
	}

	switch (format) {
		case 'iso':
			return date.toISOString()
		case 'unix':
			return String(date.getTime())
		case 'short':
			// Time only: HH:mm:ss.SSS
			return date.toISOString().split('T')[1].slice(0, -1)
		case 'long':
			// Date and time: YYYY-MM-DD HH:mm:ss.SSS
			return date.toISOString().replace('T', ' ').slice(0, -1)
		default:
			return date.toISOString()
	}
}

/**
 * Result of formatting a log entry, optionally including color map data.
 */
interface FormatLogEntryResult {
	/** The formatted log entry text */
	entry: string
	/** Color map entries for this log line (only present if colorMap option is true) */
	colorMapEntries?: ColorMapEntry[]
}

/**
 * Formats a log entry for file output.
 * Optionally extracts color map data if both stripAnsi and colorMap are true.
 */
function formatLogEntry(
	level: string,
	data: unknown[],
	meta: LogMetadata,
	timestamp: TimestampFormat,
	format: 'text' | 'json',
	stripAnsi: boolean,
	colorMap: boolean,
	lineNumber: number
): FormatLogEntryResult {
	const ts = formatTimestamp(meta.timestamp, timestamp)

	// Build message from data
	let message = data
		.map((item) => {
			if (item instanceof Error) {
				return `${item.message}\n${item.stack}`
			}
			if (typeof item === 'object' && item !== null) {
				try {
					return JSON.stringify(item, null, 2)
				} catch {
					return '[unserializable object]'
				}
			}
			return String(item)
		})
		.join(' ')

	let colorMapEntries: ColorMapEntry[] | undefined

	// Strip ANSI codes if requested
	if (stripAnsi) {
		if (colorMap) {
			// Extract color positions before stripping
			const extracted = extractAndStripAnsi(message, lineNumber)
			message = extracted.stripped
			if (extracted.colors.length > 0) {
				colorMapEntries = extracted.colors
			}
		} else {
			// Simple strip without color map
			message = message.replace(ANSI_REGEX, '')
		}
	}

	let entry: string
	if (format === 'json') {
		const jsonObj: Record<string, unknown> = {
			timestamp: meta.timestamp.toISOString(),
			level,
			message
		}
		if (meta.source) {
			jsonObj.source = meta.source
		}
		if (meta.sessionId) {
			jsonObj.sessionId = meta.sessionId
		}
		jsonObj.pid = meta.pid
		entry = JSON.stringify(jsonObj) + '\n'
	} else {
		// Plain text format: [timestamp] [LEVEL] [source]? - message
		const parts: string[] = []
		if (ts) {
			parts.push(`[${ts}]`)
		}
		parts.push(`[${level.toUpperCase()}]`)
		if (meta.source) {
			parts.push(`[${meta.source}]`)
		}
		parts.push('-')
		parts.push(message)
		entry = parts.join(' ') + '\n'
	}

	return { entry, colorMapEntries }
}

/**
 * Rotates log files when the current file exceeds maxSize.
 * Uses synchronous operations to ensure rotation completes before new writes.
 * If hasColorMap is true, also rotates the companion .colormap file.
 */
function rotateFile(filePath: string, maxFiles: number, hasColorMap: boolean = false): void {
	// Helper to rotate a single file
	const rotateOneFile = (path: string) => {
		// Delete oldest if at limit
		const oldestPath = `${path}.${maxFiles - 1}`
		if (existsSync(oldestPath)) {
			unlinkSync(oldestPath)
		}

		// Shift existing rotated files (.1 -> .2, .2 -> .3, etc)
		for (let i = maxFiles - 2; i >= 1; i--) {
			const fromPath = `${path}.${i}`
			const toPath = `${path}.${i + 1}`
			if (existsSync(fromPath)) {
				renameSync(fromPath, toPath)
			}
		}

		// Rotate current file to .1
		if (existsSync(path)) {
			renameSync(path, `${path}.1`)
		}
	}

	// Rotate main log file
	rotateOneFile(filePath)

	// Rotate colormap file if enabled
	if (hasColorMap) {
		const colorMapPath = `${filePath}.colormap`
		rotateOneFile(colorMapPath)
	}
}

/**
 * Rotates the current session log by archiving it with a timestamp-based name.
 * Prunes old archives beyond the maxSessionFiles limit.
 */
export function rotateSession(filePath: string, maxSessionFiles: number, hasColorMap: boolean = false): void {
	if (!existsSync(filePath)) {
		return
	}

	// Use file mtime for the archive timestamp
	let mtime: Date
	try {
		mtime = statSync(filePath).mtime
	} catch {
		mtime = new Date()
	}

	// Format timestamp for filename: replace colons with hyphens for filesystem safety
	const ts = mtime.toISOString().replace(/:/g, '-').replace(/\.\d{3}Z$/, 'Z')
	const ext = extname(filePath)
	const base = filePath.slice(0, -ext.length)
	const archivePath = `${base}.${ts}${ext}`

	renameSync(filePath, archivePath)

	// Also rename colormap if it exists
	if (hasColorMap) {
		const colorMapPath = `${filePath}.colormap`
		if (existsSync(colorMapPath)) {
			renameSync(colorMapPath, `${archivePath}.colormap`)
		}
	}

	// Prune old archives
	pruneOldArchives(filePath, maxSessionFiles, hasColorMap)
}

/**
 * Prunes old archive files beyond the maxFiles limit.
 * Archives use ISO timestamp names that sort lexicographically.
 */
function pruneOldArchives(filePath: string, maxFiles: number, hasColorMap: boolean): void {
	const dir = dirname(filePath)
	const ext = extname(filePath)
	const baseName = basename(filePath, ext)

	if (!existsSync(dir)) {
		return
	}

	try {
		// Match files like: development.2026-04-13T10-30-00Z.log
		const archivePattern = new RegExp(`^${escapeRegex(baseName)}\\.\\d{4}-\\d{2}-\\d{2}T[\\w-]+${escapeRegex(ext)}$`)
		const archives = readdirSync(dir)
			.filter((f) => archivePattern.test(f))
			.sort()
			.reverse() // Newest first (ISO timestamps sort lexicographically)

		// Delete archives beyond the limit
		for (let i = maxFiles; i < archives.length; i++) {
			const archivePath = resolve(dir, archives[i])
			unlinkSync(archivePath)

			// Also remove colormap
			if (hasColorMap) {
				const cmPath = `${archivePath}.colormap`
				if (existsSync(cmPath)) {
					unlinkSync(cmPath)
				}
			}
		}
	} catch {
		// Best-effort cleanup
	}
}

function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Writes a session header line as the first entry in a new log file.
 */
export function writeSessionHeader(filePath: string, sessionId: string, pid: number): void {
	const header = `--- session ${sessionId} started ${new Date().toISOString()} pid ${pid} ---\n`
	const dir = dirname(filePath)
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true })
	}
	writeFileSync(filePath, header, { flag: 'a', encoding: 'utf8' })
}

/**
 * Creates a file-based log drain.
 *
 * This drain writes log entries to a file with support for:
 * - Timestamp formatting
 * - ANSI color code stripping
 * - Level filtering
 * - File rotation based on size
 * - Blocking and non-blocking write modes
 * - Optional color map generation for color reconstruction
 *
 * @param options - Configuration options for the file drain
 * @returns A LogDrain function that writes to the specified file
 *
 * @example
 * ```typescript
 * import { logger } from 'robo.js/logger'
 * import { createFileDrain } from 'robo.js/logger/drains'
 *
 * const drain = createFileDrain({
 *   path: 'logs/app.log',
 *   timestamp: 'iso',
 *   blocking: true,
 *   colorMap: true  // Generate .colormap companion file
 * })
 *
 * logger().addDrain(drain, 'file-logger')
 * ```
 */
export function createFileDrain(options: FileDrainOptions): LogDrain {
	const {
		path: filePath,
		level: minLevel,
		timestamp = false,
		blocking = false,
		format = 'text',
		stripAnsi = true,
		maxSize = DEFAULT_MAX_SIZE,
		maxFiles = DEFAULT_MAX_FILES,
		colorMap = false,
		sessionRotation = true,
		maxSessionFiles = DEFAULT_MAX_SESSION_FILES
	} = options

	// colorMap only makes sense when stripAnsi is true
	const enableColorMap = colorMap && stripAnsi

	// Resolve to absolute path
	const absolutePath = resolve(filePath)
	const colorMapPath = `${absolutePath}.colormap`

	// Ensure directory exists (sync for initial setup)
	const dir = dirname(absolutePath)
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true })
	}

	// Perform session rotation if enabled
	if (sessionRotation !== false) {
		rotateSession(absolutePath, maxSessionFiles, enableColorMap)
	}

	// Write session header using the shared session state
	const sessionId = _currentSessionId
	if (sessionId) {
		const pid = typeof process !== 'undefined' ? process.pid : 0
		writeSessionHeader(absolutePath, sessionId, pid)
	}

	// Track current file size for rotation decisions
	let currentSize = 0
	try {
		if (existsSync(absolutePath)) {
			currentSize = statSync(absolutePath).size
		}
	} catch {
		// File might not exist yet, that's fine
		currentSize = 0
	}

	// Track current line number for colormap entries
	let currentLineNumber = 1
	try {
		if (existsSync(absolutePath)) {
			// Count lines in existing file to continue from correct line number
			const content = readFileSync(absolutePath, 'utf8')
			currentLineNumber = content.split('\n').length
			// If file ends with newline, next entry will be on this line
			// If not, it's fine as is
		}
	} catch {
		currentLineNumber = 1
	}

	// Track pending writes for non-blocking mode
	const pendingWrites: Promise<void>[] = []

	// Create the drain function
	const drain: LogDrain = async (logger: Logger, level: string, meta: LogMetadata, ...data: unknown[]): Promise<void> => {
		// Level filtering
		if (minLevel) {
			const levelValues = logger.getLevelValues()
			const minLevelValue = levelValues[minLevel] ?? LogLevelValues[minLevel] ?? 0
			const currentLevelValue = levelValues[level] ?? LogLevelValues[level] ?? 0

			if (minLevelValue > currentLevelValue) {
				return
			}
		}

		// Format the log entry (with optional colormap extraction)
		const { entry, colorMapEntries } = formatLogEntry(
			level,
			data,
			meta,
			timestamp,
			format,
			stripAnsi,
			enableColorMap,
			currentLineNumber
		)
		const entryBytes = Buffer.byteLength(entry, 'utf8')

		// Check if rotation is needed
		if (maxSize > 0 && currentSize + entryBytes > maxSize) {
			// Wait for pending writes before rotation
			if (pendingWrites.length > 0) {
				await Promise.allSettled(pendingWrites)
				pendingWrites.length = 0
			}

			rotateFile(absolutePath, maxFiles, enableColorMap)
			currentSize = 0
			currentLineNumber = 1 // Reset line counter after rotation
		}

		// Prepare colormap content if we have entries
		let colorMapContent = ''
		if (colorMapEntries && colorMapEntries.length > 0) {
			colorMapContent = colorMapEntries.map((e) => JSON.stringify(e)).join('\n') + '\n'
		}

		// Write to file
		if (blocking) {
			// Blocking mode: use sync write for immediate disk persistence
			try {
				// Ensure directory exists (in case it was deleted)
				const dir = dirname(absolutePath)
				if (!existsSync(dir)) {
					mkdirSync(dir, { recursive: true })
				}

				// Append to file synchronously
				writeFileSync(absolutePath, entry, { flag: 'a', encoding: 'utf8' })
				currentSize += entryBytes
				currentLineNumber++

				// Write colormap if we have entries
				if (colorMapContent) {
					writeFileSync(colorMapPath, colorMapContent, { flag: 'a', encoding: 'utf8' })
				}
			} catch (error) {
				// Log write errors to console as fallback
				console.error('[file-drain] Write error:', error)
			}
		} else {
			// Non-blocking mode: fire-and-forget with tracking
			currentLineNumber++ // Increment before async operation

			const writePromise = (async () => {
				try {
					// Ensure directory exists
					const dir = dirname(absolutePath)
					try {
						await stat(dir)
					} catch {
						await mkdir(dir, { recursive: true })
					}

					await appendFile(absolutePath, entry, 'utf8')
					currentSize += entryBytes

					// Write colormap if we have entries
					if (colorMapContent) {
						await appendFile(colorMapPath, colorMapContent, 'utf8')
					}
				} catch (error) {
					// Log write errors to console as fallback
					console.error('[file-drain] Write error:', error)
				}
			})()

			pendingWrites.push(writePromise)

			// Clean up completed promises
			writePromise.finally(() => {
				const idx = pendingWrites.indexOf(writePromise)
				if (idx > -1) {
					pendingWrites.splice(idx, 1)
				}
			})
		}
	}

	// Attach flush method to drain for cleanup
	;(drain as LogDrain & { flush: () => Promise<void> }).flush = async () => {
		if (pendingWrites.length > 0) {
			await Promise.allSettled(pendingWrites)
			pendingWrites.length = 0
		}
	}

	return drain
}
