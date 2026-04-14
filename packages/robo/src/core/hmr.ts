/**
 * HMR (Hot Module Replacement) Cleanup API
 *
 * Provides a way for modules to register cleanup callbacks that run when
 * the module is hot-reloaded during development. This prevents memory leaks
 * from timers, event listeners, singletons, sockets, etc.
 *
 * Usage:
 * ```ts
 * import { hmr } from 'robo.js/hmr'
 *
 * const hot = hmr.module(import.meta.url)
 * const timer = setInterval(() => console.log('tick'), 1000)
 * hot.dispose(() => clearInterval(timer))
 * ```
 *
 * The cleanup API is a no-op in production for zero runtime overhead.
 */

/**
 * Callback function registered for cleanup when a module is reloaded.
 */
export type DisposeCallback = () => unknown

/**
 * Interface returned by `hmr.module()` for registering cleanup callbacks
 * and accessing persisted data across reloads.
 */
export interface HotModule {
	/**
	 * Register a cleanup callback for when this module is reloaded.
	 * Multiple callbacks can be registered and will run in order.
	 * Async callbacks are fire-and-forget (started but not awaited).
	 */
	dispose(callback: DisposeCallback): void

	/**
	 * Persisted data that survives across reloads.
	 * Use this to preserve state like singleton instances.
	 */
	data: Record<string, unknown>
}

/**
 * Callback function for HMR event subscriptions.
 */
export type HmrCallback = (context: HmrEventContext) => unknown

/**
 * Options for filtering HMR events when subscribing.
 */
export interface HmrSubscribeOptions {
	/**
	 * Only receive events for these namespaces.
	 * If not specified, receives all namespaces.
	 */
	namespaces?: string[]

	/**
	 * Only receive events for these route types.
	 * If not specified, receives all routes.
	 */
	routes?: string[]

	/**
	 * Only receive events for these change types.
	 * If not specified, receives all change types.
	 */
	changeTypes?: Array<'change' | 'add' | 'remove'>
}

/**
 * Subscription handle returned by `hmr.subscribe()`.
 */
export interface HmrSubscription {
	/**
	 * Unsubscribe from HMR events.
	 * After calling this, the callback will no longer be invoked.
	 */
	unsubscribe(): void
}

/**
 * Route info included in HMR event context.
 */
export interface HmrEventRouteInfo {
	namespace: string
	route: string
	handlers: Array<{
		key: string
		path: string
		changeType: 'add' | 'remove' | 'change'
		plugin?: { name: string; version: string }
	}>
}

/**
 * Context passed to HMR event subscribers.
 */
export interface HmrEventContext {
	changeType: 'change' | 'add' | 'remove'
	files: string[]
	routes: HmrEventRouteInfo[]
	mode: string
}

/**
 * HMR API interface.
 */
export interface HMR {
	/**
	 * Whether HMR is currently enabled.
	 * Returns `true` only when running `robo dev --hmr`.
	 */
	readonly enabled: boolean

	/**
	 * Get the HMR instance for a module.
	 * Call this at the top level of your module with `import.meta.url`.
	 *
	 * When a module is reloaded, any previously registered dispose callbacks
	 * are executed before the new module instance registers its own.
	 *
	 * @param metaUrl - The module URL from `import.meta.url`
	 * @returns A HotModule instance for registering cleanup callbacks
	 */
	module(metaUrl: string): HotModule

	/**
	 * Subscribe to HMR events.
	 * Callbacks are invoked after handlers are reloaded in the portal.
	 *
	 * @param callback - Function to call when HMR events occur
	 * @param options - Optional filters for events
	 * @returns Subscription handle with unsubscribe method
	 *
	 * @example
	 * ```ts
	 * import { hmr } from 'robo.js/hmr'
	 *
	 * const sub = hmr.subscribe((ctx) => {
	 *   console.log('Routes reloaded:', ctx.routes)
	 * }, {
	 *   namespaces: ['server'],
	 *   routes: ['api']
	 * })
	 *
	 * // Later: sub.unsubscribe()
	 * ```
	 */
	subscribe(callback: HmrCallback, options?: HmrSubscribeOptions): HmrSubscription
}

/**
 * Internal subscriber entry with callback and filter options.
 */
interface HmrSubscriberEntry {
	callback: HmrCallback
	options?: HmrSubscribeOptions
}

/**
 * Internal state stored in globalThis to survive module reloads.
 */
interface HMRState {
	// Map from normalized module URL → dispose callbacks
	disposers: Map<string, DisposeCallback[]>
	// Map from normalized module URL → persisted data object
	data: Map<string, Record<string, unknown>>
	// Counter for debugging
	reloadCount: number
	// Set of HMR event subscribers
	subscribers: Set<HmrSubscriberEntry>
}

declare global {
	// eslint-disable-next-line no-var
	var __robo_hmr__: HMRState | undefined
}

/**
 * Normalize a module URL by stripping query string and hash.
 * This ensures the same module with different cache-busting params
 * is recognized as the same module.
 *
 * @param url - The module URL (typically from import.meta.url)
 * @returns Normalized URL without query/hash
 */
function normalizeUrl(url: string): string {
	try {
		const parsed = new URL(url)
		// Remove query string and hash
		parsed.search = ''
		parsed.hash = ''
		return parsed.href
	} catch {
		// If URL parsing fails, do basic string manipulation
		// Remove query string
		let normalized = url.split('?')[0]
		// Remove hash
		normalized = normalized.split('#')[0]
		return normalized
	}
}

/**
 * Get or initialize the global HMR state.
 */
function getState(): HMRState {
	if (!globalThis.__robo_hmr__) {
		globalThis.__robo_hmr__ = {
			disposers: new Map(),
			data: new Map(),
			reloadCount: 0,
			subscribers: new Set()
		}
	}
	// Ensure subscribers exists for older state objects
	if (!globalThis.__robo_hmr__.subscribers) {
		globalThis.__robo_hmr__.subscribers = new Set()
	}
	return globalThis.__robo_hmr__
}

/**
 * Run all dispose callbacks for a module.
 * Errors are caught and logged but don't stop other callbacks.
 */
function runDisposers(normalizedUrl: string): void {
	const state = getState()
	const disposers = state.disposers.get(normalizedUrl)

	if (!disposers || disposers.length === 0) {
		return
	}

	state.reloadCount++

	for (const callback of disposers) {
		try {
			const result = callback()
			// Fire-and-forget for async callbacks
			if (result instanceof Promise) {
				result.catch((err) => {
					console.error(`[HMR] Async dispose error for ${normalizedUrl}:`, err)
				})
			}
		} catch (err) {
			console.error(`[HMR] Dispose error for ${normalizedUrl}:`, err)
		}
	}

	// Clear disposers after running
	state.disposers.set(normalizedUrl, [])
}

/**
 * Create a HotModule instance for a specific module URL.
 */
function createHotModule(normalizedUrl: string): HotModule {
	const state = getState()

	// Initialize disposers array if needed
	if (!state.disposers.has(normalizedUrl)) {
		state.disposers.set(normalizedUrl, [])
	}

	// Initialize or get persisted data object
	if (!state.data.has(normalizedUrl)) {
		state.data.set(normalizedUrl, {})
	}

	return {
		dispose(callback: DisposeCallback): void {
			const disposers = state.disposers.get(normalizedUrl)!
			disposers.push(callback)
		},
		data: state.data.get(normalizedUrl)!
	}
}

/**
 * No-op HotModule for production mode.
 */
const noopData: Record<string, unknown> = {}
const noopModule: HotModule = {
	dispose: () => {
		// No-op in production
	},
	data: noopData
}

/**
 * Check if HMR is enabled.
 * HMR is enabled when running `robo dev --hmr`.
 */
function isHmrEnabled(): boolean {
	return process.env.ROBO_HMR === 'true'
}

/**
 * Filter context for a subscriber based on their options.
 * Returns null if no routes match the filter (subscriber should be skipped).
 */
function filterContextForSubscriber(
	context: HmrEventContext,
	options?: HmrSubscribeOptions
): HmrEventContext | null {
	if (!options) {
		return context
	}

	// Check changeType filter
	if (options.changeTypes && !options.changeTypes.includes(context.changeType)) {
		return null
	}

	// Filter routes by namespace and route
	let filteredRoutes = context.routes

	if (options.namespaces) {
		filteredRoutes = filteredRoutes.filter((r) => options.namespaces!.includes(r.namespace))
	}

	if (options.routes) {
		filteredRoutes = filteredRoutes.filter((r) => options.routes!.includes(r.route))
	}

	// If no routes match, skip this subscriber
	if (filteredRoutes.length === 0) {
		return null
	}

	// Return context with filtered routes
	return {
		...context,
		routes: filteredRoutes
	}
}

/**
 * Subscribe to HMR events (development mode).
 */
function subscribe(callback: HmrCallback, options?: HmrSubscribeOptions): HmrSubscription {
	const state = getState()
	const entry: HmrSubscriberEntry = { callback, options }
	state.subscribers.add(entry)

	return {
		unsubscribe(): void {
			state.subscribers.delete(entry)
		}
	}
}

/**
 * No-op subscription for production mode.
 */
const noopSubscription: HmrSubscription = {
	unsubscribe: () => {
		// No-op in production
	}
}

/**
 * Dispatch an HMR event to all subscribers.
 * Called by executeHmrHooks() after handlers are reloaded.
 * Errors are caught and logged but never thrown.
 *
 * @internal
 */
export async function dispatchHmrEvent(context: HmrEventContext): Promise<void> {
	if (!isHmrEnabled()) {
		return
	}

	const state = getState()

	for (const entry of state.subscribers) {
		try {
			const filteredContext = filterContextForSubscriber(context, entry.options)
			if (!filteredContext) {
				continue
			}

			const result = entry.callback(filteredContext)
			if (result instanceof Promise) {
				await result.catch((err) => {
					console.error('[HMR] Subscriber error:', err)
				})
			}
		} catch (err) {
			console.error('[HMR] Subscriber error:', err)
		}
	}
}

/**
 * Get the number of active subscribers.
 * @internal - For testing only
 */
export function getSubscriberCount(): number {
	return getState().subscribers.size
}

/**
 * Clear all subscribers.
 * @internal - For testing only
 */
export function clearHmrSubscribers(): void {
	getState().subscribers.clear()
}

/**
 * HMR API implementation for development mode.
 */
const devHmr: HMR = {
	get enabled(): boolean {
		return true
	},

	module(metaUrl: string): HotModule {
		const normalizedUrl = normalizeUrl(metaUrl)

		// Run any previous dispose callbacks for this module
		runDisposers(normalizedUrl)

		// Return a fresh HotModule for the new instance
		return createHotModule(normalizedUrl)
	},

	subscribe
}

/**
 * HMR API implementation for production mode (no-op).
 */
const prodHmr: HMR = {
	get enabled(): boolean {
		return false
	},

	module(): HotModule {
		return noopModule
	},

	subscribe(): HmrSubscription {
		return noopSubscription
	}
}

/**
 * HMR cleanup API for hot module replacement.
 *
 * Use this to register cleanup callbacks that run when your module
 * is hot-reloaded during development. This prevents memory leaks
 * from timers, event listeners, singletons, etc.
 *
 * Example:
 * ```ts
 * import { hmr } from 'robo.js/hmr'
 *
 * const hot = hmr.module(import.meta.url)
 *
 * // Register cleanup for timers
 * const timer = setInterval(() => console.log('tick'), 1000)
 * hot.dispose(() => clearInterval(timer))
 *
 * // Persist data across reloads
 * hot.data.counter = (hot.data.counter as number ?? 0) + 1
 * ```
 *
 * In production, all methods are no-ops for zero runtime overhead.
 */
export const hmr: HMR = isHmrEnabled() ? devHmr : prodHmr
