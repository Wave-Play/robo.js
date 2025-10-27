import type { RoboRequest } from '@robojs/server'
import { client, logger } from 'robo.js'
import type { Guild } from 'discord.js'

const apiLogger = logger.fork('xp-api')

/**
 * API Success Response
 */
export interface ApiSuccessResponse<T> {
	success: true
	data: T
}

/**
 * API Error Response
 */
export interface ApiErrorResponse {
	success: false
	error: {
		code: string
		message: string
	}
}

/**
 * API Response Union Type
 */
export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse

/**
 * Error Codes
 */
export const ERROR_CODES = {
	MISSING_GUILD_ID: 'MISSING_GUILD_ID',
	GUILD_NOT_FOUND: 'GUILD_NOT_FOUND',
	MISSING_USER_ID: 'MISSING_USER_ID',
	USER_NOT_FOUND: 'USER_NOT_FOUND',
	METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
	INVALID_REQUEST: 'INVALID_REQUEST',
	INVALID_AMOUNT: 'INVALID_AMOUNT',
	INVALID_CONFIG: 'INVALID_CONFIG',
	INVALID_LEVEL: 'INVALID_LEVEL',
	INVALID_ROLE_ID: 'INVALID_ROLE_ID',
	INVALID_MULTIPLIER: 'INVALID_MULTIPLIER',
	DUPLICATE_REWARD: 'DUPLICATE_REWARD',
	REWARD_NOT_FOUND: 'REWARD_NOT_FOUND',
	INTERNAL_ERROR: 'INTERNAL_ERROR'
} as const

/**
 * Get guild from request parameters
 */
export async function getGuildFromRequest(request: RoboRequest): Promise<Guild> {
	const guildId = request.params?.guildId
	if (!guildId) {
		const error = new Error('Guild ID parameter missing')
		;(error as Error & { code: string }).code = ERROR_CODES.MISSING_GUILD_ID
		throw error
	}

	const guild = await client.guilds.fetch(guildId).catch(() => null)
	if (!guild) {
		const error = new Error('Guild not found or bot not member')
		;(error as Error & { code: string }).code = ERROR_CODES.GUILD_NOT_FOUND
		throw error
	}

	apiLogger.debug(`Guild resolved: ${guild.name} (${guild.id})`)
	return guild
}

/**
 * Create success response
 */
export function success<T>(data: T): ApiSuccessResponse<T> {
	return {
		success: true,
		data
	}
}

/**
 * Create error response
 */
export function error(
	code: string,
	message: string,
	statusCode: number = 400,
	headers?: Record<string, string>
): Response {
	apiLogger.warn(`API Error: ${code} - ${message}`)
	return Response.json(
		{
			success: false,
			error: {
				code,
				message
			}
		},
		{
			status: statusCode,
			headers
		}
	)
}

/**
 * Validate HTTP method
 */
export function validateMethod(request: RoboRequest, allowedMethods: string[]): void {
	if (!allowedMethods.includes(request.method)) {
		const error = new Error(`Method ${request.method} not allowed`)
		;(error as Error & { code: string }).code = ERROR_CODES.METHOD_NOT_ALLOWED
		;(error as Error & { allowedMethods: string[] }).allowedMethods = allowedMethods
		throw error
	}
}

/**
 * Validate XP amount
 */
export function validateAmount(amount: unknown): { valid: boolean; error?: string } {
	if (typeof amount !== 'number' || Number.isNaN(amount)) {
		return { valid: false, error: 'Amount must be a number' }
	}

	if (!Number.isFinite(amount) || amount <= 0) {
		return { valid: false, error: 'Amount must be positive' }
	}

	return { valid: true }
}

/**
 * Validate Discord snowflake ID
 */
export function validateSnowflake(id: string): boolean {
	return /^\d{17,19}$/.test(id)
}

/**
 * Validate user ID
 */
export function validateUserId(userId: unknown): { valid: boolean; error?: string } {
	if (typeof userId !== 'string') {
		return { valid: false, error: 'User ID must be a string' }
	}
	if (!validateSnowflake(userId)) {
		return { valid: false, error: 'User ID must be a valid Discord snowflake' }
	}
	return { valid: true }
}

/**
 * Wrap handler with error handling
 */
export function wrapHandler(
	handler: (request: RoboRequest) => Promise<ApiResponse<unknown>>
): (request: RoboRequest) => Promise<Response> {
	return async (request: RoboRequest): Promise<Response> => {
		try {
			const result = await handler(request)
			return Response.json(result)
		} catch (err) {
			const error = err as Error & { code?: string; allowedMethods?: string[] }
			const code = error.code || ERROR_CODES.INTERNAL_ERROR
			const message = error.message || 'An unexpected error occurred'

			apiLogger.error(`Handler error: ${code}`, error)

			// Map error codes to HTTP status codes
			let statusCode = 500
			let headers: Record<string, string> | undefined

			switch (code) {
				case ERROR_CODES.GUILD_NOT_FOUND:
				case ERROR_CODES.USER_NOT_FOUND:
				case ERROR_CODES.REWARD_NOT_FOUND:
					statusCode = 404
					break
				case ERROR_CODES.METHOD_NOT_ALLOWED:
					statusCode = 405
					headers = { Allow: error.allowedMethods?.join(', ') || '' }
					break
				case ERROR_CODES.MISSING_GUILD_ID:
				case ERROR_CODES.MISSING_USER_ID:
				case ERROR_CODES.INVALID_REQUEST:
				case ERROR_CODES.INVALID_AMOUNT:
				case ERROR_CODES.INVALID_CONFIG:
				case ERROR_CODES.INVALID_LEVEL:
				case ERROR_CODES.INVALID_ROLE_ID:
				case ERROR_CODES.INVALID_MULTIPLIER:
				case ERROR_CODES.DUPLICATE_REWARD:
					statusCode = 400
					break
				default:
					statusCode = 500
			}

			return Response.json(
				{
					success: false,
					error: {
						code,
						message
					}
				},
				{
					status: statusCode,
					headers
				}
			)
		}
	}
}
