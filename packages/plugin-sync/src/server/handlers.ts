import { syncLogger } from '../core/logger.js'
import { normalizeKey } from '../core/utils.js'
import { validateSchema } from './schema.js'
import { portal } from 'robo.js'
import type {
	SyncHandlerRecord,
	SyncMiddlewareRecord,
	SyncHandlerModule,
	SyncMiddlewareModule,
	SyncUpdateContext,
	SyncMiddlewareContext,
	SyncCallContext,
	HandlerClient,
	MiddlewareResult,
	CallHandler
} from './types.js'
import type { Client, ServerZone } from '../core/types.js'

// ============================================================================
// Handler Registry
// ============================================================================

// Registered handlers by pattern (e.g., 'game.[roomId].position')
const _handlers: Map<string, SyncHandlerRecord> = new Map()
const _handlerPortalKeys: Map<string, string> = new Map()

// Registered middleware by directory path
const _middleware: Map<string, SyncMiddlewareRecord> = new Map()
const _middlewarePortalKeys: Map<string, string> = new Map()

// Compiled regex patterns for matching
const _patterns: Map<string, { regex: RegExp; params: string[] }> = new Map()

/**
 * Register a sync handler from manifest.
 */
export function registerHandler(record: SyncHandlerRecord): void {
	const pattern = keyToPattern(record.key)
	_handlers.set(pattern, record)
	if (record.portalKey) {
		_handlerPortalKeys.set(record.portalKey, pattern)
	}

	// Compile regex pattern for matching
	const { regex, params } = compilePattern(pattern)
	_patterns.set(pattern, { regex, params })

	syncLogger.debug(`Registered sync handler: ${record.key} -> ${pattern}`)
}

/**
 * Register middleware from manifest.
 */
export function registerMiddleware(record: SyncMiddlewareRecord): void {
	_middleware.set(record.path, record)
	if (record.portalKey) {
		_middlewarePortalKeys.set(record.portalKey, record.path)
	}
	syncLogger.debug(`Registered sync middleware: ${record.path}`)
}

export function unregisterHandlerByPortalKey(portalKey: string): void {
	const pattern = _handlerPortalKeys.get(portalKey)
	if (!pattern) {
		return
	}

	_handlerPortalKeys.delete(portalKey)
	_handlers.delete(pattern)
	_patterns.delete(pattern)
}

export function unregisterMiddlewareByPortalKey(portalKey: string): void {
	const middlewarePath = _middlewarePortalKeys.get(portalKey)
	if (!middlewarePath) {
		return
	}

	_middlewarePortalKeys.delete(portalKey)
	_middleware.delete(middlewarePath)
}

/**
 * Convert a file-based key (e.g., 'game/[roomId]/position') to pattern format.
 */
function keyToPattern(key: string): string {
	// Convert / to . and keep [param] as is
	return key.replace(/\//g, '.')
}

/**
 * Compile a pattern into a regex for matching.
 */
function compilePattern(pattern: string): { regex: RegExp; params: string[] } {
	const params: string[] = []
	let regexStr = '^'

	const segments = pattern.split('.')
	for (let i = 0; i < segments.length; i++) {
		const segment = segments[i]
		if (i > 0) regexStr += '\\.'

		// Dynamic segment: [param]
		const dynamicMatch = segment.match(/^\[([^\]]+)\]$/)
		if (dynamicMatch) {
			params.push(dynamicMatch[1])
			regexStr += '([^.]+)'
		} else {
			// Literal segment
			regexStr += escapeRegex(segment)
		}
	}

	regexStr += '$'
	return { regex: new RegExp(regexStr), params }
}

/**
 * Escape special regex characters.
 */
function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Find a handler matching a key and extract params.
 */
export function findHandler(cleanKey: string): { record: SyncHandlerRecord; params: Record<string, string> } | null {
	for (const [pattern, compiled] of _patterns.entries()) {
		const match = cleanKey.match(compiled.regex)
		if (match) {
			const record = _handlers.get(pattern)
			if (!record) continue

			const params: Record<string, string> = {}
			for (let i = 0; i < compiled.params.length; i++) {
				params[compiled.params[i]] = match[i + 1]
			}

			return { record, params }
		}
	}
	return null
}

/**
 * Find all middleware that applies to a key (ordered from root to leaf).
 */
export function findMiddleware(cleanKey: string): SyncMiddlewareRecord[] {
	const result: SyncMiddlewareRecord[] = []
	const segments = cleanKey.split('.')

	// Check each directory level
	for (let i = 1; i <= segments.length; i++) {
		const dirPath = segments.slice(0, i).join('/')
		const record = _middleware.get(dirPath)
		if (record) {
			result.push(record)
		}
	}

	return result
}

/**
 * Load a handler module on demand through the portal.
 */
async function loadHandler(record: SyncHandlerRecord): Promise<SyncHandlerModule | null> {
	if (record.handler) return record.handler

	try {
		const portalKey = record.portalKey ?? record.key
		if (!portalKey) {
			return null
		}

		const handler = (await portal.getHandler('sync', 'sync', portalKey)) as unknown as SyncHandlerModule
		record.handler = handler
		return handler
	} catch (error) {
		syncLogger.warn(`Failed to lazy-load handler: ${record.key}`, error)
		return null
	}
}

/**
 * Load a middleware module on demand through the portal.
 */
async function loadMiddleware(record: SyncMiddlewareRecord): Promise<SyncMiddlewareModule | null> {
	if (record.handler) return record.handler

	try {
		const portalKey = record.portalKey ?? record.path
		if (!portalKey) {
			return null
		}

		const handler = (await portal.getHandler('sync', 'sync', portalKey)) as unknown as SyncMiddlewareModule
		record.handler = handler
		return handler
	} catch (error) {
		syncLogger.warn(`Failed to lazy-load middleware: ${record.path}`, error)
		return null
	}
}

// ============================================================================
// Handler Invocation
// ============================================================================

/**
 * Result of processing an update through handlers.
 */
export interface UpdateResult {
	/** Whether the update was accepted */
	accepted: boolean
	/** Transformed state (if accepted) */
	state?: unknown
	/** Rejection reason (if rejected) */
	reason?: string
	/** Validation errors (if schema validation failed) */
	errors?: Array<{ path: string; message: string }>
}

/**
 * Process an update through handlers (validation, transform, etc.).
 *
 * @param cleanKey - Normalized key string
 * @param key - Original key array
 * @param newState - New state from client
 * @param oldState - Previous state
 * @param client - Client making the update
 * @returns Result indicating if update was accepted and final state
 */
export async function processUpdate<T = unknown>(
	cleanKey: string,
	key: string[],
	newState: T,
	oldState: T | undefined,
	client: HandlerClient
): Promise<UpdateResult> {
	// Find matching handler
	const handlerMatch = findHandler(cleanKey)

	// No handler = pass through (client-authoritative)
	if (!handlerMatch) {
		return { accepted: true, state: newState }
	}

	const { record, params } = handlerMatch

	// Load handler module
	const handler = await loadHandler(record)
	if (!handler) {
		// Handler failed to load - allow update to preserve backward compatibility
		syncLogger.warn(`Handler for ${cleanKey} failed to load, allowing update`)
		return { accepted: true, state: newState }
	}

	// Build context
	const context: SyncUpdateContext<T> = {
		newState,
		oldState,
		client,
		params,
		key,
		cleanKey
	}

	// Find applicable middleware
	const middlewareRecords = findMiddleware(cleanKey)

	// Run middleware 'before' hooks (root to leaf)
	for (const mwRecord of middlewareRecords) {
		const mw = await loadMiddleware(mwRecord)
		if (mw?.before) {
			const mwContext: SyncMiddlewareContext<T> = {
				state: newState,
				client,
				params,
				key,
				cleanKey,
				messageType: 'update'
			}

			const result = await mw.before(mwContext)
			if ('reject' in result) {
				return { accepted: false, reason: result.reason || 'middleware_rejected' }
			}
		}
	}

	// Schema validation
	if (handler.schema) {
		const schemaResult = validateSchema(handler.schema, newState)
		if (!schemaResult.success) {
			return { accepted: false, reason: 'schema_validation_failed', errors: schemaResult.errors }
		}
	}

	// Custom validation
	if (handler.validate) {
		const validateResult = await handler.validate(context)
		if (validateResult === false) {
			return { accepted: false, reason: 'validation_failed' }
		}
		if (typeof validateResult === 'string') {
			return { accepted: false, reason: validateResult }
		}
	}

	// Transform
	let finalState: T = newState
	if (handler.transform) {
		finalState = (await handler.transform(context)) as T
	}

	// Return accepted state - onUpdate and middleware 'after' run post-broadcast
	return {
		accepted: true,
		state: finalState,
		// Store context for post-broadcast hooks
		_postContext: { handler, middlewareRecords, context: { ...context, newState: finalState } }
	} as UpdateResult & { _postContext?: unknown }
}

/**
 * Run post-broadcast hooks (onUpdate, middleware 'after').
 */
export async function runPostUpdateHooks(result: UpdateResult & { _postContext?: unknown }): Promise<void> {
	const postContext = result._postContext as {
		handler: SyncHandlerModule
		middlewareRecords: SyncMiddlewareRecord[]
		context: SyncUpdateContext
	} | undefined

	if (!postContext) return

	const { handler, middlewareRecords, context } = postContext

	// onUpdate callback
	if (handler.onUpdate) {
		try {
			await handler.onUpdate(context)
		} catch (error) {
			syncLogger.error('onUpdate handler error:', error)
		}
	}

	// Middleware 'after' hooks (leaf to root)
	for (let i = middlewareRecords.length - 1; i >= 0; i--) {
		const mw = await loadMiddleware(middlewareRecords[i])
		if (mw?.after) {
			try {
				const mwContext: SyncMiddlewareContext = {
					state: context.newState,
					client: context.client,
					params: context.params,
					key: context.key,
					cleanKey: context.cleanKey,
					messageType: 'update'
				}
				await mw.after(mwContext)
			} catch (error) {
				syncLogger.error('Middleware after hook error:', error)
			}
		}
	}
}

// ============================================================================
// RPC Call Handling
// ============================================================================

/**
 * Result of an RPC call.
 */
export interface CallResult {
	success: boolean
	result?: unknown
	error?: string
}

/**
 * Process an RPC call.
 *
 * @param cleanKey - Normalized key string
 * @param key - Original key array
 * @param method - Method name to call
 * @param payload - Call payload
 * @param client - Client making the call
 * @param zone - Server zone for state access
 */
export async function processCall<T = unknown>(
	cleanKey: string,
	key: string[],
	method: string,
	payload: unknown,
	client: HandlerClient,
	zone: ServerZone<T>
): Promise<CallResult> {
	// Find matching handler
	const handlerMatch = findHandler(cleanKey)

	if (!handlerMatch) {
		return { success: false, error: 'no_handler' }
	}

	const { record, params } = handlerMatch

	// Load handler module
	const handler = await loadHandler(record)
	if (!handler) {
		return { success: false, error: 'handler_load_failed' }
	}

	// Find the RPC method
	const rpcHandler = handler[method]
	if (typeof rpcHandler !== 'function') {
		return { success: false, error: 'method_not_found' }
	}

	// Build context
	const context: SyncCallContext<T> = {
		client,
		params,
		key,
		cleanKey,
		getState: () => zone.getState(),
		setState: (data) => zone.setState(data),
		getHost: () => zone.getHost(),
		getClients: () => zone.getClients(),
		broadcast: (p) => zone.broadcast(p),
		send: (id, p) => zone.send(id, p)
	}

	// Find applicable middleware
	const middlewareRecords = findMiddleware(cleanKey)

	// Run middleware 'before' hooks
	for (const mwRecord of middlewareRecords) {
		const mw = await loadMiddleware(mwRecord)
		if (mw?.before) {
			const mwContext: SyncMiddlewareContext<T> = {
				state: zone.getState() as T,
				client,
				params,
				key,
				cleanKey,
				messageType: 'call'
			}

			const result = await mw.before(mwContext)
			if ('reject' in result) {
				return { success: false, error: result.reason || 'middleware_rejected' }
			}
		}
	}

	// Execute the RPC handler
	try {
		// Cast context to unknown to satisfy CallHandler's generic constraint
		const result = await (rpcHandler as CallHandler<unknown, unknown, unknown, unknown>)(payload, context as SyncCallContext<unknown, unknown>)
		return { success: true, result }
	} catch (error) {
		syncLogger.error(`RPC call error (${method}):`, error)
		return { success: false, error: error instanceof Error ? error.message : 'call_failed' }
	}
}

// ============================================================================
// Registry Management
// ============================================================================

/**
 * Clear all registered handlers (for testing).
 */
export function clearHandlers(): void {
	_handlers.clear()
	_middleware.clear()
	_patterns.clear()
	_handlerPortalKeys.clear()
	_middlewarePortalKeys.clear()
}

/**
 * Get handler count (for debugging).
 */
export function getHandlerCount(): number {
	return _handlers.size
}

/**
 * Get middleware count (for debugging).
 */
export function getMiddlewareCount(): number {
	return _middleware.size
}
