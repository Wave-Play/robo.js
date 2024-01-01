import { env } from '../core/env.js'
import { logger } from '../core/logger.js'
import { hasProperties, packageJson } from '../cli/utils/utils.js'
import { createOAuth, pollOAuth, verifyOAuth } from './oauth.js'

export const RoboPlay = {
	OAuth: {
		create: createOAuth,
		poll: pollOAuth,
		verify: verifyOAuth
	},
	status: () =>
		request('/status', {
			backoff: false,
			silent: true
		})
			.then(() => true)
			.catch(() => false)
}

interface RequestOptions {
	backoff?: boolean
	body?: unknown
	headers?: Record<string, string>
	method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'
	query?: Record<string, unknown>
	retries?: number
	silent?: boolean
}

/**
 * Calls a RoboPlay API endpoint.
 */
export async function request<T = unknown>(urlPath: string, options?: RequestOptions): Promise<T> {
	const { backoff = true, body, headers, method = 'GET', query, retries = 3, silent } = options ?? {}
	let retryCount = 0

	let queryString = ''
	if (query) {
		const normalizedQuery: Record<string, string> = {}
		Object.entries(query).forEach(([key, value]) => {
			if (value !== undefined) {
				normalizedQuery[key] = String(value)
			}
		})
		queryString = '?' + new URLSearchParams(normalizedQuery).toString()
	}

	while (retryCount <= retries) {
		try {
			const extraHeaders: Record<string, string> = {
				'X-Robo-Version': packageJson.version
			}
			let requestBody
			if (body instanceof FormData) {
				requestBody = body as BodyInit
			} else if (body) {
				requestBody = JSON.stringify(body)
				extraHeaders['Content-Type'] = 'application/json'
			}
			const response = await fetch(env.roboplay.api + urlPath + queryString, {
				method: method,
				headers: {
					...extraHeaders,
					...(headers ?? {})
				},
				body: requestBody
			})

			const jsonResponse = await response.json()
			if (jsonResponse.error) {
				throw new Error(jsonResponse.error)
			}

			if (!response.ok) {
				throw new Error(`HTTP Error status code: ${response.status}`)
			}

			return jsonResponse
		} catch (error) {
			// Throw error if we've reached the max number of retries
			if (retryCount === retries) {
				if (!silent) {
					logger.error(error)
				}

				throw error
			}

			// Wait for 2^retryCount * 1000 ms (exponential backoff)
			const delay = backoff ? 2 ** retryCount * 1000 : 1000
			const message = hasProperties<{ message: string }>(error, ['message']) ? error.message + ' - ' : ''
			logger.debug(error)
			if (!silent) {
				logger.warn(`${message}Retrying in ${delay}ms...`)
			}
			await new Promise((r) => setTimeout(r, delay))

			retryCount++
		}
	}

	throw new Error('Failed to call RoboPlay API')
}
