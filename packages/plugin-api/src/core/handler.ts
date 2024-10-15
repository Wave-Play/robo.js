import { RoboRequest, applyParams } from './robo-request.js'
import { RoboResponse } from './robo-response.js'
import { logger } from './logger.js'
import { pluginOptions } from '../events/_start.js'
import { mimeDb } from './mime.js'
import { createReadStream } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import url from 'node:url'
import { color } from 'robo.js'
import type { Router } from './router.js'
import type { RoboReply } from './types.js'
import type { UrlWithParsedQuery } from 'node:url'
import type { ViteDevServer } from 'vite'

const PublicPath = path.join(process.cwd(), 'public')
const PublicBuildPath = path.join(process.cwd(), '.robo', 'public')

export type ServerHandler = (req: IncomingMessage, res: ServerResponse<IncomingMessage>) => Promise<void> | void

export function createServerHandler(router: Router, vite?: ViteDevServer): ServerHandler {
	return async (req: IncomingMessage, res: ServerResponse<IncomingMessage>) => {
		const parsedUrl = url.parse(req.url, true)

		if (pluginOptions.cors) {
			// CORS Headers (to allow any origin, any method, and any header)
			res.setHeader('Access-Control-Allow-Origin', '*')
			res.setHeader('Access-Control-Allow-Methods', '*')
			res.setHeader('Access-Control-Allow-Headers', '*')

			// Preflight request. Reply successfully:
			if (req.method === 'OPTIONS') {
				res.writeHead(200)
				res.end()
				return
			}
		}

		// Prepare request and reply wrappers for easier usage
		const requestWrapper = await RoboRequest.from(req)

		const replyWrapper: RoboReply = {
			raw: res,
			hasSent: false,
			code: function (statusCode: number) {
				this.raw.statusCode = statusCode
				return this
			},
			json: function (data: unknown) {
				return this.send(RoboResponse.json(data))
			},
			send: function (data: BodyInit | Response) {
				const response = data instanceof Response ? data : new Response(data)

				// Log errors if status code is 4xx or 5xx
				if (response.status >= 400) {
					logger.error(data)
				}

				// Copy headers from the response to the raw response
				response.headers.forEach((value, key) => {
					this.raw.setHeader(key, value)
				})
				this.raw.statusCode = response.status

				// Stream the response body
				const reader = response.body.getReader()
				const read = async () => {
					while (true) {
						const { done, value } = await reader.read()

						if (done) {
							break
						} else {
							this.raw.write(value)
						}
					}
				}

				read().then(() => {
					this.raw.end()
				})

				this.hasSent = true
				return this
			},
			header: function (name: string, value: string) {
				this.raw.setHeader(name, value)
				return this
			}
		}

		// Find matching route and execute handler
		logger.debug(color.bold(req.method), req.url)
		const route = router.find(parsedUrl.pathname)
		if (route) {
			applyParams(requestWrapper, route.params)
		}

		// If Vite is available, forward the request to Vite
		if (!route?.handler && vite) {
			logger.debug(`Forwarding to Vite:`, req.url)
			vite.middlewares(req, res)
			return
		}

		// If route missing, check if we can return something from the public folder
		if (!route?.handler) {
			try {
				const callback = async (filePath: string, mimeType: string) => {
					res.setHeader('Content-Type', mimeType)
					res.setHeader('X-Content-Type-Options', 'nosniff')
					res.writeHead(200)
					await pipeline(createReadStream(filePath), res)
				}

				if (await handlePublicFile(parsedUrl, callback)) {
					return
				}
			} catch (error) {
				if (error instanceof Response) {
					replyWrapper.send(error)
				} else {
					logger.error(error)
				}
			}
		}

		if (!route?.handler) {
			replyWrapper.code(404).json('API Route not found.')
			return
		}

		try {
			const result = await route.handler(requestWrapper, replyWrapper)

			// Don't do anything if the handler has already sent a response
			if (replyWrapper.hasSent) {
				return
			}

			// Send the result
			if (result instanceof Response) {
				replyWrapper.send(result)
			} else if (result && isBodyInit(result)) {
				replyWrapper.code(200).send(result)
			} else if (result) {
				replyWrapper.code(200).json(result)
			}
		} catch (error) {
			if (error instanceof Response) {
				replyWrapper.send(error)
			} else if (error instanceof Error) {
				logger.error(error)
				replyWrapper.code(500).json(error.message ?? 'Server encountered an error.')
			} else {
				logger.error(error)
				replyWrapper.code(500).send('Server encountered an error.')
			}
		}
	}
}

export async function handlePublicFile(
	parsedUrl: UrlWithParsedQuery,
	callback: (filePath: string, mimeType: string) => void | Promise<void>
) {
	// Determine which public folder to use (production or development)
	const publicPath = process.env.NODE_ENV === 'production' ? PublicBuildPath : PublicPath
	const filePath = decodeURI(path.join(publicPath, parsedUrl.pathname))

	// Check if the requested path is within the public folder to guard against directory traversal
	if (!filePath.startsWith(publicPath)) {
		logger.warn(`Requested path is outside the public folder. Denying access...`)
		throw RoboResponse.json(
			{
				message: 'Access Denied'
			},
			{
				status: 403
			}
		)
	}

	// See if the file exists
	try {
		const stats = await stat(filePath)

		if (stats.isFile()) {
			logger.debug(`Serving public file: ${filePath}`)
			const ext = path.extname(filePath).slice(1)
			const mimeType = mimeDb[ext] ?? 'application/octet-stream'
			await callback(filePath, mimeType)
			return true
		} else if (stats.isDirectory()) {
			// Look for an index file in the directory
			const files = await readdir(filePath)
			const indexExtensions = ['html', 'htm', 'php', 'js', 'json']
			const indexFile = files.find((file) => {
				const extension = path.extname(file).slice(1)
				return indexExtensions.includes(extension) && file.startsWith('index.')
			})

			if (indexFile) {
				const indexFilePath = path.join(filePath, indexFile)
				const ext = path.extname(indexFilePath).slice(1)
				const mimeType = mimeDb[ext] ?? 'application/octet-stream'
				logger.debug('Serving public index file:', indexFilePath)
				await callback(indexFilePath, mimeType)
				return true
			}
		}
	} catch (error) {
		// Ignore ENOENT errors (file not found)
		if (error.code !== 'ENOENT') {
			throw error
		}
	}

	return false
}

/**
 * Checks if a value is a valid BodyInit type.
 */
function isBodyInit(value: unknown): value is BodyInit {
	return (
		typeof value === 'string' ||
		value instanceof Blob ||
		value instanceof FormData ||
		value instanceof URLSearchParams ||
		value instanceof ArrayBuffer ||
		ArrayBuffer.isView(value) ||
		(typeof ReadableStream !== 'undefined' && value instanceof ReadableStream)
	)
}
