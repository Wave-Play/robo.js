import { RoboRequest, applyParams } from './robo-request.js'
import { RoboResponse } from './robo-response.js'
import { logger } from './logger.js'
import { pluginOptions } from '../robo/prepare.js'
import { mimeDb } from './mime.js'
import { getPluginRouteRegistry } from './plugin-routes.js'
import { createReadStream } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import url from 'node:url'
import { color, Mode } from 'robo.js'
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
			const corsConfig =
				typeof pluginOptions.cors === 'object' ? pluginOptions.cors : { origins: '*' as const }

			const requestOrigin = req.headers.origin
			const allowedOrigins = corsConfig.origins ?? '*'

			// Set Access-Control-Allow-Origin header
			if (allowedOrigins === '*' && !corsConfig.credentials) {
				// Wildcard only allowed without credentials
				res.setHeader('Access-Control-Allow-Origin', '*')
			} else if (requestOrigin) {
				// For credentials or specific origins, echo back the request origin if allowed
				const originsArray = allowedOrigins === '*' ? [requestOrigin] : allowedOrigins
				if (originsArray.includes(requestOrigin)) {
					res.setHeader('Access-Control-Allow-Origin', requestOrigin)
					res.setHeader('Vary', 'Origin')
				}
			}

			// Set credentials header if enabled
			if (corsConfig.credentials) {
				res.setHeader('Access-Control-Allow-Credentials', 'true')
			}

			res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS')
			res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')

			// Preflight request. Reply successfully:
			if (req.method === 'OPTIONS') {
				res.writeHead(204)
				res.end()
				return
			}
		}

		// Find matching route and execute handler
		logger.debug(color.bold(req.method), req.url)

		// Check for plugin API prefix (needed for static asset handling and Vite bypass)
		// Note: Route lookup now happens on the original path because:
		// - Exclusive plugins: routes are registered WITH the prefix
		// - Additive plugins: routes are registered BOTH with and without prefix
		const registry = getPluginRouteRegistry()
		const apiMatch = registry.matchApiPrefix(parsedUrl.pathname ?? '')
		const activePluginPrefix: string | null = apiMatch?.prefix ?? null

		if (activePluginPrefix) {
			logger.debug(`Plugin prefix detected: ${activePluginPrefix}`)
		}

		const route = router.find(parsedUrl.pathname ?? '/')

		// If no route found and we have a plugin prefix, check plugin static assets FIRST
		// This must happen before Vite middleware to avoid Vite serving index.html for prefixed paths
		if (!route?.handler && activePluginPrefix) {
			const staticMatch = registry.matchStaticPrefix(parsedUrl.pathname ?? '')
			if (staticMatch) {
				const strippedPath = registry.stripPrefix(parsedUrl.pathname ?? '', staticMatch.prefix)
				const pluginPublicDir = registry.getPublicDir(staticMatch.plugin)

				if (pluginPublicDir) {
					const fileCallback = async (filePath: string, mimeType: string) => {
						res.setHeader('Content-Type', mimeType)
						res.setHeader('X-Content-Type-Options', 'nosniff')
						// Prevent caching in development for hot reload
						if (Mode.isDev()) {
							res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
						}
						res.writeHead(200)
						await pipeline(createReadStream(filePath), res)
					}

					try {
						const result = await handlePluginStaticFile(strippedPath, pluginPublicDir, req.url ?? '', fileCallback)
						if (result.type === 'served') {
							return
						} else if (result.type === 'redirect') {
							res.writeHead(301, { Location: result.location })
							res.end()
							return
						}
					} catch (error) {
						if (error instanceof Response) {
							res.statusCode = error.status
							res.end(error.statusText)
							return
						}
						logger.error('Plugin static file error:', error)
					}
				}
			}
		}

		// If Vite is available and no plugin prefix matched, forward to Vite
		if (!route?.handler && vite && !activePluginPrefix) {
			logger.debug(`Forwarding to Vite:`, req.url)
			vite.middlewares(req, res)
			return
		}

		// Prepare request and reply wrappers for easier usage
		const requestWrapper = await RoboRequest.from(req, { skipBody: !route })

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
				const setCookies: string[] | undefined = typeof (h as any).getSetCookie === 'function' ? (h as any).getSetCookie() : undefined

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

		if (route) {
			applyParams(requestWrapper, route.params)
		}

		// If route missing, check plugin static assets first, then project's public folder
		if (!route?.handler) {
			logger.debug(`No route found for ${req.method} ${req.url}, checking static assets...`)

			const fileCallback = async (filePath: string, mimeType: string) => {
				res.setHeader('Content-Type', mimeType)
				res.setHeader('X-Content-Type-Options', 'nosniff')
				// Prevent caching in development for hot reload
				if (Mode.isDev()) {
					res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
				}
				res.writeHead(200)
				await pipeline(createReadStream(filePath), res)
			}

			// Check for plugin static assets (if path matches a plugin's static prefix)
			try {
				const staticMatch = registry.matchStaticPrefix(parsedUrl.pathname ?? '')
				if (staticMatch) {
					const strippedPath = registry.stripPrefix(parsedUrl.pathname ?? '', staticMatch.prefix)
					const pluginPublicDir = registry.getPublicDir(staticMatch.plugin)

					if (pluginPublicDir) {
						const result = await handlePluginStaticFile(strippedPath, pluginPublicDir, req.url ?? '', fileCallback)
						if (result.type === 'served') {
							return
						} else if (result.type === 'redirect') {
							res.writeHead(301, { Location: result.location })
							res.end()
							return
						}
					}
				}
			} catch (error) {
				if (error instanceof Response) {
					replyWrapper.send(error)
					return
				} else {
					logger.error(error)
				}
			}

			// Check project's public folder
			try {
				if (await handlePublicFile(parsedUrl, fileCallback)) {
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

			// Try plugin SPA fallback first (if path matches a plugin's static prefix)
			const staticMatch = registry.matchStaticPrefix(parsedUrl.pathname ?? '')
			if (staticMatch) {
				const strippedPath = registry.stripPrefix(parsedUrl.pathname ?? '', staticMatch.prefix)
				const pluginPublicDir = registry.getPublicDir(staticMatch.plugin)

				if (pluginPublicDir) {
					if (await tryServePluginSpaFallback(req, res, strippedPath, staticMatch.plugin, pluginPublicDir)) {
						return
					}
				}
			}

			if (res.writableEnded || res.headersSent) {
				return
			}

			// Try project's SPA fallback
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
 * Result from handlePluginStaticFile indicating what action was taken.
 */
export type StaticFileResult =
	| { type: 'served' }
	| { type: 'redirect'; location: string }
	| { type: 'not_found' }

/**
 * Serve static files from a plugin's public directory.
 * Similar to handlePublicFile but operates on a specific plugin's public dir.
 *
 * @param pathname - The stripped pathname (without plugin prefix)
 * @param pluginPublicDir - Path to the plugin's public directory
 * @param originalUrl - The original request URL (for redirect calculation)
 * @param callback - Function to call when serving a file
 * @returns Result indicating what action was taken
 */
export async function handlePluginStaticFile(
	pathname: string,
	pluginPublicDir: string,
	originalUrl: string,
	callback: (filePath: string, mimeType: string) => void | Promise<void>
): Promise<StaticFileResult> {
	// Decode and resolve the file path
	const decodedPath = decodeURI(pathname)
	const filePath = path.join(pluginPublicDir, decodedPath)

	// Check if the requested path is within the plugin's public folder to guard against directory traversal
	if (!filePath.startsWith(pluginPublicDir)) {
		logger.warn(`Requested path is outside the plugin public folder. Denying access...`)
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
			logger.debug(`Serving plugin static file: ${filePath}`)
			const ext = path.extname(filePath).slice(1)
			const mimeType = mimeDb[ext] ?? 'application/octet-stream'
			await callback(filePath, mimeType)
			return { type: 'served' }
		} else if (stats.isDirectory()) {
			// If URL path doesn't end with /, redirect to add trailing slash
			// This ensures relative URLs in the served HTML resolve correctly
			// Parse URL to handle query strings correctly (don't append / after ?token=xxx)
			const urlParts = originalUrl.split('?')
			const urlPath = urlParts[0]
			const queryString = urlParts.length > 1 ? '?' + urlParts.slice(1).join('?') : ''

			if (!urlPath.endsWith('/')) {
				const redirectUrl = urlPath + '/' + queryString
				logger.debug(`Redirecting to add trailing slash: ${redirectUrl}`)
				return { type: 'redirect', location: redirectUrl }
			}

			// Look for an index file in the directory
			const files = await readdir(filePath)
			const indexExtensions = ['html', 'htm', 'js', 'json']
			const indexFile = files.find((file) => {
				const extension = path.extname(file).slice(1)
				return indexExtensions.includes(extension) && file.startsWith('index.')
			})

			if (indexFile) {
				const indexFilePath = path.join(filePath, indexFile)
				const ext = path.extname(indexFilePath).slice(1)
				const mimeType = mimeDb[ext] ?? 'application/octet-stream'
				logger.debug('Serving plugin index file:', indexFilePath)
				await callback(indexFilePath, mimeType)
				return { type: 'served' }
			}
		}
	} catch (error) {
		// Ignore ENOENT errors (file not found)
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
			throw error
		}
	}

	return { type: 'not_found' }
}

/**
 * Serve plugin SPA fallback (index.html) for client-side routing.
 * Returns true if handled, false otherwise.
 */
async function tryServePluginSpaFallback(
	req: IncomingMessage,
	res: ServerResponse<IncomingMessage>,
	pathname: string | null | undefined,
	pluginName: string,
	pluginPublicDir: string
): Promise<boolean> {
	if (req.method && req.method !== 'GET') {
		return false
	}
	// Skip if path has a file extension (static file request)
	if (pathname && path.extname(pathname)) {
		return false
	}
	if (!acceptsHtml(req)) {
		return false
	}

	const indexFilePath = path.join(pluginPublicDir, 'index.html')

	try {
		const stats = await stat(indexFilePath)
		if (!stats.isFile()) {
			return false
		}
	} catch {
		return false
	}

	logger.debug(`Serving plugin SPA fallback for ${pluginName}: ${indexFilePath}`)
	res.setHeader('Content-Type', 'text/html; charset=utf-8')
	res.setHeader('X-Content-Type-Options', 'nosniff')
	res.writeHead(200)
	await pipeline(createReadStream(indexFilePath), res)
	return true
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
		// For non-mergeable headers, last write wins (that's fine)
		// ServerResponse.setHeader accepts string | number | string[] | readonly string[]
		res.setHeader(name, value as unknown as string | number | string[] | readonly string[])
	}
}
