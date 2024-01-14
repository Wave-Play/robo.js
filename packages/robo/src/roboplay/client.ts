import { env } from '../core/env.js'
import { logger } from '../core/logger.js'
import { getRoboPackageJson, hasProperties, packageJson } from '../cli/utils/utils.js'
import { createOAuth, pollOAuth, verifyOAuth } from './oauth.js'
import { createDeployment, updateDeployment, uploadBundle } from './deploy.js'
import { getRoboStatus, listPods, listRobos, startPod, stopPod } from './robos.js'

export const RoboPlay = {
	Deploy: {
		create: createDeployment,
		update: updateDeployment,
		upload: uploadBundle
	},
	OAuth: {
		create: createOAuth,
		poll: pollOAuth,
		verify: verifyOAuth
	},
	Pod: {
		list: listPods,
		start: startPod,
		stop: stopPod
	},
	Robo: {
		list: listRobos,
		status: getRoboStatus
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

	// Pass down Robo metadata with every request
	const roboPackageJson = await getRoboPackageJson()
	const extraHeaders: Record<string, string> = {
		'X-Robo-Project-Description': roboPackageJson.description ?? '',
		'X-Robo-Project-Name': roboPackageJson.name ?? '',
		'X-Robo-Project-Version': roboPackageJson.version ?? '',
		'X-Robo-Version': packageJson.version
	}

	// Prepare request body by parsing FormData or JSON when applicable
	let requestBody

	if (body instanceof FormData) {
		requestBody = body as BodyInit
	} else if (body) {
		requestBody = JSON.stringify(body)
		extraHeaders['Content-Type'] = 'application/json'
	}

	while (retryCount <= retries) {
		try {
			const response = await fetch(env.roboplay.api + urlPath + queryString, {
				method: method,
				headers: {
					...extraHeaders,
					...(headers ?? {})
				},
				body: requestBody
			})

			const jsonResponse = await response.json()
			if (response.status >= 500) {
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
