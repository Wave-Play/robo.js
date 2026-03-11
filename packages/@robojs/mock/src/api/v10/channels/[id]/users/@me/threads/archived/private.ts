import { define } from '@robojs/server'
import type { RoboRequest } from '@robojs/server'
import { z } from 'zod'
import { sessionManager } from '../../../../../../../../core/manager.js'
import { parseMockToken } from '../../../../../../../../utils/id.js'
import { mockThreadToAPIChannel } from '../../../../../../../../discord/payloads.js'

/**
 * GET /api/v10/channels/:id/users/@me/threads/archived/private
 *
 * Gets all private archived threads in a channel that the current user has joined.
 *
 * Query params:
 * - before?: ISO8601 timestamp - Get threads archived before this timestamp
 * - limit?: number - Max threads to return (1-100, default 50)
 *
 * Response:
 * {
 *   threads: APIChannel[],   // Array of archived thread channels
 *   members: ThreadMember[], // Bot's membership in each thread
 *   has_more: boolean        // Whether there are more threads
 * }
 */
export const GET = define(
	{
		summary: 'List joined private archived threads',
		description: 'Returns archived threads in the channel that are private, and the current user has joined.',
		tags: ['Threads'],
		params: z.object({
			id: z.string().describe('The channel ID (Snowflake)')
		}),
		query: z.object({
			before: z.string().optional().describe('Returns threads with IDs before this snowflake'),
			limit: z.string().optional().describe('Maximum number of threads to return (2-100)')
		}),
		response: {
			200: z
				.object({
					threads: z.array(
						z
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
					),
					members: z.array(
						z
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
					),
					has_more: z.boolean(),
					first_messages: z.array(z.object({}).passthrough()).optional()
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

	// 4. Parse query params
	const url = new URL(request.url)
	const before = url.searchParams.get('before')
	const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100)

	// 5. Get archived private threads for this channel that the bot is a member of
	let threads = session.state
		.getThreadsForChannel(channelId, { archived: true })
		.filter((t) => t.type === 12) // PrivateThread = 12
		.filter((t) => session.state.getThreadMember(t.id, session.state.botUser.id))

	// 6. Apply timestamp filter
	if (before) {
		const beforeDate = new Date(before)
		threads = threads.filter((t) => new Date(t.threadMetadata.archive_timestamp) < beforeDate)
	}

	// 7. Sort by archive timestamp (newest first)
	threads.sort(
		(a, b) =>
			new Date(b.threadMetadata.archive_timestamp).getTime() - new Date(a.threadMetadata.archive_timestamp).getTime()
	)

	// 8. Check if there are more
	const hasMore = threads.length > limit

	// 9. Apply limit
	threads = threads.slice(0, limit)

	// 10. Get bot's membership in each thread
	const members = threads
		.map((thread) => {
			const member = session.state.getThreadMember(thread.id, session.state.botUser.id)
			if (member) {
				return {
					id: thread.id,
					user_id: session.state.botUser.id,
					join_timestamp: member.join_timestamp,
					flags: member.flags
				}
			}
			return null
		})
		.filter((m) => m !== null)

	// 11. Return response
	return {
		threads: threads.map((thread) => {
			const botMember = session.state.getThreadMember(thread.id, session.state.botUser.id)
			return mockThreadToAPIChannel(thread, botMember ?? undefined)
		}),
		members,
		has_more: hasMore
	}
})
