import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals'
import type { TestServer } from './helpers/test-server.js'

// ---------------------------------------------------------------------------
// Module-scope mocks – these MUST be set up before any dynamic engine imports
// ---------------------------------------------------------------------------

const mockPluginOptions: Record<string, unknown> = { cors: false, prefix: '/api' }

jest.unstable_mockModule('../../src/robo/prepare.js', () => ({
	pluginOptions: mockPluginOptions
}))

jest.unstable_mockModule('../../src/core/logger.js', () => ({
	logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn() }
}))

jest.unstable_mockModule('../../src/core/plugin-routes.js', () => ({
	getPluginRouteRegistry: () => ({
		matchApiPrefix: jest.fn(() => null),
		matchStaticPrefix: jest.fn(() => null),
		stripPrefix: jest.fn((p: string, prefix: string) => p.slice(prefix.length) || '/'),
		getPublicDir: jest.fn(() => null)
	})
}))

jest.unstable_mockModule('robo.js', () => ({
	color: { bold: (s: string) => s, blue: (s: string) => s },
	composeColors: (..._fns: any[]) => (s: string) => s,
	Mode: { isDev: () => false },
	Robo: { status: { set: jest.fn() } }
}))

// ---------------------------------------------------------------------------

jest.setTimeout(15_000)

describe('Plugin prefix routing (real HTTP)', () => {
	let NodeEngine: new () => any
	let startTestServer: typeof import('./helpers/test-server.js').startTestServer

	beforeAll(async () => {
		const engineMod = await import('../../src/engines/node.js')
		NodeEngine = engineMod.NodeEngine

		const helpers = await import('./helpers/test-server.js')
		startTestServer = helpers.startTestServer
	})

	// ------------------------------------------------------------------
	// 1. Default /api prefix
	// ------------------------------------------------------------------
	describe('default /api prefix', () => {
		let server: TestServer

		beforeAll(async () => {
			mockPluginOptions.prefix = '/api'
			server = await startTestServer(mockPluginOptions, NodeEngine)

			;(server.engine as any).registerRoute('/api/health', () => ({ status: 'ok' }))
		})

		afterAll(async () => {
			await server.stop()
		})

		it('route at /api/health is accessible', async () => {
			const res = await server.fetch('/api/health')
			expect(res.ok).toBe(true)

			const body = await res.json()
			expect(body).toEqual({ status: 'ok' })
		})

		it('same route without /api prefix produces fallback body', async () => {
			const res = await server.fetch('/health', {
				headers: { Accept: 'application/json' }
			})
			const body = await res.json()
			expect(body).toBe('API Route not found.')
		})
	})

	// ------------------------------------------------------------------
	// 2. Custom prefix /v1
	// ------------------------------------------------------------------
	describe('custom prefix /v1', () => {
		let server: TestServer

		beforeAll(async () => {
			mockPluginOptions.prefix = '/v1'
			server = await startTestServer(mockPluginOptions, NodeEngine)

			;(server.engine as any).registerRoute('/v1/users', () => ({ users: ['alice', 'bob'] }))
		})

		afterAll(async () => {
			await server.stop()
		})

		it('route at /v1/users is accessible', async () => {
			const res = await server.fetch('/v1/users')
			expect(res.ok).toBe(true)

			const body = await res.json()
			expect(body).toEqual({ users: ['alice', 'bob'] })
		})

		it('/api/users with wrong prefix produces fallback body', async () => {
			const res = await server.fetch('/api/users', {
				headers: { Accept: 'application/json' }
			})
			const body = await res.json()
			expect(body).toBe('API Route not found.')
		})

		it('/users without prefix produces fallback body', async () => {
			const res = await server.fetch('/users', {
				headers: { Accept: 'application/json' }
			})
			const body = await res.json()
			expect(body).toBe('API Route not found.')
		})
	})

	// ------------------------------------------------------------------
	// 3. Prefix disabled (false)
	// ------------------------------------------------------------------
	describe('prefix disabled', () => {
		let server: TestServer

		beforeAll(async () => {
			mockPluginOptions.prefix = false
			server = await startTestServer(mockPluginOptions, NodeEngine)

			;(server.engine as any).registerRoute('/users', () => ({ users: ['charlie'] }))
		})

		afterAll(async () => {
			await server.stop()
		})

		it('route at /users is accessible when prefix is disabled', async () => {
			const res = await server.fetch('/users')
			expect(res.ok).toBe(true)

			const body = await res.json()
			expect(body).toEqual({ users: ['charlie'] })
		})

		it('/api/users produces fallback body when prefix is disabled', async () => {
			const res = await server.fetch('/api/users', {
				headers: { Accept: 'application/json' }
			})
			const body = await res.json()
			expect(body).toBe('API Route not found.')
		})
	})

	// ------------------------------------------------------------------
	// 4. Multiple routes with prefix
	// ------------------------------------------------------------------
	describe('multiple routes with prefix', () => {
		let server: TestServer

		beforeAll(async () => {
			mockPluginOptions.prefix = '/api'
			server = await startTestServer(mockPluginOptions, NodeEngine)

			;(server.engine as any).registerRoute('/api/users', () => ({ type: 'users' }))
			;(server.engine as any).registerRoute('/api/users/:id', (req: any) => ({ type: 'user', id: req.params.id }))
			;(server.engine as any).registerRoute('/api/posts', () => ({ type: 'posts' }))
		})

		afterAll(async () => {
			await server.stop()
		})

		it('routes coexist under the same prefix', async () => {
			const usersRes = await server.fetch('/api/users')
			expect(usersRes.ok).toBe(true)
			expect(await usersRes.json()).toEqual({ type: 'users' })

			const userRes = await server.fetch('/api/users/42')
			expect(userRes.ok).toBe(true)
			expect(await userRes.json()).toEqual({ type: 'user', id: '42' })

			const postsRes = await server.fetch('/api/posts')
			expect(postsRes.ok).toBe(true)
			expect(await postsRes.json()).toEqual({ type: 'posts' })
		})
	})
})
