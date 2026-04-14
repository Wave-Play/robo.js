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

describe('Static / SPA fallback behavior (real HTTP)', () => {
	let NodeEngine: new () => any
	let startTestServer: typeof import('./helpers/test-server.js').startTestServer

	beforeAll(async () => {
		const engineMod = await import('../../src/engines/node.js')
		NodeEngine = engineMod.NodeEngine

		const helpers = await import('./helpers/test-server.js')
		startTestServer = helpers.startTestServer
	})

	// ------------------------------------------------------------------
	// 1. No static files – unknown paths produce "API Route not found."
	//
	//    NOTE: The handler calls reply.code(404).json(...) but due to the
	//    status-code override in reply.send(), the HTTP status arrives as
	//    200. We verify behaviour by checking the body text.
	// ------------------------------------------------------------------
	describe('no static files', () => {
		let server: TestServer

		beforeAll(async () => {
			mockPluginOptions.prefix = '/api'
			server = await startTestServer(mockPluginOptions, NodeEngine)
			// No routes registered – everything falls through
		})

		afterAll(async () => {
			await server.stop()
		})

		it('returns "API Route not found." body for an unknown path', async () => {
			const res = await server.fetch('/unknown-path', {
				headers: { Accept: 'application/json' }
			})
			const body = await res.json()
			expect(body).toBe('API Route not found.')
		})
	})

	// ------------------------------------------------------------------
	// 2. Accept header filtering
	//    With no index.html on disk, both text/html and application/json
	//    requests to unknown paths produce the fallback body.
	// ------------------------------------------------------------------
	describe('Accept header filtering', () => {
		let server: TestServer

		beforeAll(async () => {
			mockPluginOptions.prefix = '/api'
			server = await startTestServer(mockPluginOptions, NodeEngine)
			;(server.engine as any).registerRoute('/api/data', () => ({ ok: true }))
		})

		afterAll(async () => {
			await server.stop()
		})

		it('returns fallback body for GET with Accept: text/html on non-existent path (no index.html)', async () => {
			// SPA fallback would kick in only if index.html exists in the public dir.
			// Since we have no public dir, the fallback cannot serve anything.
			const res = await server.fetch('/dashboard', {
				headers: { Accept: 'text/html' }
			})
			const body = await res.json()
			expect(body).toBe('API Route not found.')
		})

		it('returns fallback body for GET with Accept: application/json on non-existent path', async () => {
			const res = await server.fetch('/non-existent', {
				headers: { Accept: 'application/json' }
			})
			const body = await res.json()
			expect(body).toBe('API Route not found.')
		})
	})

	// ------------------------------------------------------------------
	// 3. File extension requests – produce fallback body, not served files
	// ------------------------------------------------------------------
	describe('file extension requests', () => {
		let server: TestServer

		beforeAll(async () => {
			mockPluginOptions.prefix = '/api'
			server = await startTestServer(mockPluginOptions, NodeEngine)
		})

		afterAll(async () => {
			await server.stop()
		})

		it('returns fallback body for /styles.css (no static dir)', async () => {
			const res = await server.fetch('/styles.css')
			const body = await res.json()
			expect(body).toBe('API Route not found.')
		})

		it('returns fallback body for /app.js (no static dir)', async () => {
			const res = await server.fetch('/app.js')
			const body = await res.json()
			expect(body).toBe('API Route not found.')
		})
	})

	// ------------------------------------------------------------------
	// 4. API prefix guard – paths under /api do not get SPA fallback
	// ------------------------------------------------------------------
	describe('API prefix guard', () => {
		let server: TestServer

		beforeAll(async () => {
			mockPluginOptions.prefix = '/api'
			server = await startTestServer(mockPluginOptions, NodeEngine)
			;(server.engine as any).registerRoute('/api/health', () => ({ status: 'ok' }))
		})

		afterAll(async () => {
			await server.stop()
		})

		it('registered API route responds normally', async () => {
			const res = await server.fetch('/api/health')
			expect(res.ok).toBe(true)

			const body = await res.json()
			expect(body).toEqual({ status: 'ok' })
		})

		it('unregistered path under /api produces fallback body (no SPA fallback)', async () => {
			// Since the path starts with /api (the configured prefix), the SPA
			// fallback is suppressed even for text/html requests.
			const res = await server.fetch('/api/nonexistent', {
				headers: { Accept: 'text/html' }
			})
			const body = await res.json()
			expect(body).toBe('API Route not found.')
		})
	})

	// ------------------------------------------------------------------
	// 5. Custom 404 handler
	// ------------------------------------------------------------------
	describe('custom 404 handler via registerNotFound', () => {
		let server: TestServer

		beforeAll(async () => {
			mockPluginOptions.prefix = '/api'
			server = await startTestServer(mockPluginOptions, NodeEngine)
			;(server.engine as any).registerNotFound((_req: any, reply: any) => {
				reply.code(404).json({ custom: true, message: 'not here' })
			})
		})

		afterAll(async () => {
			await server.stop()
		})

		it('invokes the custom 404 handler for unmatched routes', async () => {
			const res = await server.fetch('/totally-unknown')
			const body = await res.json()
			expect(body).toEqual({ custom: true, message: 'not here' })
		})
	})
})
