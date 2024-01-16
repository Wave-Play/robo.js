import { logger } from './logger.js'
import { IncomingMessage, ServerResponse } from 'node:http'
import url from 'node:url'
import { parse } from 'node:querystring'
import { pluginOptions } from '../events/_start.js'
import type { Router } from './router.js'
import type { HttpMethod, RoboReply, RoboRequest } from './types.js'
import { RoboError } from './runtime-utils.js'

const MAX_BODY_SIZE = 5 * 1024 * 1024 // 5MB

export function createServerHandler(router: Router) {
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
		if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
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

		if (!route?.handler) {
			replyWrapper.code(404).send('API Route not found.')
			return
		}

		try {
			const result = await route.handler(requestWrapper, replyWrapper)
			if (!replyWrapper.hasSent && result) {
				replyWrapper.code(200).send(JSON.stringify(result))
			}
		} catch (error) {
			if (error instanceof RoboError) {
				logger.error(`API Route error: ${error}`)
				res.statusCode = error.status
				res.end(error.message)
			} else {
				logger.error(`API Route error: ${error}`)
				res.statusCode = 500
				res.end('Server encountered an error.')
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
			try {
				let parsedBody
				try {
					parsedBody = JSON.parse(body)
					resolve(parsedBody)
				} catch (err) {
					reject(new Error('Invalid JSON data'))
				}
			} catch (err) {
				reject(err)
			}
		})
	})
}
