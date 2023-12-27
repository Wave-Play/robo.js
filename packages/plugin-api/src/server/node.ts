import { createServerHandler } from '~/core/handler.js'
import { logger } from '~/core/logger.js'
import { Router } from '~/core/router.js'
import { pluginOptions } from '~/events/_start.js'
import { BaseServer, StartOptions } from '~/server/base.js'
import http from 'node:http'
import { color, composeColors, portal } from '@roboplay/robo.js'

const PATH_REGEX = new RegExp(/\[(.+?)\]/g)

export class NodeServer extends BaseServer {
	private _isRunning = false
	private _router: Router | null = null
	private _server: http.Server | null = null

	public isRunning(): boolean {
		return this._isRunning
	}

	public async start(options: StartOptions): Promise<void> {
		const { port } = options

		return new Promise((resolve) => {
			if (this._server) {
				logger.warn('Server is already up and running. No action taken.')
				resolve()
				return
			}

			// Add loaded API modules onto new router instance
			this._router = new Router()
			const prefix = pluginOptions.prefix ?? ''

			portal.apis.forEach((api) => {
				const key = api.key.replace(PATH_REGEX, ':$1')

				this._router.addRoute({
					handler: api.handler.default,
					path: prefix + '/' + key
				})
			})
			const { routes } = this._router.stats()
			const routePaths = routes.map((route) => route.path)
			logger.debug(`Registered routes:`, routePaths)

			// Create server instance
			this._server = http.createServer(createServerHandler(this._router))

			// Handle server errors
			this._server.on('error', (error: Error) => logger.error(`Server error:`, error))

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
				this._router = null
				this._server = null
				logger.debug('Server has been stopped successfully.')
				resolve()
			})
		})
	}
}
