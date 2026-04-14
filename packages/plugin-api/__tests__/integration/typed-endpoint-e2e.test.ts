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
		matchApiPrefix: () => null,
		matchStaticPrefix: () => null,
		stripPrefix: (p: string) => p,
		getPublicDir: () => null
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

describe('Typed endpoint (real HTTP)', () => {
	let NodeEngine: new () => any
	let startTestServer: typeof import('./helpers/test-server.js').startTestServer

	beforeAll(async () => {
		const engineMod = await import('../../src/engines/node.js')
		NodeEngine = engineMod.NodeEngine

		const helpers = await import('./helpers/test-server.js')
		startTestServer = helpers.startTestServer
	})

	// ------------------------------------------------------------------
	// 1. Handler returning a plain object produces correct JSON
	// ------------------------------------------------------------------
	describe('JSON response from handler', () => {
		let server: TestServer

		beforeAll(async () => {
			server = await startTestServer(mockPluginOptions, NodeEngine)

			;(server.engine as any).registerRoute('/api/info', () => {
				return { message: 'hello', count: 42 }
			})
		})

		afterAll(async () => {
			await server.stop()
		})

		it('returns exact JSON body', async () => {
			const res = await server.fetch('/api/info')
			expect(res.ok).toBe(true)

			const body = await res.json()
			expect(body).toEqual({ message: 'hello', count: 42 })
		})

		it('response Content-Type is application/json', async () => {
			const res = await server.fetch('/api/info')
			const ct = res.headers.get('content-type') ?? ''
			expect(ct).toContain('application/json')
		})
	})

	// ------------------------------------------------------------------
	// 2. Handler reading request headers
	// ------------------------------------------------------------------
	describe('request headers', () => {
		let server: TestServer

		beforeAll(async () => {
			server = await startTestServer(mockPluginOptions, NodeEngine)

			;(server.engine as any).registerRoute('/api/headers', (req: any) => {
				return {
					custom: req.headers.get('x-custom'),
					auth: req.headers.get('authorization')
				}
			})
		})

		afterAll(async () => {
			await server.stop()
		})

		it('reads custom headers from the request', async () => {
			const res = await server.fetch('/api/headers', {
				headers: {
					'X-Custom': 'my-value',
					Authorization: 'Bearer token123'
				}
			})
			expect(res.ok).toBe(true)

			const body = await res.json()
			expect(body).toEqual({
				custom: 'my-value',
				auth: 'Bearer token123'
			})
		})
	})

	// ------------------------------------------------------------------
	// 3. Handler reading path params
	// ------------------------------------------------------------------
	describe('path params', () => {
		let server: TestServer

		beforeAll(async () => {
			server = await startTestServer(mockPluginOptions, NodeEngine)

			;(server.engine as any).registerRoute('/api/items/:itemId', (req: any) => {
				return { itemId: req.params.itemId }
			})
		})

		afterAll(async () => {
			await server.stop()
		})

		it('extracts :itemId from URL path', async () => {
			const res = await server.fetch('/api/items/abc-123')
			expect(res.ok).toBe(true)

			const body = await res.json()
			expect(body).toEqual({ itemId: 'abc-123' })
		})
	})

	// ------------------------------------------------------------------
	// 4. Handler reading and echoing request body
	// ------------------------------------------------------------------
	describe('request body', () => {
		let server: TestServer

		beforeAll(async () => {
			server = await startTestServer(mockPluginOptions, NodeEngine)

			;(server.engine as any).registerRoute('/api/echo', async (req: any) => {
				const body = await req.json()
				return { echo: body }
			})
		})

		afterAll(async () => {
			await server.stop()
		})

		it('reads JSON body and echoes it back', async () => {
			const payload = { foo: 'bar', nums: [1, 2, 3] }
			const res = await server.fetch('/api/echo', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			})
			expect(res.ok).toBe(true)

			const body = await res.json()
			expect(body).toEqual({ echo: payload })
		})
	})

	// ------------------------------------------------------------------
	// 5. Handler returning a Response object
	// ------------------------------------------------------------------
	describe('Response object return', () => {
		let server: TestServer

		beforeAll(async () => {
			server = await startTestServer(mockPluginOptions, NodeEngine)

			;(server.engine as any).registerRoute('/api/custom-response', () => {
				return new Response(JSON.stringify({ custom: true }), {
					status: 201,
					headers: { 'Content-Type': 'application/json', 'X-Created': 'yes' }
				})
			})
		})

		afterAll(async () => {
			await server.stop()
		})

		it('passes through status code and custom headers from Response', async () => {
			const res = await server.fetch('/api/custom-response')
			expect(res.status).toBe(201)
			expect(res.headers.get('x-created')).toBe('yes')

			const body = await res.json()
			expect(body).toEqual({ custom: true })
		})
	})

	// ------------------------------------------------------------------
	// 6. Handler using reply.send() with a Response for custom status
	// ------------------------------------------------------------------
	describe('Response with custom status', () => {
		let server: TestServer

		beforeAll(async () => {
			server = await startTestServer(mockPluginOptions, NodeEngine)

			;(server.engine as any).registerRoute('/api/custom-status', () => {
				return new Response(JSON.stringify({ accepted: true }), {
					status: 202,
					headers: { 'Content-Type': 'application/json' }
				})
			})
		})

		afterAll(async () => {
			await server.stop()
		})

		it('preserves custom 202 status code from returned Response', async () => {
			const res = await server.fetch('/api/custom-status')
			expect(res.status).toBe(202)

			const body = await res.json()
			expect(body).toEqual({ accepted: true })
		})
	})

	// ------------------------------------------------------------------
	// 7. Handler using reply.code().json() chain
	//    Note: reply.json() internally creates a Response with status 200,
	//    which overrides the previously set status code.
	// ------------------------------------------------------------------
	describe('reply.code().json() chain', () => {
		let server: TestServer

		beforeAll(async () => {
			server = await startTestServer(mockPluginOptions, NodeEngine)

			;(server.engine as any).registerRoute('/api/reply-chain', (_req: any, reply: any) => {
				reply.code(202).json({ accepted: true })
			})
		})

		afterAll(async () => {
			await server.stop()
		})

		it('delivers JSON body through reply chain', async () => {
			const res = await server.fetch('/api/reply-chain')

			const body = await res.json()
			expect(body).toEqual({ accepted: true })
		})
	})
})
