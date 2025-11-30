/**
 * Middleware Execution
 *
 * Handles the execution of middleware before command/event handlers.
 * Middleware can abort execution by returning { abort: true }.
 */
import { portal, color } from 'robo.js'
import { discordLogger } from './logger.js'
import type { HandlerRecord } from 'robo.js'
import type { MiddlewareData, MiddlewareHandler, MiddlewareResult } from '../types/index.js'

/**
 * Handler module with callable default
 */
type HandlerWithDefault<T> = {
	default?: T
	config?: unknown
	[key: string]: unknown
}

/**
 * Get all middleware records from the portal
 */
export function getMiddleware(): HandlerRecord[] {
	const middlewareRecords = portal.getByType('discord:middleware')
	if (!middlewareRecords) return []

	const result: HandlerRecord[] = []
	for (const recordOrArray of Object.values(middlewareRecords)) {
		if (Array.isArray(recordOrArray)) {
			result.push(...recordOrArray)
		} else {
			result.push(recordOrArray)
		}
	}
	return result
}

/**
 * Get the path for logging (uses plugin name if available)
 */
export function getHandlerPath(record: HandlerRecord): string {
	const pluginPrefix = record.plugin ? `[${record.plugin.name}] ` : ''
	return pluginPrefix + record.path
}

/**
 * Execute middleware chain for a handler
 *
 * @param payload - The data to pass to middleware (typically interaction or event args)
 * @param record - The handler record being executed
 * @returns true if execution should continue, false if middleware aborted
 */
export async function executeMiddleware(payload: unknown[], record: HandlerRecord): Promise<boolean> {
	const middleware = getMiddleware()

	try {
		for (const mw of middleware) {
			if (!mw.enabled) {
				continue
			}

			discordLogger.debug(`Executing middleware: ${color.bold(getHandlerPath(mw))}`)

			// Import handler if needed
			if (!mw.handler) {
				await portal.importHandler('discord', 'middleware', mw.key)
			}

			const handler = mw.handler as HandlerWithDefault<MiddlewareHandler> | null
			const data: MiddlewareData = {
				payload,
				record
			}

			const result = await handler?.default?.(data)

			if (result && result.abort) {
				discordLogger.debug(`Middleware aborted execution for: ${color.bold(record.key)}`)
				return false
			}
		}
	} catch (error) {
		discordLogger.error('Aborting due to middleware error:', error)
		return false
	}

	return true
}
