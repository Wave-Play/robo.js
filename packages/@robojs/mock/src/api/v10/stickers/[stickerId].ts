import { define } from '@robojs/server'
import type { RoboRequest } from '@robojs/server'
import { z } from 'zod'
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
export const GET = define(
	{
		summary: 'Get sticker',
		tags: ['Stickers'],
		params: z.object({
			stickerId: z.string().describe('Sticker ID')
		}),
		response: {
			200: z.object({
				id: z.string(),
				name: z.string(),
				tags: z.string(),
				type: z.number().int(),
				format_type: z.number().int().nullable(),
				description: z.string().nullable(),
				available: z.boolean().optional(),
				guild_id: z.string().optional(),
				user: z.object({}).passthrough().optional(),
				pack_id: z.string().optional(),
				sort_value: z.number().int().optional()
			}).passthrough()
		}
	},
	async (request: RoboRequest) => {
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
})
