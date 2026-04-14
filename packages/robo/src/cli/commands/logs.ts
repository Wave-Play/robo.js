/**
 * Logs Command
 *
 * Query, filter, and stream local log files from .robo/logs/.
 * Usage: robo logs [options]
 */

import { Command } from '../utils/cli-handler.js'
import { color } from '../../core/color.js'
import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, statSync, unwatchFile, watchFile } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { CliContext } from '../../types/cli.js'

const command = new Command('logs')
	.description('View and search local log files.')
	.option('-j', '--json', 'output logs as NDJSON (one JSON object per line)')
	.option('-l', '--level', 'filter by minimum log level (trace, debug, info, warn, error)')
	.option('-p', '--source', 'filter by source/plugin name (e.g., discordjs, api)')
	.option('-g', '--grep', 'filter log messages by text or regex pattern')
	.option('-m', '--mode', 'which mode logs to read (development, production, etc.)')
	.option('-n', '--limit', 'maximum number of lines to output')
	.option('-t', '--tail', 'watch for new log entries (stream mode)')
	.option('-s', '--session', 'view specific session (current, previous, or index number)')
	.option('-S', '--sessions', 'list all available log sessions')
	.option('-T', '--since', 'show logs since time (e.g., "1h", "30m", ISO timestamp)')
	.option('-h', '--help', 'Shows the available command options')
	.handler(logsAction)
export default command

interface LogsCommandOptions {
	json?: boolean
	level?: string
	source?: string
	grep?: string
	mode?: string
	limit?: number | string
	tail?: boolean
	session?: string
	sessions?: boolean
	since?: string
}

// Log level priority values
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

// Regex for parsing text-format log lines: [timestamp] [LEVEL] [source]? - message
const LOG_LINE_REGEX = /^\[(\S+)\]\s+\[(\w+)\](?:\s+\[([^\]]+)\])?\s+-\s+(.*)$/

// Regex for detecting session header lines
const SESSION_HEADER_REGEX = /^--- session (\S+) started (\S+) pid (\d+) ---$/

interface ParsedLogEntry {
	timestamp: string
	level: string
	source: string | null
	sessionId?: string
	pid?: number
	message: string
	raw: string
	/** 1-indexed line number of the first line in the original file */
	lineStart: number
}

function parseLogLine(line: string, lineNumber: number): ParsedLogEntry | null {
	// Detect session header lines
	const sessionMatch = SESSION_HEADER_REGEX.exec(line)
	if (sessionMatch) {
		return {
			timestamp: sessionMatch[2],
			level: 'session',
			source: null,
			sessionId: sessionMatch[1],
			pid: Number(sessionMatch[3]),
			message: line,
			raw: line,
			lineStart: lineNumber
		}
	}

	// Try text format first
	const match = LOG_LINE_REGEX.exec(line)
	if (match) {
		const timestamp = match[1]
		const level = match[2].toLowerCase()
		const source = match[3] || null
		const message = match[4]

		return { timestamp, level, source, message, raw: line, lineStart: lineNumber }
	}

	// Try JSON format
	try {
		const parsed = JSON.parse(line)
		if (parsed && typeof parsed === 'object' && 'level' in parsed) {
			return {
				timestamp: parsed.timestamp || '',
				level: (parsed.level || '').toLowerCase(),
				source: parsed.source || null,
				sessionId: parsed.sessionId ?? undefined,
				pid: parsed.pid != null ? Number(parsed.pid) : undefined,
				message: parsed.message || '',
				raw: line,
				lineStart: lineNumber
			}
		}
	} catch {
		// Not JSON, not a parseable line
	}

	return null
}

function parseLogContent(content: string, startLineNumber: number = 1): ParsedLogEntry[] {
	const lines = content.split('\n')
	const entries: ParsedLogEntry[] = []
	let currentEntry: ParsedLogEntry | null = null

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]
		if (!line.trim()) continue

		const lineNumber = startLineNumber + i
		const parsed = parseLogLine(line, lineNumber)
		if (parsed) {
			// Skip session header lines — don't include them as log entries
			if (parsed.level === 'session') {
				if (currentEntry) {
					entries.push(currentEntry)
					currentEntry = null
				}
				continue
			}
			if (currentEntry) {
				entries.push(currentEntry)
			}
			currentEntry = parsed
		} else if (currentEntry) {
			// Multi-line entry (e.g., stack trace) — append to previous
			currentEntry.message += '\n' + line
			currentEntry.raw += '\n' + line
		}
	}

	if (currentEntry) {
		entries.push(currentEntry)
	}

	return entries
}

function filterEntries(entries: ParsedLogEntry[], options: LogsCommandOptions): ParsedLogEntry[] {
	let result = entries

	// Filter by level
	if (options.level) {
		const minLevel = LogLevelValues[options.level.toLowerCase()] ?? 0
		result = result.filter((e) => {
			const entryLevel = LogLevelValues[e.level] ?? 0
			return entryLevel >= minLevel
		})
	}

	// Filter by source
	if (options.source) {
		const sourceFilter = options.source.toLowerCase()
		result = result.filter((e) => e.source !== null && e.source.toLowerCase().includes(sourceFilter))
	}

	// Filter by grep pattern
	if (options.grep) {
		let pattern: RegExp
		try {
			pattern = new RegExp(options.grep, 'i')
		} catch {
			// Fall back to literal string match
			const escaped = options.grep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
			pattern = new RegExp(escaped, 'i')
		}
		result = result.filter((e) => pattern.test(e.message) || pattern.test(e.raw))
	}

	// Filter by --since
	if (options.since) {
		const sinceDate = parseSinceValue(options.since)
		result = result.filter((e) => {
			const entryDate = new Date(e.timestamp)
			// Skip entries with unparseable timestamps (e.g., time-only short format)
			if (isNaN(entryDate.getTime())) return true
			return entryDate >= sinceDate
		})
	}

	// Apply limit (coerce to number in case CLI parser passed a string)
	const limit = Number(options.limit)
	if (limit > 0) {
		result = result.slice(-limit)
	}

	return result
}

function formatEntry(entry: ParsedLogEntry, jsonOutput: boolean): string {
	if (jsonOutput) {
		return JSON.stringify({
			timestamp: entry.timestamp,
			level: entry.level,
			source: entry.source,
			sessionId: entry.sessionId ?? undefined,
			pid: entry.pid ?? undefined,
			message: entry.message
		})
	}
	return entry.raw
}

function parseSinceValue(value: string): Date {
	// Try relative duration: e.g., "1h", "30m", "2d"
	const relativeMatch = /^(\d+)([smhd])$/.exec(value)
	if (relativeMatch) {
		const amount = Number(relativeMatch[1])
		const unit = relativeMatch[2]
		const now = Date.now()
		const multipliers: Record<string, number> = {
			s: 1000,
			m: 60 * 1000,
			h: 60 * 60 * 1000,
			d: 24 * 60 * 60 * 1000
		}
		return new Date(now - amount * (multipliers[unit] || 0))
	}

	// Try absolute ISO 8601 string
	const parsed = new Date(value)
	if (!isNaN(parsed.getTime())) {
		return parsed
	}

	// Fallback: return epoch 0 so nothing is filtered out
	return new Date(0)
}

interface SessionInfo {
	sessionId: string
	started: string
	pid: number
	file: string
	size: number
	isCurrent: boolean
}

function listSessions(logsDir: string, mode: string): void {
	if (!existsSync(logsDir)) {
		console.log(`No logs directory found at ${logsDir}`)
		return
	}

	const sessions: SessionInfo[] = []
	const currentFile = path.join(logsDir, `${mode}.log`)

	// Collect archive files: both timestamp-based ({mode}.{timestamp}.log)
	// and legacy numbered rotation ({mode}.log.1, {mode}.log.2, etc.)
	try {
		const baseNameWithExt = `${mode}.log`
		const archivePrefix = `${mode}.`
		const files = readdirSync(logsDir).filter((f) => {
			if (f === baseNameWithExt) return false // Skip current file (added separately)
			// Timestamp-based archives: development.2026-04-13T10-30-00Z.log
			if (f.startsWith(archivePrefix) && f.endsWith('.log')) return true
			// Legacy numbered rotation: development.log.1, development.log.2
			if (f.startsWith(baseNameWithExt + '.') && /\.\d+$/.test(f)) return true
			return false
		})

		for (const f of files) {
			const filePath = path.join(logsDir, f)
			const info = parseSessionFromFile(filePath, false)
			if (info) {
				sessions.push(info)
			}
		}
	} catch {
		// Directory read failed
	}

	// Add current file
	if (existsSync(currentFile)) {
		const info = parseSessionFromFile(currentFile, true)
		if (info) {
			sessions.push(info)
		}
	}

	if (sessions.length === 0) {
		console.log(`No sessions found for ${mode}.`)
		return
	}

	// Sort by started date descending (most recent first), current always on top
	sessions.sort((a, b) => {
		if (a.isCurrent && !b.isCurrent) return -1
		if (!a.isCurrent && b.isCurrent) return 1
		return new Date(b.started).getTime() - new Date(a.started).getTime()
	})

	console.log(`Sessions for ${mode}:`)
	console.log(
		`  ${'SESSION'.padEnd(14)}${'STARTED'.padEnd(30)}${'PID'.padEnd(10)}${'SIZE'.padEnd(12)}`
	)
	for (const s of sessions) {
		const marker = s.isCurrent ? ' *' : '  '
		const sizeStr = formatFileSize(s.size)
		const suffix = s.isCurrent ? '  (current)' : ''
		console.log(
			`  ${s.sessionId.padEnd(12)}${marker}${s.started.padEnd(30)}${String(s.pid).padEnd(10)}${sizeStr.padEnd(12)}${suffix}`
		)
	}
}

function parseSessionFromFile(filePath: string, isCurrent: boolean): SessionInfo | null {
	try {
		const stats = statSync(filePath)
		if (stats.size === 0) return null

		// Read first line to find session header
		const fd = openSync(filePath, 'r')
		try {
			const headerBuf = Buffer.alloc(Math.min(256, stats.size))
			readSync(fd, headerBuf, 0, headerBuf.length, 0)
			const firstLine = headerBuf.toString('utf-8').split('\n')[0]
			const match = SESSION_HEADER_REGEX.exec(firstLine)
			if (match) {
				return {
					sessionId: match[1],
					started: match[2],
					pid: Number(match[3]),
					file: filePath,
					size: stats.size,
					isCurrent
				}
			}
		} finally {
			closeSync(fd)
		}

		// Fallback for log files without a session header (pre-session-rotation files).
		// Use file mtime as the start time and a truncated filename as the session ID.
		const baseName = path.basename(filePath, '.log')
		const fallbackId = baseName.includes('.') ? baseName.split('.').slice(1).join('.') : (isCurrent ? 'current' : 'unknown')
		return {
			sessionId: fallbackId,
			started: stats.mtime.toISOString(),
			pid: 0,
			file: filePath,
			size: stats.size,
			isCurrent
		}
	} catch {
		// File read failed
	}
	return null
}

function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function resolveSessionFile(logsDir: string, mode: string, session: string): string | null {
	const currentFile = path.join(logsDir, `${mode}.log`)

	// 'current' or empty → current log file
	if (!session || session === 'current') {
		return existsSync(currentFile) ? currentFile : null
	}

	// Collect archive files sorted by modification time descending
	const archives = getArchiveFiles(logsDir, mode)

	// 'previous' or 'prev' → most recent archive
	if (session === 'previous' || session === 'prev') {
		return archives.length > 0 ? archives[0] : null
	}

	// Numeric index → Nth most recent archive (1-based)
	const index = Number(session)
	if (!isNaN(index) && index > 0) {
		return archives.length >= index ? archives[index - 1] : null
	}

	// Partial timestamp match → find archive containing the timestamp fragment
	const lowerSession = session.toLowerCase()
	for (const archive of archives) {
		const basename = path.basename(archive).toLowerCase()
		if (basename.includes(lowerSession)) {
			return archive
		}
	}

	return null
}

function getArchiveFiles(logsDir: string, mode: string): string[] {
	if (!existsSync(logsDir)) return []

	try {
		const baseNameWithExt = `${mode}.log`
		const archivePrefix = `${mode}.`
		const files = readdirSync(logsDir)
			.filter((f) => {
				if (f === baseNameWithExt) return false
				// Timestamp-based archives: development.2026-04-13T10-30-00Z.log
				if (f.startsWith(archivePrefix) && f.endsWith('.log')) return true
				// Legacy numbered rotation: development.log.1, development.log.2
				if (f.startsWith(baseNameWithExt + '.') && /\.\d+$/.test(f)) return true
				return false
			})
			.map((f) => path.join(logsDir, f))

		// Sort by modification time descending (most recent first)
		files.sort((a, b) => {
			try {
				return statSync(b).mtimeMs - statSync(a).mtimeMs
			} catch {
				return 0
			}
		})

		return files
	} catch {
		return []
	}
}

function resolveLogFile(logsDir: string, mode?: string): string | null {
	// Guard against boolean mode (CLI parser may pass true when no value given)
	if (mode && typeof mode === 'string') {
		const logPath = path.join(logsDir, `${mode}.log`)
		return existsSync(logPath) ? logPath : null
	}

	// Try development first, then production
	const devPath = path.join(logsDir, 'development.log')
	if (existsSync(devPath)) return devPath

	const prodPath = path.join(logsDir, 'production.log')
	if (existsSync(prodPath)) return prodPath

	// Fall back to any available log file
	if (!existsSync(logsDir)) return null

	try {
		const files = readdirSync(logsDir).filter((f) => f.endsWith('.log') && !f.includes('.log.'))
		if (files.length > 0) {
			return path.join(logsDir, files[0])
		}
	} catch {
		// Directory read failed
	}

	return null
}

async function logsAction(context: CliContext) {
	const options = context.options as LogsCommandOptions
	const logsDir = path.join(process.cwd(), '.robo', 'logs')

	// Resolve mode string
	const modeStr = typeof options.mode === 'string' ? options.mode : undefined
	const effectiveMode = modeStr || resolveDefaultMode(logsDir)

	// Handle --sessions: list all available sessions
	if (options.sessions) {
		if (!effectiveMode) {
			console.log("No log files found at .robo/logs/. Run 'robo dev' or 'robo start' to generate logs.")
			return
		}
		listSessions(logsDir, effectiveMode)
		return
	}

	// Handle --session: resolve to a specific file
	let logFile: string | null
	if (options.session) {
		if (!effectiveMode) {
			console.log("No log files found at .robo/logs/. Run 'robo dev' or 'robo start' to generate logs.")
			return
		}
		const sessionStr = typeof options.session === 'string' ? options.session : 'current'
		logFile = resolveSessionFile(logsDir, effectiveMode, sessionStr)
		if (!logFile) {
			console.log(`No session matching "${sessionStr}" found for mode "${effectiveMode}".`)
			return
		}
	} else {
		logFile = resolveLogFile(logsDir, modeStr)
	}

	if (!logFile) {
		if (modeStr) {
			console.log(`No log file found for mode "${modeStr}" at ${logsDir}/.`)
		} else {
			console.log("No log files found at .robo/logs/. Run 'robo dev' or 'robo start' to generate logs.")
		}

		// List available modes if any exist
		if (existsSync(logsDir)) {
			try {
				const files = readdirSync(logsDir).filter((f) => f.endsWith('.log') && !f.includes('.log.'))
				if (files.length > 0) {
					console.log('')
					console.log('Available log files:')
					for (const f of files) {
						console.log(`  ${f.replace('.log', '')}`)
					}
				}
			} catch {
				// Ignore
			}
		}
		return
	}

	if (options.tail) {
		await tailMode(logFile, options)
	} else {
		await readMode(logFile, options)
	}
}

function resolveDefaultMode(logsDir: string): string | null {
	if (!existsSync(logsDir)) return null

	const devPath = path.join(logsDir, 'development.log')
	if (existsSync(devPath)) return 'development'

	const prodPath = path.join(logsDir, 'production.log')
	if (existsSync(prodPath)) return 'production'

	try {
		const files = readdirSync(logsDir).filter((f) => f.endsWith('.log') && !f.includes('.log.'))
		if (files.length > 0) {
			return files[0].replace('.log', '')
		}
	} catch {
		// Ignore
	}

	return null
}

async function readMode(logFile: string, options: LogsCommandOptions) {
	const content = await readFile(logFile, 'utf-8')
	if (!content.trim()) return

	// Try to load colormap for human-readable output
	let colorMap: Map<number, import('../../core/file-drain.js').ColorMapEntry[]> | null = null
	if (!options.json) {
		const colorMapPath = `${logFile}.colormap`
		if (existsSync(colorMapPath)) {
			try {
				const { parseColorMapFile } = await import('../../core/file-drain.js')
				const colorMapContent = readFileSync(colorMapPath, 'utf-8')
				colorMap = parseColorMapFile(colorMapContent)
			} catch {
				// Colormap loading failed, use plain output
			}
		}
	}

	const entries = parseLogContent(content)
	const filtered = filterEntries(entries, options)

	if (filtered.length === 0) return

	// For human-readable output with colormap, reconstruct colors using tracked line numbers
	if (!options.json && colorMap) {
		const { applyColorMap } = await import('../../core/file-drain.js')

		for (const entry of filtered) {
			const entryLines = entry.raw.split('\n')
			for (let i = 0; i < entryLines.length; i++) {
				const lineNum = entry.lineStart + i
				const colors = colorMap.get(lineNum)
				if (colors && colors.length > 0) {
					console.log(applyColorMap(entryLines[i], colors))
				} else {
					console.log(entryLines[i])
				}
			}
		}
	} else {
		for (const entry of filtered) {
			console.log(formatEntry(entry, !!options.json))
		}
	}
}

async function tailMode(logFile: string, options: LogsCommandOptions) {
	console.log(color.dim(`Watching ${path.basename(logFile)} for new entries... (Ctrl+C to stop)`))
	console.log('')

	// Read and display existing content first
	await readMode(logFile, options)

	// Track file position in bytes
	let filePosition = 0
	try {
		filePosition = statSync(logFile).size
	} catch {
		filePosition = 0
	}

	let outputCount = 0
	const limit = Number(options.limit) > 0 ? Number(options.limit) : Infinity

	// Watch for changes
	const onFileChange = async () => {
		if (outputCount >= limit) {
			cleanup()
			return
		}

		try {
			const currentSize = statSync(logFile).size

			// File was truncated or rotated (strictly less — equal means no new data)
			if (currentSize < filePosition) {
				console.log('')
				console.log(color.dim('--- new session started ---'))
				console.log('')

				// Skip past the session header line if present
				const headerBuf = Buffer.alloc(Math.min(256, currentSize))
				const headerFd = openSync(logFile, 'r')
				try {
					readSync(headerFd, headerBuf, 0, headerBuf.length, 0)
				} finally {
					closeSync(headerFd)
				}
				const headerContent = headerBuf.toString('utf-8')
				const firstNewline = headerContent.indexOf('\n')
				if (firstNewline !== -1 && SESSION_HEADER_REGEX.test(headerContent.slice(0, firstNewline))) {
					filePosition = firstNewline + 1
				} else {
					filePosition = 0
				}
			}

			if (currentSize > filePosition) {
				// Read only the new bytes using positioned read
				const bytesToRead = currentSize - filePosition
				const buffer = Buffer.alloc(bytesToRead)
				const fd = openSync(logFile, 'r')
				try {
					readSync(fd, buffer, 0, bytesToRead, filePosition)
				} finally {
					closeSync(fd)
				}
				const newContent = buffer.toString('utf-8')
				filePosition = currentSize

				if (!newContent.trim()) return

				const entries = parseLogContent(newContent)
				const filtered = filterEntries(
					entries,
					// Don't apply limit filter during tail — we track manually
					{ ...options, limit: undefined }
				)

				for (const entry of filtered) {
					if (outputCount >= limit) {
						cleanup()
						return
					}
					console.log(formatEntry(entry, !!options.json))
					outputCount++
				}
			}
		} catch {
			// File might be temporarily unavailable during rotation
		}
	}

	watchFile(logFile, { interval: 250 }, onFileChange)

	const cleanup = () => {
		unwatchFile(logFile, onFileChange)
		process.exit(0)
	}

	process.on('SIGINT', cleanup)
	process.on('SIGTERM', cleanup)

	// Keep process alive
	await new Promise(() => {
		// Intentionally never resolves — process exits via signal handler
	})
}
