import { describe, expect, it, jest, beforeEach } from '@jest/globals'

const mockRegistry = {
	getPlugin: jest.fn(() => null as { apiPrefix?: string; exclusive?: boolean } | null)
}

jest.unstable_mockModule('../src/core/plugin-routes.js', () => ({
	getPluginRouteRegistry: () => mockRegistry
}))

jest.unstable_mockModule('robo.js', () => ({
	Manifest: { routeSummariesSync: jest.fn(() => []) }
}))

describe('api-routing helpers', () => {
	let normalizeServerPrefix: typeof import('../src/core/api-routing.js').normalizeServerPrefix
	let getApiRoutePath: typeof import('../src/core/api-routing.js').getApiRoutePath
	let createRegisteredApiRoutes: typeof import('../src/core/api-routing.js').createRegisteredApiRoutes
	let createMethodDispatcher: typeof import('../src/core/api-routing.js').createMethodDispatcher

	beforeEach(async () => {
		jest.clearAllMocks()
		mockRegistry.getPlugin.mockReturnValue(null)
		const mod = await import('../src/core/api-routing.js')
		normalizeServerPrefix = mod.normalizeServerPrefix
		getApiRoutePath = mod.getApiRoutePath
		createRegisteredApiRoutes = mod.createRegisteredApiRoutes
		createMethodDispatcher = mod.createMethodDispatcher
	})

	describe('normalizeServerPrefix()', () => {
		it('returns empty string for null', () => {
			expect(normalizeServerPrefix(null)).toBe('')
		})

		it('returns empty string for false', () => {
			expect(normalizeServerPrefix(false)).toBe('')
		})

		it('returns /api as default for undefined', () => {
			expect(normalizeServerPrefix(undefined)).toBe('/api')
		})

		it('adds leading slash to bare string', () => {
			expect(normalizeServerPrefix('custom')).toBe('/custom')
		})

		it('strips trailing slash', () => {
			expect(normalizeServerPrefix('/custom/')).toBe('/custom')
		})

		it('returns /api unchanged', () => {
			expect(normalizeServerPrefix('/api')).toBe('/api')
		})

		it('returns empty string for empty string', () => {
			expect(normalizeServerPrefix('')).toBe('')
		})

		it('returns empty string for whitespace-only string', () => {
			expect(normalizeServerPrefix(' ')).toBe('')
		})
	})

	describe('getApiRoutePath()', () => {
		it('converts bracket params to colon params', () => {
			expect(getApiRoutePath('/api', 'users/[id]')).toBe('/api/users/:id')
		})

		it('returns prefix alone when routeKey is empty', () => {
			expect(getApiRoutePath('/api', '')).toBe('/api')
		})

		it('returns route path under root prefix', () => {
			expect(getApiRoutePath('/', 'health')).toBe('/health')
		})

		it('returns route path with leading slash when prefix is empty', () => {
			expect(getApiRoutePath('', 'health')).toBe('/health')
		})

		it('converts multiple bracket params', () => {
			expect(getApiRoutePath('/api', 'users/[id]/posts/[postId]')).toBe('/api/users/:id/posts/:postId')
		})
	})

	describe('createRegisteredApiRoutes()', () => {
		function makeSummary(key: string, plugin: string | null = null) {
			return {
				key,
				path: `api/${key}.js`,
				exports: { default: true, named: [] },
				plugin
			}
		}

		it('returns 1 route with registrationKind "project" for non-plugin summary', () => {
			const routes = createRegisteredApiRoutes(makeSummary('health'), '/api')

			expect(routes).toHaveLength(1)
			expect(routes[0]).toMatchObject({
				path: '/api/health',
				registrationKind: 'project',
				pluginName: null
			})
		})

		it('returns 1 route with "plugin-exclusive" kind for plugin with exclusive prefix', () => {
			mockRegistry.getPlugin.mockReturnValue({ apiPrefix: '/mock', exclusive: true })
			const routes = createRegisteredApiRoutes(makeSummary('health', '@robojs/mock'), '/api')

			expect(routes).toHaveLength(1)
			expect(routes[0]).toMatchObject({
				path: '/mock/api/health',
				registrationKind: 'plugin-exclusive',
				pluginName: '@robojs/mock'
			})
		})

		it('returns 2 routes for plugin with non-exclusive prefix', () => {
			mockRegistry.getPlugin.mockReturnValue({ apiPrefix: '/mock', exclusive: false })
			const routes = createRegisteredApiRoutes(makeSummary('health', '@robojs/mock'), '/api')

			expect(routes).toHaveLength(2)
			expect(routes[0]).toMatchObject({
				path: '/api/health',
				registrationKind: 'project'
			})
			expect(routes[1]).toMatchObject({
				path: '/mock/api/health',
				registrationKind: 'plugin-additive'
			})
		})

		it('returns 1 route as project when plugin has no prefix config', () => {
			mockRegistry.getPlugin.mockReturnValue(null)
			const routes = createRegisteredApiRoutes(makeSummary('health', '@robojs/other'), '/api')

			expect(routes).toHaveLength(1)
			expect(routes[0]).toMatchObject({
				path: '/api/health',
				registrationKind: 'project',
				pluginName: '@robojs/other'
			})
		})
	})

	describe('createMethodDispatcher()', () => {
		function createMockReply() {
			const reply = {
				statusCode: 200,
				headers: {} as Record<string, string>,
				body: undefined as unknown,
				hasSent: false,
				code(code: number) {
					reply.statusCode = code
					return reply
				},
				header(name: string, value: string) {
					reply.headers[name] = value
					return reply
				},
				json(data: unknown) {
					reply.body = data
					reply.hasSent = true
					return reply
				},
				send(data: unknown) {
					reply.body = data
					reply.hasSent = true
					return reply
				}
			}
			return reply
		}

		it('returns null for null handler', () => {
			expect(createMethodDispatcher(null)).toBeNull()
		})

		it('returns the default function directly when only default export exists', () => {
			const defaultFn = jest.fn()
			const result = createMethodDispatcher({ default: defaultFn })

			expect(result).toBe(defaultFn)
		})

		it('returns a dispatcher that routes by method for named exports', async () => {
			const getFn = jest.fn(async () => 'get-result')
			const postFn = jest.fn(async () => 'post-result')
			const dispatcher = createMethodDispatcher({ GET: getFn, POST: postFn })

			expect(dispatcher).not.toBe(getFn)
			expect(dispatcher).not.toBe(postFn)
			expect(typeof dispatcher).toBe('function')
		})

		it('calls GET handler when request method is GET', async () => {
			const getFn = jest.fn(async () => 'get-result')
			const postFn = jest.fn(async () => 'post-result')
			const dispatcher = createMethodDispatcher({ GET: getFn, POST: postFn })

			const req = { method: 'GET' } as never
			const reply = createMockReply()
			await dispatcher!(req, reply as never)

			expect(getFn).toHaveBeenCalled()
			expect(postFn).not.toHaveBeenCalled()
		})

		it('returns 405 with Allow header when method is not supported and no default', async () => {
			const getFn = jest.fn(async () => 'get-result')
			const dispatcher = createMethodDispatcher({ GET: getFn })

			const req = { method: 'DELETE' } as never
			const reply = createMockReply()
			await dispatcher!(req, reply as never)

			expect(reply.statusCode).toBe(405)
			expect(reply.headers['Allow']).toBe('GET')
			expect(reply.body).toMatchObject({ error: 'Method Not Allowed' })
		})

		it('auto responds 204 with Allow header for OPTIONS when no OPTIONS export', async () => {
			const getFn = jest.fn(async () => 'ok')
			const postFn = jest.fn(async () => 'ok')
			const dispatcher = createMethodDispatcher({ GET: getFn, POST: postFn })

			const req = { method: 'OPTIONS' } as never
			const reply = createMockReply()
			await dispatcher!(req, reply as never)

			expect(reply.statusCode).toBe(204)
			expect(reply.headers['Allow']).toContain('GET')
			expect(reply.headers['Allow']).toContain('POST')
		})

		it('falls back to GET handler for HEAD request when no HEAD export', async () => {
			const getFn = jest.fn(async () => 'get-result')
			const dispatcher = createMethodDispatcher({ GET: getFn })

			const req = { method: 'HEAD' } as never
			const reply = createMockReply()
			await dispatcher!(req, reply as never)

			expect(getFn).toHaveBeenCalled()
		})

		it('named exports take priority over default, default is fallback', async () => {
			const getFn = jest.fn(async () => 'get-result')
			const defaultFn = jest.fn(async () => 'default-result')
			const dispatcher = createMethodDispatcher({ default: defaultFn, GET: getFn })

			// GET should use named export
			const getReq = { method: 'GET' } as never
			const getReply = createMockReply()
			await dispatcher!(getReq, getReply as never)
			expect(getFn).toHaveBeenCalled()
			expect(defaultFn).not.toHaveBeenCalled()

			// POST should fall back to default
			jest.clearAllMocks()
			const postReq = { method: 'POST' } as never
			const postReply = createMockReply()
			await dispatcher!(postReq, postReply as never)
			expect(defaultFn).toHaveBeenCalled()
			expect(getFn).not.toHaveBeenCalled()
		})
	})
})
