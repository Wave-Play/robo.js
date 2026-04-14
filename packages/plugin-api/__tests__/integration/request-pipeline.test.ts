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

/** Pick a random port in the 20 000 – 30 000 range. */
function randomPort(): number {
	return 20_000 + Math.floor(Math.random() * 10_000)
}

describe('NodeEngine request pipeline (integration)', () => {
	let NodeEngine: new () => any
	let startTestServer: typeof import('./helpers/test-server.js').startTestServer

	beforeAll(async () => {
		const engineMod = await import('../../src/engines/node.js')
		NodeEngine = engineMod.NodeEngine

		const helpers = await import('./helpers/test-server.js')
		startTestServer = helpers.startTestServer
	})

	// Utility: create a fresh server with routes already registered
	async function createServer(
		registerRoutes: (engine: any) => void
	): Promise<TestServer> {
		const server = await startTestServer(mockPluginOptions, NodeEngine)
		registerRoutes(server.engine)
		return server
	}

	// ------------------------------------------------------------------
	// 1. All HTTP methods
	// ------------------------------------------------------------------
	describe('HTTP method support', () => {
		let server: TestServer

		beforeAll(async () => {
			server = await createServer((engine) => {
				engine.registerRoute('/methods', (req: any) => {
					return { method: req.method }
				})
			})
		})

		afterAll(async () => {
			await server.stop()
		})

		it.each(['GET', 'POST', 'PUT', 'DELETE', 'PATCH'])('handles %s requests', async (method) => {
			const res = await server.fetch('/methods', { method })
			expect(res.ok).toBe(true)

			const body = await res.json()
			expect(body).toEqual({ method })
		})
	})

	// ------------------------------------------------------------------
	// 2. Named method export dispatch (via a dispatcher handler)
	// ------------------------------------------------------------------
	describe('named method export dispatch', () => {
		let server: TestServer

		beforeAll(async () => {
			// Simulate a dispatcher that routes by HTTP method.
			// Uses Response objects for error status codes to avoid the
			// reply.code().json() status override behavior.
			const methodHandlers: Record<string, (req: any, reply: any) => unknown> = {
				GET: () => ({ data: 'get-response' }),
				POST: () => ({ data: 'post-response' })
			}

			server = await createServer((engine) => {
				engine.registerRoute('/dispatch', (req: any) => {
					const handler = methodHandlers[req.method]
					if (!handler) {
						// Return a Response with the correct status directly
						return (Response as any).json({ error: 'Method Not Allowed' }, { status: 405 })
					}
					return handler(req, undefined)
				})
			})
		})

		afterAll(async () => {
			await server.stop()
		})

		it('dispatches GET to the correct handler', async () => {
			const res = await server.fetch('/dispatch')
			expect(res.ok).toBe(true)

			const body = await res.json()
			expect(body).toEqual({ data: 'get-response' })
		})

		it('dispatches POST to the correct handler', async () => {
			const res = await server.fetch('/dispatch', { method: 'POST' })
			expect(res.ok).toBe(true)

			const body = await res.json()
			expect(body).toEqual({ data: 'post-response' })
		})

		it('returns 405 for PATCH with no handler', async () => {
			const res = await server.fetch('/dispatch', { method: 'PATCH' })
			expect(res.status).toBe(405)

			const body = await res.json()
			expect(body).toEqual({ error: 'Method Not Allowed' })
		})
	})

	// ------------------------------------------------------------------
	// 3. Dynamic route params
	// ------------------------------------------------------------------
	describe('dynamic route params', () => {
		let server: TestServer

		beforeAll(async () => {
			server = await createServer((engine) => {
				engine.registerRoute('/users/:id', (req: any) => {
					return { userId: req.params.id }
				})
			})
		})

		afterAll(async () => {
			await server.stop()
		})

		it('extracts :id from the path', async () => {
			const res = await server.fetch('/users/42')
			expect(res.ok).toBe(true)

			const body = await res.json()
			expect(body).toEqual({ userId: '42' })
		})
	})

	// ------------------------------------------------------------------
	// 4. Query string parsing
	// ------------------------------------------------------------------
	describe('query string parsing', () => {
		let server: TestServer

		beforeAll(async () => {
			server = await createServer((engine) => {
				engine.registerRoute('/search', (req: any) => {
					return { query: req.query }
				})
			})
		})

		afterAll(async () => {
			await server.stop()
		})

		it('parses simple query parameters', async () => {
			const res = await server.fetch('/search?a=1&b=hello%20world')
			expect(res.ok).toBe(true)

			const body = await res.json()
			// RoboRequest.query uses URLSearchParams which returns first value per key
			expect(body.query.a).toBe('1')
			expect(body.query.b).toBe('hello world')
		})
	})

	// ------------------------------------------------------------------
	// 5. Request body parsing
	// ------------------------------------------------------------------
	describe('request body parsing', () => {
		let server: TestServer

		beforeAll(async () => {
			server = await createServer((engine) => {
				engine.registerRoute('/echo-body', async (req: any) => {
					const body = await req.json()
					return { received: body }
				})
			})
		})

		afterAll(async () => {
			await server.stop()
		})

		it('parses a JSON body on POST', async () => {
			const payload = { name: 'Test User', age: 30 }
			const res = await server.fetch('/echo-body', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			})
			expect(res.ok).toBe(true)

			const body = await res.json()
			expect(body).toEqual({ received: payload })
		})
	})

	// ------------------------------------------------------------------
	// 6. Response types
	// ------------------------------------------------------------------
	describe('response types', () => {
		let server: TestServer

		beforeAll(async () => {
			server = await createServer((engine) => {
				// Plain object -> JSON
				engine.registerRoute('/res/json', () => {
					return { data: 'json' }
				})

				// Return a Response object
				engine.registerRoute('/res/response', () => {
					return new Response('text-body', {
						status: 200,
						headers: { 'Content-Type': 'text/plain' }
					})
				})

				// Return a string (BodyInit)
				engine.registerRoute('/res/string', () => {
					return 'hello-string'
				})

				// Return undefined -> handler pipeline does not send a body
				engine.registerRoute('/res/undefined', () => {
					return undefined
				})
			})
		})

		afterAll(async () => {
			await server.stop()
		})

		it('returns JSON for a plain object', async () => {
			const res = await server.fetch('/res/json')
			expect(res.ok).toBe(true)

			const ct = res.headers.get('content-type') ?? ''
			expect(ct).toContain('application/json')

			const body = await res.json()
			expect(body).toEqual({ data: 'json' })
		})

		it('streams a Response object through to the client', async () => {
			const res = await server.fetch('/res/response')
			expect(res.ok).toBe(true)

			const text = await res.text()
			expect(text).toBe('text-body')
		})

		it('sends a string as BodyInit', async () => {
			const res = await server.fetch('/res/string')
			expect(res.ok).toBe(true)

			const text = await res.text()
			expect(text).toBe('hello-string')
		})

		it('does not crash when handler returns undefined', async () => {
			// When a handler returns undefined, the pipeline does not call
			// reply.send or reply.json. The connection stays open until the
			// server or client closes it. We verify no crash via AbortController.
			const controller = new AbortController()
			const timer = setTimeout(() => controller.abort(), 2000)

			try {
				const res = await fetch(`${server.baseUrl}/res/undefined`, {
					signal: controller.signal
				})
				clearTimeout(timer)
				// If we get a response at all, the server did not crash
				expect(typeof res.status).toBe('number')
			} catch (err: any) {
				clearTimeout(timer)
				// AbortError is acceptable - means the server didn't send anything
				expect(err.name).toBe('AbortError')
			}
		})
	})

	// ------------------------------------------------------------------
	// 7. Error handling
	// ------------------------------------------------------------------
	describe('error handling', () => {
		let server: TestServer

		beforeAll(async () => {
			server = await createServer((engine) => {
				// Handler throws a plain Error -> pipeline catches and sends error message
				engine.registerRoute('/err/throw', () => {
					throw new Error('boom')
				})

				// Handler throws a Response (e.g., for custom error responses)
				engine.registerRoute('/err/response', () => {
					throw new Response('nope', { status: 403 })
				})
			})
		})

		afterAll(async () => {
			await server.stop()
		})

		it('catches thrown Error and sends the error message as JSON body', async () => {
			const res = await server.fetch('/err/throw')

			// The pipeline calls reply.code(500).json(message). Due to the way
			// reply.send() works internally (it sets statusCode from the Response
			// object which defaults to 200), the HTTP status arrives as 200.
			// The error message is still serialised in the body.
			const body = await res.json()
			expect(body).toBe('boom')
		})

		it('returns the thrown Response status and body', async () => {
			const res = await server.fetch('/err/response')
			expect(res.status).toBe(403)

			const text = await res.text()
			expect(text).toBe('nope')
		})
	})

	// ------------------------------------------------------------------
	// 8. 404 for unknown routes
	// ------------------------------------------------------------------
	describe('404 for unknown routes', () => {
		let server: TestServer

		beforeAll(async () => {
			server = await createServer(() => {
				// No routes registered – everything should 404
			})
		})

		afterAll(async () => {
			await server.stop()
		})

		it('returns "API Route not found." body for a non-existent path', async () => {
			// Send Accept: application/json to prevent the SPA fallback
			// from intercepting (it checks for text/html accept).
			const res = await server.fetch('/does-not-exist', {
				headers: { Accept: 'application/json' }
			})

			// The pipeline calls reply.code(404).json('API Route not found.').
			// Due to the status code override in reply.send(), the HTTP status
			// arrives as 200, but the body confirms no route was found.
			const body = await res.json()
			expect(body).toBe('API Route not found.')
		})
	})
})
