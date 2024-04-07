import { createServerHandler } from '../core/handler.js'
import { logger } from '../core/logger.js'
import { Router } from '../core/router.js'
import { BaseEngine } from '../engines/base.js'
import http from 'node:http'
import { color, composeColors } from 'robo.js'
import type { RouteHandler } from '../core/types.js'
import type { InitOptions, StartOptions } from '../engines/base.js'
import type { ViteDevServer } from 'vite'

export class NodeEngine extends BaseEngine {
	private _isRunning = false
	private _router: Router | null = null
	private _server: http.Server | null = null
	private _vite: ViteDevServer | null = null

	public async init(options: InitOptions): Promise<void> {
		this._router = new Router()
		this._server = http.createServer(createServerHandler(this._router, options?.vite))
		this._vite = options.vite

		this._server.on('error', (error: Error) => logger.error(`Server error:`, error))
	}

	public isRunning(): boolean {
		return this._isRunning
	}

	public registerRoute(path: string, handler: RouteHandler): void {
		this._router.addRoute({ handler, path })
	}

	public async start(options: StartOptions): Promise<void> {
		const { port } = options

		return new Promise((resolve) => {
			if (this._isRunning) {
				logger.warn('Server is already up and running. No action taken.')
				resolve()
				return
			}

			// Start server
			this._isRunning = true
			this._server.listen(port, () => {
				logger.ready(`Server is live at ${composeColors(color.bold, color.blue)(`http://localhost:${port}`)}`)
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
