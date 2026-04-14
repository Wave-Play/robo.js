import { define } from '@robojs/server'
import { z } from 'zod'
import { sessionManager } from '../../../../../../../core/manager.js'
import { parseMockToken } from '../../../../../../../utils/id.js'
import { mockUserToAPIUser } from '../../../../../../../discord/payloads.js'

/**
 * GET /api/v10/channels/:id/polls/:messageId/answers/:answerId
 *
 * Get users who voted for a specific poll answer
 * Returns: { users: APIUser[] }
 */
export const GET = define(
	{
		summary: 'Get answer voters',
		description: 'Get a list of users that voted for the specified answer in a poll',
		tags: ['Polls'],
		params: z.object({
			id: z.string().describe('The channel ID (Snowflake)'),
			messageId: z.string().describe('The message ID (Snowflake)'),
			answerId: z.string().describe('The answer ID (integer)')
		}),
		query: z.object({
			after: z.string().optional().describe('Get users after this user ID (Snowflake)'),
			limit: z.string().optional().describe('Max number of users to return (1-100)')
		}),
		response: {
			200: z
				.object({
					users: z.array(
						z
							.object({
								id: z.string(),
								username: z.string(),
								avatar: z.string().nullable(),
								discriminator: z.string(),
								public_flags: z.number().int(),
								flags: z.number().int(),
								global_name: z.string().nullable(),
								primary_guild: z.object({}).passthrough().nullable(),
								bot: z.boolean().optional(),
								system: z.boolean().optional(),
								banner: z.string().nullable().optional(),
								accent_color: z.number().int().nullable().optional(),
								avatar_decoration_data: z.object({}).passthrough().nullable().optional(),
								collectibles: z.object({}).passthrough().nullable().optional()
							})
							.passthrough()
					)
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
	const { id: channelId, messageId, answerId: answerIdStr } = request.params as {
		id: string
		messageId: string
		answerId: string
	}

	const answerId = parseInt(answerIdStr, 10)
	if (isNaN(answerId)) {
		return new Response(JSON.stringify({ message: 'Invalid answer ID', code: 50035 }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 3. Validate channel exists
	const channel = session.state.getChannel(channelId)
	if (!channel) {
		return new Response(JSON.stringify({ message: 'Unknown Channel', code: 10003 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 4. Validate message exists and has poll
	const message = session.state.getMessage(messageId)
	if (!message) {
		return new Response(JSON.stringify({ message: 'Unknown Message', code: 10008 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	if (message.channelId !== channelId) {
		return new Response(JSON.stringify({ message: 'Unknown Message', code: 10008 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	if (!message.poll) {
		return new Response(JSON.stringify({ message: 'Message has no poll', code: 50035 }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 5. Validate answer exists
	const answerExists = message.poll.answers.some((a) => a.answer_id === answerId)
	if (!answerExists) {
		return new Response(JSON.stringify({ message: 'Invalid answer ID', code: 50035 }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 6. Parse pagination query params
	const url = new URL(request.url)
	const limit = Math.min(parseInt(url.searchParams.get('limit') || '25', 10), 100)
	const after = url.searchParams.get('after')

	// 7. Get voters for this answer
	let voterIds = session.state.getPollVoters(messageId, answerId)

	// Apply pagination
	if (after) {
		const afterIndex = voterIds.indexOf(after)
		if (afterIndex !== -1) {
			voterIds = voterIds.slice(afterIndex + 1)
		}
	}
	voterIds = voterIds.slice(0, limit)

	// 8. Convert to API user objects
	const users = voterIds
		.map((userId) => {
			const user = session.state.users.get(userId)
			return user ? mockUserToAPIUser(user) : null
		})
		.filter((u): u is NonNullable<typeof u> => u !== null)

	// 9. Record action (use session.recordAction for metadata propagation)
	session.recordAction(
		'poll_voters_fetched',
		{
			message_id: messageId,
			channel_id: channelId,
			answer_id: answerId,
			voter_count: users.length
		},
		{
			endpoint: `GET /channels/${channelId}/polls/${messageId}/answers/${answerId}`,
			method: 'GET'
		}
	)

	// 10. Return response
	return new Response(JSON.stringify({ users }), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	})
})
