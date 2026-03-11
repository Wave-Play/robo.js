import { define } from '@robojs/server'
import type { RoboRequest } from '@robojs/server'
import { z } from 'zod'
import { sessionManager } from '../../../../../core/manager.js'
import { parseMockToken } from '../../../../../utils/id.js'
import { mockThreadToAPIChannel } from '../../../../../discord/payloads.js'

/**
 * GET /api/v10/guilds/:id/threads/active - Get all active threads in a guild
 *
 * Response:
 * {
 *   threads: APIChannel[],   // Array of active thread channels
 *   members: ThreadMember[], // Bot's membership in each thread
 *   has_more: boolean        // Whether there are more threads
 * }
 */
export const GET = define(
	{
		summary: 'Get active threads',
		description: 'Returns all active threads in the guild, including public and private threads',
		tags: ['Threads'],
		params: z.object({
			id: z.string().describe('The guild ID (Snowflake)')
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

		// 4. Get all active (non-archived) threads in the guild
		const threads = session.state.getActiveThreadsForGuild(guildId)

		// 5. Get bot's membership in each thread
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

		// 6. Return response (include member field in each thread if bot is a member)
		return {
			threads: threads.map((thread) => {
				const botMember = session.state.getThreadMember(thread.id, session.state.botUser.id)
				return mockThreadToAPIChannel(thread, botMember ?? undefined)
			}),
			members,
			has_more: false // We return all threads at once in mock
		}
	}
)
