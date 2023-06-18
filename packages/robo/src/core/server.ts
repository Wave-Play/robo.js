import http, { IncomingMessage } from 'node:http'
import url from 'node:url'
import { parse } from 'node:querystring'
import { Router } from './router.js'
import { logger } from './logger.js'
import { portal } from './robo.js'
import { color, composeColors } from './color.js'
import type { HttpMethod, RoboReply, RoboRequest } from '../types/index.js'

const MAX_BODY_SIZE = 5 * 1024 * 1024 // 5MB

let _isRunning = false
let _router: Router | null = null
let _server: http.Server | null = null

const Server = {
	isRunning: () => _isRunning,

	start: (port = 3000): Promise<void> => {
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
			_server = http.createServer(async (req, res) => {
				const parsedUrl = url.parse(req.url, true)
				let body
				if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
					try {
						body = await getRequestBody(req)
					} catch (err) {
						logger.error(`Error in parsing request body: ${err}`)
						res.statusCode = 400
						res.end('Invalid request body.')
						return
					}
				}
				const reqWrapper: RoboRequest = {
					req,
					body: body,
					method: req.method as HttpMethod,
					query: parse(req.url || ''),
					params: {} // to be filled by the route handler
				}

				const reply: RoboReply = {
					res,
					hasSent: false,
					code: function (statusCode: number) {
						this.res.statusCode = statusCode
						return this
					},
					send: function (data: string) {
						this.res.end(data)
						this.hasSent = true
						return this
					},
					header: function (name: string, value: string) {
						this.res.setHeader(name, value)
						return this
					}
				}

				const route = _router.find(parsedUrl.pathname)

				if (!route?.handler) {
					reply.code(404).send('API Route not found.')
					return
				}

				try {
					const result = await route.handler(reqWrapper, reply)
					if (!reply.hasSent && result) {
						reply.code(200).send(result.toString())
					}
				} catch (error) {
					logger.error(`API Route error: ${error}`)
					res.statusCode = 500
					res.end('Server encountered an error.')
				}
			})

			_server.on('error', (error: Error) => logger.error(`Server error: ${error}`))

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

async function getRequestBody(req: IncomingMessage): Promise<unknown> {
	return new Promise((resolve, reject) => {
		let body = ''
		let size = 0
		req.on('data', (chunk) => {
			size += chunk.length
			if (size > MAX_BODY_SIZE) {
				reject(new Error('Request body is too large'))
				return
			}
			body += chunk
		})
		req.on('end', () => {
			try {
				let parsedBody
				try {
					parsedBody = JSON.parse(body)
				} catch (err) {
					reject(new Error('Invalid JSON data'))
					return
				}
				resolve(parsedBody)
			} catch (err) {
				reject(err)
			}
		})
	})
}
