import { env } from '../core/env.js'
import { logger } from '../core/logger.js'
import { getRoboPackageJson, hasProperties, packageJson } from '../cli/utils/utils.js'
import { createOAuth, pollOAuth, verifyOAuth } from './oauth.js'
import { createDeployment, updateDeployment, uploadBundle } from './deploy.js'
import { getPodLogs, getPodStatus, getRoboStatus, listPods, listRobos, startPod, stopPod } from './robos.js'
import os from 'node:os'

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
		getLogs: getPodLogs,
		list: listPods,
		start: startPod,
		status: getPodStatus,
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
	raw?: boolean
	retries?: number
	silent?: boolean
}

/**
 * Calls a RoboPlay API endpoint.
 */
export async function request<T = unknown>(urlPath: string, options?: RequestOptions): Promise<T> {
	const { backoff = true, body, headers, method = 'GET', query, raw, retries = 3, silent } = options ?? {}
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
		'X-Robo-Project-Description': sanitizeForAscii(roboPackageJson.description ?? ''),
		'X-Robo-Project-Name': sanitizeForAscii(roboPackageJson.name ?? ''),
		'X-Robo-Project-Version': sanitizeForAscii(roboPackageJson.version ?? ''),
		'X-Robo-Version': packageJson.version
	}

	// Only include OS metadata if opted in to debug mode
	if (env('roboplay.debug')) {
		extraHeaders['X-Robo-OS-Arch'] = os.arch()
		extraHeaders['X-Robo-OS-Hostname'] = sanitizeForAscii(os.hostname())
		extraHeaders['X-Robo-OS-Platform'] = os.platform()
		extraHeaders['X-Robo-OS-Name'] = os.type()
		extraHeaders['X-Robo-OS-Release'] = os.release()
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
			const response = await fetch(env('roboplay.api') + urlPath + queryString, {
				method: method,
				headers: {
					...extraHeaders,
					...(headers ?? {})
				},
				body: requestBody
			})

			if (raw) {
				return response as unknown as T
			}

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

export async function requestStream<T = unknown>(
	urlPath: string,
	callback: (error: Error | Event, data: T) => void | Promise<void>
) {
	const response = await fetch(env('roboplay.api') + urlPath, {
		headers: {
			'Content-Type': 'text/event-stream'
		}
	})

	const reader = response.body?.getReader()

	if (!reader) {
		callback(new Error('Failed to get readable stream reader'), null)
		return
	}

	let buffer = ''

	while (true) {
		const { done, value } = await reader.read()

		if (done) {
			break
		}

		buffer += new TextDecoder().decode(value)

		const parts = buffer.split('\n\n')
		buffer = parts.pop()

		for (const part of parts) {
			const message = part.split('\n').reduce((acc, line) => {
				const [key, value] = line.split(': ')
				return { ...acc, [key]: value }
			}, {})

			// @ts-expect-error - ...
			if (typeof message.data === 'string' && message.data.startsWith('{') && message.data.endsWith('}')) {
				// @ts-expect-error - ...
				callback(null, JSON.parse(message.data))
			}
		}
	}
}

// eslint-disable-next-line no-control-regex
const AsciiRegex = new RegExp(/[^\x00-\x7F]/g)

/**
 * Sanitize a string for use in ASCII-only contexts. (0-127)
 * This is necessary for fetch requests, as non-ASCII characters can cause issues.
 */
function sanitizeForAscii(input: string) {
	return input?.replace(AsciiRegex, '_')
}
