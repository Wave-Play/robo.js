import { logger } from '../core/logger.js'
import { BaseEngine } from './base.js'
import { color, composeColors } from '@roboplay/robo.js'
import type { HttpMethod, RoboReply, RoboRequest, RouteHandler } from '../core/types.js'
import type { StartOptions } from './base.js'
import type { FastifyInstance } from 'fastify'

export class FastifyEngine extends BaseEngine {
	private _isRunning = false
	private _server: FastifyInstance | null = null

	public async init(): Promise<void> {
		const { fastify } = await import('fastify')
		this._server = fastify()

		this._server.setErrorHandler((error, _request, reply) => {
			logger.error(error)
			reply.status(500).send({ ok: false })
		})
	}

	public isRunning(): boolean {
		return this._isRunning
	}

	public registerRoute(path: string, handler: RouteHandler): void {
		this._server.all(path, async (request, reply) => {
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
				const result = await handler(requestWrapper, replyWrapper)
				if (!replyWrapper.hasSent && result) {
					replyWrapper.code(200).send(JSON.stringify(result))
				}
			} catch (error) {
				logger.error(error)
				reply.status(500).send({
					ok: false,
					errors: Array.isArray(error) ? error.map((e) => e.message) : [error.message]
				})
			}
		})
	}

	public async start(options: StartOptions): Promise<void> {
		const { port } = options

		return new Promise((resolve) => {
			const run = async () => {
				if (this._isRunning) {
					logger.warn('Fastify server is already up and running. No action taken.')
					resolve()
					return
				}

				// Start server
				this._isRunning = true
				this._server.listen({ port }, () => {
					logger.ready(
						`🚀 Fastify server is live at ${composeColors(color.bold, color.underline)(`http://localhost:${port}`)}`
					)
					resolve()
				})
			}
			run()
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
					logger.debug('Fastify server has been stopped successfully.')
					resolve()
				})
				.catch((err) => {
					logger.error(`Error stopping the Fastify server: ${err}`)
				})
		})
	}
}
