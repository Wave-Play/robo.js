import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { HandlerSummary } from 'robo.js'

const routeSummaries = jest.fn(async () => [] as HandlerSummary[])

jest.unstable_mockModule('robo.js', () => ({
	Manifest: {
		routeSummaries
	},
	Mode: {
		get: () => 'development'
	},
	getConfig: jest.fn(() => ({}))
}))

jest.unstable_mockModule('../src/core/plugin-routes.js', () => ({
	getPluginRouteRegistry: jest.fn(() => ({
		getPlugin: jest.fn(() => null)
	}))
}))

jest.unstable_mockModule('../src/core/logger.js', () => ({
	logger: {
		debug: jest.fn(),
		warn: jest.fn()
	}
}))

function createSummary(key: string, path: string): HandlerSummary {
	return {
		key,
		path,
		exports: { default: true, named: [] },
		plugin: null
	}
}

function createEngine() {
	const routes = new Set<string>()
	const handlers = new Map<string, unknown>()

	return {
		get routes() {
			return routes
		},
		get handlers() {
			return handlers
		},
		registerRoute: jest.fn(async (path: string, handler: unknown) => {
			routes.add(path)
			handlers.set(path, handler)
		}),
		unregisterRoute: jest.fn(async (path: string) => {
			routes.delete(path)
			handlers.delete(path)
		}),
		replaceRoute: jest.fn(async (path: string, handler: unknown) => {
			if (!routes.has(path)) {
				throw new Error(`missing route ${path}`)
			}
			routes.add(path)
			handlers.set(path, handler)
		}),
		hasRoute: jest.fn((path: string) => routes.has(path)),
		supportsRouteMutation: jest.fn(() => true)
	}
}

function createReply() {
	return {
		statusCode: 200,
		body: undefined as unknown,
		code(code: number) {
			this.statusCode = code
			return this
		},
		json(payload: unknown) {
			this.body = payload
			return this
		}
	}
}

describe('ApiRuntime topology sync', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		routeSummaries.mockReset()
	})

	it('commits topology even when removal finalization fails after commit', async () => {
		const { getApiRuntime } = await import('../src/core/api-runtime.js')
		const runtime = getApiRuntime()
		const engine = createEngine()

		routeSummaries.mockResolvedValueOnce([createSummary('users', 'api/users.js')])
		await runtime.initialize(engine as never, '/api')
		expect(runtime.getRegisteredPaths()).toEqual(['/api/users'])

		routeSummaries.mockResolvedValueOnce([createSummary('posts', 'api/posts.js')])
		engine.unregisterRoute.mockImplementation(async (_path: string) => {
			// Simulate final removal cleanup failure by leaving the ghost route installed.
		})

		await expect(runtime.syncTopology()).resolves.toBeDefined()
		expect(runtime.getRegisteredPaths()).toEqual(['/api/posts'])

		runtime.dispose()
	})

	it('pending removed routes continue serving old handlers if sync later fails', async () => {
		const { getApiRuntime } = await import('../src/core/api-runtime.js')
		const runtime = getApiRuntime()
		const engine = createEngine()
		const dispatcher = jest.fn(async () => 'ok')

		routeSummaries.mockResolvedValueOnce([createSummary('users', 'api/users.js')])
		await runtime.initialize(engine as never, '/api')
		const slot = (runtime as any)._getOrCreateSlot('users')
		slot.dispatcher = dispatcher
		slot.stale = false

		let resolveSync: ((success: boolean) => void) | undefined
		;(runtime as any)._syncPromise = new Promise<boolean>((resolve: (success: boolean) => void) => {
			resolveSync = resolve
		})
		;(runtime as any)._pendingRouteStates = new Map([
			['users', { kind: 'remove', fallbackRouteKey: 'users' }]
		])

		const wrapper = (runtime as any)._wrappers.get('users')
		const reply = createReply()
		const response = wrapper({} as never, reply as never)
		resolveSync?.(false)
		await response

		expect(dispatcher).toHaveBeenCalled()
		expect(reply.statusCode).toBe(200)

		runtime.dispose()
	})

	it('rolls back engine state when an added route fails verification', async () => {
		const { getApiRuntime } = await import('../src/core/api-runtime.js')
		const runtime = getApiRuntime()
		const engine = createEngine()

		routeSummaries.mockResolvedValueOnce([createSummary('users', 'api/users.js')])
		await runtime.initialize(engine as never, '/api')

		engine.hasRoute
			.mockImplementationOnce(() => false)
			.mockImplementation((registeredPath: string) => engine.routes.has(registeredPath))
		routeSummaries.mockResolvedValueOnce([
			createSummary('users', 'api/users.js'),
			createSummary('posts', 'api/posts.js')
		])

		await expect(runtime.syncTopology()).rejects.toThrow('Route verification failed for /api/posts')
		expect([...engine.routes]).toEqual(['/api/users'])
		expect(runtime.getRegisteredPaths()).toEqual(['/api/users'])

		runtime.dispose()
	})

	it('restores the previous handler when rolling back a replace mutation', async () => {
		const { getApiRuntime } = await import('../src/core/api-runtime.js')
		const runtime = getApiRuntime()
		const engine = createEngine()

		routeSummaries.mockResolvedValueOnce([createSummary('users', 'api/users.js')])
		await runtime.initialize(engine as never, '/api')
		const previousWrapper = engine.handlers.get('/api/users')

		const previousRoute = {
			path: '/api/users',
			routeKey: 'users',
			pluginName: null,
			registrationKind: 'project',
			summary: createSummary('users', 'api/users.js')
		}
		const nextRoute = {
			path: '/api/users',
			routeKey: 'users-v2',
			pluginName: null,
			registrationKind: 'project',
			summary: createSummary('users-v2', 'api/users.v2.js')
		}

		const createdWrapperKeys = new Set<string>()
		const nextWrapper = (runtime as any)._getOrCreateWrapperForSync('users-v2', createdWrapperKeys)
		await engine.replaceRoute('/api/users', nextWrapper)

		await (runtime as any)._rollbackAppliedMutations([
			{
				kind: 'replace',
				path: '/api/users',
				previousRoute,
				nextRoute
			}
		], {
			byRouteKey: new Map([
				['users-v2', [nextRoute]]
			]),
			byPath: new Map([
				['/api/users', nextRoute]
			])
		})

		expect(engine.handlers.get('/api/users')).toBe(previousWrapper)

		runtime.dispose()
	})

	it('marks newly added routes stale and unloaded after successful topology sync', async () => {
		const { getApiRuntime } = await import('../src/core/api-runtime.js')
		const runtime = getApiRuntime()
		const engine = createEngine()

		routeSummaries.mockResolvedValueOnce([])
		await runtime.initialize(engine as never, '/api')

		routeSummaries.mockResolvedValueOnce([createSummary('users', 'api/users.js')])
		await runtime.syncTopology()

		const slot = (runtime as any)._slots.get('users')
		expect(runtime.getRegisteredPaths()).toEqual(['/api/users'])
		expect(slot).toMatchObject({
			routeKey: 'users',
			module: null,
			dispatcher: null,
			stale: true
		})

		runtime.dispose()
	})

	it('newly added route wrappers dispatch without relying on stale topology membership checks', async () => {
		const { getApiRuntime } = await import('../src/core/api-runtime.js')
		const runtime = getApiRuntime()
		const engine = createEngine()
		const dispatcher = jest.fn(async () => 'ok')

		routeSummaries.mockResolvedValueOnce([])
		await runtime.initialize(engine as never, '/api')

		routeSummaries.mockResolvedValueOnce([createSummary('users', 'api/users.js')])
		await runtime.syncTopology()

		const wrapper = (runtime as any)._wrappers.get('users')
		;(runtime as any).getDispatcher = jest.fn(async () => dispatcher)
		const reply = createReply()

		await wrapper({}, reply)

		expect(dispatcher).toHaveBeenCalled()
		expect(reply.statusCode).toBe(200)

		runtime.dispose()
	})

	it('wrapper waits for sync completion before serving a pending route', async () => {
		const { getApiRuntime } = await import('../src/core/api-runtime.js')
		const runtime = getApiRuntime()
		const engine = createEngine()
		const dispatcher = jest.fn(async () => 'ok')

		routeSummaries.mockResolvedValueOnce([])
		await runtime.initialize(engine as never, '/api')

		let resolveSync: ((success: boolean) => void) | undefined
		;(runtime as any)._syncPromise = new Promise<boolean>((resolve: (success: boolean) => void) => {
			resolveSync = resolve
		})
		;(runtime as any)._pendingRouteStates = new Map([['users', {}]])
		const slot = (runtime as any)._getOrCreateSlot('users')
		slot.dispatcher = dispatcher
		slot.stale = false
		;(runtime as any)._topology = {
			byRouteKey: new Map([
				[
					'users',
					[
						{
							path: '/api/users',
							routeKey: 'users',
							pluginName: null,
							registrationKind: 'project',
							summary: createSummary('users', 'api/users.js')
						}
					]
				]
			]),
			byPath: new Map()
		}

		const wrapper = (runtime as any)._getOrCreateWrapper('users')
		const reply = createReply()
		const response = wrapper({} as never, reply as never)
		resolveSync?.(true)
		await response

		expect(reply.statusCode).toBe(200)

		runtime.dispose()
	})

	it('wrapper returns 500 when handler loading fails for an existing route', async () => {
		const { getApiRuntime } = await import('../src/core/api-runtime.js')
		const runtime = getApiRuntime()
		const engine = createEngine()

		routeSummaries.mockResolvedValueOnce([createSummary('users', 'api/users.js')])
		await runtime.initialize(engine as never, '/api')

		const wrapper = (runtime as any)._wrappers.get('users')
		;(runtime as any).getDispatcher = jest.fn(async () => null)
		const reply = createReply()

		await wrapper({}, reply)

		expect(reply.statusCode).toBe(500)
		expect(reply.body).toEqual({ error: 'Handler not available' })

		runtime.dispose()
	})

	it('wrapper returns 404 only when getDispatcher resolves null for an absent route', async () => {
		const { getApiRuntime } = await import('../src/core/api-runtime.js')
		const runtime = getApiRuntime()
		const engine = createEngine()

		routeSummaries.mockResolvedValueOnce([createSummary('users', 'api/users.js')])
		await runtime.initialize(engine as never, '/api')

		const wrapper = (runtime as any)._wrappers.get('users')
		;(runtime as any)._topology = { byRouteKey: new Map(), byPath: new Map() }
		;(runtime as any).getDispatcher = jest.fn(async () => null)
		const reply = createReply()

		await wrapper({}, reply)

		expect(reply.statusCode).toBe(404)
		expect(reply.body).toEqual({ error: 'Not Found' })

		runtime.dispose()
	})

	it('marks changed route summaries stale without changing stable topology', async () => {
		const { getApiRuntime } = await import('../src/core/api-runtime.js')
		const runtime = getApiRuntime()
		const engine = createEngine()

		routeSummaries.mockResolvedValueOnce([createSummary('users', 'api/users.js')])
		await runtime.initialize(engine as never, '/api')

		const slot = (runtime as any)._getOrCreateSlot('users')
		slot.stale = false
		slot.dispatcher = jest.fn()

		routeSummaries.mockResolvedValueOnce([createSummary('users', 'api/users.v2.js')])
		await runtime.syncTopology()

		expect(runtime.getRegisteredPaths()).toEqual(['/api/users'])
		expect(slot.stale).toBe(true)

		runtime.dispose()
	})
})
