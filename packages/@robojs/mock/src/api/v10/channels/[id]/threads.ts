import { define } from '@robojs/server'
import type { RoboRequest } from '@robojs/server'
import { z } from 'zod'
import type { Snowflake } from 'discord-api-types/v10'
import { sessionManager } from '../../../../core/manager.js'
import { parseMockToken } from '../../../../utils/id.js'
import { mockThreadToAPIChannel, mockForumThreadToAPIChannel } from '../../../../discord/payloads.js'
import type { MockForumChannel } from '../../../../types/index.js'

/**
 * POST /api/v10/channels/:id/threads - Create a thread in a channel
 *
 * Request body (regular threads):
 * {
 *   name: string,                          // Thread name (1-100 chars)
 *   auto_archive_duration?: 60|1440|4320|10080,  // Minutes until auto-archive
 *   type?: 10|11|12,                       // Thread type (default 11 for public)
 *   invitable?: boolean,                   // For private threads only
 *   rate_limit_per_user?: number           // Slowmode in seconds
 * }
 *
 * Request body (forum/media channel posts):
 * {
 *   name: string,                          // Post title (1-100 chars)
 *   auto_archive_duration?: 60|1440|4320|10080,
 *   rate_limit_per_user?: number,
 *   message: {                             // Required for forum/media channels
 *     content?: string,
 *     embeds?: object[],
 *     components?: object[],
 *     attachments?: object[]
 *   },
 *   applied_tags?: Snowflake[]             // Tags to apply (max 5)
 * }
 *
 * Response: APIChannel (thread) object
 */
export const POST = define(
	{
		summary: 'Create thread',
		description: 'Creates a new thread in a channel. For forum/media channels, a message body is required.',
		tags: ['Threads'],
		params: z.object({
			id: z.string().describe('The channel ID (Snowflake)')
		}),
		body: z
			.object({
				name: z.string().min(1).max(100),
				auto_archive_duration: z.union([z.literal(60), z.literal(1440), z.literal(4320), z.literal(10080)]).nullable().optional(),
				type: z.union([z.literal(10), z.literal(11), z.literal(12)]).nullable().optional(),
				invitable: z.boolean().optional(),
				rate_limit_per_user: z.number().int().min(0).max(21600).nullable().optional(),
				message: z.object({
					content: z.string().optional(),
					embeds: z.array(z.object({}).passthrough()).optional(),
					components: z.array(z.object({}).passthrough()).optional(),
					attachments: z.array(z.object({}).passthrough()).optional()
				}).passthrough().optional(),
				applied_tags: z.array(z.string()).nullable().optional()
			})
			.passthrough(),
		response: {
			201: z
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
					owner_id: z.string(),
					thread_metadata: z
						.object({
							archived: z.boolean(),
							archive_timestamp: z.string().nullable(),
							auto_archive_duration: z.number().int(),
							locked: z.boolean(),
							create_timestamp: z.string().optional(),
							invitable: z.boolean().optional()
						})
						.passthrough(),
					message_count: z.number().int(),
					member_count: z.number().int(),
					total_message_sent: z.number().int(),
					applied_tags: z.array(z.string()).optional(),
					member: z
						.object({
							id: z.string(),
							user_id: z.string(),
							join_timestamp: z.string(),
							flags: z.number().int(),
							member: z
								.object({
									avatar: z.string().nullable(),
									avatar_decoration_data: z.object({}).passthrough().nullable().optional(),
									banner: z.string().nullable(),
									communication_disabled_until: z.string().nullable(),
									flags: z.number().int(),
									joined_at: z.string(),
									nick: z.string().nullable(),
									pending: z.boolean(),
									premium_since: z.string().nullable(),
									roles: z.array(z.string()),
									collectibles: z.object({}).passthrough().nullable().optional(),
									user: z.object({}).passthrough(),
									mute: z.boolean(),
									deaf: z.boolean()
								})
								.passthrough()
								.optional()
						})
						.passthrough()
						.optional()
				})
				.passthrough()
		}
	},
	async (request) => {
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

	// 2. Extract channel ID from params
	const { id: channelId } = request.params as { id: string }

	// 3. Validate parent channel exists
	const channel = session.state.getChannel(channelId)
	if (!channel) {
		return new Response(JSON.stringify({ message: 'Unknown Channel', code: 10003 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 4. Validate channel type (must be text, announcement, forum, or media)
	const allowedTypes = [0, 5, 15, 16] // GUILD_TEXT, GUILD_ANNOUNCEMENT, GUILD_FORUM, GUILD_MEDIA
	if (!allowedTypes.includes(channel.type)) {
		return new Response(
			JSON.stringify({
				error: 'Cannot create thread in this channel type',
				code: 50024
			}),
			{
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			}
		)
	}

	// Check if this is a forum/media channel
	const isForumChannel = channel.type === 15 || channel.type === 16

	// 5. Parse thread creation payload
	let body: {
		name: string
		auto_archive_duration?: 60 | 1440 | 4320 | 10080
		type?: 10 | 11 | 12
		invitable?: boolean
		rate_limit_per_user?: number
		// Forum/media channel specific fields
		message?: {
			content?: string
			embeds?: unknown[]
			components?: unknown[]
			attachments?: unknown[]
		}
		applied_tags?: Snowflake[]
	}

	try {
		body = await request.json()
	} catch {
		return new Response(JSON.stringify({ message: 'Invalid JSON body' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 6. Validate required fields
	if (!body.name || typeof body.name !== 'string' || body.name.length < 1 || body.name.length > 100) {
		return new Response(
			JSON.stringify({
				error: 'Thread name must be between 1 and 100 characters',
				code: 50035
			}),
			{
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			}
		)
	}

	// 6b. For forum/media channels, message is required
	if (isForumChannel && !body.message) {
		return new Response(
			JSON.stringify({
				error: 'Message is required for forum posts',
				code: 50035
			}),
			{
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			}
		)
	}

	// 6c. Validate applied_tags for forum channels
	if (isForumChannel && body.applied_tags) {
		if (body.applied_tags.length > 5) {
			return new Response(
				JSON.stringify({
					error: 'Cannot apply more than 5 tags to a forum post',
					code: 50035
				}),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				}
			)
		}

		// Validate tags exist in forum channel
		const forumChannel = channel as MockForumChannel
		const validTagIds = new Set(forumChannel.available_tags.map((t) => t.id))
		for (const tagId of body.applied_tags) {
			if (!validTagIds.has(tagId)) {
				return new Response(
					JSON.stringify({
						error: `Invalid tag ID: ${tagId}`,
						code: 50035
					}),
					{
						status: 400,
						headers: { 'Content-Type': 'application/json' }
					}
				)
			}
		}
	}

	// 7. Handle forum/media channel posts differently
	if (isForumChannel) {
		// Create forum post with initial message
		const { thread, message } = session.state.createForumPost({
			name: body.name,
			parentId: channelId,
			ownerId: session.state.botUser.id,
			autoArchiveDuration: body.auto_archive_duration,
			rateLimitPerUser: body.rate_limit_per_user,
			applied_tags: body.applied_tags,
			message: body.message!
		})

		// Record as 'thread_created' action
		session.recordAction(
			'thread_created',
			{
				thread_id: thread.id,
				parent_id: channelId,
				name: thread.name,
				type: thread.type,
				applied_tags: thread.applied_tags,
				initial_message_id: message.id
			},
			{
				endpoint: `POST /channels/${channelId}/threads`,
				method: 'POST'
			}
		)

		// Return forum thread as APIChannel with applied_tags
		return mockForumThreadToAPIChannel(thread, message, session.state.botUser)
	}

	// 8. Regular thread creation (text/announcement channels)
	const threadType = body.type ?? (channel.type === 5 ? 10 : 11)

	const thread = session.state.createThread({
		name: body.name,
		type: threadType,
		parentId: channelId,
		ownerId: session.state.botUser.id,
		autoArchiveDuration: body.auto_archive_duration,
		invitable: body.invitable,
		rateLimitPerUser: body.rate_limit_per_user
	})

	// 9. Record as 'thread_created' action
	session.recordAction(
		'thread_created',
		{
			thread_id: thread.id,
			parent_id: channelId,
			name: thread.name,
			type: thread.type
		},
		{
			endpoint: `POST /channels/${channelId}/threads`,
			method: 'POST'
		}
	)

	// 10. Return thread as APIChannel (include member since creator is automatically added)
	const botMember = session.state.getThreadMember(thread.id, session.state.botUser.id)
	return mockThreadToAPIChannel(thread, botMember ?? undefined)
})
