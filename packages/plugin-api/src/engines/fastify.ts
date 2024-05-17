import { handlePublicFile } from '~/core/handler.js'
import { logger } from '../core/logger.js'
import { RoboRequest, applyParams } from '~/core/robo-request.js'
import { BaseEngine } from './base.js'
import { createReadStream } from 'node:fs'
import url from 'node:url'
import { color, composeColors } from 'robo.js'
import type { RoboReply, RouteHandler } from '../core/types.js'
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

		this._server.removeAllContentTypeParsers()
		this._server.addContentTypeParser('*', (_req, payload, done) => {
			const chunks: Buffer[] = []
			payload.on('data', (chunk) => {
				chunks.push(chunk)
			})
			payload.on('end', () => {
				done(null, Buffer.concat(chunks))
			})
		})

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
					if (error instanceof Response) {
						reply.send(error)
						return
					} else if (error instanceof Error) {
						logger.error(error)
						reply.code(500).send(error.message ?? 'Server encountered an error.')
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
		this._server.route({
			method: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
			url: path,
			handler: async (request, reply) => {
				// Prepare request and reply wrappers for easier usage
				const requestWrapper = await RoboRequest.from(request.raw, { body: request.body as Buffer })
				applyParams(requestWrapper, request.params as Record<string, string>)
				const replyWrapper: RoboReply = {
					raw: reply.raw,
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
					send: function (data: Response | string) {
						if (data instanceof Response) {
							reply.hijack()

							if (data.status >= 400) {
								logger.error(data)
							}

							data.headers.forEach(([key, value]) => {
								reply.header(key, value)
							})

							this.raw.statusCode = data.status
							data.text().then((text) => {
								reply.raw.end(text)
							})
						} else {
							reply.send(data)
						}
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

					if (!replyWrapper.hasSent && result instanceof Response) {
						replyWrapper.send(result)
					} else if (!replyWrapper.hasSent && result) {
						replyWrapper.code(200).json(result)
					}
				} catch (error) {
					if (error instanceof Response) {
						replyWrapper.send(error)
					} else if (error instanceof Error) {
						logger.error(error)
						replyWrapper.code(500).json({
							ok: false,
							errors: Array.isArray(error) ? error.map((e) => e.message) : [error.message]
						})
					} else {
						logger.error(error)
						replyWrapper.code(500).json({
							ok: false,
							errors: ['Server encountered an error.']
						})
					}
				}
			}
		})
	}

	public registerWebsocket(): void {
		logger.warn(`Websockets are not supported in Fastify engine yet.`)
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
