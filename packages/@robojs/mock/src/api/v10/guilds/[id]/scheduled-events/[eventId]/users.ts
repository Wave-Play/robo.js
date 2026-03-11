import { define } from '@robojs/server'
import type { RoboRequest } from '@robojs/server'
import { z } from 'zod'
import { sessionManager } from '../../../../../../core/manager.js'
import { parseMockToken } from '../../../../../../utils/id.js'
import { mockUserToAPIUser } from '../../../../../../discord/payloads.js'

/**
 * GET /api/v10/guilds/:id/scheduled-events/:eventId/users - Get scheduled event users
 *
 * Returns a list of users subscribed to a scheduled event.
 *
 * Query parameters:
 * - limit: Max number of users to return (1-100, default 100)
 * - with_member: Include guild member data (default false)
 * - before: Get users before this user ID
 * - after: Get users after this user ID
 *
 * @see https://discord.com/developers/docs/resources/guild-scheduled-event#get-guild-scheduled-event-users
 */
export const GET = define(
	{
		summary: 'List scheduled event users',
		description: 'Get a list of guild scheduled event users',
		tags: ['Guild Scheduled Events'],
		params: z.object({
			id: z.string().describe('The guild ID (Snowflake)'),
			eventId: z.string().describe('The scheduled event ID (Snowflake)')
		}),
		query: z.object({
			with_member: z.string().optional(),
			limit: z.string().optional(),
			before: z.string().optional(),
			after: z.string().optional()
		}),
		response: {
			200: z.array(
				z
					.object({
						guild_scheduled_event_id: z.string(),
						user: z.object({}).passthrough(),
						member: z.object({}).passthrough().optional()
					})
					.passthrough()
			)
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

		// 2. Extract guild ID and event ID from params
		const { id: guildId, eventId } = request.params as { id: string; eventId: string }

		// 3. Validate guild exists
		const guild = session.state.guilds.get(guildId)
		if (!guild) {
			return new Response(JSON.stringify({ message: 'Unknown Guild', code: 10004 }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// 4. Get the scheduled event
		const event = session.state.getScheduledEvent(guildId, eventId)
		if (!event) {
			return new Response(JSON.stringify({ message: 'Unknown Scheduled Event', code: 10070 }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// 5. Parse query parameters
		const url = new URL(request.url)
		const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '100', 10), 1), 100)
		const withMember = url.searchParams.get('with_member') === 'true'
		const before = url.searchParams.get('before') || undefined
		const after = url.searchParams.get('after') || undefined

		// 6. Get subscribers (pagination is handled by the state method)
		const subscribers = session.state.getScheduledEventSubscribers(guildId, eventId, {
			limit,
			withMember,
			before,
			after
		})

		// 7. Build response
		const users = subscribers.map((subscriber) => {
			const response: {
				guild_scheduled_event_id: string
				user: ReturnType<typeof mockUserToAPIUser>
				member?: unknown
			} = {
				guild_scheduled_event_id: eventId,
				user: mockUserToAPIUser(subscriber.user)
			}

			// Include member data if requested and available
			if (withMember && subscriber.member) {
				response.member = {
					user: mockUserToAPIUser(subscriber.user),
					nick: subscriber.member.nick,
					avatar: subscriber.member.avatar,
					roles: subscriber.member.roles,
					joined_at: subscriber.member.joinedAt,
					premium_since: subscriber.member.premiumSince,
					deaf: subscriber.member.deaf,
					mute: subscriber.member.mute,
					flags: subscriber.member.flags,
					pending: subscriber.member.pending,
					communication_disabled_until: subscriber.member.communicationDisabledUntil
				}
			}

			return response
		})

		return users
	}
)
