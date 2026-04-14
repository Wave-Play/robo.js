import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createMethodDispatcher, createRegisteredApiRoutes, normalizeServerPrefix, type RegisteredApiRoute } from './api-routing.js'
import { logger } from './logger.js'
import { getConfig, Manifest, Mode } from 'robo.js'
import type { HandlerSummary } from 'robo.js'
import type { BaseEngine } from '../engines/base.js'
import type { ApiHandlerModule } from '../robo/routes/api.js'
import type { RouteHandler } from './types.js'

export interface ApiHandlerSlot {
	routeKey: string
	module: ApiHandlerModule | null
	dispatcher: RouteHandler | null
	version: number
	stale: boolean
	pendingLoad?: Promise<RouteHandler | null>
}

export interface ApiTopologySnapshot {
	byRouteKey: Map<string, RegisteredApiRoute[]>
	byPath: Map<string, RegisteredApiRoute>
}

interface TopologyMutation {
	kind: 'add' | 'replace' | 'remove'
	path: string
	nextRoute?: RegisteredApiRoute
	previousRoute?: RegisteredApiRoute
}

interface AppliedTopologyMutation {
	kind: 'add' | 'replace' | 'remove'
	path: string
	nextRoute?: RegisteredApiRoute
	previousRoute?: RegisteredApiRoute
}

interface TopologySyncError extends Error {
	rollbackAttempted: boolean
	rollbackFailed: boolean
}

interface PendingRouteState {
	kind: 'add' | 'replace' | 'remove'
	fallbackRouteKey?: string
}

class ApiRuntime {
	private _engine: BaseEngine | null = null
	private _prefix = ''
	private _topology: ApiTopologySnapshot = {
		byRouteKey: new Map(),
		byPath: new Map()
	}
	private _slots = new Map<string, ApiHandlerSlot>()
	private _wrappers = new Map<string, RouteHandler>()
	private _pendingRouteStates = new Map<string, PendingRouteState>()
	private _syncPromise: Promise<boolean> | null = null
	private _resolveSyncPromise: ((success: boolean) => void) | null = null

	public async initialize(engine: BaseEngine, prefix: string | null | false | undefined): Promise<void> {
		this.dispose()
		this._engine = engine
		this._prefix = normalizeServerPrefix(prefix)
		await this.syncTopology()
	}

	public dispose(): void {
		this._engine = null
		this._topology = {
			byRouteKey: new Map(),
			byPath: new Map()
		}
		this._slots.clear()
		this._wrappers.clear()
		this._pendingRouteStates.clear()
		this._syncPromise = null
		this._resolveSyncPromise = null
	}

	public getRegisteredPaths(): string[] {
		return [...this._topology.byPath.keys()]
	}

	public getCapabilities() {
		const mutableRoutes = this._engine?.supportsRouteMutation() ?? false
		return {
			serverApiTopology: mutableRoutes,
			serverApiMutableRoutes: mutableRoutes
		}
	}

	public markRoutesStale(routeKeys: string[]): void {
		for (const routeKey of routeKeys) {
			const slot = this._getOrCreateSlot(routeKey)
			slot.stale = true
		}
	}

	public async syncTopology(): Promise<ApiTopologySnapshot> {
		if (!this._engine) {
			throw new Error('API runtime has not been initialized')
		}

		const currentTopology = this._topology
		const nextTopology = buildTopology(await Manifest.routeSummaries('server', 'api'), this._prefix)
		const createdWrapperKeys = new Set<string>()
		const mutations = this._planTopologyMutations(currentTopology, nextTopology)
		const appliedMutations: AppliedTopologyMutation[] = []
		this._beginTopologySync(mutations)

		try {
			for (const mutation of mutations) {
				const appliedMutation = await this._applyTopologyMutation(mutation, createdWrapperKeys)
				appliedMutations.push(appliedMutation)
				this._verifyAppliedMutation(appliedMutation)
			}
		} catch (error) {
			let rollbackError: Error | null = null

			try {
				await this._rollbackAppliedMutations(appliedMutations)
			} catch (rollbackFailure) {
				rollbackError = rollbackFailure instanceof Error ? rollbackFailure : new Error(String(rollbackFailure))
			}

			for (const routeKey of createdWrapperKeys) {
				if (!currentTopology.byRouteKey.has(routeKey)) {
					this._wrappers.delete(routeKey)
				}
			}

			if (rollbackError) {
				const applyError = error instanceof Error ? error.message : String(error)
				this._finishTopologySync(false)
				throw createTopologySyncError(`Topology sync failed: ${applyError}. Rollback failed: ${rollbackError.message}`, true, true)
			}

			const message = error instanceof Error ? error.message : String(error)
			this._finishTopologySync(false)
			throw createTopologySyncError(message, appliedMutations.length > 0, false)
		}

		this._commitTopology(currentTopology, nextTopology)
		this._finishTopologySync(true)
		await this._finalizeRemovedRoutes(mutations)

		return nextTopology
	}

	public async getDispatcher(routeKey: string): Promise<RouteHandler | null> {
		const routes = this._topology.byRouteKey.get(routeKey)
		if (!routes || routes.length === 0) {
			return null
		}

		const slot = this._getOrCreateSlot(routeKey)
		if (slot.pendingLoad) {
			return slot.pendingLoad
		}

		if (slot.dispatcher && !slot.stale) {
			return slot.dispatcher
		}

		slot.pendingLoad = this._loadDispatcher(slot, routes[0].summary)
		try {
			return await slot.pendingLoad
		} finally {
			slot.pendingLoad = undefined
		}
	}

	private _getOrCreateWrapper(routeKey: string): RouteHandler {
		const cached = this._wrappers.get(routeKey)
		if (cached) {
			return cached
		}

		const wrapper: RouteHandler = async (req, reply) => {
			const dispatcher = await this.getDispatcher(routeKey)
			if (!dispatcher) {
				const pendingDispatcher = await this._awaitPendingDispatcher(routeKey)
				if (pendingDispatcher) {
					return pendingDispatcher(req, reply)
				}

				if (!this._topology.byRouteKey.has(routeKey)) {
					return reply.code(404).json({ error: 'Not Found' })
				}

				return reply.code(500).json({ error: 'Handler not available' })
			}

			return dispatcher(req, reply)
		}

		this._wrappers.set(routeKey, wrapper)
		return wrapper
	}

	private _getOrCreateWrapperForSync(routeKey: string, createdWrapperKeys: Set<string>): RouteHandler {
		const cached = this._wrappers.get(routeKey)
		if (cached) {
			return cached
		}

		createdWrapperKeys.add(routeKey)
		return this._getOrCreateWrapper(routeKey)
	}

	private _getOrCreateSlot(routeKey: string): ApiHandlerSlot {
		const cached = this._slots.get(routeKey)
		if (cached) {
			return cached
		}

		const slot: ApiHandlerSlot = {
			routeKey,
			module: null,
			dispatcher: null,
			version: 0,
			stale: true
		}
		this._slots.set(routeKey, slot)
		return slot
	}

	private async _loadDispatcher(slot: ApiHandlerSlot, summary: HandlerSummary): Promise<RouteHandler | null> {
		const previousModule = slot.module
		const previousDispatcher = slot.dispatcher
		const previousVersion = slot.version
		const nextVersion = Date.now()

		try {
			const module = (await import(getImportPath(summary, nextVersion))) as ApiHandlerModule
			const dispatcher = createMethodDispatcher(module)

			if (!dispatcher) {
				throw new Error(`API handler "${summary.key}" has no runnable exports`)
			}

			slot.module = module
			slot.dispatcher = dispatcher
			slot.version = nextVersion
			slot.stale = false
			return dispatcher
		} catch (error) {
			if (previousDispatcher) {
				slot.module = previousModule
				slot.dispatcher = previousDispatcher
				slot.version = previousVersion
				slot.stale = false
				logger.warn(`[HMR] Preserving previous API handler for ${summary.key}:`, error)
				return previousDispatcher
			}

			slot.module = null
			slot.dispatcher = null
			slot.version = nextVersion
			slot.stale = false
			logger.warn(`[HMR] Failed to load API handler for ${summary.key}:`, error)
			return null
		}
	}

	private _verifyRouteState(path: string, expected: boolean): void {
		if ((this._engine?.hasRoute(path) ?? false) !== expected) {
			throw new Error(`Route verification failed for ${path}`)
		}
	}

	private _planTopologyMutations(currentTopology: ApiTopologySnapshot, nextTopology: ApiTopologySnapshot): TopologyMutation[] {
		const replacements: TopologyMutation[] = []
		const additions: TopologyMutation[] = []
		const removals: TopologyMutation[] = []

		for (const [registeredPath, nextRoute] of nextTopology.byPath) {
			const currentRoute = currentTopology.byPath.get(registeredPath)
			if (!currentRoute) {
				additions.push({ kind: 'add', path: registeredPath, nextRoute })
				continue
			}

			if (currentRoute.routeKey !== nextRoute.routeKey) {
				replacements.push({
					kind: 'replace',
					path: registeredPath,
					previousRoute: currentRoute,
					nextRoute
				})
			}
		}

		for (const [registeredPath, currentRoute] of currentTopology.byPath) {
			if (!nextTopology.byPath.has(registeredPath)) {
				removals.push({ kind: 'remove', path: registeredPath, previousRoute: currentRoute })
			}
		}

		return [...replacements, ...additions, ...removals]
	}

	private async _applyTopologyMutation(
		mutation: TopologyMutation,
		createdWrapperKeys: Set<string>
	): Promise<AppliedTopologyMutation> {
		if (!this._engine) {
			throw new Error('API runtime has not been initialized')
		}

		if (mutation.kind === 'add') {
			const nextRoute = mutation.nextRoute
			if (!nextRoute) {
				throw new Error(`Missing next route for add mutation: ${mutation.path}`)
			}

			const wrapper = this._getOrCreateWrapperForSync(nextRoute.routeKey, createdWrapperKeys)
			await this._engine.registerRoute(mutation.path, wrapper)
			logger.debug(`[HMR] Registered API route: ${mutation.path}`)
			return { ...mutation }
		}

		if (mutation.kind === 'replace') {
			const nextRoute = mutation.nextRoute
			if (!nextRoute) {
				throw new Error(`Missing next route for replace mutation: ${mutation.path}`)
			}

			const wrapper = this._getOrCreateWrapperForSync(nextRoute.routeKey, createdWrapperKeys)
			await this._engine.replaceRoute(mutation.path, wrapper)
			logger.debug(`[HMR] Replaced API route: ${mutation.path}`)
			return { ...mutation }
		}

		logger.debug(`[HMR] Staged API route removal: ${mutation.path}`)
		return { ...mutation }
	}

	private _verifyAppliedMutation(mutation: AppliedTopologyMutation): void {
		this._verifyRouteState(mutation.path, true)
	}

	private async _rollbackAppliedMutations(
		appliedMutations: AppliedTopologyMutation[]
	): Promise<void> {
		if (!this._engine) {
			throw new Error('API runtime has not been initialized')
		}

		const rollbackErrors: Error[] = []

		for (const mutation of [...appliedMutations].reverse()) {
			try {
				if (mutation.kind === 'add') {
					await this._engine.unregisterRoute(mutation.path)
					this._verifyRouteState(mutation.path, false)
					continue
				}

				if (mutation.kind === 'remove') continue

				const previousRoute = mutation.previousRoute
				if (!previousRoute) {
					throw new Error(`Missing previous route for rollback: ${mutation.path}`)
				}

				const previousWrapper = this._getWrapper(previousRoute.routeKey)
				if (!previousWrapper) {
					throw new Error(`Missing previous wrapper for rollback: ${previousRoute.routeKey}`)
				}

				await this._engine.replaceRoute(mutation.path, previousWrapper)
				this._verifyRouteState(mutation.path, true)
			} catch (error) {
				rollbackErrors.push(error instanceof Error ? error : new Error(String(error)))
			}
		}

		if (rollbackErrors.length > 0) {
			throw new Error(rollbackErrors.map(error => error.message).join('; '))
		}
	}

	private _commitTopology(currentTopology: ApiTopologySnapshot, nextTopology: ApiTopologySnapshot): void {
		this._topology = nextTopology

		for (const routeKey of currentTopology.byRouteKey.keys()) {
			if (!nextTopology.byRouteKey.has(routeKey)) {
				this._slots.delete(routeKey)
				this._wrappers.delete(routeKey)
			}
		}

		const routeKeysToInvalidate = new Set<string>()
		for (const [routeKey, nextRoutes] of nextTopology.byRouteKey) {
			const currentRoutes = currentTopology.byRouteKey.get(routeKey)
			if (!currentRoutes || didRouteChange(currentRoutes[0]?.summary, nextRoutes[0]?.summary)) {
				routeKeysToInvalidate.add(routeKey)
			}
		}

		if (routeKeysToInvalidate.size > 0) {
			this.markRoutesStale([...routeKeysToInvalidate])
		}
	}

	private _getWrapper(routeKey: string): RouteHandler | null {
		return this._wrappers.get(routeKey) ?? null
	}

	private _beginTopologySync(mutations: TopologyMutation[]): void {
		if (this._syncPromise) {
			throw createTopologySyncError('Topology sync already in progress', false, false)
		}

		this._pendingRouteStates.clear()
		for (const mutation of mutations) {
			if (mutation.kind === 'add' && mutation.nextRoute) {
				this._pendingRouteStates.set(mutation.nextRoute.routeKey, { kind: 'add' })
			}

			if (mutation.kind === 'replace' && mutation.nextRoute) {
				this._pendingRouteStates.set(mutation.nextRoute.routeKey, {
					kind: 'replace',
					fallbackRouteKey: mutation.previousRoute?.routeKey
				})
			}

			if (mutation.kind === 'remove' && mutation.previousRoute) {
				this._pendingRouteStates.set(mutation.previousRoute.routeKey, {
					kind: 'remove',
					fallbackRouteKey: mutation.previousRoute.routeKey
				})
			}
		}

		this._syncPromise = new Promise<boolean>((resolve) => {
			this._resolveSyncPromise = resolve
		})
	}

	private _finishTopologySync(success: boolean): void {
		const resolve = this._resolveSyncPromise
		this._resolveSyncPromise = null
		this._syncPromise = null
		this._pendingRouteStates.clear()
		resolve?.(success)
	}

	private async _awaitPendingDispatcher(routeKey: string): Promise<RouteHandler | null> {
		const pendingState = this._pendingRouteStates.get(routeKey)
		const syncPromise = this._syncPromise
		if (!pendingState || !syncPromise) {
			return null
		}

		const syncSucceeded = await syncPromise
		if (syncSucceeded) {
			if (pendingState.kind === 'remove') {
				return null
			}
			return this.getDispatcher(routeKey)
		}

		if (!pendingState.fallbackRouteKey) {
			return null
		}

		return this.getDispatcher(pendingState.fallbackRouteKey)
	}

	private async _finalizeRemovedRoutes(mutations: TopologyMutation[]): Promise<void> {
		if (!this._engine) {
			return
		}

		for (const mutation of mutations) {
			if (mutation.kind !== 'remove') {
				continue
			}

			try {
				await this._engine.unregisterRoute(mutation.path)
				this._verifyRouteState(mutation.path, false)
				logger.debug(`[HMR] Unregistered API route: ${mutation.path}`)
			} catch (error) {
				// The committed topology already hides this route from requests.
				logger.warn(`[HMR] Failed to finalize API route removal for ${mutation.path}:`, error)
			}
		}
	}
}

function buildTopology(summaries: HandlerSummary[], prefix: string): ApiTopologySnapshot {
	const byRouteKey = new Map<string, RegisteredApiRoute[]>()
	const byPath = new Map<string, RegisteredApiRoute>()

	for (const summary of summaries) {
		const routes = createRegisteredApiRoutes(summary, prefix)
		byRouteKey.set(summary.key, routes)

		for (const route of routes) {
			byPath.set(route.path, route)
		}
	}

	return { byRouteKey, byPath }
}
function createTopologySyncError(message: string, rollbackAttempted: boolean, rollbackFailed: boolean): TopologySyncError {
	const error = new Error(message) as TopologySyncError
	error.rollbackAttempted = rollbackAttempted
	error.rollbackFailed = rollbackFailed
	return error
}

function didRouteChange(current?: HandlerSummary, next?: HandlerSummary): boolean {
	if (!current || !next) {
		return true
	}

	return JSON.stringify({
		key: current.key,
		path: current.path,
		plugin: current.plugin,
		exports: current.exports
	}) !==
		JSON.stringify({
			key: next.key,
			path: next.path,
			plugin: next.plugin,
			exports: next.exports
		})
}

function getImportPath(summary: HandlerSummary, version: number): string {
	const basePath = summary.plugin ? getPluginBuildPath(summary.plugin) : getProjectBuildPath()
	const fileUrl = pathToFileURL(path.join(basePath, summary.path))
	fileUrl.searchParams.set('v', String(version))
	return fileUrl.toString()
}

function getProjectBuildPath(): string {
	const config = getConfig()
	const customBuildDir = config?.experimental?.buildDirectory

	if (typeof customBuildDir === 'function') {
		return path.join(process.cwd(), customBuildDir({ mode: Mode.get(), baseDir: process.cwd() }))
	}
	if (typeof customBuildDir === 'string') {
		return path.join(process.cwd(), customBuildDir)
	}

	return path.join(process.cwd(), '.robo', 'build', Mode.get())
}

function getPluginBuildPath(pluginName: string): string {
	return path.join(process.cwd(), 'node_modules', pluginName, '.robo', 'build')
}

const runtime = new ApiRuntime()

export function getApiRuntime(): ApiRuntime {
	return runtime
}
