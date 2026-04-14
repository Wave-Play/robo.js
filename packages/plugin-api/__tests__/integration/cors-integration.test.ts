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

function randomPort(): number {
	return 20_000 + Math.floor(Math.random() * 10_000)
}

describe('CORS integration (real HTTP)', () => {
	let NodeEngine: new () => any
	let startTestServer: typeof import('./helpers/test-server.js').startTestServer

	beforeAll(async () => {
		const engineMod = await import('../../src/engines/node.js')
		NodeEngine = engineMod.NodeEngine

		const helpers = await import('./helpers/test-server.js')
		startTestServer = helpers.startTestServer
	})

	// ------------------------------------------------------------------
	// 1. cors: true – permissive wildcard
	// ------------------------------------------------------------------
	describe('cors: true', () => {
		let server: TestServer

		beforeAll(async () => {
			mockPluginOptions.cors = true
			server = await startTestServer(mockPluginOptions, NodeEngine)
			;(server.engine as any).registerRoute('/api/health', () => ({ ok: true }))
		})

		afterAll(async () => {
			await server.stop()
		})

		it('GET response includes Access-Control-Allow-Origin: *', async () => {
			const res = await server.fetch('/api/health')
			expect(res.ok).toBe(true)
			expect(res.headers.get('access-control-allow-origin')).toBe('*')
		})

		it('OPTIONS preflight returns 204', async () => {
			const res = await server.fetch('/api/health', { method: 'OPTIONS' })
			expect(res.status).toBe(204)
			expect(res.headers.get('access-control-allow-methods')).toContain('GET')
			expect(res.headers.get('access-control-allow-methods')).toContain('POST')
		})
	})

	// ------------------------------------------------------------------
	// 2. Specific origins
	// ------------------------------------------------------------------
	describe('specific origins', () => {
		let server: TestServer

		beforeAll(async () => {
			mockPluginOptions.cors = {
				origins: ['http://allowed.example.com', 'http://also-allowed.com']
			}
			server = await startTestServer(mockPluginOptions, NodeEngine)
			;(server.engine as any).registerRoute('/api/data', () => ({ data: 1 }))
		})

		afterAll(async () => {
			await server.stop()
		})

		it('echoes allowed origin and includes Vary: Origin', async () => {
			const res = await server.fetch('/api/data', {
				headers: { Origin: 'http://allowed.example.com' }
			})
			expect(res.ok).toBe(true)
			expect(res.headers.get('access-control-allow-origin')).toBe('http://allowed.example.com')
			expect(res.headers.get('vary')).toContain('Origin')
		})

		it('does not include Access-Control-Allow-Origin for disallowed origin', async () => {
			const res = await server.fetch('/api/data', {
				headers: { Origin: 'http://evil.com' }
			})
			// The request still succeeds at the HTTP level (CORS is enforced by browsers)
			// but the header should NOT be present
			expect(res.headers.get('access-control-allow-origin')).toBeNull()
		})
	})

	// ------------------------------------------------------------------
	// 3. Credentials mode
	// ------------------------------------------------------------------
	describe('credentials enabled', () => {
		let server: TestServer

		beforeAll(async () => {
			mockPluginOptions.cors = { origins: '*', credentials: true }
			server = await startTestServer(mockPluginOptions, NodeEngine)
			;(server.engine as any).registerRoute('/api/me', () => ({ user: 'test' }))
		})

		afterAll(async () => {
			await server.stop()
		})

		it('echoes origin instead of wildcard and includes Allow-Credentials', async () => {
			const res = await server.fetch('/api/me', {
				headers: { Origin: 'http://my-app.com' }
			})
			expect(res.ok).toBe(true)

			// With credentials + wildcard origins, the handler echoes back the
			// request origin rather than sending the literal '*'
			expect(res.headers.get('access-control-allow-origin')).toBe('http://my-app.com')
			expect(res.headers.get('access-control-allow-credentials')).toBe('true')
		})
	})

	// ------------------------------------------------------------------
	// 4. CORS disabled (default)
	// ------------------------------------------------------------------
	describe('cors disabled', () => {
		let server: TestServer

		beforeAll(async () => {
			mockPluginOptions.cors = false
			server = await startTestServer(mockPluginOptions, NodeEngine)
			;(server.engine as any).registerRoute('/api/open', () => ({ open: true }))
		})

		afterAll(async () => {
			await server.stop()
		})

		it('response contains no CORS headers', async () => {
			const res = await server.fetch('/api/open')
			expect(res.ok).toBe(true)
			expect(res.headers.get('access-control-allow-origin')).toBeNull()
			expect(res.headers.get('access-control-allow-methods')).toBeNull()
			expect(res.headers.get('access-control-allow-credentials')).toBeNull()
		})
	})
})
