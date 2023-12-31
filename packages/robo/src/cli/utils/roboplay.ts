import { env } from '../../core/env.js'
import { logger } from '../../core/logger.js'
import { hasProperties } from './utils.js'

export const RoboPlay = {
	OAuth: {
		create: createOAuth,
		poll: pollOAuth,
		verify: verifyOAuth
	}
}

interface RequestOptions {
	backoff?: boolean
	body?: unknown
	headers?: Record<string, string>
	method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'
	query?: Record<string, unknown>
	retries?: number
}

/**
 * Calls a RoboPlay API endpoint.
 */
async function request<T = unknown>(urlPath: string, options?: RequestOptions): Promise<T> {
	const { backoff = true, body, headers, method = 'GET', query, retries = 3 } = options ?? {}
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
			const extraHeaders: Record<string, string> = {}
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
				logger.error(error)
				throw error
			}

			// Wait for 2^retryCount * 1000 ms (exponential backoff)
			const delay = backoff ? 2 ** retryCount * 1000 : 1000
			const message = hasProperties<{ message: string }>(error, ['message']) ? error.message + ' - ' : ''
			logger.debug(error)
			logger.warn(`${message}Retrying in ${delay}ms...`)
			await new Promise((r) => setTimeout(r, delay))

			retryCount++
		}
	}

	throw new Error('Failed to call RoboPlay API')
}

type OAuthSessionStatus = 'Authorized' | 'Created' | 'Expired' | 'Invalid' | 'Paired' | 'Used'

interface OAuthSession {
	pairingCode: string
	secret: string
	status: OAuthSessionStatus
	token: string
}

async function createOAuth() {
	return request<OAuthSession>('/oauth', {
		method: 'POST'
	})
}

interface PollOAuthOptions {
	token: string
}

interface PollOAuthResult {
	error?: string
	status: OAuthSessionStatus
	success: boolean
}

async function pollOAuth(options: PollOAuthOptions) {
	const { token } = options

	return request<PollOAuthResult>(`/oauth/${token}/poll`)
}

interface VerifyOAuthOptions {
	pairingCode: string
	secret?: string
	token: string
}

interface VerifyOAuthResult {
	error?: string
	status: OAuthSessionStatus
	success: boolean
	user?: User | null
	userToken?: string | null
}

async function verifyOAuth(options: VerifyOAuthOptions) {
	const { pairingCode, secret, token } = options

	return request<VerifyOAuthResult>(`/oauth/${token}/verify`, {
		method: 'PUT',
		body: { pairingCode, secret }
	})
}

interface User {
	id: string
	avatar?: string
	displayName: string
	email: string
}
