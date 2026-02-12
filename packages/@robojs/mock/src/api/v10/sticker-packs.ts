import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../core/manager.js'
import { parseMockToken } from '../../utils/id.js'

/**
 * GET /api/v10/sticker-packs - List standard sticker packs
 *
 * Returns empty array for mock server (no Discord standard stickers available)
 *
 * @see https://discord.com/developers/docs/resources/sticker#list-sticker-packs
 */
export async function GET(request: RoboRequest) {
	// 1. Parse Authorization header → get session
	const authHeader = request.headers.get('Authorization') || ''
	const sessionId = parseMockToken(authHeader)

	if (!sessionId) {
		return new Response(JSON.stringify({ message: 'Unauthorized', code: 0 }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	const session = sessionManager.get(sessionId)
	if (!session) {
		return new Response(JSON.stringify({ message: 'Unauthorized', code: 0 }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Return empty sticker packs (mock server doesn't have Discord's standard stickers)
	return {
		sticker_packs: []
	}
}
