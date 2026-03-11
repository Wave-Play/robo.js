import { define } from '@robojs/server'
import type { RoboRequest } from '@robojs/server'
import { z } from 'zod'
import { sessionManager } from '../../../core/manager.js'
import { parseMockToken } from '../../../utils/id.js'

/**
 * GET /api/v10/users/@me - Discord User endpoint mock
 * PATCH /api/v10/users/@me - Update user (username, avatar)
 *
 * GET: Returns the authenticated bot user's information.
 * PATCH: Updates username or avatar.
 *
 * Response matches Discord's format:
 * {
 *   id: string,
 *   username: string,
 *   discriminator: string,
 *   avatar: string | null,
 *   bot: boolean,
 *   ...
 * }
 */

function resolveSession(request: RoboRequest) {
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

	return { session }
}

const UserPIIResponseSchema = z.object({
	id: z.string(),
	username: z.string(),
	discriminator: z.string(),
	global_name: z.string().nullable(),
	avatar: z.string().nullable(),
	public_flags: z.number().int(),
	flags: z.number().int(),
	mfa_enabled: z.boolean(),
	locale: z.string(),
	bot: z.boolean().optional(),
	system: z.boolean().optional(),
	banner: z.string().nullable().optional(),
	accent_color: z.number().int().nullable().optional(),
	avatar_decoration_data: z.object({}).passthrough().nullable().optional(),
	collectibles: z.object({}).passthrough().nullable().optional(),
	primary_guild: z.object({}).passthrough().nullable().optional(),
	premium_type: z.number().int().optional(),
	verified: z.boolean().optional(),
	email: z.string().nullable().optional()
}).passthrough()

export const GET = define(
	{
		summary: 'Get current user',
		tags: ['Users'],
		response: {
			200: UserPIIResponseSchema
		}
	},
	async (request: RoboRequest) => {
	const resolved = resolveSession(request)
	if (resolved instanceof Response) return resolved
	const { session } = resolved

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
})

export const PATCH = define(
	{
		summary: 'Update current user',
		tags: ['Users'],
		body: z.object({
			username: z.string().min(2).max(32),
			avatar: z.string().nullable().optional(),
			banner: z.string().nullable().optional()
		}).passthrough(),
		response: {
			200: UserPIIResponseSchema
		}
	},
	async (request: RoboRequest) => {
	const resolved = resolveSession(request)
	if (resolved instanceof Response) return resolved
	const { session } = resolved

	const botUser = session.state.botUser
	const body = (await request.json()) as { username?: string; avatar?: string | null }

	// Update username if provided
	if (body.username !== undefined) {
		botUser.username = body.username
	}

	// Update avatar if provided (can be null to clear, or base64 data URL)
	if (body.avatar !== undefined) {
		if (body.avatar === null) {
			botUser.avatar = null
		} else if (body.avatar.startsWith('data:')) {
			// For base64 data URLs, generate a simple hash for the avatar
			// In production Discord would process and store the image
			botUser.avatar = Buffer.from(body.avatar.slice(0, 100)).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 32)
		} else {
			// Direct avatar hash
			botUser.avatar = body.avatar
		}
	}

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
})
