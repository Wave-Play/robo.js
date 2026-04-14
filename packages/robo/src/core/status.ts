/**
 * Status Registry for dev mode.
 *
 * Plugins call `Robo.status.set()` to report persistent status items and
 * `Robo.status.flash()` for transient notifications. In dev mode (worker thread),
 * these are forwarded to the parent CLI via IPC. In production or main-thread
 * contexts, they fall back to logger.ready() / logger.info().
 */
import { isMainThread, parentPort } from 'node:worker_threads'
import { logger } from './logger.js'

export interface StatusOptions {
	/** Priority for hint line display. <=10 shows in hint line, >10 only in /status drawer. Default: 100 */
	priority?: number
}

const items = new Map<string, { value: string; priority: number }>()

export const Status = {
	/**
	 * Set a persistent status item shown in dev mode.
	 * Items with priority <= 10 appear in the hint line; others only in /status drawer.
	 * In production/main thread, falls back to logger.ready().
	 */
	set(key: string, value: string, options?: StatusOptions): void {
		const priority = options?.priority ?? 100
		items.set(key, { value, priority })

		if (!isMainThread && parentPort) {
			parentPort.postMessage({ event: 'status-set', payload: { key, value, priority } })
		} else {
			// Fallback: log to console in non-dev mode
			logger.ready(value)
		}
	},

	/**
	 * Remove a persistent status item.
	 */
	remove(key: string): void {
		items.delete(key)

		if (!isMainThread && parentPort) {
			parentPort.postMessage({ event: 'status-remove', payload: { key } })
		} else {
			logger.debug(`Status item removed: ${key}`)
		}
	},

	/**
	 * Flash a transient notification on the hint line.
	 * Auto-dismisses after duration (default 3000ms).
	 */
	flash(message: string, duration = 3000): void {
		if (!isMainThread && parentPort) {
			parentPort.postMessage({ event: 'status-flash', payload: { message, duration } })
		} else {
			logger.info(message)
		}
	},

	/** Get all current status items (for /status command in-process) */
	getAll(): Map<string, { value: string; priority: number }> {
		return new Map(items)
	}
}
