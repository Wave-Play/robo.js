import { BaseLogger, LogLevel, colorizedLogLevels } from './base-logger.js'
import type { BaseLoggerOptions } from './base-logger.js'

class Logger extends BaseLogger {
	constructor(options?: BaseLoggerOptions) {
		super(options)
	}

	protected _log(level: LogLevel, ...data: unknown[]): void {
		// Get the message from the first data element unless it's not a string
		const first = data[0]
		let message
		if (typeof first === 'string') {
			message = ' ' + first
			data.splice(0, 1)
		} else {
			message = ''
		}

		// Format the message all pretty and stuff
		let formattedLevel = ''
		let formattedMessage = ''

		if (level === 'other') {
			formattedMessage = message
		} else {
			const colorizedLevel = colorizedLogLevels[level]
			formattedLevel = colorizedLevel ? colorizedLevel : level.padEnd(5)
			formattedMessage = `${formattedLevel} -${message}`
		}

		switch (level) {
			case 'trace':
			case 'debug':
				console.debug(formattedMessage, ...data)
				break
			case 'info':
				console.info(formattedMessage, ...data)
				break
			case 'wait':
				console.info(formattedMessage, ...data)
				break
			case 'event':
				console.log(formattedMessage, ...data)
				break
			case 'warn':
				console.warn(formattedMessage, ...data)
				break
			case 'error':
				console.error(formattedMessage, ...data)
				break
			default:
				console.log(formattedMessage, ...data)
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
