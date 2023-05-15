import { BaseLogger, LogLevel, colorizedLogLevels } from './base-logger.js'
import { ANSI_REGEX, DEBUG_MODE } from './debug.js'
import type { BaseLoggerOptions } from './base-logger.js'

const DEFAULT_MAX_ENTRIES = 100

class LogEntry {
	level: LogLevel
	timestamp: Date
	data: unknown[]

	constructor(level: LogLevel, data: unknown[]) {
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

interface LoggerOptions extends BaseLoggerOptions {
	maxEntries?: number
}

class Logger extends BaseLogger {
	// Circular log buffer that overwrites old entries
	private _currentIndex: number
	private _logBuffer: LogEntry[]

	constructor(options?: LoggerOptions) {
		super(options)

		// Initialize the log buffer
		this._currentIndex = 0
		this._logBuffer = new Array(options?.maxEntries ?? DEFAULT_MAX_ENTRIES)
	}

	protected _log(level: LogLevel, ...data: unknown[]): void {
		// Format the message all pretty and stuff
		if (level !== 'other') {
			const colorizedLevel = colorizedLogLevels[level]
			data.unshift((colorizedLevel ?? level.padEnd(5)) + ' -')
		}

		// Persist the log entry in debug mode
		if (DEBUG_MODE) {
			this._logBuffer[this._currentIndex] = new LogEntry(level, data)
			this._currentIndex = (this._currentIndex + 1) % this._logBuffer.length
		}

		switch (level) {
			case 'trace':
			case 'debug':
				console.debug(...data)
				break
			case 'info':
				console.info(...data)
				break
			case 'wait':
				console.info(...data)
				break
			case 'event':
				console.log(...data)
				break
			case 'warn':
				console.warn(...data)
				break
			case 'error':
				console.error(...data)
				break
			default:
				console.log(...data)
		}
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
}

export { Logger }

let _logger: Logger | null = null

export function logger(options?: BaseLoggerOptions): Logger {
	if (options) {
		_logger = new Logger(options)
	} else if (!_logger) {
		_logger = new Logger()
	}

	return _logger
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
