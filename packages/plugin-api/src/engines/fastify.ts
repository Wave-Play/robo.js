import { handlePublicFile } from '~/core/handler.js'
import { logger } from '../core/logger.js'
import { BaseEngine } from './base.js'
import { RoboResponse } from '~/core/robo-response.js'
import { createReadStream } from 'node:fs'
import url from 'node:url'
import { color, composeColors } from 'robo.js'
import type { HttpMethod, RoboReply, RoboRequest, RouteHandler } from '../core/types.js'
import type { InitOptions, StartOptions } from './base.js'
import type { FastifyInstance } from 'fastify'
import type { ViteDevServer } from 'vite'

export class FastifyEngine extends BaseEngine {
	private _isRunning = false
	private _server: FastifyInstance | null = null
	private _vite: ViteDevServer | null = null

	public async init(options: InitOptions): Promise<void> {
		const { fastify } = await import('fastify')
		this._server = fastify()
		this._vite = options.vite

		this._server.setErrorHandler((error, _request, reply) => {
			logger.error(error)
			reply.status(500).send({ ok: false })
		})

		this._server.setNotFoundHandler((request, reply) => {
			logger.debug(color.bold(request.method), request.raw.url)

			if (this._vite) {
				logger.debug(`Forwarding to Vite:`, request.url)
				this._vite.middlewares(request.raw, reply.raw)
				return
			}

			const run = async () => {
				try {
					const callback = async (filePath: string, mimeType: string) => {
						await reply
							.header('Content-Type', mimeType)
							.header('X-Content-Type-Options', 'nosniff')
							.type(mimeType)
							.send(createReadStream(filePath))
					}

					const parsedUrl = url.parse(request.url, true)
					if (await handlePublicFile(parsedUrl, callback)) {
						return
					}
				} catch (error) {
					if (error instanceof RoboResponse) {
						if (error?.status >= 400) {
							logger.error(error)
						}

						Object.entries(error.headers ?? {}).forEach(([key, value]) => {
							reply.header(key, value)
						})
						reply.code(error.status ?? 500).send(error.data ?? error.message)
						return
					} else {
						logger.error(error)
					}
				}

				reply
					.status(404)
					.send({ message: `Route ${request.method}:${request.url} not found`, error: 'Not Found', statusCode: 404 })
			}
			run()
		})
	}

	public getHttpServer() {
		return this._server?.server
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
				json: function (data: unknown) {
					reply.header('Content-Type', 'application/json').send(JSON.stringify(data))
					this.hasSent = true
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
				logger.debug(color.bold(request.method), request.raw.url)
				const result = await handler(requestWrapper, replyWrapper)

				if (!replyWrapper.hasSent && result) {
					replyWrapper.code(200).json(result)
				}
			} catch (error) {
				logger.error(error)
				replyWrapper.code(500).json({
					ok: false,
					errors: Array.isArray(error) ? error.map((e) => e.message) : [error.message]
				})
			}
		})
	}

	public setupVite(vite: ViteDevServer) {
		this._vite = vite
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
					logger.ready(`Fastify server is live at`, composeColors(color.bold, color.blue)(`http://localhost:${port}`))
					resolve()
				})
			}
			run()
		})
	}

	public async stop(): Promise<void> {
		const serverPromise = new Promise<void>((resolve) => {
			if (!this._server) {
				logger.debug(`Fastify server isn't running. Nothing to stop here.`)
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
		const vitePromise = this._vite?.close()

		await Promise.allSettled([serverPromise, vitePromise])
	}
}
