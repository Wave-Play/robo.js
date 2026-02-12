import type { RoboRequest } from '@robojs/server'
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
export async function GET(request: RoboRequest) {
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
