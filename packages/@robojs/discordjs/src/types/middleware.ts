/**
 * Discord middleware types for @robojs/discordjs
 */
import type { BaseConfig } from './common.js'

/**
 * Middleware data passed to handler.
 */
export interface MiddlewareData {
	/** The handler record being invoked */
	record: {
		key: string
		type: string
		metadata: Record<string, unknown>
	}
	/** Original payload/arguments (first element is usually the interaction) */
	payload: unknown[]
}

/**
 * Middleware result that can abort or modify processing.
 */
export interface MiddlewareResult {
	/** If true, abort the handler execution */
	abort?: boolean
	/** Optional modified payload to pass to handler */
	payload?: unknown[]
}

/**
 * Middleware handler function type.
 */
export type MiddlewareHandler = (data: MiddlewareData) => void | MiddlewareResult | Promise<MiddlewareResult | void>

/**
 * Middleware module structure expected in handler files.
 */
export interface Middleware {
	config?: MiddlewareConfig
	default: MiddlewareHandler
}

/**
 * Middleware configuration options.
 */
export interface MiddlewareConfig extends BaseConfig {
	/** Execution order (lower runs first) */
	order?: number
	/** Whether middleware is enabled */
	enabled?: boolean
}

/**
 * Middleware entry in manifest.
 */
export type MiddlewareEntry = MiddlewareConfig

/**
 * Middleware controller for portal.discord.middleware()
 */
export interface MiddlewareController {
	/** Check if middleware is enabled */
	isEnabled(): boolean
	/** Enable or disable the middleware */
	setEnabled(value: boolean): void
	/** Get middleware order */
	getOrder(): number
	/** Set middleware execution order */
	setOrder(order: number): void
}
