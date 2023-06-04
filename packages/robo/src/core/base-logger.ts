import { color } from './../cli/utils/color.js';
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

	public trace(...data: unknown[]) {
		if (this._enabled && LogLevelValues[this._level] <= LogLevelValues.trace) {
			this._log('trace', ...data)
		}
	}

	public debug(...data: unknown[]) {
		if (this._enabled && LogLevelValues[this._level] <= LogLevelValues.debug) {
			this._log('debug', ...data)
		}
	}

	public info(...data: unknown[]) {
		if (this._enabled && LogLevelValues[this._level] <= LogLevelValues.info) {
			this._log('info', ...data)
		}
	}

	public wait(...data: unknown[]) {
		if (this._enabled && LogLevelValues[this._level] <= LogLevelValues.wait) {
			this._log('wait', ...data)
		}
	}

	public log(...data: unknown[]) {
		if (this._enabled && LogLevelValues[this._level] <= LogLevelValues.other) {
			this._log('other', ...data)
		}
	}

	public event(...data: unknown[]) {
		if (this._enabled && LogLevelValues[this._level] <= LogLevelValues.event) {
			this._log('event', ...data)
		}
	}

	public ready(...data: unknown[]) {
		if (this._enabled && LogLevelValues[this._level] <= LogLevelValues.ready) {
			this._log('ready', ...data)
		}
	}

	public warn(...data: unknown[]) {
		if (this._enabled && LogLevelValues[this._level] <= LogLevelValues.warn) {
			this._log('warn', ...data)
		}
	}

	public error(...data: unknown[]) {
		if (this._enabled && LogLevelValues[this._level] <= LogLevelValues.error) {
			this._log('error', ...data)
		}
	}

	protected abstract _log(level: LogLevel, ...data: unknown[]): void
}

const LogLevelValues: Record<LogLevel, number> = {
	trace: 0,
	debug: 1,
	info: 2,
	wait: 2,
	other: 2,
	event: 3,
	warn: 4,
	ready: 5,
	error: 5
}

const colorizedLogLevels = {
	trace: color.gray('trace'.padEnd(5)),
	debug: color.cyan('debug'.padEnd(5)),
	info: color.blue('info'.padEnd(5)),
	wait: color.cyan('wait'.padEnd(5)),
	event: color.magenta('event'.padEnd(5)),
	ready: color.green('ready'.padEnd(5)),
	warn: color.yellow('warn'.padEnd(5)),
	error: color.red('error'.padEnd(5))
}

export { BaseLogger, colorizedLogLevels }
