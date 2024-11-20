import { HttpMethod, RoboReply, RoboRequest } from '@roboplay/plugin-api'
import { BaseServer, StartOptions } from '@roboplay/plugin-api/.robo/build/server/base.js'
import { color, composeColors, logger, portal } from 'robo.js'
import fastify from 'fastify'
import type { FastifyInstance } from 'fastify'

export class FastifyServer extends BaseServer {
	private _isRunning = false
	private _server: FastifyInstance | null = null

	public isRunning(): boolean {
		return this._isRunning
	}

	public async start(options: StartOptions): Promise<void> {
		const { port } = options

		return new Promise((resolve) => {
			if (this._server) {
				logger.warn('Fastify server is already up and running. No action taken.')
				resolve()
				return
			}

			// Create server instance
			this._server = fastify()

			// TODO:
			portal.apis.forEach((api) => {
				const key = '/' + api.key.replace(/\[(.+?)\]/g, ':$1')

				this._server?.all(key, async (request, reply) => {
					// Prepare request and reply wrappers for easier usage
					const requestWrapper: RoboRequest = {
						req: request.raw,
						body: request.body as Record<string, unknown>,
						method: request.method as HttpMethod,
						query: request.query as Record<string, string>,
						params: request.params as Record<string, string>
					}

					const replyWrapper: RoboReply = {
						res: reply.raw,
						hasSent: false,
						code: function (statusCode: number) {
							reply.code(statusCode)
							return this
						},
						send: function (data: string) {
							reply.send(data)
							this.hasSent = true
							return this
						},
						header: function (name: string, value: string) {
							reply.header(name, value)
							return this
						}
					}

					try {
						const result = await api.handler.default(requestWrapper, replyWrapper)
						if (!replyWrapper.hasSent && result) {
							replyWrapper.code(200).send(JSON.stringify(result))
						}
					} catch (error) {
						logger.error(`API Route error: ${error}`)
						reply.status(500).send('Server encountered an error.')
					}
				})
			})

			// Handle server errors
			this._server.setErrorHandler((error, _request, reply) => {
				logger.error(error)
				reply.status(500).send({ ok: false })
			})

			// Start server
			this._isRunning = true
			this._server.listen({ port }, () => {
				logger.ready(
					`🚀 Fastify server is live at ${composeColors(color.bold, color.underline)(`http://localhost:${port}`)}`
				)
				resolve()
			})
		})
	}

	public async stop(): Promise<void> {
		return new Promise((resolve) => {
			if (!this._server) {
				logger.warn(`Fastify server isn't running. Nothing to stop here.`)
				resolve()
				return
			}

			this._server
				.close()
				.then(() => {
					this._isRunning = false
					this._server = null
					logger.debug('Fastify server has been stopped successfully.')
					resolve()
				})
				.catch((err) => {
					logger.error(`Error stopping the Fastify server: ${err}`)
				})
		})
	}
}
