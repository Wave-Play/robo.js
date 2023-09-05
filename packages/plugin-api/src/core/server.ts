import http from 'node:http'
import { Router } from './router.js'
import { color, composeColors, logger, portal } from '@roboplay/robo.js'
import { createServerHandler } from './handler.js'

let _isRunning = false
let _router: Router | null = null
let _server: http.Server | null = null

const Server = {
	isRunning: () => _isRunning,

	start: (port: number): Promise<void> => {
		return new Promise((resolve) => {
			if (_server) {
				logger.warn('Server is already up and running. No action taken.')
				resolve()
				return
			}

			// Add loaded API modules onto new router instance
			_router = new Router()
			portal.apis.forEach((api) => {
				_router.addRoute({
					handler: api.handler.default,
					path: '/api/' + api.key
				})
			})

			// Create server instance
			_server = http.createServer(createServerHandler(_router))

			// Handle server errors
			_server.on('error', (error: Error) => logger.error(`Server error: ${error}`))

			// Start server
			_isRunning = true
			_server.listen(port, () => {
				logger.ready(`🚀 Server is live at ${composeColors(color.bold, color.underline)(`http://localhost:${port}`)}`)
				resolve()
			})
		})
	},

	stop: (): Promise<void> => {
		return new Promise((resolve) => {
			if (!_server) {
				logger.warn(`Server isn't running. Nothing to stop here.`)
				resolve()
				return
			}

			_server.close((err) => {
				if (err) {
					logger.error(`Error stopping the server: ${err}`)
					return
				}

				_isRunning = false
				_router = null
				_server = null
				logger.debug('Server has been stopped successfully.')
				resolve()
			})
		})
	}
}
export default Server
