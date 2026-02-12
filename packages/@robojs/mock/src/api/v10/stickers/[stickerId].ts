import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../core/manager.js'
import { parseMockToken } from '../../../utils/id.js'
import { mockStickerToAPISticker } from '../../../discord/payloads.js'

/**
 * GET /api/v10/stickers/:stickerId - Get a sticker by ID
 *
 * Returns the sticker object for the given ID (guild or standard)
 *
 * @see https://discord.com/developers/docs/resources/sticker#get-sticker
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

	// 2. Extract sticker ID from params
	const { stickerId } = request.params as { stickerId: string }

	// 3. Get sticker from state
	const sticker = session.state.getSticker(stickerId)
	if (!sticker) {
		return new Response(JSON.stringify({ message: 'Unknown Sticker', code: 10060 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	return mockStickerToAPISticker(sticker)
}
