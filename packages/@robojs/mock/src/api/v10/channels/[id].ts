import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../core/manager.js'
import { parseMockToken } from '../../../utils/id.js'
import { mockThreadToAPIChannel, mockChannelToAPIChannel } from '../../../discord/payloads.js'
import { enforcePermissions } from '../../../utils/permission-check.js'
import { getGatewayServer } from '../../../core/gateway.js'

/**
 * Channel endpoint - handles GET, PATCH and DELETE for channels (including threads)
 *
 * GET    /api/v10/channels/:id    - Fetch a channel
 * PATCH  /api/v10/channels/:id    - Modify a channel/thread
 * DELETE /api/v10/channels/:id    - Delete a channel/thread
 *
 * For threads (types 10, 11, 12), this endpoint supports:
 * - PATCH: name, archived, auto_archive_duration, locked, invitable, rate_limit_per_user
 * - DELETE: Remove the thread entirely
 */
export default async (request: RoboRequest) => {
	// 1. Validate method
	if (request.method !== 'GET' && request.method !== 'PATCH' && request.method !== 'DELETE') {
		return new Response(JSON.stringify({ message: 'Method not allowed' }), {
			status: 405,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 2. Parse Authorization header → get session
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

	// 3. Extract channel ID from params
	const { id: channelId } = request.params as { id: string }

	// 4. Validate channel exists
	const channel = session.state.getChannel(channelId)
	if (!channel) {
		return new Response(JSON.stringify({ message: 'Unknown Channel', code: 10003 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 4b. Check permissions
	const permError = enforcePermissions(
		session,
		request.method,
		`/channels/${channelId}`,
		channelId
	)
	if (permError) return permError

	// Check if this is a thread
	const isThread = channel.type === 10 || channel.type === 11 || channel.type === 12

	// GET - return channel representation
	if (request.method === 'GET') {
		if (isThread) {
			const botMember = session.state.getThreadMember(channelId, session.state.botUser.id)
			return mockThreadToAPIChannel(channel as any, botMember ?? undefined)
		}
		return mockChannelToAPIChannel(channel)
	}

	if (request.method === 'DELETE') {
		// 5a. DELETE - Remove channel/thread
		if (isThread) {
			const deleted = session.state.deleteThread(channelId)
			if (!deleted) {
				return new Response(JSON.stringify({ message: 'Failed to delete thread', code: 50001 }), {
					status: 500,
					headers: { 'Content-Type': 'application/json' }
				})
			}

			// Record action
			session.recordAction(
				'thread_deleted',
				{
					thread_id: channelId,
					parent_id: channel.parentId,
					type: channel.type
				},
				{
					endpoint: `DELETE /channels/${channelId}`,
					method: 'DELETE'
				}
			)
		} else {
			// Regular channel deletion
			const deleted = session.state.removeChannel(channelId)
			if (!deleted) {
				return new Response(JSON.stringify({ message: 'Failed to delete channel', code: 50001 }), {
					status: 500,
					headers: { 'Content-Type': 'application/json' }
				})
			}

			// Record action
			session.recordAction(
				'channel_deleted',
				{
					channel_id: channelId,
					guild_id: channel.guildId,
					type: channel.type
				},
				{
					endpoint: `DELETE /channels/${channelId}`,
					method: 'DELETE'
				}
			)
		}

		// Dispatch CHANNEL_DELETE event
		if (isThread) {
			const apiChannel = mockThreadToAPIChannel(channel as any)
			getGatewayServer().dispatchToSession(session.id, 'CHANNEL_DELETE', apiChannel, channel.guildId)
			return apiChannel
		} else {
			const apiChannel = mockChannelToAPIChannel(channel)
			getGatewayServer().dispatchToSession(session.id, 'CHANNEL_DELETE', apiChannel, channel.guildId)
			return apiChannel
		}
	}

	// 5b. PATCH - Modify channel/thread
	let body: {
		name?: string
		archived?: boolean
		auto_archive_duration?: 60 | 1440 | 4320 | 10080
		locked?: boolean
		invitable?: boolean
		rate_limit_per_user?: number
		// Regular channel fields
		topic?: string
		nsfw?: boolean
		position?: number
		parent_id?: string | null
		permission_overwrites?: Array<{ id: string; type: number; allow: string; deny: string }>
		bitrate?: number
		user_limit?: number
		// Voice channel fields
		rtc_region?: string | null
		video_quality_mode?: number | null
		// Text channel fields
		default_auto_archive_duration?: number
	}

	try {
		body = await request.json()
	} catch {
		return new Response(JSON.stringify({ message: 'Invalid JSON body' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	if (isThread) {
		// Update thread
		const thread = session.state.updateThread(channelId, {
			name: body.name,
			archived: body.archived,
			auto_archive_duration: body.auto_archive_duration,
			locked: body.locked,
			invitable: body.invitable,
			rateLimitPerUser: body.rate_limit_per_user
		})

		if (!thread) {
			return new Response(JSON.stringify({ message: 'Failed to update thread', code: 50001 }), {
				status: 500,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Record action
		session.recordAction(
			'thread_updated',
			{
				thread_id: channelId,
				updates: body
			},
			{
				endpoint: `PATCH /channels/${channelId}`,
				method: 'PATCH'
			}
		)

		// Dispatch THREAD_UPDATE event
		const botMember = session.state.getThreadMember(channelId, session.state.botUser.id)
		const apiChannel = mockThreadToAPIChannel(thread, botMember ?? undefined)
		getGatewayServer().dispatchToSession(session.id, 'THREAD_UPDATE', apiChannel, thread.guildId)

		return apiChannel
	} else {
		// Update regular channel (basic implementation)
		if (body.name !== undefined) {
			channel.name = body.name
		}

		// Update additional channel properties
		if (body.topic !== undefined && channel.type === 0) {
			channel.topic = body.topic
		}
		if (body.nsfw !== undefined) {
			channel.nsfw = body.nsfw
		}
		if (body.rate_limit_per_user !== undefined) {
			channel.rateLimitPerUser = body.rate_limit_per_user
		}
		if (body.bitrate !== undefined && channel.type === 2) {
			channel.bitrate = body.bitrate
		}
		if (body.user_limit !== undefined && channel.type === 2) {
			channel.userLimit = body.user_limit
		}
		// Voice channel specific fields
		if (body.rtc_region !== undefined && channel.type === 2) {
			channel.rtcRegion = body.rtc_region
		}
		if (body.video_quality_mode !== undefined && channel.type === 2) {
			channel.videoQualityMode = body.video_quality_mode
		}
		// Position and parent (all channel types)
		if (body.position !== undefined) {
			channel.position = body.position
		}
		if (body.parent_id !== undefined) {
			channel.parentId = body.parent_id
		}
		// Text channel specific fields
		if (body.default_auto_archive_duration !== undefined && channel.type === 0) {
			channel.defaultAutoArchiveDuration = body.default_auto_archive_duration
		}

		// Handle permission_overwrites (for lockPermissions and direct updates)
		if (body.permission_overwrites !== undefined) {
			channel.permissionOverwrites = body.permission_overwrites.map((ow) => ({
				id: ow.id,
				type: ow.type,
				allow: ow.allow,
				deny: ow.deny
			}))
		}

		// Record action
		session.recordAction(
			'channel_updated',
			{
				channel_id: channelId,
				updates: body
			},
			{
				endpoint: `PATCH /channels/${channelId}`,
				method: 'PATCH'
			}
		)

		// Dispatch CHANNEL_UPDATE event
		const apiChannel = mockChannelToAPIChannel(channel)
		getGatewayServer().dispatchToSession(session.id, 'CHANNEL_UPDATE', apiChannel, channel.guildId)

		return apiChannel
	}
}
