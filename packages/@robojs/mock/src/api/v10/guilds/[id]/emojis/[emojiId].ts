import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../../core/manager.js'
import { parseMockToken } from '../../../../../utils/id.js'
import { mockEmojiToAPIEmoji } from '../../../../../discord/payloads.js'
import { EmojiLimits } from '../../../../../types/index.js'

/**
 * GET /api/v10/guilds/:id/emojis/:emojiId - Get a guild emoji
 * PATCH /api/v10/guilds/:id/emojis/:emojiId - Modify a guild emoji
 * DELETE /api/v10/guilds/:id/emojis/:emojiId - Delete a guild emoji
 *
 * @see https://discord.com/developers/docs/resources/emoji#get-guild-emoji
 * @see https://discord.com/developers/docs/resources/emoji#modify-guild-emoji
 * @see https://discord.com/developers/docs/resources/emoji#delete-guild-emoji
 */

function resolveGuildEmoji(request: RoboRequest) {
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

	// 2. Extract params
	const { id: guildId, emojiId } = request.params as { id: string; emojiId: string }

	// 3. Validate guild exists
	const guild = session.state.guilds.get(guildId)
	if (!guild) {
		return new Response(JSON.stringify({ message: 'Unknown Guild', code: 10004 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 4. Validate emoji exists and belongs to this guild
	const emoji = session.state.getEmoji(emojiId)
	if (!emoji || !guild.emojis.includes(emojiId)) {
		return new Response(JSON.stringify({ message: 'Unknown Emoji', code: 10014 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	return { session, guild, guildId, emojiId, emoji }
}

export async function GET(request: RoboRequest) {
	const resolved = resolveGuildEmoji(request)
	if (resolved instanceof Response) return resolved
	const { emoji } = resolved

	return mockEmojiToAPIEmoji(emoji)
}

export async function PATCH(request: RoboRequest) {
	const resolved = resolveGuildEmoji(request)
	if (resolved instanceof Response) return resolved
	const { session, guildId, emojiId } = resolved

	let body: {
		name?: string
		roles?: string[]
	}

	try {
		body = await request.json()
	} catch {
		return new Response(JSON.stringify({ message: 'Invalid request body', code: 50035 }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Validate name length
	if (body.name !== undefined) {
		if (body.name.length < EmojiLimits.MIN_NAME_LENGTH) {
			return new Response(
				JSON.stringify({
					error: `Emoji name must be at least ${EmojiLimits.MIN_NAME_LENGTH} characters`,
					code: 50035
				}),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				}
			)
		}

		if (body.name.length > EmojiLimits.MAX_NAME_LENGTH) {
			return new Response(
				JSON.stringify({
					error: `Emoji name cannot exceed ${EmojiLimits.MAX_NAME_LENGTH} characters`,
					code: 50035
				}),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				}
			)
		}

		// Validate name pattern (alphanumeric and underscores only)
		if (!EmojiLimits.NAME_PATTERN.test(body.name)) {
			return new Response(
				JSON.stringify({
					error: 'Emoji name must only contain alphanumeric characters and underscores',
					code: 50035
				}),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				}
			)
		}
	}

	// Update the emoji
	const updated = session.state.updateGuildEmoji(emojiId, body)
	if (!updated) {
		return new Response(JSON.stringify({ message: 'Failed to update emoji', code: 50035 }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Record action
	session.recordAction(
		'emoji_updated',
		{
			emoji_id: emojiId,
			guild_id: guildId,
			updates: body
		},
		{
			endpoint: `PATCH /guilds/${guildId}/emojis/${emojiId}`,
			method: 'PATCH'
		}
	)

	// Dispatch GUILD_EMOJIS_UPDATE event
	await session.dispatchGuildEmojisUpdate(guildId)

	return mockEmojiToAPIEmoji(updated)
}

export async function DELETE(request: RoboRequest) {
	const resolved = resolveGuildEmoji(request)
	if (resolved instanceof Response) return resolved
	const { session, guildId, emojiId } = resolved

	const deleted = session.state.deleteGuildEmoji(emojiId)
	if (!deleted) {
		return new Response(JSON.stringify({ message: 'Failed to delete emoji', code: 50035 }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Record action
	session.recordAction(
		'emoji_deleted',
		{
			emoji_id: emojiId,
			guild_id: guildId
		},
		{
			endpoint: `DELETE /guilds/${guildId}/emojis/${emojiId}`,
			method: 'DELETE'
		}
	)

	// Dispatch GUILD_EMOJIS_UPDATE event
	await session.dispatchGuildEmojisUpdate(guildId)

	return new Response(null, { status: 204 })
}
