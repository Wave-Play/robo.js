import { inspect } from 'node:util'
import { color } from './color.js'
import { env } from './env.js'

export type LogLevel = 'trace' | 'debug' | 'info' | 'wait' | 'other' | 'event' | 'ready' | 'warn' | 'error'

interface CustomLevel {
	label: string
	priority: number
}

export interface LoggerOptions {
	customLevels?: Record<string, CustomLevel>
	enabled?: boolean
	level?: LogLevel | string
	maxEntries?: number
}

export const DEBUG_MODE = process.env.NODE_ENV !== 'production'

// eslint-disable-next-line no-control-regex
export const ANSI_REGEX = /\x1b\[.*?m/g

const pendingWrites = new Set<Promise<void>>()

type LogStream = typeof process.stderr | typeof process.stdout

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
	private _currentIndex: number
	private _logBuffer: LogEntry[]

	constructor(options?: LoggerOptions) {
		const { customLevels, enabled = true, level } = options ?? {}

		this._customLevels = customLevels
		this._enabled = enabled
		if (env.roboplay.host) {
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

	protected _log(level: string, ...data: unknown[]): void {
		if (this._enabled && this._levelValues[this._level] <= this._levelValues[level]) {
			// Format the message all pretty and stuff
			if (level !== 'other') {
				const label = this._customLevels ? this._customLevels[level]?.label : colorizedLogLevels[level]
				data.unshift((label ?? level.padEnd(5)) + ' -')
			}

			// Persist the log entry in debug mode
			if (DEBUG_MODE) {
				this._logBuffer[this._currentIndex] = new LogEntry(level, data)
				this._currentIndex = (this._currentIndex + 1) % this._logBuffer.length
			}

			let promise: Promise<void>
			switch (level) {
				case 'trace':
				case 'debug':
					promise = writeLog(process.stdout, ...data)
					break
				case 'info':
					promise = writeLog(process.stdout, ...data)
					break
				case 'wait':
					promise = writeLog(process.stdout, ...data)
					break
				case 'event':
					promise = writeLog(process.stdout, ...data)
					break
				case 'warn':
					promise = writeLog(process.stderr, ...data)
					break
				case 'error':
					promise = writeLog(process.stderr, ...data)
					break
				default:
					promise = writeLog(process.stdout, ...data)
					break
			}

			pendingWrites.add(promise)
			promise.finally(() => {
				pendingWrites.delete(promise)
			})
		}
	}

	public flush() {
		return Promise.allSettled([...pendingWrites])
	}

	public getRecentLogs(count = 50): LogEntry[] {
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

	public trace(...data: unknown[]) {
		this._log('trace', ...data)
	}

	public debug(...data: unknown[]) {
		this._log('debug', ...data)
	}

	public info(...data: unknown[]) {
		this._log('info', ...data)
	}

	public wait(...data: unknown[]) {
		this._log('wait', ...data)
	}

	public log(...data: unknown[]) {
		this._log('other', ...data)
	}

	public event(...data: unknown[]) {
		this._log('event', ...data)
	}

	public ready(...data: unknown[]) {
		this._log('ready', ...data)
	}

	public warn(...data: unknown[]) {
		this._log('warn', ...data)
	}

	public error(...data: unknown[]) {
		this._log('error', ...data)
	}

	public custom(level: string, ...data: unknown[]): void {
		if (this._customLevels?.[level]) {
			this._log(level, ...data)
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
	if (options) {
		_logger = new Logger(options)
	} else if (!_logger) {
		_logger = new Logger()
	}

	return _logger
}

logger.flush = async function (): Promise<void> {
	await logger().flush()
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
