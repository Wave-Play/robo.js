import { define } from '@robojs/server'
import type { RoboRequest } from '@robojs/server'
import { z } from 'zod'
import { sessionManager } from '../../../core/manager.js'
import { parseMockToken } from '../../../utils/id.js'

/**
 * GET /api/v10/users/:id - Fetch user by ID
 *
 * Returns user information for the specified user ID.
 * If the ID matches the bot user, returns bot user info.
 * If the ID matches a user in the session state, returns that user.
 *
 * Response matches Discord's format:
 * {
 *   id: string,
 *   username: string,
 *   discriminator: string,
 *   avatar: string | null,
 *   bot?: boolean,
 *   ...
 * }
 */
export const GET = define(
	{
		summary: 'Get user',
		tags: ['Users'],
		params: z.object({
			id: z.string().describe('User ID')
		}),
		response: {
			200: z.object({
				id: z.string(),
				username: z.string(),
				avatar: z.string().nullable(),
				discriminator: z.string(),
				public_flags: z.number().int(),
				flags: z.number().int(),
				global_name: z.string().nullable(),
				primary_guild: z.object({}).passthrough().nullable().optional(),
				bot: z.boolean().optional(),
				system: z.boolean().optional(),
				banner: z.string().nullable().optional(),
				accent_color: z.number().int().nullable().optional(),
				avatar_decoration_data: z.object({}).passthrough().nullable().optional(),
				collectibles: z.object({}).passthrough().nullable().optional()
			}).passthrough()
		}
	},
	async (request: RoboRequest) => {
	const { id } = request.params as { id: string }

	// Get token from Authorization header
	const authHeader = request.headers.get('Authorization') || ''
	const sessionId = parseMockToken(authHeader)

	if (!sessionId) {
		return new Response(JSON.stringify({ message: 'Unauthorized', code: 0 }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Get session
	const session = sessionManager.get(sessionId)
	if (!session) {
		return new Response(JSON.stringify({ message: 'Unauthorized', code: 0 }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Handle @me as alias for bot user
	if (id === '@me') {
		const botUser = session.state.botUser
		return {
			id: botUser.id,
			username: botUser.username,
			discriminator: botUser.discriminator,
			global_name: botUser.globalName,
			avatar: botUser.avatar,
			bot: botUser.bot,
			system: false,
			mfa_enabled: false,
			banner: null,
			accent_color: null,
			locale: 'en-US',
			verified: true,
			flags: 0,
			premium_type: 0,
			public_flags: 0
		}
	}

	// Check if requesting the bot user by ID
	if (id === session.state.botUser.id) {
		const botUser = session.state.botUser
		return {
			id: botUser.id,
			username: botUser.username,
			discriminator: botUser.discriminator,
			global_name: botUser.globalName,
			avatar: botUser.avatar,
			bot: botUser.bot,
			system: false,
			mfa_enabled: false,
			banner: null,
			accent_color: null,
			locale: 'en-US',
			verified: true,
			flags: 0,
			premium_type: 0,
			public_flags: 0
		}
	}

	// Check if the user exists in session state
	const user = session.state.users.get(id)
	if (user) {
		return {
			id: user.id,
			username: user.username,
			discriminator: user.discriminator,
			global_name: user.globalName,
			avatar: user.avatar,
			bot: user.bot,
			system: false,
			banner: null,
			accent_color: null,
			public_flags: 0
		}
	}

	// User not found - return 404 with Discord error format
	return new Response(
		JSON.stringify({
			message: 'Unknown User',
			code: 10013
		}),
		{
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		}
	)
})
