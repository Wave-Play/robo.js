import { define } from '@robojs/server'
import type { RoboRequest } from '@robojs/server'
import { z } from 'zod'
import { sessionManager } from '../../../../../core/manager.js'
import { parseMockToken } from '../../../../../utils/id.js'
import { mockStickerToAPISticker } from '../../../../../discord/payloads.js'
import { StickerLimits } from '../../../../../types/index.js'

/**
 * GET /api/v10/guilds/:id/stickers/:stickerId - Get a guild sticker
 * PATCH /api/v10/guilds/:id/stickers/:stickerId - Modify a guild sticker
 * DELETE /api/v10/guilds/:id/stickers/:stickerId - Delete a guild sticker
 *
 * @see https://discord.com/developers/docs/resources/sticker#get-guild-sticker
 * @see https://discord.com/developers/docs/resources/sticker#modify-guild-sticker
 * @see https://discord.com/developers/docs/resources/sticker#delete-guild-sticker
 */
function resolveSticker(request: RoboRequest) {
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
	const { id: guildId, stickerId } = request.params as { id: string; stickerId: string }

	// 3. Validate guild exists
	const guild = session.state.guilds.get(guildId)
	if (!guild) {
		return new Response(JSON.stringify({ message: 'Unknown Guild', code: 10004 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 4. Validate sticker exists and belongs to this guild
	const sticker = session.state.getSticker(stickerId)
	if (!sticker || sticker.guild_id !== guildId) {
		return new Response(JSON.stringify({ message: 'Unknown Sticker', code: 10060 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	return { session, guild, guildId, sticker, stickerId }
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

const stickerParams = z.object({
	id: z.string().describe('The guild ID (Snowflake)'),
	stickerId: z.string().describe('The sticker ID (Snowflake)')
})

export const GET = define(
	{
		summary: 'Get guild sticker',
		description: 'Returns a sticker object for the given guild and sticker IDs',
		tags: ['Guild Stickers'],
		params: stickerParams,
		response: {
			200: GuildStickerResponseSchema
		}
	},
	async (request) => {
		const resolved = resolveSticker(request)
		if (resolved instanceof Response) return resolved
		const { sticker } = resolved

		return mockStickerToAPISticker(sticker)
	}
)

export const PATCH = define(
	{
		summary: 'Update guild sticker',
		description: 'Modify the given sticker',
		tags: ['Guild Stickers'],
		params: stickerParams,
		body: z
			.object({
				name: z.string().min(2).max(30).optional(),
				tags: z.string().min(1).max(200).optional(),
				description: z.string().nullable().max(100).optional()
			})
			.passthrough(),
		response: {
			200: GuildStickerResponseSchema
		}
	},
	async (request) => {
		const resolved = resolveSticker(request)
		if (resolved instanceof Response) return resolved
		const { session, guildId, sticker, stickerId } = resolved

		let body: {
			name?: string
			description?: string
			tags?: string
		}

		try {
			body = await request.json()
		} catch {
			return new Response(JSON.stringify({ message: 'Invalid request body', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Validate name length (2-30 characters)
		if (body.name !== undefined) {
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
		}

		// Validate description length (empty or 2-100 characters)
		if (body.description !== undefined) {
			if (body.description.length > 0 && body.description.length < StickerLimits.MIN_DESCRIPTION_LENGTH) {
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
			if (body.description.length > StickerLimits.MAX_DESCRIPTION_LENGTH) {
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
		}

		// Validate tags length (2-200 characters)
		if (body.tags !== undefined) {
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
		}

		// Update the sticker
		const updated = session.state.updateGuildSticker(stickerId, body)
		if (!updated) {
			return new Response(JSON.stringify({ message: 'Failed to update sticker', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Record action
		session.recordAction(
			'sticker_updated',
			{
				sticker_id: stickerId,
				guild_id: guildId,
				updates: body
			},
			{
				endpoint: `PATCH /guilds/${guildId}/stickers/${stickerId}`,
				method: 'PATCH'
			}
		)

		// Dispatch GUILD_STICKERS_UPDATE event
		await session.dispatchGuildStickersUpdate(guildId)

		return mockStickerToAPISticker(updated)
	}
)

export const DELETE = define(
	{
		summary: 'Delete guild sticker',
		description: 'Delete the given sticker',
		tags: ['Guild Stickers'],
		params: stickerParams,
		response: {
			204: z.undefined().describe('Sticker deleted successfully')
		}
	},
	async (request) => {
		const resolved = resolveSticker(request)
		if (resolved instanceof Response) return resolved
		const { session, guildId, stickerId } = resolved

		const deleted = session.state.deleteGuildSticker(stickerId)
		if (!deleted) {
			return new Response(JSON.stringify({ message: 'Failed to delete sticker', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Record action
		session.recordAction(
			'sticker_deleted',
			{
				sticker_id: stickerId,
				guild_id: guildId
			},
			{
				endpoint: `DELETE /guilds/${guildId}/stickers/${stickerId}`,
				method: 'DELETE'
			}
		)

		// Dispatch GUILD_STICKERS_UPDATE event
		await session.dispatchGuildStickersUpdate(guildId)

		return new Response(null, { status: 204 })
	}
)
