import { define } from '@robojs/server'
import { z } from 'zod'
import { sessionManager } from '../../../../../../core/manager.js'
import { parseMockToken } from '../../../../../../utils/id.js'
import { mockThreadToAPIChannel } from '../../../../../../discord/payloads.js'

/**
 * POST /api/v10/channels/:id/messages/:messageId/threads - Create a thread from a message
 *
 * Request body:
 * {
 *   name: string,                          // Thread name (1-100 chars)
 *   auto_archive_duration?: 60|1440|4320|10080,  // Minutes until auto-archive
 *   rate_limit_per_user?: number           // Slowmode in seconds
 * }
 *
 * Response: APIChannel (thread) object
 */
export const POST = define(
	{
		summary: 'Create thread from message',
		description: 'Creates a new thread from an existing message',
		tags: ['Threads'],
		params: z.object({
			id: z.string().describe('The channel ID (Snowflake)'),
			messageId: z.string().describe('The message ID (Snowflake)')
		}),
		body: z
			.object({
				name: z.string().min(1).max(100),
				auto_archive_duration: z.union([z.literal(60), z.literal(1440), z.literal(4320), z.literal(10080)]).nullable().optional(),
				rate_limit_per_user: z.number().int().min(0).max(21600).nullable().optional()
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
							member: z.object({}).passthrough().optional()
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

	// 2. Extract params
	const { id: channelId, messageId } = request.params as { id: string; messageId: string }

	// 3. Validate parent channel exists
	const channel = session.state.getChannel(channelId)
	if (!channel) {
		return new Response(JSON.stringify({ message: 'Unknown Channel', code: 10003 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 4. Validate message exists
	const message = session.state.getMessage(messageId)
	if (!message) {
		return new Response(JSON.stringify({ message: 'Unknown Message', code: 10008 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 5. Validate message is in the specified channel
	if (message.channelId !== channelId) {
		return new Response(JSON.stringify({ message: 'Unknown Message', code: 10008 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 6. Validate channel type (must be text or announcement)
	if (channel.type !== 0 && channel.type !== 5) {
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

	// 7. Parse thread creation payload
	let body: {
		name: string
		auto_archive_duration?: 60 | 1440 | 4320 | 10080
		rate_limit_per_user?: number
	}

	try {
		body = await request.json()
	} catch {
		return new Response(JSON.stringify({ message: 'Invalid JSON body' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 8. Validate required fields
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

	// 9. Determine thread type (public thread or announcement thread based on parent)
	const threadType = channel.type === 5 ? 10 : 11

	// 10. Create thread in state
	const thread = session.state.createThread({
		name: body.name,
		type: threadType,
		parentId: channelId,
		ownerId: session.state.botUser.id,
		autoArchiveDuration: body.auto_archive_duration,
		rateLimitPerUser: body.rate_limit_per_user
	})

	// 11. Record as 'thread_created' action
	session.recordAction(
		'thread_created',
		{
			thread_id: thread.id,
			parent_id: channelId,
			message_id: messageId,
			name: thread.name,
			type: thread.type
		},
		{
			endpoint: `POST /channels/${channelId}/messages/${messageId}/threads`,
			method: 'POST'
		}
	)

	// 12. Return thread as APIChannel (include member since creator is automatically added)
	const botMember = session.state.getThreadMember(thread.id, session.state.botUser.id)
	return mockThreadToAPIChannel(thread, botMember ?? undefined)
})
