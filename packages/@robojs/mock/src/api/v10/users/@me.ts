import type { RoboRequest } from '@robojs/server'
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

export async function GET(request: RoboRequest) {
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
}

export async function PATCH(request: RoboRequest) {
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
}
