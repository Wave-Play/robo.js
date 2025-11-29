import { client } from 'robo.js'
import type { RoboRequest } from '@robojs/server'
import type { Guild } from 'discord.js'
import { roadmapLogger } from '../../core/logger.js'

/**
 * Success response structure
 */
export interface ApiSuccessResponse<T> {
	success: true
	data: T
}

/**
 * Error response structure
 */
export interface ApiErrorResponse {
	success: false
	error: {
		code: string
		message: string
		hint?: string
	}
}

/**
 * Generic API response type
 */
export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse

/**
 * Common error codes used across API endpoints
 */
export const ERROR_CODES = {
	MISSING_GUILD_ID: 'MISSING_GUILD_ID',
	GUILD_NOT_FOUND: 'GUILD_NOT_FOUND',
	METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
	PROVIDER_NOT_READY: 'PROVIDER_NOT_READY',
	FORUM_NOT_SETUP: 'FORUM_NOT_SETUP',
	INVALID_REQUEST: 'INVALID_REQUEST',
	MISSING_PERMISSIONS: 'MISSING_PERMISSIONS',
	PROVIDER_AUTH_FAILED: 'PROVIDER_AUTH_FAILED',
	NETWORK_ERROR: 'NETWORK_ERROR',
	SYNC_FAILED: 'SYNC_FAILED',
	CARD_CREATION_FAILED: 'CARD_CREATION_FAILED',
	CARD_NOT_FOUND: 'CARD_NOT_FOUND',
	CARD_UPDATE_FAILED: 'CARD_UPDATE_FAILED',
	INTERNAL_ERROR: 'INTERNAL_ERROR'
} as const

/**
 * Extracts and validates guild from request parameters
 *
 * @param request - The incoming request
 * @returns The guild object
 * @throws Error if guildId is missing or guild not found
 */
export async function getGuildFromRequest(request: RoboRequest): Promise<Guild> {
	const { guildId } = request.params as { guildId?: string }

	if (!guildId) {
	roadmapLogger.warn('Request missing guildId parameter')
		const error = new Error('Guild ID is required')
		error.name = ERROR_CODES.MISSING_GUILD_ID
		throw error
	}

	try {
		const guild = await client.guilds.fetch(guildId)
		roadmapLogger.debug(`Fetched guild: ${guild.name} (${guild.id})`)
		return guild as unknown as Guild
	} catch (err) {
		roadmapLogger.warn(`Guild not found: ${guildId}`, err)
		const error = new Error('Guild not found or bot is not a member')
		error.name = ERROR_CODES.GUILD_NOT_FOUND
		throw error
	}
}

/**
 * Creates a success response
 *
 * @param data - The response data
 * @returns Success response object
 */
export function success<T>(data: T): ApiSuccessResponse<T> {
	return {
		success: true,
		data
	}
}

/**
 * Creates an error response
 *
 * @param code - Error code
 * @param message - Error message
 * @param statusCode - HTTP status code (default: 400)
 * @param headers - Optional additional headers
 * @returns HTTP Response with error
 */
export function error(
	code: string,
	message: string,
	statusCode: number = 400,
	headers?: Record<string, string>,
	hint?: string
): Response {
	roadmapLogger.warn(`API Error: [${code}] ${message}`)

	const errorResponse: ApiErrorResponse = hint
		? {
				success: false,
				error: { code, message, hint }
		  }
		: {
				success: false,
				error: { code, message }
		  }

	return Response.json(errorResponse, { status: statusCode, headers })
}

/**
 * Custom error type for method not allowed errors
 */
interface MethodNotAllowedError extends Error {
	name: typeof ERROR_CODES.METHOD_NOT_ALLOWED
	allowedMethods: string[]
}

/**
 * Validates that the request method is allowed
 *
 * @param request - The incoming request
 * @param allowedMethods - Array of allowed HTTP methods
 * @throws MethodNotAllowedError if method is not allowed
 */
export function validateMethod(request: RoboRequest, allowedMethods: string[]): void {
	if (!allowedMethods.includes(request.method)) {
		const error = new Error(
			`Method not allowed. Allowed methods: ${allowedMethods.join(', ')}`
		) as MethodNotAllowedError
		error.name = ERROR_CODES.METHOD_NOT_ALLOWED
		// Store allowed methods on the error for use in response headers
		error.allowedMethods = allowedMethods
		throw error
	}
}

/**
 * Wraps an endpoint handler with error handling
 *
 * @param handler - The endpoint handler function
 * @returns Wrapped handler with automatic error handling
 */
export function wrapHandler(
	handler: (request: RoboRequest) => Promise<ApiResponse<unknown>>
): (request: RoboRequest) => Promise<Response> {
	return async (request: RoboRequest) => {
		try {
			const result = await handler(request)
			return Response.json(result, { status: 200 })
		} catch (err) {
			roadmapLogger.error('Handler error:', err)

			// Extract error properties for categorization
			const errorName = (err as Error).name
			const errorMessage = (err as Error).message

			// Map error to 404 Not Found
			if (errorName === ERROR_CODES.GUILD_NOT_FOUND) {
				return error(ERROR_CODES.GUILD_NOT_FOUND, errorMessage, 404)
			}

			// Map error to 405 Method Not Allowed
			if (errorName === ERROR_CODES.METHOD_NOT_ALLOWED) {
				// Extract allowed methods from error object if available
				const methodError = err as MethodNotAllowedError
				const allowedMethods = methodError.allowedMethods
				const headers = allowedMethods ? { Allow: allowedMethods.join(', ') } : undefined
				return error(ERROR_CODES.METHOD_NOT_ALLOWED, errorMessage, 405, headers)
			}

			// Map error to 400 Bad Request
			if (errorName === ERROR_CODES.MISSING_GUILD_ID) {
				return error(
					ERROR_CODES.MISSING_GUILD_ID,
					'Guild ID is required',
					400,
					undefined,
					'Include :guildId in the URL path or query when calling this endpoint.'
				)
			}

			// Map error to 503 Service Unavailable
			if (errorName === ERROR_CODES.PROVIDER_NOT_READY) {
				return error(
					ERROR_CODES.PROVIDER_NOT_READY,
					errorMessage,
					503,
					undefined,
					'Verify your roadmap provider credentials and configuration, then restart Robo so the provider can initialize.'
				)
			}

			// Map error to 404 Not Found
			if (errorName === ERROR_CODES.FORUM_NOT_SETUP) {
				return error(
					ERROR_CODES.FORUM_NOT_SETUP,
					errorMessage,
					404,
					undefined,
					'Run the `/roadmap setup` command in Discord to create the roadmap forums before calling this endpoint.'
				)
			}

			// Map error to 400 Bad Request
			if (errorName === ERROR_CODES.INVALID_REQUEST) {
				return error(ERROR_CODES.INVALID_REQUEST, errorMessage, 400)
			}

			// Map error to 403 Forbidden
			if (errorName === ERROR_CODES.MISSING_PERMISSIONS) {
				return error(ERROR_CODES.MISSING_PERMISSIONS, errorMessage, 403)
			}

			// Map error to 401 Unauthorized
			if (errorName === ERROR_CODES.PROVIDER_AUTH_FAILED) {
				return error(ERROR_CODES.PROVIDER_AUTH_FAILED, errorMessage, 401)
			}

			// Map error to 503 Service Unavailable
			if (errorName === ERROR_CODES.NETWORK_ERROR) {
				return error(ERROR_CODES.NETWORK_ERROR, errorMessage, 503)
			}

			// Map error to 500 Internal Server Error
			if (errorName === ERROR_CODES.SYNC_FAILED) {
				return error(ERROR_CODES.SYNC_FAILED, errorMessage, 500)
			}

			// Map error to 500 Internal Server Error
			if (errorName === ERROR_CODES.CARD_CREATION_FAILED) {
				return error(ERROR_CODES.CARD_CREATION_FAILED, errorMessage, 500)
			}

			// Map error to 404 Not Found
			if (errorName === ERROR_CODES.CARD_NOT_FOUND) {
				return error(ERROR_CODES.CARD_NOT_FOUND, errorMessage, 404)
			}

			// Map error to 500 Internal Server Error
			if (errorName === ERROR_CODES.CARD_UPDATE_FAILED) {
				return error(ERROR_CODES.CARD_UPDATE_FAILED, errorMessage, 500)
			}

			// Generic internal error fallback
			return error(ERROR_CODES.INTERNAL_ERROR, 'An internal error occurred', 500)
		}
	}
}
