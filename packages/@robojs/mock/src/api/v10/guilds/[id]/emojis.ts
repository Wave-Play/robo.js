import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../core/manager.js'
import { parseMockToken } from '../../../../utils/id.js'
import { mockEmojiToAPIEmoji } from '../../../../discord/payloads.js'
import { EmojiLimits } from '../../../../types/index.js'

/**
 * GET /api/v10/guilds/:id/emojis - List all emojis for a guild
 * POST /api/v10/guilds/:id/emojis - Create a guild emoji
 *
 * @see https://discord.com/developers/docs/resources/emoji#list-guild-emojis
 * @see https://discord.com/developers/docs/resources/emoji#create-guild-emoji
 */
export default async (request: RoboRequest) => {
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

	// 2. Extract guild ID from params
	const { id: guildId } = request.params as { id: string }

	// 3. Validate guild exists
	const guild = session.state.guilds.get(guildId)
	if (!guild) {
		return new Response(JSON.stringify({ message: 'Unknown Guild', code: 10004 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Handle GET - List guild emojis
	if (request.method === 'GET') {
		const emojis = session.state.getGuildEmojis(guildId)
		return emojis.map(mockEmojiToAPIEmoji)
	}

	// Handle POST - Create guild emoji
	if (request.method === 'POST') {
		let body: {
			name: string
			image: string
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

		// Validate required fields
		if (!body.name || typeof body.name !== 'string') {
			return new Response(JSON.stringify({ message: 'Name is required', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Validate name length
		if (body.name.length < EmojiLimits.MIN_NAME_LENGTH) {
			return new Response(
				JSON.stringify({ message: `Emoji name must be at least ${EmojiLimits.MIN_NAME_LENGTH} characters`, code: 50035 }),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				}
			)
		}

		if (body.name.length > EmojiLimits.MAX_NAME_LENGTH) {
			return new Response(
				JSON.stringify({ message: `Emoji name cannot exceed ${EmojiLimits.MAX_NAME_LENGTH} characters`, code: 50035 }),
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

		// Validate image is provided (required by Discord API, but mock allows omission for testing convenience)
		// Note: Discord requires base64-encoded image data in data URI format
		if (!body.image || typeof body.image !== 'string') {
			return new Response(
				JSON.stringify({ message: 'Image is required', code: 50035 }),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				}
			)
		}

		// Check guild emoji limit
		if (guild.emojis.length >= EmojiLimits.MAX_GUILD_EMOJIS) {
			return new Response(
				JSON.stringify({
					error: `Guild has reached maximum emoji limit of ${EmojiLimits.MAX_GUILD_EMOJIS}`,
					code: 30008
				}),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				}
			)
		}

		// Determine if emoji is animated (from image data URL or explicit flag)
		const animated = body.image?.startsWith('data:image/gif') ?? false

		// Create the emoji
		const emoji = session.state.createGuildEmoji(
			guildId,
			{
				name: body.name,
				image: body.image,
				roles: body.roles,
				animated
			},
			session.state.botUser.id
		)

		if (!emoji) {
			return new Response(JSON.stringify({ message: 'Failed to create emoji', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Record action
		session.recordAction(
			'emoji_created',
			{
				emoji_id: emoji.id,
				guild_id: guildId,
				name: emoji.name
			},
			{
				endpoint: `POST /guilds/${guildId}/emojis`,
				method: 'POST'
			}
		)

		// Dispatch GUILD_EMOJIS_UPDATE event
		await session.dispatchGuildEmojisUpdate(guildId)

		return new Response(JSON.stringify(mockEmojiToAPIEmoji(emoji)), {
			status: 201,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Method not allowed
	return new Response(JSON.stringify({ message: 'Method not allowed' }), {
		status: 405,
		headers: { 'Content-Type': 'application/json' }
	})
}
