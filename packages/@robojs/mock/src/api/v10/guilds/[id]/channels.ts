import { define } from '@robojs/server'
import type { RoboRequest } from '@robojs/server'
import { z } from 'zod'
import { ChannelType } from 'discord-api-types/v10'
import { sessionManager } from '../../../../core/manager.js'
import { parseMockToken } from '../../../../utils/id.js'
import { createMockChannel } from '../../../../session/state.js'
import { mockChannelToAPIChannel } from '../../../../discord/payloads.js'
import { getStageServer } from '../../../../core/stage.js'
import { enforcePermissions } from '../../../../utils/permission-check.js'

/**
 * GET /api/v10/guilds/:id/channels - Fetch guild channels
 * POST /api/v10/guilds/:id/channels - Create a channel in the guild
 * PATCH /api/v10/guilds/:id/channels - Modify channel positions (bulk update)
 *
 * Returns an array of channel objects for the guild (GET, PATCH)
 * or a single channel object (POST).
 */
function resolveGuild(request: RoboRequest) {
	// Extract session from Authorization header
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

	const { id: guildId } = request.params as { id: string }
	const guild = session.state.guilds.get(guildId)

	if (!guild) {
		return new Response(JSON.stringify({ message: 'Unknown Guild', code: 10004 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	return { session, guild, guildId }
}

const GuildChannelResponseSchema = z
	.object({
		id: z.string(),
		type: z.number().int(),
		last_message_id: z.string().nullable().optional(),
		flags: z.number().int(),
		last_pin_timestamp: z.string().nullable().optional(),
		guild_id: z.string(),
		name: z.string(),
		parent_id: z.string().nullable().optional(),
		rate_limit_per_user: z.number().int().optional(),
		bitrate: z.number().int().optional(),
		user_limit: z.number().int().optional(),
		rtc_region: z.string().nullable().optional(),
		video_quality_mode: z.number().int().optional(),
		permissions: z.string().nullable().optional(),
		topic: z.string().nullable().optional(),
		default_auto_archive_duration: z.number().int().optional(),
		default_thread_rate_limit_per_user: z.number().int().optional(),
		position: z.number().int(),
		permission_overwrites: z.array(z.object({}).passthrough()).optional(),
		nsfw: z.boolean().optional(),
		available_tags: z.array(z.object({}).passthrough()).optional(),
		default_reaction_emoji: z.object({}).passthrough().nullable().optional(),
		default_sort_order: z.number().int().nullable().optional(),
		default_forum_layout: z.number().int().nullable().optional(),
		default_tag_setting: z.number().int().nullable().optional(),
		hd_streaming_until: z.string().optional(),
		hd_streaming_buyer_id: z.string().optional()
	})
	.passthrough()

export const GET = define(
	{
		summary: 'List guild channels',
		description: 'Returns a list of guild channel objects',
		tags: ['Guilds'],
		params: z.object({
			id: z.string().describe('The guild ID (Snowflake)')
		}),
		response: {
			200: z.array(GuildChannelResponseSchema).nullable()
		}
	},
	async (request) => {
		const resolved = resolveGuild(request)
		if (resolved instanceof Response) return resolved
		const { session, guild } = resolved

		const channels = []
		for (const channelId of guild.channels) {
			const channel = session.state.channels.get(channelId)
			if (channel) {
				channels.push(mockChannelToAPIChannel(channel))
			}
		}

		return channels
	}
)

export const POST = define(
	{
		summary: 'Create guild channel',
		description: 'Create a new channel object for the guild',
		tags: ['Guilds'],
		params: z.object({
			id: z.string().describe('The guild ID (Snowflake)')
		}),
		body: z
			.object({
				name: z.string().min(1).max(100),
				type: z.number().int().nullable().optional(),
				position: z.number().int().min(0).nullable().optional(),
				topic: z.string().max(4096).nullable().optional(),
				bitrate: z.number().int().min(8000).nullable().optional(),
				user_limit: z.number().int().min(0).nullable().optional(),
				nsfw: z.boolean().nullable().optional(),
				rate_limit_per_user: z.number().int().min(0).max(21600).nullable().optional(),
				parent_id: z.string().nullable().optional(),
				permission_overwrites: z.array(z.object({}).passthrough()).nullable().optional(),
				rtc_region: z.string().nullable().optional(),
				video_quality_mode: z.number().int().nullable().optional(),
				default_auto_archive_duration: z.number().int().nullable().optional(),
				default_reaction_emoji: z.object({}).passthrough().nullable().optional(),
				default_thread_rate_limit_per_user: z.number().int().min(0).max(21600).nullable().optional(),
				default_sort_order: z.number().int().nullable().optional(),
				default_forum_layout: z.number().int().nullable().optional(),
				default_tag_setting: z.number().int().nullable().optional(),
				available_tags: z.array(z.object({}).passthrough()).nullable().optional()
			})
			.passthrough(),
		response: {
			201: GuildChannelResponseSchema
		}
	},
	async (request) => {
		const resolved = resolveGuild(request)
		if (resolved instanceof Response) return resolved
		const { session, guildId } = resolved

		// Check permissions
		const permError = enforcePermissions(session, 'POST', `/guilds/${guildId}/channels`, undefined, guildId)
		if (permError) return permError

		let body: {
			name: string
			type?: number
			topic?: string
			bitrate?: number
			user_limit?: number
			rate_limit_per_user?: number
			position?: number
			permission_overwrites?: Array<{ id: string; type: number; allow?: string; deny?: string }>
			parent_id?: string | null
			nsfw?: boolean
		}

		try {
			body = await request.json()
		} catch {
			return new Response(JSON.stringify({ message: 'Invalid JSON body' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Validate name
		if (!body.name || typeof body.name !== 'string' || body.name.length < 1 || body.name.length > 100) {
			return new Response(
				JSON.stringify({ message: 'Channel name must be between 1 and 100 characters', code: 50035 }),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				}
			)
		}

		// Create channel
		const channelType = body.type ?? ChannelType.GuildText
		const channel = createMockChannel({
			guildId,
			name: body.name,
			type: channelType,
			parentId: body.parent_id ?? null
		})

		// Set additional properties
		if (body.topic !== undefined && channelType === ChannelType.GuildText) {
			channel.topic = body.topic
		}
		if (body.bitrate !== undefined && channelType === ChannelType.GuildVoice) {
			channel.bitrate = body.bitrate
		}
		if (body.user_limit !== undefined && channelType === ChannelType.GuildVoice) {
			channel.userLimit = body.user_limit
		}
		if (body.rate_limit_per_user !== undefined) {
			channel.rateLimitPerUser = body.rate_limit_per_user
		}
		if (body.nsfw !== undefined) {
			channel.nsfw = body.nsfw
		}
		if (body.permission_overwrites) {
			channel.permissionOverwrites = body.permission_overwrites.map((ow) => ({
				id: ow.id,
				type: ow.type,
				allow: ow.allow ?? '0',
				deny: ow.deny ?? '0'
			}))
		}

		// Initialize forum-specific properties for forum/media channels (type 15 or 16)
		if (channelType === ChannelType.GuildForum || channelType === 16) {
			// Cast to add forum properties
			const forumChannel = channel as typeof channel & {
				available_tags: Array<{ id: string; name: string; moderated: boolean; emoji_id: string | null; emoji_name: string | null }>
				default_auto_archive_duration?: number
				default_thread_rate_limit_per_user?: number
				default_sort_order?: number | null
				default_forum_layout?: number
				default_reaction_emoji?: { emoji_id: string | null; emoji_name: string | null } | null
			}
			forumChannel.available_tags = []
			forumChannel.default_auto_archive_duration = 4320 // 3 days default
			forumChannel.default_thread_rate_limit_per_user = 0
			forumChannel.default_sort_order = null
			forumChannel.default_forum_layout = 0
			forumChannel.default_reaction_emoji = null
		}

		// Add to state
		session.state.addChannelToGuild(guildId, channel)

		// Record action
		session.recordAction(
			'channel_created',
			{
				channel_id: channel.id,
				guild_id: guildId,
				name: channel.name,
				type: channel.type
			},
			{
				endpoint: `POST /guilds/${guildId}/channels`,
				method: 'POST'
			}
		)

		// Dispatch CHANNEL_CREATE event (uses session.dispatch to reach both gateway and stage)
		const apiChannel = mockChannelToAPIChannel(channel)
		await session.dispatch('CHANNEL_CREATE', apiChannel)

		// Return the channel object directly (Robo.js server will serialize it)
		return apiChannel
	}
)

export const PATCH = define(
	{
		summary: 'Bulk update guild channels',
		description: 'Modify the positions of a set of channel objects for the guild',
		tags: ['Guilds'],
		params: z.object({
			id: z.string().describe('The guild ID (Snowflake)')
		}),
		body: z.array(
			z.object({
				id: z.string().nullable().optional(),
				position: z.number().int().min(0).nullable().optional(),
				parent_id: z.string().nullable().optional(),
				lock_permissions: z.boolean().nullable().optional()
			})
		),
		response: {
			204: z.undefined()
		}
	},
	async (request) => {
		const resolved = resolveGuild(request)
		if (resolved instanceof Response) return resolved
		const { session, _guild, guildId } = resolved

		// Check permissions
		const permError = enforcePermissions(session, 'PATCH', `/guilds/${guildId}/channels`, undefined, guildId)
		if (permError) return permError

		let body: Array<{
			id: string
			position?: number | null
			lock_permissions?: boolean | null
			parent_id?: string | null
		}>

		try {
			body = await request.json()
		} catch {
			return new Response(JSON.stringify({ message: 'Invalid JSON body' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		if (!Array.isArray(body)) {
			return new Response(JSON.stringify({ message: 'Body must be an array' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Update each channel's position and/or parent
		for (const update of body) {
			const channel = session.state.channels.get(update.id)
			if (channel && channel.guildId === guildId) {
				if (update.position !== undefined && update.position !== null) {
					channel.position = update.position
				}
				if (update.parent_id !== undefined) {
					channel.parentId = update.parent_id
				}

				// Dispatch CHANNEL_UPDATE for each updated channel (uses session.dispatch to reach both gateway and stage)
				const apiChannel = mockChannelToAPIChannel(channel)
				await session.dispatch('CHANNEL_UPDATE', apiChannel)
			}
		}

		// Record action
		session.recordAction(
			'channels_positions_updated',
			{
				guild_id: guildId,
				updates: body
			},
			{
				endpoint: `PATCH /guilds/${guildId}/channels`,
				method: 'PATCH'
			}
		)

		// Broadcast control action for toast notification
		const stageServer = getStageServer()
		stageServer.broadcastControlAction(
			session.id,
			'channel_reorder',
			'Channels were reordered',
			'success',
			{ type: 'user', name: 'Stage UI' }
		)

		// Discord returns 204 No Content for bulk channel position updates
		return new Response(null, { status: 204 })
	}
)
