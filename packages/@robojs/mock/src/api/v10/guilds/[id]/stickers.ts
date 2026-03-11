import { define } from '@robojs/server'
import type { RoboRequest } from '@robojs/server'
import { z } from 'zod'
import { sessionManager } from '../../../../core/manager.js'
import { parseMockToken } from '../../../../utils/id.js'
import { mockStickerToAPISticker } from '../../../../discord/payloads.js'
import { StickerLimits } from '../../../../types/index.js'
import { isMultipartRequest, MultipartError } from '../../../../utils/multipart.js'

/**
 * GET /api/v10/guilds/:id/stickers - List all stickers for a guild
 * POST /api/v10/guilds/:id/stickers - Create a guild sticker
 *
 * @see https://discord.com/developers/docs/resources/sticker#list-guild-stickers
 * @see https://discord.com/developers/docs/resources/sticker#create-guild-sticker
 */
function resolveGuild(request: RoboRequest) {
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

	return { session, guild, guildId }
}

const GuildStickerResponseSchema = z
	.object({
		id: z.string(),
		name: z.string(),
		tags: z.string(),
		type: z.number(),
		format_type: z.number().nullable(),
		description: z.string().nullable(),
		available: z.boolean(),
		guild_id: z.string(),
		user: z.object({}).passthrough().optional()
	})
	.passthrough()

export const GET = define(
	{
		summary: 'List guild stickers',
		description: 'Returns an array of sticker objects for the given guild',
		tags: ['Guild Stickers'],
		params: z.object({
			id: z.string().describe('The guild ID (Snowflake)')
		}),
		response: {
			200: z.array(GuildStickerResponseSchema)
		}
	},
	async (request) => {
		const resolved = resolveGuild(request)
		if (resolved instanceof Response) return resolved
		const { session, guildId } = resolved

		const stickers = session.state.getGuildStickers(guildId)
		return stickers.map(mockStickerToAPISticker)
	}
)

export const POST = define(
	{
		summary: 'Create guild sticker',
		description: 'Create a new sticker for the guild',
		tags: ['Guild Stickers'],
		params: z.object({
			id: z.string().describe('The guild ID (Snowflake)')
		}),
		body: z
			.object({
				name: z.string().min(2).max(30),
				tags: z.string().min(1).max(200),
				description: z.string().nullable().max(100).optional(),
				file: z.string().optional()
			})
			.passthrough(),
		response: {
			201: GuildStickerResponseSchema
		}
	},
	async (request) => {
		const resolved = resolveGuild(request)
		if (resolved instanceof Response) return resolved
		const { session, guild, guildId } = resolved

		// Parse request body (supports both JSON and multipart/form-data)
		let body: {
			name: string
			description?: string
			tags: string
		}

		try {
			if (isMultipartRequest(request)) {
				// Parse multipart form data (Discord.js sends stickers as form-data)
				const formData = await request.formData()
				body = {
					name: formData.get('name') as string || '',
					description: (formData.get('description') as string) || undefined,
					tags: formData.get('tags') as string || ''
				}
			} else {
				body = await request.json()
			}
		} catch (error) {
			if (error instanceof MultipartError) {
				return new Response(JSON.stringify({ message: error.message, code: error.code }), {
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				})
			}
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

		if (!body.tags || typeof body.tags !== 'string') {
			return new Response(JSON.stringify({ message: 'Tags are required', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Validate name length (2-30 characters)
		if (body.name.length < StickerLimits.MIN_NAME_LENGTH) {
			return new Response(
				JSON.stringify({ message: `Sticker name must be at least ${StickerLimits.MIN_NAME_LENGTH} characters`, code: 50035 }),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				}
			)
		}
		if (body.name.length > StickerLimits.MAX_NAME_LENGTH) {
			return new Response(
				JSON.stringify({ message: `Sticker name cannot exceed ${StickerLimits.MAX_NAME_LENGTH} characters`, code: 50035 }),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				}
			)
		}

		// Validate description length (empty or 2-100 characters)
		if (body.description && body.description.length > 0 && body.description.length < StickerLimits.MIN_DESCRIPTION_LENGTH) {
			return new Response(
				JSON.stringify({
					error: `Sticker description must be empty or at least ${StickerLimits.MIN_DESCRIPTION_LENGTH} characters`,
					code: 50035
				}),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				}
			)
		}
		if (body.description && body.description.length > StickerLimits.MAX_DESCRIPTION_LENGTH) {
			return new Response(
				JSON.stringify({
					error: `Sticker description cannot exceed ${StickerLimits.MAX_DESCRIPTION_LENGTH} characters`,
					code: 50035
				}),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				}
			)
		}

		// Validate tags length (2-200 characters)
		if (body.tags.length < StickerLimits.MIN_TAGS_LENGTH) {
			return new Response(
				JSON.stringify({ message: `Sticker tags must be at least ${StickerLimits.MIN_TAGS_LENGTH} characters`, code: 50035 }),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				}
			)
		}
		if (body.tags.length > StickerLimits.MAX_TAGS_LENGTH) {
			return new Response(
				JSON.stringify({ message: `Sticker tags cannot exceed ${StickerLimits.MAX_TAGS_LENGTH} characters`, code: 50035 }),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				}
			)
		}

		// Check guild sticker limit
		if (guild.stickers.length >= StickerLimits.MAX_GUILD_STICKERS) {
			return new Response(
				JSON.stringify({
					error: `Guild has reached maximum sticker limit of ${StickerLimits.MAX_GUILD_STICKERS}`,
					code: 30039
				}),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				}
			)
		}

		// Create the sticker
		const sticker = session.state.createGuildSticker(
			guildId,
			{
				name: body.name,
				description: body.description,
				tags: body.tags
			},
			session.state.botUser.id
		)

		if (!sticker) {
			return new Response(JSON.stringify({ message: 'Failed to create sticker', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Record action
		session.recordAction(
			'sticker_created',
			{
				sticker_id: sticker.id,
				guild_id: guildId,
				name: sticker.name,
				tags: sticker.tags
			},
			{
				endpoint: `POST /guilds/${guildId}/stickers`,
				method: 'POST'
			}
		)

		// Dispatch GUILD_STICKERS_UPDATE event
		await session.dispatchGuildStickersUpdate(guildId)

		return new Response(JSON.stringify(mockStickerToAPISticker(sticker)), {
			status: 201,
			headers: { 'Content-Type': 'application/json' }
		})
	}
)
