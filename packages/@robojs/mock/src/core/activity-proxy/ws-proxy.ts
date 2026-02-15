// ============================================================================
// WebSocket Proxy
// Handles WebSocket upgrade requests for /.proxy/* and mapping prefix routes
// ============================================================================

import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import WebSocket, { WebSocketServer } from 'ws'
import { mockLogger } from '../logger.js'
import { emitProxyNetworkEntry, generateEntryId, recordProxyWsAction } from './observability.js'

// ============================================================================
// Types
// ============================================================================

export interface WsProxyOptions {
	/** Incoming upgrade request */
	req: IncomingMessage
	/** Incoming socket */
	socket: Duplex
	/** Incoming head buffer */
	head: Buffer
	/** Target upstream WebSocket URL */
	targetUrl: URL
	/** Session ID for observability */
	sessionId: string
	/** Proxy URL (as seen by browser) for observability */
	proxyUrl: string
}

// ============================================================================
// Shared WebSocketServer instance (noServer mode)
// ============================================================================

let _wss: WebSocketServer | null = null

function getWss(): WebSocketServer {
	if (!_wss) {
		_wss = new WebSocketServer({ noServer: true })
	}
	return _wss
}

/**
 * Clean up the shared WebSocketServer instance.
 */
export function closeWsProxy(): void {
	if (_wss) {
		_wss.close()
		_wss = null
	}
}

// ============================================================================
// WebSocket Proxy Function
// ============================================================================

/**
 * Proxy a WebSocket upgrade request to an upstream WebSocket server.
 *
 * Uses `ws` library on both sides:
 * - Client side: handleUpgrade() via shared noServer WSS
 * - Upstream side: new WebSocket() connection
 *
 * Critical for HMR: Vite's hot module replacement connects via WebSocket.
 * The proxy must correctly forward /.proxy/__vite_hmr to ws://launch_url/__vite_hmr.
 */
export function proxyWebSocketUpgrade(options: WsProxyOptions): void {
	const { req, socket, head, targetUrl, sessionId, proxyUrl } = options
	const connectEntryId = generateEntryId()
	const startTime = Date.now()

	// Convert http(s) URL to ws(s) URL for upstream connection
	const wsUrl = new URL(targetUrl.href)
	wsUrl.protocol = targetUrl.protocol === 'https:' ? 'wss:' : 'ws:'

	// Extract Sec-WebSocket-Protocol from incoming request
	const protocols = req.headers['sec-websocket-protocol']
		? req.headers['sec-websocket-protocol'].split(',').map((p) => p.trim())
		: undefined

	// Build upstream connection options
	const upstreamOptions: WebSocket.ClientOptions = {
		headers: {},
		// Allow self-signed certs for dev servers
		rejectUnauthorized: false
	}

	// Forward relevant headers to upstream
	if (req.headers['sec-websocket-protocol']) {
		upstreamOptions.headers!['Sec-WebSocket-Protocol'] = req.headers['sec-websocket-protocol']
	}
	if (req.headers['cookie']) {
		upstreamOptions.headers!['Cookie'] = req.headers['cookie']
	}

	// Step 1: Handle the incoming upgrade to get a client WebSocket
	const wss = getWss()

	wss.handleUpgrade(req, socket, head, (clientWs) => {
		mockLogger.debug(`WS proxy: client upgraded for ${proxyUrl}`)

		// Step 2: Connect to upstream WebSocket
		const upstreamWs = new WebSocket(wsUrl.href, protocols, upstreamOptions)

		upstreamWs.on('open', () => {
			mockLogger.debug(`WS proxy: upstream connected to ${wsUrl.href}`)

			// Emit connect observability entry
			emitProxyNetworkEntry(sessionId, {
				id: connectEntryId,
				timestamp: startTime,
				method: 'WS',
				proxyUrl,
				upstreamUrl: wsUrl.href,
				statusCode: 0,
				duration: Date.now() - startTime,
				type: 'ws_connect'
			})

			// Record WS connect in session recorder
			import('../../activity/index.js')
				.then(({ getActivityHostManager }) => {
					const record = getActivityHostManager().getRecord(sessionId)
					if (record) {
						recordProxyWsAction(sessionId, {
							instance_id: record.instance_id,
							event: 'connect',
							url: proxyUrl,
							upstream_url: wsUrl.href
						})
					}
				})
				.catch(() => {})

			// Step 3: Pipe messages bidirectionally
			clientWs.on('message', (data, isBinary) => {
				if (upstreamWs.readyState === WebSocket.OPEN) {
					upstreamWs.send(data, { binary: isBinary })
				}
			})

			upstreamWs.on('message', (data, isBinary) => {
				if (clientWs.readyState === WebSocket.OPEN) {
					clientWs.send(data, { binary: isBinary })
				}
			})
		})

		// Handle upstream errors
		upstreamWs.on('error', (err) => {
			mockLogger.debug(`WS proxy: upstream error: ${err.message}`)
			if (clientWs.readyState === WebSocket.OPEN) {
				clientWs.close(1011, 'Upstream WebSocket error')
			}
		})

		// Handle client errors
		clientWs.on('error', (err) => {
			mockLogger.debug(`WS proxy: client error: ${err.message}`)
			if (upstreamWs.readyState === WebSocket.OPEN) {
				upstreamWs.close(1011, 'Client WebSocket error')
			}
		})

		// Handle upstream close -> close client
		upstreamWs.on('close', (code, reason) => {
			const disconnectEntryId = generateEntryId()
			emitProxyNetworkEntry(sessionId, {
				id: disconnectEntryId,
				timestamp: Date.now(),
				method: 'WS',
				proxyUrl,
				upstreamUrl: wsUrl.href,
				statusCode: 0,
				duration: Date.now() - startTime,
				type: 'ws_disconnect'
			})

			// Record WS disconnect in session recorder
			import('../../activity/index.js')
				.then(({ getActivityHostManager }) => {
					const record = getActivityHostManager().getRecord(sessionId)
					if (record) {
						recordProxyWsAction(sessionId, {
							instance_id: record.instance_id,
							event: 'disconnect',
							url: proxyUrl,
							upstream_url: wsUrl.href,
							close_code: code
						})
					}
				})
				.catch(() => {})

			if (clientWs.readyState === WebSocket.OPEN) {
				clientWs.close(code, reason.toString())
			}
		})

		// Handle client close -> close upstream
		clientWs.on('close', (code, reason) => {
			if (upstreamWs.readyState === WebSocket.OPEN) {
				upstreamWs.close(code, reason.toString())
			}
		})

		// If upstream fails to connect, destroy the client connection
		upstreamWs.on('unexpected-response', (_req, _res) => {
			mockLogger.debug(`WS proxy: upstream returned unexpected response for ${wsUrl.href}`)
			if (clientWs.readyState === WebSocket.OPEN) {
				clientWs.close(1011, 'Upstream WebSocket returned unexpected response')
			}
		})
	})
}
