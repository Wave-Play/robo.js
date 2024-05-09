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
import { parse } from 'node:querystring'
import { color } from 'robo.js'
import type { Router } from './router.js'
import type { HttpMethod, RoboReply, RoboRequest } from './types.js'
import type { UrlWithParsedQuery } from 'node:url'
import type { ViteDevServer } from 'vite'

const MAX_BODY_SIZE = 5 * 1024 * 1024 // 5MB
const BodyMethods = ['PATCH', 'POST', 'PUT']
const PublicPath = path.join(process.cwd(), 'public')
const PublicBuildPath = path.join(process.cwd(), '.robo', 'public')

export type ServerHandler = (req: IncomingMessage, res: ServerResponse<IncomingMessage>) => Promise<void> | void

export function createServerHandler(router: Router, vite?: ViteDevServer): ServerHandler {
	const { parseBody = true } = pluginOptions

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

		// Parse request body if applicable
		let body: Record<string, unknown>

		if (parseBody && BodyMethods.includes(req.method)) {
			try {
				body = await getRequestBody(req)
			} catch (err) {
				logger.error(`Error in parsing request body: ${err}`)
				res.statusCode = 400
				res.end('Invalid request body.')
				return
			}
		}

		// Prepare request and reply wrappers for easier usage
		const requestWrapper: RoboRequest = {
			req,
			body: body,
			method: req.method as HttpMethod,
			query: {},
			params: {} // to be filled by the route handler
		}

		// Parse query string if applicable
		const queryIndex = req.url?.indexOf('?') ?? -1
		if (queryIndex !== -1) {
			requestWrapper.query = parse(req.url.substring(queryIndex + 1))
		}

		const replyWrapper: RoboReply = {
			res,
			hasSent: false,
			code: function (statusCode: number) {
				this.res.statusCode = statusCode
				return this
			},
			json: function (data: unknown) {
				this.res.setHeader('Content-Type', 'application/json')
				this.res.end(JSON.stringify(data))
				this.hasSent = true
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

		// Find matching route and execute handler
		logger.debug(color.bold(req.method), req.url)
		const route = router.find(parsedUrl.pathname)
		requestWrapper.params = route?.params ?? {}

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
				if (error instanceof RoboResponse) {
					if (error?.status >= 400) {
						logger.error(error)
					}

					Object.entries(error.headers ?? {}).forEach(([key, value]) => {
						replyWrapper.header(key, value)
					})
					replyWrapper.code(error.status ?? 500).json(error.data ?? error.message)
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

			if (!replyWrapper.hasSent && result) {
				replyWrapper.code(200).json(result)
			}
		} catch (error) {
			if (error instanceof RoboResponse) {
				if (error?.status >= 400) {
					logger.error(error)
				}

				Object.entries(error.headers ?? {}).forEach(([key, value]) => {
					replyWrapper.header(key, value)
				})
				replyWrapper.code(error.status ?? 500).json(error.data ?? error.message)
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

export async function getRequestBody(req: IncomingMessage): Promise<Record<string, unknown>> {
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
			// It's okay to have empty body <3
			if (!body) {
				resolve({})
				return
			}

			try {
				const parsedBody = JSON.parse(body)
				resolve(parsedBody)
			} catch (err) {
				reject(new Error('Invalid JSON data'))
			}
		})
	})
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
		throw new RoboResponse({
			status: 403,
			message: 'Access Denied'
		})
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
