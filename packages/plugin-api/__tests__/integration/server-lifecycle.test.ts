import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals'

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

describe('NodeEngine server lifecycle (integration)', () => {
	let NodeEngine: new () => any

	beforeAll(async () => {
		const mod = await import('../../src/engines/node.js')
		NodeEngine = mod.NodeEngine
	})

	// ------------------------------------------------------------------
	// 1. Init -> Start -> Responds -> Stop
	// ------------------------------------------------------------------
	it('starts, responds to a registered route, and stops cleanly', async () => {
		const engine = new NodeEngine()
		await engine.init({})

		const port = randomPort()

		// Register a simple health endpoint
		engine.registerRoute('/health', () => {
			return { status: 'ok' }
		})

		await engine.start({ hostname: '127.0.0.1', port })
		engine.getHttpServer()?.unref()

		// Verify the server actually responds
		const res = await fetch(`http://127.0.0.1:${port}/health`)
		expect(res.ok).toBe(true)

		const body = await res.json()
		expect(body).toEqual({ status: 'ok' })

		// Stop and verify
		await engine.stop()
		expect(engine.isRunning()).toBe(false)
	})

	// ------------------------------------------------------------------
	// 2. isRunning() state transitions
	// ------------------------------------------------------------------
	it('transitions isRunning through false -> false -> true -> false', async () => {
		const engine = new NodeEngine()

		// Before init
		expect(engine.isRunning()).toBe(false)

		await engine.init({})

		// After init, before start
		expect(engine.isRunning()).toBe(false)

		const port = randomPort()
		await engine.start({ hostname: '127.0.0.1', port })
		engine.getHttpServer()?.unref()

		// After start
		expect(engine.isRunning()).toBe(true)

		await engine.stop()

		// After stop
		expect(engine.isRunning()).toBe(false)
	})

	// ------------------------------------------------------------------
	// 3. Restart cycle
	// ------------------------------------------------------------------
	it('can stop and start again on a new port', async () => {
		const engine = new NodeEngine()
		await engine.init({})

		const port1 = randomPort()
		await engine.start({ hostname: '127.0.0.1', port: port1 })
		engine.getHttpServer()?.unref()

		engine.registerRoute('/ping', () => ({ pong: true }))

		const res1 = await fetch(`http://127.0.0.1:${port1}/ping`)
		expect(res1.ok).toBe(true)

		await engine.stop()
		expect(engine.isRunning()).toBe(false)

		// Re-init and start on a different port
		await engine.init({})
		const port2 = randomPort()
		await engine.start({ hostname: '127.0.0.1', port: port2 })
		engine.getHttpServer()?.unref()

		engine.registerRoute('/ping', () => ({ pong: 'again' }))

		const res2 = await fetch(`http://127.0.0.1:${port2}/ping`)
		expect(res2.ok).toBe(true)

		const body2 = await res2.json()
		expect(body2).toEqual({ pong: 'again' })

		await engine.stop()
	})

	// ------------------------------------------------------------------
	// 4. Double-start idempotency
	// ------------------------------------------------------------------
	it('resolves without error when start is called twice', async () => {
		const engine = new NodeEngine()
		await engine.init({})

		const port = randomPort()
		await engine.start({ hostname: '127.0.0.1', port })
		engine.getHttpServer()?.unref()

		// Second start should resolve without throwing
		await expect(engine.start({ hostname: '127.0.0.1', port: port + 1 })).resolves.toBeUndefined()

		await engine.stop()
	})

	// ------------------------------------------------------------------
	// 5. Double-stop idempotency
	// ------------------------------------------------------------------
	it('resolves without error when stop is called twice', async () => {
		const engine = new NodeEngine()
		await engine.init({})

		const port = randomPort()
		await engine.start({ hostname: '127.0.0.1', port })
		engine.getHttpServer()?.unref()

		await expect(engine.stop()).resolves.toBeUndefined()
		await expect(engine.stop()).resolves.toBeUndefined()
	})
})
