import { inspect } from 'node:util'
import { color } from './color.js'
import { getModeColor } from './mode.js'

// Compute mode label color
let ModeLabel: string

if (process.env.ROBO_SHARD_MODE) {
	const mode = process.env.ROBO_SHARD_MODE
	const longestMode = process.env.ROBO_SHARD_LONGEST_MODE
	const modeColor = getModeColor(mode)

	ModeLabel = color.bold(color.dim(modeColor(mode.padEnd(longestMode.length))))
}

export type LogDrain = (logger: Logger, level: string, ...data: unknown[]) => Promise<void>

export type LogLevel = 'trace' | 'debug' | 'info' | 'wait' | 'other' | 'event' | 'ready' | 'warn' | 'error'

interface CustomLevel {
	label: string
	priority: number
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

export const DEBUG_MODE = process.env.NODE_ENV !== 'production'

// eslint-disable-next-line no-control-regex
export const ANSI_REGEX = /\x1b\[.*?m/g

const pendingDrains = new Set<Promise<void>>()

type LogStream = typeof process.stderr | typeof process.stdout

function consoleDrain(_logger: Logger, level: string, ...data: unknown[]): Promise<void> {
	switch (level) {
		case 'trace':
		case 'debug':
		case 'info':
		case 'wait':
		case 'event':
			return writeLog(process.stdout, ...data)
		case 'warn':
		case 'error':
			return writeLog(process.stderr, ...data)
		default:
			return writeLog(process.stdout, ...data)
	}
}

function writeLog(stream: LogStream, ...data: unknown[]) {
	return new Promise<void>((resolve, reject) => {
		const parts = data?.map((item) => {
			if (typeof item === 'object' || item instanceof Error || Array.isArray(item)) {
				return inspect(item, { colors: true, depth: null })
			}
			return item
		})

		stream.write(parts?.join(' ') + '\n', 'utf8', (error) => {
			if (error) reject(error)
			else resolve()
		})
	})
}

const DEFAULT_MAX_ENTRIES = 100

class LogEntry {
	level: string
	timestamp: Date
	data: unknown[]

	constructor(level: string, data: unknown[]) {
		this.level = level
		this.data = data
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

export class Logger {
	protected _customLevels: Record<string, CustomLevel>
	protected _enabled: boolean
	protected _level: LogLevel | string
	protected _levelValues: Record<string, number>
	protected _parent: Logger | undefined
	protected _prefix: string | undefined
	private _currentIndex: number
	private _drain: LogDrain
	private _logBuffer: LogEntry[]

	constructor(options?: LoggerOptions) {
		this.setup(options)
	}

	public setup(options?: LoggerOptions) {
		const { customLevels, drain = consoleDrain, enabled = true, level, parent, prefix } = options ?? {}

		this._customLevels = customLevels
		this._drain = drain
		this._enabled = enabled
		this._parent = parent
		this._prefix = prefix

		if (process.env.ROBOPLAY_ENV) {
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

		// Format the message all pretty and stuff
		if (level !== 'other') {
			const label = this._customLevels ? this._customLevels[level]?.label : colorizedLogLevels[level]
			let levelLabel = (label ?? level.padEnd(5)) + ' -'

			// Add the prefix if specified
			if (prefix) {
				levelLabel = color.bold(colorMap[level](prefix + ':')) + levelLabel
			}

			data.unshift(levelLabel)
		}

		// Add the mode label if one exists
		if (ModeLabel !== undefined && data.length > 1) {
			data.unshift(ModeLabel)
		}

		// Persist the log entry in debug mode
		if (DEBUG_MODE) {
			this._logBuffer[this._currentIndex] = new LogEntry(level, data)
			this._currentIndex = (this._currentIndex + 1) % this._logBuffer.length
		}

		// Drain the log entry
		const promise = this._drain(this, level, ...data)
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
		this._drain = drain
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
