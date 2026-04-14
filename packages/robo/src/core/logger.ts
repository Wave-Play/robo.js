import { color } from './color.js'
import { getModeColor } from './mode.js'
import type { DrainHandle } from '../types/config.js'

// Compute mode label color
let ModeLabel: string
const hasProcess = typeof process !== 'undefined'
const env = hasProcess ? process.env : undefined

if (env?.ROBO_SHARD_MODE) {
	const mode = env.ROBO_SHARD_MODE
	const longestMode = env?.ROBO_SHARD_LONGEST_MODE
	const modeColor = getModeColor(mode)

	ModeLabel = color.bold(color.dim(modeColor(mode.padEnd(longestMode.length))))
}

export interface LogMetadata {
	source: string | null
	timestamp: Date
	sessionId: string | null
	pid: number
}

export type LogDrain = (logger: Logger, level: string, meta: LogMetadata, ...data: unknown[]) => Promise<void>

export type LogLevel = 'trace' | 'debug' | 'info' | 'wait' | 'other' | 'event' | 'ready' | 'warn' | 'error'

interface CustomLevel {
	label: string
	priority: number
	color?: keyof typeof colorMap
}

export interface LoggerOptions {
	customLevels?: Record<string, CustomLevel>
	drain?: LogDrain
	enabled?: boolean
	level?: LogLevel | string
	maxEntries?: number
	parent?: Logger
	prefix?: string
}

export const DEBUG_MODE = env?.ROBO_DEV === 'true'

 
export const ANSI_REGEX = /\x1b\[.*?m/g

const pendingDrains = new Set<Promise<void>>()

type LogStream = typeof process.stderr | typeof process.stdout

function isBrowser(): boolean {
	return typeof window !== 'undefined' && typeof document !== 'undefined'
}

/**
 * Dynamically imports and caches the Node.js `inspect` function.
 * This function is concurrency safe and always returns the same singleton.
 */
let cachedInspect: typeof import('node:util').inspect | null = null
let cachedInspectPromise: Promise<typeof import('node:util').inspect> | null = null

function getInspect(): Promise<typeof import('node:util').inspect> {
	if (cachedInspect) {
		return Promise.resolve(cachedInspect)
	}
	if (cachedInspectPromise) {
		return cachedInspectPromise
	}
	cachedInspectPromise = import('node:util').then((module) => {
		cachedInspect = module.inspect
		return cachedInspect
	})
	return cachedInspectPromise
}

/**
 * Returns the cached inspect function if available, otherwise null.
 * Used for synchronous console writes when the cache has been warmed.
 */
function getInspectSync(): typeof import('node:util').inspect | null {
	return cachedInspect
}

// Warm the inspect cache immediately in Node.js environments
// This ensures even the first log call can be synchronous
if (!isBrowser()) {
	getInspect()
}

/**
 * Given a hex color (e.g. "#F44336"), returns a dimmed version by multiplying its
 * RGB components by the given factor (default 0.6). If the input isn't in hex form,
 * the original string is returned.
 */
function dimColor(col: string, factor: number = 0.6): string {
	if (col.startsWith('#') && (col.length === 7 || col.length === 4)) {
		if (col.length === 7) {
			const r = parseInt(col.slice(1, 3), 16)
			const g = parseInt(col.slice(3, 5), 16)
			const b = parseInt(col.slice(5, 7), 16)
			const nr = Math.round(r * factor)
			const ng = Math.round(g * factor)
			const nb = Math.round(b * factor)

			return '#' + [nr, ng, nb].map((x) => x.toString(16).padStart(2, '0')).join('')
		} else if (col.length === 4) {
			// Expand short hex notation (#rgb)
			const r = parseInt(col.charAt(1) + col.charAt(1), 16)
			const g = parseInt(col.charAt(2) + col.charAt(2), 16)
			const b = parseInt(col.charAt(3) + col.charAt(3), 16)
			const nr = Math.round(r * factor)
			const ng = Math.round(g * factor)
			const nb = Math.round(b * factor)

			return '#' + [nr, ng, nb].map((x) => x.toString(16).padStart(2, '0')).join('')
		}
	}

	return col
}

/**
 * Merges a new text-decoration value into an existing one.
 * (If the existing decoration is empty or "none", returns the new one.)
 */
function mergeTextDecoration(current: string | undefined, addition: string): string {
	if (!current || current === 'none') {
		return addition
	}
	const parts = current.split(/\s+/)
	if (parts.includes(addition)) return current
	return parts.concat(addition).join(' ')
}

/**
 * Removes a specific text-decoration from the current decoration.
 */
function removeTextDecoration(current: string | undefined, removal: string): string {
	if (!current) return ''
	const parts = current.split(/\s+/).filter((p) => p !== removal)
	return parts.join(' ')
}

/**
 * Updates the given style object based on a single ANSI code.
 * This switch–case implementation supports merging of effects such as bold and underline.
 */
function updateStyle(style: Record<string, string>, code: string): Record<string, string> {
	// Clone the current style.
	const newStyle = { ...style }

	switch (code) {
		case '0':
			// Reset all styles.
			return {}
		case '1':
			newStyle['font-weight'] = 'bold'
			break
		case '2':
			// If a color is already set, adjust it; otherwise, use a default dim gray.
			if (newStyle['color']) {
				newStyle['color'] = dimColor(newStyle['color'], 0.6)
			} else {
				newStyle['color'] = '#999999'
			}
			break
		case '3':
			newStyle['font-style'] = 'italic'
			break
		case '4':
			newStyle['text-decoration'] = mergeTextDecoration(newStyle['text-decoration'], 'underline')
			break
		case '7':
			newStyle['filter'] = 'invert(100%)'
			break
		case '8':
			newStyle['visibility'] = 'hidden'
			break
		case '9':
			newStyle['text-decoration'] = mergeTextDecoration(newStyle['text-decoration'], 'line-through')
			break
		case '22':
			// Reset bold/dim.
			delete newStyle['font-weight']
			// Remove any dimmed color by leaving the color untouched (or you could reset to original if needed)
			break
		case '23':
			delete newStyle['font-style']
			break
		case '24':
			newStyle['text-decoration'] = removeTextDecoration(newStyle['text-decoration'], 'underline')
			break
		case '27':
			delete newStyle['filter']
			break
		case '28':
			newStyle['visibility'] = 'visible'
			break
		case '29':
			newStyle['text-decoration'] = removeTextDecoration(newStyle['text-decoration'], 'line-through')
			break
		// Foreground colors
		case '30':
			newStyle['color'] = 'black'
			break
		case '31':
			newStyle['color'] = '#F44336'
			break
		case '32':
			newStyle['color'] = '#4CAF50'
			break
		case '33':
			newStyle['color'] = '#FFEB3B'
			break
		case '34':
			newStyle['color'] = '#2196F3'
			break
		case '35':
			newStyle['color'] = '#FF4081'
			break
		case '36':
			newStyle['color'] = '#00E5FF'
			break
		case '37':
			newStyle['color'] = 'white'
			break
		case '39':
			newStyle['color'] = 'inherit'
			break
		case '90':
			newStyle['color'] = '#9E9E9E'
			break
		case '91':
			newStyle['color'] = '#FF5252'
			break
		case '92':
			newStyle['color'] = '#69F0AE'
			break
		case '93':
			newStyle['color'] = '#FFD700'
			break
		case '94':
			newStyle['color'] = '#448AFF'
			break
		case '95':
			newStyle['color'] = '#EA80FC'
			break
		case '96':
			newStyle['color'] = '#18FFFF'
			break
		case '97':
			newStyle['color'] = '#FFFFFF'
			break
		// Background colors
		case '40':
			newStyle['background-color'] = 'black'
			break
		case '41':
			newStyle['background-color'] = '#F44336'
			break
		case '42':
			newStyle['background-color'] = '#4CAF50'
			break
		case '43':
			newStyle['background-color'] = '#FFEB3B'
			break
		case '44':
			newStyle['background-color'] = '#2196F3'
			break
		case '45':
			newStyle['background-color'] = '#E91E63'
			break
		case '46':
			newStyle['background-color'] = '#00E5FF'
			break
		case '47':
			newStyle['background-color'] = 'white'
			break
		case '49':
			newStyle['background-color'] = 'inherit'
			break
		case '100':
			newStyle['background-color'] = '#9E9E9E'
			break
		case '101':
			newStyle['background-color'] = '#FF5252'
			break
		case '102':
			newStyle['background-color'] = '#69F0AE'
			break
		case '103':
			newStyle['background-color'] = '#FFD700'
			break
		case '104':
			newStyle['background-color'] = '#448AFF'
			break
		case '105':
			newStyle['background-color'] = '#EA80FC'
			break
		case '106':
			newStyle['background-color'] = '#18FFFF'
			break
		case '107':
			newStyle['background-color'] = '#FFFFFF'
			break
		default:
			// For unrecognized codes, do nothing.
			break
	}

	return newStyle
}

/**
 * Converts an ANSI-coded string into a format string and a corresponding CSS array
 * for use with browser console methods. This parser is stateful and will merge consecutive
 * ANSI codes into a single CSS style.
 */
function ansiToBrowserFormat(text: string): { fmt: string; css: string[] } {
	let fmt = ''
	const cssArr: string[] = []
	let lastIndex = 0
	let currentStyle: Record<string, string> = {}

	// Match one or more codes at a time (e.g. "\x1b[1;36m")
	 
	const pattern = /\x1b\[([0-9;]+)m/g
	let match: RegExpExecArray | null

	while ((match = pattern.exec(text)) !== null) {
		// Append any plain text preceding the ANSI sequence.
		if (match.index > lastIndex) {
			const segment = text.slice(lastIndex, match.index).replace(/%/g, '%%')
			fmt += '%c' + segment
			cssArr.push(objectToCssString(currentStyle))
		}

		// Process the ANSI sequence.
		const codes = match[1].split(';')
		for (const code of codes) {
			currentStyle = updateStyle(currentStyle, code)
		}

		lastIndex = pattern.lastIndex
	}

	// Append any trailing text.
	if (lastIndex < text.length) {
		const segment = text.slice(lastIndex).replace(/%/g, '%%')
		fmt += '%c' + segment
		cssArr.push(objectToCssString(currentStyle))
	}

	// If no ANSI codes were found, return the text as-is.
	if (cssArr.length === 0) {
		return { fmt: text, css: [] }
	}

	return { fmt, css: cssArr }
}

/**
 * Converts a style object into a CSS string.
 */
function objectToCssString(style: Record<string, string>): string {
	return Object.entries(style)
		.map(([key, value]) => `${key}: ${value}`)
		.join('; ')
}

/**
 * Writes log data synchronously. Do not call this in browser environments.
 * Requires the inspect function to be cached (via getInspectSync).
 */
function writeLogSync(
	stream: LogStream,
	inspectFn: typeof import('node:util').inspect,
	...data: unknown[]
): void {
	const parts = data.map((item) => {
		if (typeof item === 'object' || item instanceof Error || Array.isArray(item)) {
			return inspectFn(item, { colors: true, depth: null })
		}
		return item
	})
	stream.write(parts.join(' ') + '\n')
}

/**
 * Writes log data asynchronously. Do not call this in browser environments.
 * This uses the dynamically imported `inspect` function and writes to the provided stream.
 * Used as fallback when inspect cache is not yet warmed.
 */
async function writeLog(stream: LogStream, ...data: unknown[]): Promise<void> {
	const inspect = await getInspect()
	const parts = data.map((item) => {
		if (typeof item === 'object' || item instanceof Error || Array.isArray(item)) {
			return inspect(item, { colors: true, depth: null })
		}

		return item
	})

	return new Promise<void>((resolve, reject) => {
		stream.write(parts.join(' ') + '\n', 'utf8', (error) => {
			if (error) {
				reject(error)
			} else {
				resolve()
			}
		})
	})
}

/**
 * A drain function that writes logs either to stdout/stderr (in Node.js)
 * or uses console.log/error (in browsers). In browsers, it uses ansiToBrowserFormat()
 * to convert ANSI codes into %c format with merged CSS.
 *
 * In Node.js, this uses synchronous writes (like console.log) to ensure logs
 * appear immediately and in order, without delayed output on shutdown.
 */
export function consoleDrain(_logger: Logger, level: string, meta: LogMetadata, ...data: unknown[]): Promise<void> {
	// Format the message with level label, source prefix, and mode label
	const formatted = [...data]
	if (level !== 'other') {
		const customLevels = (_logger as unknown as { _customLevels?: Record<string, CustomLevel> })._customLevels
		const customLevel = customLevels?.[level]
		const levelColor = (customLevel?.color ? colorMap[customLevel.color] : colorMap[level]) ?? ((s: string) => s)

		let levelLabel =
			(customLevel?.color
				? levelColor(customLevel.label.padEnd(9))
				: customLevel?.label ?? colorizedLogLevels[level] ?? level.padEnd(5)) + ' -'

		if (meta.source) {
			levelLabel = color.bold(levelColor(meta.source + ':')) + levelLabel
		}

		formatted.unshift(levelLabel)
	}

	if (ModeLabel !== undefined && formatted.length > 1) {
		formatted.unshift(ModeLabel)
	}

	if (isBrowser()) {
		let fmt = ''
		const args: unknown[] = []

		const addSpace = () => {
			if (fmt && !fmt.endsWith(' ')) fmt += ' '
		}

		for (const item of formatted) {
			if (typeof item === 'string') {
				const { fmt: f, css } = ansiToBrowserFormat(item)
				if (f) {
					if (fmt) fmt += ' '
					fmt += f
					for (const c of css) args.push(c)
				}
			} else {
				addSpace()
				fmt += '%o'
				args.push(item)
			}
		}

		const fn = level === 'warn' || level === 'error' ? console.error : console.log

		if (!fmt) {
			fn(...args)
		} else {
			fn(fmt, ...args)
		}

		return Promise.resolve()
	}

	// Determine output stream based on log level
	const stream = level === 'warn' || level === 'error' ? process.stderr : process.stdout

	// Use synchronous write if inspect is cached (99%+ of calls after module load)
	const inspectFn = getInspectSync()
	if (inspectFn) {
		writeLogSync(stream, inspectFn, ...formatted)
		return Promise.resolve()
	}

	// Async fallback for the rare case where cache isn't warmed yet
	return writeLog(stream, ...formatted)
}

/**
 * Composes multiple drains into a single drain that calls all of them.
 * Useful for logging to multiple outputs (e.g., console + file) simultaneously.
 *
 * @param drains - Array of drain functions to compose
 * @returns A single drain function that calls all provided drains
 *
 * @example
 * ```typescript
 * import { createMultiDrain, consoleDrain } from 'robo.js/logger'
 * import { createFileDrain } from 'robo.js/logger/drains'
 *
 * const fileDrain = createFileDrain({ path: 'logs/app.log' })
 * const multiDrain = createMultiDrain([consoleDrain, fileDrain])
 *
 * logger({ drain: multiDrain })
 * ```
 */
export function createMultiDrain(drains: LogDrain[]): LogDrain {
	if (drains.length === 0) {
		return async () => {}
	}
	if (drains.length === 1) {
		return drains[0]
	}

	return async (logger: Logger, level: string, meta: LogMetadata, ...data: unknown[]): Promise<void> => {
		await Promise.all(drains.map((drain) => drain(logger, level, meta, ...data).catch(() => {})))
	}
}

/**
 * Wraps a drain with level filtering.
 * Only log entries at or above the specified minimum level will be passed to the wrapped drain.
 *
 * This is useful when combining drains with different level requirements, such as:
 * - Console output at 'info' level
 * - File output at 'debug' level
 *
 * @param drain - The drain to wrap with level filtering
 * @param minLevel - The minimum level to pass through (e.g., 'info', 'debug')
 * @returns A new drain that filters messages below the specified level
 *
 * @example
 * ```typescript
 * import { createLevelFilteredDrain, createMultiDrain, consoleDrain } from 'robo.js/logger'
 * import { createFileDrain } from 'robo.js/logger/drains'
 *
 * const filteredConsole = createLevelFilteredDrain(consoleDrain, 'info')
 * const fileDrain = createFileDrain({ path: 'logs/app.log', level: 'debug' })
 * const multiDrain = createMultiDrain([filteredConsole, fileDrain])
 * ```
 */
export function createLevelFilteredDrain(drain: LogDrain, minLevel: LogLevel | string): LogDrain {
	return async (logger: Logger, level: string, meta: LogMetadata, ...data: unknown[]): Promise<void> => {
		const levelValues = logger.getLevelValues()
		const minLevelValue = levelValues[minLevel] ?? LogLevelValues[minLevel] ?? 0
		const currentLevelValue = levelValues[level] ?? LogLevelValues[level] ?? 0

		// Only pass through if current level >= minimum level
		if (currentLevelValue >= minLevelValue) {
			await drain(logger, level, meta, ...data)
		}
	}
}

const DEFAULT_MAX_ENTRIES = 100

class LogEntry {
	level: string
	timestamp: Date
	data: unknown[]
	source: string | null

	constructor(level: string, data: unknown[], source: string | null = null) {
		this.level = level
		this.data = data
		this.source = source
		this.timestamp = new Date()
	}

	message(): string {
		const messageParts = this.data.map((item) => {
			if (item instanceof Error) {
				return item.message
			} else if (typeof item === 'object') {
				try {
					return JSON.stringify(item)
				} catch (error) {
					// In case of circular structures or other stringify errors, return a fallback string
					return '[unserializable object]'
				}
			}
			return item
		})

		return messageParts.join(' ').replace(ANSI_REGEX, '')
	}
}

/**
 * The logger class provides a simple and flexible logging system.
 *
 * ```ts
 * import { logger } from 'robo.js'
 *
 * // Can be used instead of console.log
 * logger.info('Hello, world!')
 * logger.debug('This is a debug message')
 * logger.warn('Warning: something is not right')
 * logger.error('An error occurred')
 *
 * // To make your own Logger instance
 * import { Logger } from 'robo.js'
 *
 * const customLogger = new Logger({
 * 	level: 'debug'
 * })
 * ```
 *
 * Use logger whenever possible instead of `console.log` to take advantage of Robo drains and log levels.
 *
 * [**Learn more:** Logger](https://robojs.dev/robojs/logger)
 */
export class Logger {
	static _sessionId: string | null = null

	static setSessionId(id: string): void {
		Logger._sessionId = id
	}

	protected _customLevels: Record<string, CustomLevel>
	protected _enabled: boolean
	protected _level: LogLevel | string
	protected _levelValues: Record<string, number>
	protected _parent: Logger | undefined
	protected _prefix: string | undefined
	private _currentIndex: number
	private _drain: LogDrain
	private _logBuffer: LogEntry[]
	private _drains: Map<string, LogDrain> = new Map()
	private _primaryDrain: LogDrain = consoleDrain

	constructor(options?: LoggerOptions) {
		// Bind all public methods
		this.setup = this.setup.bind(this)
		this.flush = this.flush.bind(this)
		this.fork = this.fork.bind(this)
		this.getLevel = this.getLevel.bind(this)
		this.getLevelValues = this.getLevelValues.bind(this)
		this.getRecentLogs = this.getRecentLogs.bind(this)
		this.setDrain = this.setDrain.bind(this)
		this.addDrain = this.addDrain.bind(this)
		this.removeDrain = this.removeDrain.bind(this)
		this.trace = this.trace.bind(this)
		this.debug = this.debug.bind(this)
		this.info = this.info.bind(this)
		this.wait = this.wait.bind(this)
		this.log = this.log.bind(this)
		this.event = this.event.bind(this)
		this.ready = this.ready.bind(this)
		this.warn = this.warn.bind(this)
		this.error = this.error.bind(this)
		this.custom = this.custom.bind(this)

		this.setup(options)
	}

	public setup(options?: LoggerOptions) {
		const { customLevels, drain = consoleDrain, enabled = true, level, parent, prefix } = options ?? {}

		// Preserve existing customLevels if new ones aren't provided
		this._customLevels = customLevels ?? this._customLevels
		this._primaryDrain = drain
		this._enabled = enabled
		this._parent = parent
		this._prefix = prefix

		// Update combined drain if we have additional drains
		this._updateCombinedDrain()

		if (env?.ROBOPLAY_ENV) {
			// This allows developers to have better control over the logs when hosted
			this._level = 'trace'
		} else {
			this._level = level ?? 'info'
		}

		// Combine the default log levels with the custom ones
		this._levelValues = {
			...LogLevelValues,
			...Object.fromEntries(Object.entries(this._customLevels ?? {}).map(([key, value]) => [key, value.priority]))
		}

		// Initialize the log buffer
		this._currentIndex = 0
		this._logBuffer = new Array(options?.maxEntries ?? DEFAULT_MAX_ENTRIES)
	}

	protected _log(prefix: string | null, level: string, ...data: unknown[]): void {
		// Delegate to parent if forked
		if (this._parent) {
			return this._parent._log(this._prefix, level, ...data)
		}

		// Only log if the level is enabled
		if (!this._enabled) {
			return
		}

		// If using the default drain, perform the level check
		if (this._drain === consoleDrain && this._levelValues[this._level] > this._levelValues[level]) {
			return
		}

		// Build metadata
		const meta: LogMetadata = {
			source: prefix,
			timestamp: new Date(),
			sessionId: Logger._sessionId,
			pid: hasProcess ? process.pid : 0
		}

		// Persist the log entry in debug mode
		if (DEBUG_MODE) {
			this._logBuffer[this._currentIndex] = new LogEntry(level, data, meta.source)
			this._currentIndex = (this._currentIndex + 1) % this._logBuffer.length
		}

		// Drain the log entry with raw, unformatted data
		const promise = this._drain(this, level, meta, ...data)
		pendingDrains.add(promise)
		promise.finally(() => {
			pendingDrains.delete(promise)
		})
	}

	/**
	 * Waits for all pending log writes to complete.
	 */
	public async flush(): Promise<void> {
		// Delegate to parent if forked
		if (this._parent) {
			return this._parent.flush()
		}

		await Promise.allSettled([...pendingDrains])
	}

	/**
	 * Creates a new logger instance with the specified prefix.
	 * This is useful for creating a logger for a specific plugin, big features, or modules.
	 *
	 * All writes and cached logs will be delegated to the parent logger, so debugging will still work.
	 *
	 * @param prefix The prefix to add to the logger (e.g. 'my-plugin')
	 * @returns A new logger instance with the specified prefix
	 */
	public fork(prefix: string): Logger {
		return new Logger({
			customLevels: this._customLevels,
			enabled: this._enabled,
			level: this._level,
			parent: this,
			prefix: this._prefix ? this._prefix + prefix : prefix
		})
	}

	public getLevel(): LogLevel | string {
		// Delegate to parent if forked
		if (this._parent) {
			return this._parent.getLevel()
		}

		return this._level
	}

	public getLevelValues(): Record<string, number> {
		// Delegate to parent if forked
		if (this._parent) {
			return this._parent.getLevelValues()
		}

		return this._levelValues
	}

	public getRecentLogs(count = 50): LogEntry[] {
		// Delegate to parent if forked
		if (this._parent) {
			return this._parent.getRecentLogs(count)
		}

		// Return an empty array if the log buffer is empty
		if (count <= 0) {
			return []
		}

		// Ensure the count doesn't exceed the number of logs in the buffer
		count = Math.min(count, this._logBuffer.length)
		const startIndex = (this._currentIndex - count + this._logBuffer.length) % this._logBuffer.length
		let recentLogs: LogEntry[]

		if (startIndex < this._currentIndex) {
			recentLogs = this._logBuffer.slice(startIndex, this._currentIndex)
		} else {
			recentLogs = this._logBuffer.slice(startIndex).concat(this._logBuffer.slice(0, this._currentIndex))
		}

		return recentLogs.reverse()
	}

	public setDrain(drain: LogDrain) {
		this._primaryDrain = drain
		this._updateCombinedDrain()
	}

	/**
	 * Adds a drain to the logger. Multiple drains can be active simultaneously.
	 * Returns a handle that can be used to remove the drain and flush pending writes.
	 *
	 * @param drain - The drain function to add
	 * @param id - Optional unique identifier for this drain. Auto-generated if not provided.
	 * @returns A DrainHandle for managing this drain
	 *
	 * @example
	 * ```typescript
	 * import { logger } from 'robo.js/logger'
	 * import { createFileDrain } from 'robo.js/logger/drains'
	 *
	 * const drain = createFileDrain({ path: 'logs/test.log', blocking: true })
	 * const handle = logger().addDrain(drain, 'test-logger')
	 *
	 * // Later, remove the drain
	 * handle.remove()
	 * ```
	 */
	public addDrain(drain: LogDrain, id?: string): DrainHandle {
		// Delegate to parent if forked
		if (this._parent) {
			return this._parent.addDrain(drain, id)
		}

		const drainId = id ?? `drain_${Date.now()}_${Math.random().toString(36).slice(2)}`
		this._drains.set(drainId, drain)
		this._updateCombinedDrain()

		return {
			id: drainId,
			remove: () => this.removeDrain(drainId),
			flush: () => this.flush()
		}
	}

	/**
	 * Removes a drain from the logger by its ID.
	 *
	 * @param id - The unique identifier of the drain to remove
	 * @returns true if the drain was found and removed, false otherwise
	 */
	public removeDrain(id: string): boolean {
		// Delegate to parent if forked
		if (this._parent) {
			return this._parent.removeDrain(id)
		}

		const removed = this._drains.delete(id)
		if (removed) {
			this._updateCombinedDrain()
		}
		return removed
	}

	/**
	 * Updates the combined drain based on the primary drain and additional drains.
	 */
	private _updateCombinedDrain(): void {
		if (this._drains.size === 0) {
			this._drain = this._primaryDrain
		} else {
			this._drain = createMultiDrain([this._primaryDrain, ...this._drains.values()])
		}
	}

	public trace(...data: unknown[]) {
		this._log(null, 'trace', ...data)
	}

	public debug(...data: unknown[]) {
		this._log(null, 'debug', ...data)
	}

	public info(...data: unknown[]) {
		this._log(null, 'info', ...data)
	}

	public wait(...data: unknown[]) {
		this._log(null, 'wait', ...data)
	}

	public log(...data: unknown[]) {
		this._log(null, 'other', ...data)
	}

	public event(...data: unknown[]) {
		this._log(null, 'event', ...data)
	}

	public ready(...data: unknown[]) {
		this._log(null, 'ready', ...data)
	}

	public warn(...data: unknown[]) {
		this._log(null, 'warn', ...data)
	}

	public error(...data: unknown[]) {
		this._log(null, 'error', ...data)
	}

	public custom(level: string, ...data: unknown[]): void {
		if (this._customLevels?.[level]) {
			this._log(null, level, ...data)
		}
	}
}

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

const colorMap: Record<string, (str: string) => string> = {
	trace: color.gray,
	debug: color.cyan,
	info: color.blue,
	wait: color.cyan,
	event: color.magenta,
	ready: color.green,
	warn: color.yellow,
	error: color.red
}

const colorizedLogLevels: Record<string, string> = {
	trace: color.gray('trace'.padEnd(5)),
	debug: color.cyan('debug'.padEnd(5)),
	info: color.blue('info'.padEnd(5)),
	wait: color.cyan('wait'.padEnd(5)),
	event: color.magenta('event'.padEnd(5)),
	ready: color.green('ready'.padEnd(5)),
	warn: color.yellow('warn'.padEnd(5)),
	error: color.red('error'.padEnd(5))
}

let _logger: Logger | null = null

export function logger(options?: LoggerOptions): Logger {
	if (!_logger && options) {
		_logger = new Logger(options)
	} else if (!_logger) {
		_logger = new Logger()
	} else if (options) {
		_logger.setup(options)
	}

	return _logger
}

logger.flush = async function (): Promise<void> {
	await logger().flush()
}

logger.fork = function (prefix: string): Logger {
	return logger().fork(prefix)
}

logger.getRecentLogs = function (count = 25): LogEntry[] {
	return logger().getRecentLogs(count)
}

logger.trace = function (...data: unknown[]): void {
	return logger().trace(...data)
}

logger.debug = function (...data: unknown[]): void {
	return logger().debug(...data)
}

logger.info = function (...data: unknown[]): void {
	return logger().info(...data)
}

logger.wait = function (...data: unknown[]): void {
	return logger().wait(...data)
}

logger.log = function (...data: unknown[]): void {
	return logger().log(...data)
}

logger.event = function (...data: unknown[]): void {
	return logger().event(...data)
}

logger.ready = function (...data: unknown[]): void {
	return logger().ready(...data)
}

logger.warn = function (...data: unknown[]): void {
	return logger().warn(...data)
}

logger.error = function (...data: unknown[]): void {
	return logger().error(...data)
}

logger.custom = function (level: string, ...data: unknown[]): void {
	return logger().custom(level, ...data)
}

logger.addDrain = function (drain: LogDrain, id?: string): DrainHandle {
	return logger().addDrain(drain, id)
}

logger.removeDrain = function (id: string): boolean {
	return logger().removeDrain(id)
}
