import { createServerHandler } from '~/core/handler.js'
import { logger } from '~/core/logger.js'
import { Router } from '~/core/router.js'
import { BaseEngine } from 'src/engines/base.js'
import http from 'node:http'
import { color, composeColors } from '@roboplay/robo.js'
import type { RouteHandler } from '~/core/types'
import type { StartOptions } from 'src/engines/base.js'

export class NodeEngine extends BaseEngine {
	private _isRunning = false
	private _router: Router | null = null
	private _server: http.Server | null = null

	public async init(): Promise<void> {
		this._router = new Router()
		this._server = http.createServer(createServerHandler(this._router))

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
				logger.ready(`🚀 Server is live at ${composeColors(color.bold, color.underline)(`http://localhost:${port}`)}`)
				resolve()
			})
		})
	}

	public async stop(): Promise<void> {
		return new Promise((resolve) => {
			if (!this._server) {
				logger.warn(`Server isn't running. Nothing to stop here.`)
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
	}
}
