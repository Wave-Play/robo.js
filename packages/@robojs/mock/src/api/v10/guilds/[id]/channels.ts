import type { RoboRequest } from '@robojs/server'
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
export default async (request: RoboRequest) => {
	// Validate method
	if (request.method !== 'GET' && request.method !== 'POST' && request.method !== 'PATCH') {
		return new Response(JSON.stringify({ message: 'Method not allowed' }), {
			status: 405,
			headers: { 'Content-Type': 'application/json' }
		})
	}

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

	// POST - Create a new channel
	if (request.method === 'POST') {
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

	// PATCH - Modify channel positions (bulk update)
	if (request.method === 'PATCH') {
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

		// Return all channels for this guild
		const channels = []
		for (const channelId of guild.channels) {
			const channel = session.state.channels.get(channelId)
			if (channel) {
				channels.push(mockChannelToAPIChannel(channel))
			}
		}

		return channels
	}

	// GET - Get all channels for this guild
	const channels = []
	for (const channelId of guild.channels) {
		const channel = session.state.channels.get(channelId)
		if (channel) {
			channels.push(mockChannelToAPIChannel(channel))
		}
	}

	return channels
}
