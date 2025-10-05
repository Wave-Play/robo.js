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
import type { NotFoundHandler, RoboReply } from './types.js'
import type { UrlWithParsedQuery } from 'node:url'
import type { ViteDevServer } from 'vite'

const PublicPath = path.join(process.cwd(), 'public')
const PublicBuildPath = path.join(process.cwd(), '.robo', 'public')

export type ServerHandler = (req: IncomingMessage, res: ServerResponse<IncomingMessage>) => Promise<void> | void

export function createServerHandler(router: Router, vite?: ViteDevServer, onNotFound?: NotFoundHandler): ServerHandler {
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

				// Copy headers from the response to the raw response, taking care to merge set-cookie headers
				const h = response.headers
				const setCookies: string[] | undefined = typeof h.getSetCookie === 'function' ? h.getSetCookie() : undefined

				if (setCookies && setCookies.length) {
					appendHeader(this.raw, 'Set-Cookie', setCookies)
				}

				response.headers.forEach((value, key) => {
					if (key.toLowerCase() === 'set-cookie') {
						return
					}
					appendHeader(this.raw, key, value)
				})
				this.raw.statusCode = response.status

				// Stream the response body
				if (response.body !== null) {
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
				} else {
					this.raw.end()
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
			logger.debug(`No route found for ${req.method} ${req.url}, checking public folder...`)
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
			if (onNotFound && !res.writableEnded && !res.headersSent) {
				try {
					logger.debug('Running custom 404 handler for', req.url)
					const result = await onNotFound(requestWrapper, replyWrapper)

					if (result === false) {
						// Continue with Robo's built-in fallbacks
					} else {
						if (replyWrapper.hasSent || res.writableEnded || res.headersSent) {
							return
						}

						if (result instanceof Response) {
							replyWrapper.send(result)
							return
						}
						if (result && isBodyInit(result)) {
							replyWrapper.code(200).send(result)
							return
						}
						if (typeof result !== 'undefined') {
							replyWrapper.code(200).json(result)
							return
						}

						// Handler handled the response (likely via raw), so stop here.
						return
					}
				} catch (error) {
					if (error instanceof Response) {
						replyWrapper.send(error)
						return
					}
					logger.error(error)
					replyWrapper.code(500).send('Server encountered an error.')
					return
				}
			} else {
				logger.warn(`No route nor 404 handler found for ${req.method} ${req.url}`)
			}

			if (res.writableEnded || res.headersSent) {
				return
			}

			if (await tryServeSpaFallback(req, res, parsedUrl.pathname)) {
				return
			}

			if (res.writableEnded || res.headersSent) {
				return
			}

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
 * Streams the SPA entry point when a request looks like a client-routed URL.
 * Only kicks in for GET HTML requests outside the API namespace so real API
 * calls or static assets still flow through their normal handlers.
 */
async function tryServeSpaFallback(
	req: IncomingMessage,
	res: ServerResponse<IncomingMessage>,
	pathname: string | null | undefined
): Promise<boolean> {
	if (req.method && req.method !== 'GET') {
		return false
	}
	if (pathname && path.extname(pathname)) {
		return false
	}
	if (!acceptsHtml(req)) {
		return false
	}
	if (isApiPath(pathname)) {
		return false
	}

	const publicPath = process.env.NODE_ENV === 'production' ? PublicBuildPath : PublicPath
	const indexFilePath = path.join(publicPath, 'index.html')

	try {
		const stats = await stat(indexFilePath)
		if (!stats.isFile()) {
			return false
		}
	} catch {
		return false
	}

	res.setHeader('Content-Type', 'text/html; charset=utf-8')
	res.setHeader('X-Content-Type-Options', 'nosniff')
	res.writeHead(200)
	await pipeline(createReadStream(indexFilePath), res)
	return true
}

function acceptsHtml(req: IncomingMessage): boolean {
	const accept = req.headers?.accept
	return !accept || accept.includes('text/html')
}

function isApiPath(pathname: string | null | undefined): boolean {
	if (!pathname) return false
	const prefix = pluginOptions.prefix
	if (prefix === false || prefix === null) {
		return false
	}
	if (!prefix || prefix === '/') {
		return false
	}
	return pathname.startsWith(prefix)
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

function appendHeader(res: ServerResponse, name: string, value: string | string[]) {
	const lower = name.toLowerCase()
	if (lower === 'set-cookie') {
		const prev = res.getHeader('set-cookie')
		const prevArr = Array.isArray(prev) ? (prev as string[]) : prev ? [String(prev)] : []
		const nextArr = Array.isArray(value) ? value : [value]
		res.setHeader('Set-Cookie', [...prevArr, ...nextArr])
	} else {
		// For non-mergeable headers, last write wins (that’s fine)
		res.setHeader(name, value as any)
	}
}
