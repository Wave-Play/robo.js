import { BaseLogger, LogLevel, colorizedLogLevels } from './base-logger.js'
import type { BaseLoggerOptions } from './base-logger.js'

class Logger extends BaseLogger {
	constructor(options?: BaseLoggerOptions) {
		super(options)
	}

	protected _log(level: LogLevel, ...data: unknown[]): void {
		// Format the message all pretty and stuff
		if (level !== 'other') {
			const colorizedLevel = colorizedLogLevels[level]
			data.unshift((colorizedLevel ?? level.padEnd(5)) + ' -')
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
