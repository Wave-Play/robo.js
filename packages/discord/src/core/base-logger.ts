import chalk from 'chalk'
import { env } from './env.js'

export type LogLevel = 'trace' | 'debug' | 'info' | 'wait' | 'other' | 'event' | 'ready' | 'warn' | 'error'

export interface BaseLoggerOptions {
	enabled?: boolean
	level?: LogLevel
}

abstract class BaseLogger {
	protected _enabled: boolean
	protected _level: LogLevel

	constructor(options?: BaseLoggerOptions) {
		const { enabled = true, level } = options ?? {}

		this._enabled = enabled
		if (env.roboplay.host) {
			// This allows developers to have better control over the logs when hosted
			this._level = 'trace'
		} else {
			this._level = level ?? 'info'
		}
	}

	public trace(message: string, ...args: unknown[]) {
		if (this._enabled && LogLevelValues[this._level] <= LogLevelValues.trace) {
			this._log('trace', message, ...args)
		}
	}

	public debug(message: string, ...args: unknown[]) {
		if (this._enabled && LogLevelValues[this._level] <= LogLevelValues.debug) {
			this._log('debug', message, ...args)
		}
	}

	public info(message: string, ...args: unknown[]) {
		if (this._enabled && LogLevelValues[this._level] <= LogLevelValues.info) {
			this._log('info', message, ...args)
		}
	}

	public wait(message: string, ...args: unknown[]) {
		if (this._enabled && LogLevelValues[this._level] <= LogLevelValues.wait) {
			this._log('wait', message, ...args)
		}
	}

	public log(message: string, ...args: unknown[]) {
		if (this._enabled && LogLevelValues[this._level] <= LogLevelValues.other) {
			this._log('other', message, ...args)
		}
	}

	public event(message: string, ...args: unknown[]) {
		if (this._enabled && LogLevelValues[this._level] <= LogLevelValues.event) {
			this._log('event', message, ...args)
		}
	}

	public ready(message: string, ...args: unknown[]) {
		if (this._enabled && LogLevelValues[this._level] <= LogLevelValues.ready) {
			this._log('ready', message, ...args)
		}
	}

	public warn(message: string, ...args: unknown[]) {
		if (this._enabled && LogLevelValues[this._level] <= LogLevelValues.warn) {
			this._log('warn', message, ...args)
		}
	}

	public error(message: string, ...args: unknown[]) {
		if (this._enabled && LogLevelValues[this._level] <= LogLevelValues.error) {
			this._log('error', message, ...args)
		}
	}

	protected abstract _log(level: LogLevel, message: string, ...args: unknown[]): void
}

const LogLevelValues: Record<LogLevel, number> = {
	trace: 0,
	debug: 1,
	info: 2,
	wait: 2,
	other: 2,
	event: 3,
	ready: 5,
	warn: 4,
	error: 5
}

const colorizedLogLevels = {
	trace: chalk.gray('trace'.padEnd(5)),
	debug: chalk.cyan('debug'.padEnd(5)),
	info: chalk.blue('info'.padEnd(5)),
	wait: chalk.cyan('wait'.padEnd(5)),
	event: chalk.magenta('event'.padEnd(5)),
	ready: chalk.green('ready'.padEnd(5)),
	warn: chalk.yellow('warn'.padEnd(5)),
	error: chalk.red('error'.padEnd(5))
}

export { BaseLogger, colorizedLogLevels }
