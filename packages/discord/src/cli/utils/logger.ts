import { BaseLogger, LogLevel, colorizedLogLevels } from './base-logger.js'
import type { BaseLoggerOptions } from './base-logger.js'

class Logger extends BaseLogger {
	constructor(options?: BaseLoggerOptions) {
		super(options)
	}

	protected _log(level: LogLevel, message: string, ...args: unknown[]): void {
		let formattedLevel = ''
		let formattedMessage = ''

		if (level === 'other') {
			formattedMessage = message
		} else {
			const colorizedLevel = colorizedLogLevels[level]
			formattedLevel = colorizedLevel ? colorizedLevel : level.padEnd(5)
			formattedMessage = `${formattedLevel} - ${message}`
		}

		switch (level) {
			case 'trace':
			case 'debug':
				console.debug(formattedMessage, ...args)
				break
			case 'info':
				console.info(formattedMessage, ...args)
				break
			case 'event':
				console.log(formattedMessage, ...args)
				break
			case 'warn':
				console.warn(formattedMessage, ...args)
				break
			case 'error':
				console.error(formattedMessage)
				break
			default:
				console.log(formattedMessage, ...args)
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

logger.trace = function (message: string, ...args: unknown[]): void {
	return logger().trace(message, ...args)
}

logger.debug = function (message: string, ...args: unknown[]): void {
	return logger().debug(message, ...args)
}

logger.info = function (message: string, ...args: unknown[]): void {
	return logger().info(message, ...args)
}

logger.log = function (message: string, ...args: unknown[]): void {
	return logger().log(message, ...args)
}

logger.event = function (message: string, ...args: unknown[]): void {
	return logger().event(message, ...args)
}

logger.ready = function (message: string, ...args: unknown[]): void {
	return logger().ready(message, ...args)
}

logger.warn = function (message: string, ...args: unknown[]): void {
	return logger().warn(message, ...args)
}

logger.error = function (message: string, ...args: unknown[]): void {
	return logger().error(message, ...args)
}
