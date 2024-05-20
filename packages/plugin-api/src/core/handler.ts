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
				this.raw.setHeader('Content-Type', 'application/json')
				this.raw.end(JSON.stringify(data))
				this.hasSent = true
				return this
			},
			send: function (data: Response | string) {
				if (data instanceof Response) {
					if (data.status >= 400) {
						logger.error(data)
					}

					data.headers.forEach(([key, value]) => {
						this.raw.setHeader(key, value)
					})
					this.raw.statusCode = data.status
					data.text().then((text) => {
						this.raw.end(text)
					})
				} else {
					this.raw.end(data)
				}
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
