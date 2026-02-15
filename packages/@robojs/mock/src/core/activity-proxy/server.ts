// ============================================================================
// Activity Proxy Server
// Dedicated Node http server that simulates Discord's Activity proxy
// ============================================================================

import http from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import { mockLogger } from '../logger.js'
import { getProxyConfigStore, sanitizeSessionId } from './config-store.js'
import { resolveRoute, isRedirectResult } from './url-router.js'
import { proxyHttpRequest, sendProxyError } from './http-proxy.js'
import { proxyWebSocketUpgrade, closeWsProxy } from './ws-proxy.js'

// ============================================================================
// Constants
// ============================================================================

export const ACTIVITY_PROXY_PORT = 50002

// ============================================================================
// ActivityProxyServer
// ============================================================================

export interface ActivityProxyServerConfig {
	port?: number
	cspMode?: 'discord_strict' | 'relaxed'
}

export class ActivityProxyServer {
	private server: http.Server | null = null
	private port: number = ACTIVITY_PROXY_PORT
	private started = false

	/**
	 * Start the proxy server.
	 * Auto-increments port if the default is taken (up to 10 attempts).
	 * Returns the actual port the server is listening on.
	 */
	async start(port?: number): Promise<number> {
		if (this.started) {
			return this.port
		}

		const startPort = port ?? ACTIVITY_PROXY_PORT
		const server = http.createServer(this.handleRequest.bind(this))
		server.on('upgrade', this.handleUpgrade.bind(this))

		this.port = await startWithPortRetry(server, startPort)
		this.server = server
		this.started = true

		mockLogger.info(`Activity Proxy server listening on port ${this.port}`)
		return this.port
	}

	/**
	 * Stop the proxy server.
	 */
	async stop(): Promise<void> {
		if (!this.started || !this.server) {
			return
		}

		closeWsProxy()

		return new Promise<void>((resolve) => {
			this.server!.close(() => {
				mockLogger.info('Activity Proxy server stopped')
				this.server = null
				this.started = false
				resolve()
			})
		})
	}

	/**
	 * Get the proxy origin URL for a given session and application.
	 *
	 * Format: http://{sanitized_session}.{application_id}.discordsays.localhost:{port}
	 */
	getProxyOrigin(sessionId: string, applicationId: string): string {
		const sanitized = sanitizeSessionId(sessionId)
		return `http://${sanitized}.${applicationId}.discordsays.localhost:${this.port}`
	}

	/**
	 * Get the port the server is listening on.
	 */
	getPort(): number {
		return this.port
	}

	/**
	 * Whether the server is currently running.
	 */
	isStarted(): boolean {
		return this.started
	}

	// ========================================================================
	// HTTP Request Handler
	// ========================================================================

	private handleRequest(req: IncomingMessage, res: ServerResponse): void {
		const host = req.headers['host']
		if (!host) {
			sendProxyError(res, 400, 'Bad Request', 'Missing Host header')
			return
		}

		// Resolve session from hostname
		const configStore = getProxyConfigStore()
		mockLogger.debug(`[proxy] Incoming request: host=${host} path=${req.url} configs=${configStore.size()}`)
		const resolved = configStore.resolveFromHostname(host)

		if (!resolved) {
			sendProxyError(res, 404, 'Not Found', `No Activity session found for host: ${host}`)
			return
		}

		const { sessionId, config } = resolved

		// Parse URL path and query string
		const urlObj = new URL(req.url ?? '/', `http://${host}`)
		const requestPath = urlObj.pathname
		const queryString = urlObj.search

		// Route the request
		const routeResult = resolveRoute(requestPath, queryString, config)

		if (routeResult === null) {
			// 404: No matching route
			const availableRoutes = ['/.proxy/*']
			for (const mapping of config.url_mappings) {
				availableRoutes.push(`${mapping.prefix}/*`)
			}
			sendProxyError(
				res,
				404,
				'Not Found',
				`No route matched path: ${requestPath}. Available routes: ${availableRoutes.join(', ')}`
			)
			return
		}

		if (isRedirectResult(routeResult)) {
			// Redirect (e.g., / -> /.proxy/)
			res.writeHead(routeResult.statusCode, { Location: routeResult.location })
			res.end()
			return
		}

		// Build proxy origin for this session
		const proxyOrigin = this.getProxyOrigin(sessionId, config.application_id)

		// Proxy the request
		proxyHttpRequest({
			req,
			res,
			targetUrl: routeResult.targetUrl,
			sessionConfig: config,
			sessionId,
			rewriteHtml: routeResult.rewriteHtml,
			proxyOrigin,
			isProxyRoute: routeResult.isProxyRoute,
			mappingPrefix: routeResult.mapping?.prefix
		}).catch((err) => {
			mockLogger.debug(`Proxy request error: ${(err as Error).message}`)
			if (!res.headersSent) {
				sendProxyError(res, 502, 'Bad Gateway', (err as Error).message)
			}
		})
	}

	// ========================================================================
	// WebSocket Upgrade Handler
	// ========================================================================

	private handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
		const host = req.headers['host']
		if (!host) {
			socket.write('HTTP/1.1 400 Bad Request\r\n\r\n')
			socket.destroy()
			return
		}

		// Resolve session from hostname
		const configStore = getProxyConfigStore()
		const resolved = configStore.resolveFromHostname(host)

		if (!resolved) {
			socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
			socket.destroy()
			return
		}

		const { sessionId, config } = resolved

		// Parse URL path
		const urlObj = new URL(req.url ?? '/', `http://${host}`)
		const requestPath = urlObj.pathname
		const queryString = urlObj.search

		// Route the request (WS doesn't use query for routing, but pass it through)
		const routeResult = resolveRoute(requestPath, queryString, config)

		if (routeResult === null || isRedirectResult(routeResult)) {
			socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
			socket.destroy()
			return
		}

		// Convert HTTP target URL to WS
		const proxyOrigin = this.getProxyOrigin(sessionId, config.application_id)

		proxyWebSocketUpgrade({
			req,
			socket,
			head,
			targetUrl: routeResult.targetUrl,
			sessionId,
			proxyUrl: `${proxyOrigin}${req.url ?? '/'}`
		})
	}
}

// ============================================================================
// Port auto-increment helper
// ============================================================================

async function startWithPortRetry(
	server: http.Server,
	startPort: number,
	maxRetries: number = 10
): Promise<number> {
	for (let i = 0; i < maxRetries; i++) {
		const port = startPort + i
		try {
			await new Promise<void>((resolve, reject) => {
				server.once('error', reject)
				server.listen(port, () => {
					server.removeListener('error', reject)
					resolve()
				})
			})
			return port
		} catch (err: unknown) {
			const nodeErr = err as NodeJS.ErrnoException
			if (nodeErr.code !== 'EADDRINUSE' || i === maxRetries - 1) {
				throw err
			}
			mockLogger.debug(`Port ${port} in use, trying ${port + 1}...`)
		}
	}
	throw new Error(`Could not find available port starting from ${startPort}`)
}

// ============================================================================
// Singleton
// ============================================================================

let _activityProxyServer: ActivityProxyServer | null = null

export function getActivityProxyServer(): ActivityProxyServer {
	if (!_activityProxyServer) {
		_activityProxyServer = new ActivityProxyServer()
	}
	return _activityProxyServer
}

export function stopActivityProxyServer(): Promise<void> {
	if (_activityProxyServer) {
		const s = _activityProxyServer
		_activityProxyServer = null
		return s.stop()
	}
	return Promise.resolve()
}
