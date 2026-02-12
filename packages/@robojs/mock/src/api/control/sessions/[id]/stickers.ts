import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../core/manager.js'
import { validateMethod, notFound } from '../../utils.js'
import { StickerFormatType, StickerType } from 'discord-api-types/v10'
import type { MockSticker } from '../../../../types/index.js'

/**
 * POST /api/control/sessions/:id/stickers - Add a sticker directly to state
 *
 * Request body:
 * {
 *   id: string,            // Sticker ID
 *   name: string,          // Sticker name
 *   tags?: string,         // Autocomplete tags (comma-separated)
 *   description?: string,  // Sticker description
 *   format_type?: number,  // StickerFormatType (default: PNG)
 *   type?: number,         // StickerType (default: Standard)
 *   pack_id?: string,      // For standard stickers
 *   guild_id?: string,     // For guild stickers
 * }
 *
 * This endpoint allows adding stickers of any type (standard/nitro or guild)
 * directly to the session state for testing purposes.
 */
export default async (request: RoboRequest) => {
	validateMethod(request, ['POST'])

	const { id } = request.params as { id: string }

	if (!id) {
		return notFound('Session ID required')
	}

	const session = sessionManager.get(id)

	if (!session) {
		return notFound('Session not found')
	}

	const body = (await request.json()) as {
		id: string
		name: string
		tags?: string
		description?: string
		format_type?: number
		type?: number
		pack_id?: string
		guild_id?: string
	}

	if (!body.id || !body.name) {
		return new Response(JSON.stringify({ message: 'id and name are required' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	const sticker: MockSticker = {
		id: body.id,
		name: body.name,
		tags: body.tags ?? '',
		description: body.description ?? null,
		format_type: body.format_type ?? StickerFormatType.PNG,
		type: body.type ?? StickerType.Standard,
		available: true,
		pack_id: body.pack_id,
		guild_id: body.guild_id
	}

	session.state.addSticker(sticker)

	return { success: true, sticker }
}
