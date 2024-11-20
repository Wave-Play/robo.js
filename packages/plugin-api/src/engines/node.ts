import { ServerHandler, createServerHandler } from '../core/handler.js'
import { logger } from '../core/logger.js'
import { Router } from '../core/router.js'
import { BaseEngine } from '../engines/base.js'
import http from 'node:http'
import { color, composeColors } from 'robo.js'
import type { RouteHandler, WebSocketHandler } from '../core/types.js'
import type { InitOptions, StartOptions } from '../engines/base.js'
import type { ViteDevServer } from 'vite'

export class NodeEngine extends BaseEngine {
	private _isRunning = false
	private _router: Router | null = null
	private _server: http.Server | null = null
	private _vite: ViteDevServer | null = null
	private _websocketHandlers: Record<string, WebSocketHandler> = {}
	protected _serverHandler: ServerHandler | null = null

	public async init(options: InitOptions): Promise<void> {
		this._router = new Router()
		this._serverHandler = createServerHandler(this._router, options?.vite)
		this._server = http.createServer((req, res) => this._serverHandler?.(req, res))

		this._server.on('error', (error: Error) => logger.error(`Server error:`, error))
		this._server.on('upgrade', (req, socket, head) => {
			const handler = this._websocketHandlers[req.url ?? '']

			if (handler) {
				handler(req, socket, head)
				return
			}

			const defaultHandler = this._websocketHandlers['default']
			if (defaultHandler) {
				defaultHandler(req, socket, head)
			} else {
				logger.warn(`No WebSocket handler found for`, req.url)
			}
		})
	}

	public getHttpServer() {
		return this._server
	}

	public isRunning(): boolean {
		return this._isRunning
	}

	public registerRoute(path: string, handler: RouteHandler) {
		this._router.addRoute({ handler, path })
	}

	public registerWebsocket(path: string, handler: WebSocketHandler) {
		this._websocketHandlers[path] = handler
	}

	public setupVite(vite: ViteDevServer) {
		this._vite = vite
		this._serverHandler = createServerHandler(this._router, vite)
	}

	public async start(options: StartOptions): Promise<void> {
		const { hostname = 'localhost', port } = options

		return new Promise((resolve) => {
			if (this._isRunning) {
				logger.warn('Server is already up and running. No action taken.')
				resolve()
				return
			}

			// Start server
			this._isRunning = true
			this._server.listen(port, hostname, () => {
				logger.ready(`Server is live at ${composeColors(color.bold, color.blue)(`http://${hostname}:${port}`)}`)
				resolve()
			})
		})
	}

	public async stop(): Promise<void> {
		const serverPromise = new Promise<void>((resolve) => {
			if (!this._server) {
				logger.debug(`Server isn't running. Nothing to stop here.`)
				resolve()
				return
			}

			this._server.close((err) => {
				if (err) {
					logger.error(`Error stopping the server: ${err}`)
					return
				}

				this._isRunning = false
				logger.debug('Server has been stopped successfully.')
				resolve()
			})
		})
		const vitePromise = this._vite?.close()

		await Promise.allSettled([serverPromise, vitePromise])
	}
}
