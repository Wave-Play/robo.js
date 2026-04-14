import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals'
import { WebSocketServer } from 'ws'
import WebSocket from 'ws'

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

/**
 * Connect a WebSocket and collect the first message sent by the server
 * (if any arrives within the connection window). This avoids a race
 * between the `open` event and an immediate server-side `send()`.
 */
function connectAndCapture(url: string): Promise<{ ws: WebSocket; firstMessage: string | null }> {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(url)
		let firstMessage: string | null = null
		let opened = false

		ws.on('message', (data) => {
			if (!firstMessage) {
				firstMessage = data.toString()
				// If already open, resolve immediately
				if (opened) {
					resolve({ ws, firstMessage })
				}
			}
		})

		ws.on('open', () => {
			opened = true
			// If we already captured a message, resolve
			if (firstMessage !== null) {
				resolve({ ws, firstMessage })
			} else {
				// Give a brief window for the server to send the initial message
				setTimeout(() => resolve({ ws, firstMessage }), 100)
			}
		})

		ws.on('error', (err) => reject(err))
	})
}

/** Helper: wait for the next message on a WebSocket. */
function nextMessage(ws: WebSocket): Promise<string> {
	return new Promise((resolve, reject) => {
		ws.once('message', (data) => resolve(data.toString()))
		ws.once('error', (err) => reject(err))
	})
}

/**
 * All WebSocket tests use a single engine + server.
 * This avoids port-collision and teardown-ordering issues.
 */
describe('WebSocket integration (real connections)', () => {
	let engine: any
	let port: number
	let wss: WebSocketServer

	beforeAll(async () => {
		const engineMod = await import('../../src/engines/node.js')
		const NodeEngine = engineMod.NodeEngine

		engine = new NodeEngine()
		await engine.init({})
		port = 20_000 + Math.floor(Math.random() * 10_000)

		wss = new WebSocketServer({ noServer: true })

		// Register a handler at /ws that sends "connected" on upgrade
		engine.registerWebsocket('/ws', (req: any, socket: any, head: any) => {
			wss.handleUpgrade(req, socket, head, (ws: any) => {
				ws.send('connected')
			})
		})

		// Register a handler at /echo that echoes messages back
		engine.registerWebsocket('/echo', (req: any, socket: any, head: any) => {
			wss.handleUpgrade(req, socket, head, (ws: any) => {
				ws.on('message', (data: any) => {
					ws.send(`echo: ${data}`)
				})
			})
		})

		// Register a default handler for any unmatched path
		engine.registerWebsocket('default', (req: any, socket: any, head: any) => {
			wss.handleUpgrade(req, socket, head, (ws: any) => {
				ws.send('default-handler')
			})
		})

		await engine.start({ hostname: '127.0.0.1', port })
		engine.getHttpServer()?.unref()
	})

	afterAll(async () => {
		// Close all WebSocket server connections before stopping engine
		for (const client of wss.clients) {
			client.terminate()
		}
		wss.close()
		await engine.stop()
	})

	// ------------------------------------------------------------------
	// 1. WebSocket upgrade at a registered path
	// ------------------------------------------------------------------
	it('connects to /ws and receives initial message', async () => {
		const { ws, firstMessage } = await connectAndCapture(`ws://127.0.0.1:${port}/ws`)
		expect(firstMessage).toBe('connected')
		ws.close()
	})

	// ------------------------------------------------------------------
	// 2. Default handler catches unregistered paths
	// ------------------------------------------------------------------
	it('falls through to default handler for unregistered path', async () => {
		const { ws, firstMessage } = await connectAndCapture(`ws://127.0.0.1:${port}/unregistered`)
		expect(firstMessage).toBe('default-handler')
		ws.close()
	})

	// ------------------------------------------------------------------
	// 3. Echo round-trip
	// ------------------------------------------------------------------
	it('sends a message to /echo and receives echo response', async () => {
		const { ws } = await connectAndCapture(`ws://127.0.0.1:${port}/echo`)
		const msgPromise = nextMessage(ws)
		ws.send('hello')

		const response = await msgPromise
		expect(response).toBe('echo: hello')
		ws.close()
	})

	// ------------------------------------------------------------------
	// 4. Multiple sequential messages
	// ------------------------------------------------------------------
	it('handles multiple sequential messages on /echo', async () => {
		const { ws } = await connectAndCapture(`ws://127.0.0.1:${port}/echo`)

		const msg1 = nextMessage(ws)
		ws.send('first')
		expect(await msg1).toBe('echo: first')

		const msg2 = nextMessage(ws)
		ws.send('second')
		expect(await msg2).toBe('echo: second')

		ws.close()
	})
})
