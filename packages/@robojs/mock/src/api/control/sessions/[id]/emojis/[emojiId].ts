import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../../core/manager.js'
import { getStageServer } from '../../../../../core/stage.js'
import { validateMethod, notFound } from '../../../utils.js'

/**
 * DELETE /api/control/sessions/:id/emojis/:emojiId - Delete an emoji
 */
export default async (request: RoboRequest) => {
	validateMethod(request, ['DELETE'])

	const { id, emojiId } = request.params as { id: string; emojiId: string }

	if (!id) {
		return notFound('Session ID required')
	}

	if (!emojiId) {
		return notFound('Emoji ID required')
	}

	const session = sessionManager.get(id)

	if (!session) {
		return notFound('Session not found')
	}

	// Find the emoji
	const emoji = session.state.getEmoji(emojiId)
	if (!emoji) {
		return notFound('Emoji not found')
	}

	// Store emoji name for toast message
	const emojiName = emoji.name

	// Find which guild this emoji belongs to
	let guildId: string | null = null
	for (const guild of session.state.guilds.values()) {
		if (guild.emojis.includes(emojiId)) {
			guildId = guild.id
			break
		}
	}

	// Delete the emoji
	const deleted = session.state.deleteGuildEmoji(emojiId)

	if (!deleted) {
		return new Response(JSON.stringify({ message: 'Failed to delete emoji' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Dispatch emoji update event if we found the guild
	if (guildId) {
		await session.dispatchGuildEmojisUpdate(guildId)
	}

	// Broadcast control action for toast notification
	const stageServer = getStageServer()
	stageServer.broadcastControlAction(
		id,
		'emoji_delete',
		`Emoji :${emojiName}: was removed`,
		'success',
		{ type: 'user', name: 'DevTools' }
	)

	return { success: true }
}
