import type { RoboRequest } from '@robojs/server'
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
export default async (request: RoboRequest) => {
	// 1. Validate GET method
	if (request.method !== 'GET') {
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

	// 4. Validate parent channel exists
	const channel = session.state.getChannel(channelId)
	if (!channel) {
		return new Response(JSON.stringify({ message: 'Unknown Channel', code: 10003 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 5. Parse query params
	const url = new URL(request.url)
	const before = url.searchParams.get('before')
	const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100)

	// 6. Get archived private threads for this channel that the bot is a member of
	let threads = session.state
		.getThreadsForChannel(channelId, { archived: true })
		.filter((t) => t.type === 12) // PrivateThread = 12
		.filter((t) => session.state.getThreadMember(t.id, session.state.botUser.id))

	// 7. Apply timestamp filter
	if (before) {
		const beforeDate = new Date(before)
		threads = threads.filter((t) => new Date(t.threadMetadata.archive_timestamp) < beforeDate)
	}

	// 8. Sort by archive timestamp (newest first)
	threads.sort(
		(a, b) =>
			new Date(b.threadMetadata.archive_timestamp).getTime() - new Date(a.threadMetadata.archive_timestamp).getTime()
	)

	// 9. Check if there are more
	const hasMore = threads.length > limit

	// 10. Apply limit
	threads = threads.slice(0, limit)

	// 11. Get bot's membership in each thread
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

	// 12. Return response
	return {
		threads: threads.map((thread) => {
			const botMember = session.state.getThreadMember(thread.id, session.state.botUser.id)
			return mockThreadToAPIChannel(thread, botMember ?? undefined)
		}),
		members,
		has_more: hasMore
	}
}
