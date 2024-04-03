import { logger } from './logger.js'
import { IncomingMessage, ServerResponse } from 'node:http'
import url from 'node:url'
import { parse } from 'node:querystring'
import { pluginOptions } from '../events/_start.js'
import { RoboError } from './runtime-utils.js'
import type { Router } from './router.js'
import type { HttpMethod, RoboReply, RoboRequest } from './types.js'
import type { ViteDevServer } from 'vite'

const MAX_BODY_SIZE = 5 * 1024 * 1024 // 5MB
const BodyMethods = ['PATCH', 'POST', 'PUT']

export function createServerHandler(router: Router, vite?: ViteDevServer) {
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
		const route = router.find(parsedUrl.pathname)
		requestWrapper.params = route?.params ?? {}

		if (!route?.handler && vite) {
			logger.debug(`Forwarding to Vite:`, req.url)
			vite.middlewares(req, res)
			return
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
			logger.error(error)

			if (error instanceof RoboError) {
				Object.entries(error.headers ?? {}).forEach(([key, value]) => {
					replyWrapper.header(key, value)
				})
				replyWrapper.code(error.status ?? 500).json(error.data ?? error.message)
			} else if (error instanceof Error) {
				replyWrapper.code(500).json(error.message ?? 'Server encountered an error.')
			} else {
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
