/**
 * Middleware Execution
 *
 * Handles the execution of middleware before command/event handlers.
 * Middleware can abort execution by returning { abort: true }.
 */
import { portal, color } from 'robo.js'
import { discordLogger } from './logger.js'
import type { HandlerRecord } from 'robo.js'
import type { HandlerModule } from './handler-types.js'
import type { MiddlewareData, MiddlewareHandler, MiddlewareResult } from '../types/index.js'

/**
 * Get all middleware records from the portal
 */
export function getMiddleware(): HandlerRecord[] {
	const middlewareRecords = portal.getByType('discordjs:middleware')
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
	await portal.ensureRoute('discordjs', 'middleware')

	const middleware = getMiddleware()

	// Sort by order metadata (stable sort preserves insertion order for equal values)
	middleware.sort((a, b) => {
		const orderA = (a.metadata?.order as number) ?? 0
		const orderB = (b.metadata?.order as number) ?? 0
		return orderA - orderB
	})

	try {
		for (const mw of middleware) {
			if (!mw.enabled || mw.metadata?.enabled === false || mw.metadata?.disabled === true) {
				continue
			}

			discordLogger.debug(`Executing middleware: ${color.bold(getHandlerPath(mw))}`)

			// Import handler if needed
			if (!mw.handler) {
				await portal.importHandler('discordjs', 'middleware', mw.key)
			}

			const handler = mw.handler as HandlerModule<MiddlewareHandler> | null
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
