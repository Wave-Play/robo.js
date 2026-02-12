import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../core/manager.js'
import { parseMockToken } from '../../../../utils/id.js'

/**
 * GET /api/v10/users/@me/guilds - Get Current User Guilds
 *
 * Returns a list of partial guild objects the current user is a member of.
 * For bots, this returns all guilds the bot is in.
 *
 * Query params:
 * - before: Snowflake - get guilds before this guild ID
 * - after: Snowflake - get guilds after this guild ID
 * - limit: number - max number of guilds to return (1-200, default 200)
 * - with_counts: boolean - include approximate member and presence counts
 *
 * @see https://discord.com/developers/docs/resources/user#get-current-user-guilds
 */
export default async (request: RoboRequest) => {
	if (request.method !== 'GET') {
		return new Response(JSON.stringify({ message: 'Method not allowed' }), {
			status: 405,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Get token from Authorization header
	const authHeader = request.headers.get('Authorization') || ''
	const sessionId = parseMockToken(authHeader)

	if (!sessionId) {
		return new Response(JSON.stringify({ message: 'Unauthorized', code: 0 }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Get session
	const session = sessionManager.get(sessionId)
	if (!session) {
		return new Response(JSON.stringify({ message: 'Unauthorized', code: 0 }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Parse query params
	const url = new URL(request.url)
	const before = url.searchParams.get('before')
	const after = url.searchParams.get('after')
	const limitParam = url.searchParams.get('limit')
	const withCounts = url.searchParams.get('with_counts') === 'true'

	// Default limit is 200, max is 200
	let limit = 200
	if (limitParam) {
		limit = Math.min(200, Math.max(1, parseInt(limitParam, 10) || 200))
	}

	// Get all guilds from state
	let guilds = Array.from(session.state.guilds.values())

	// Sort by ID for consistent pagination
	guilds.sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1))

	// Apply before/after filters
	if (before) {
		guilds = guilds.filter((g) => BigInt(g.id) < BigInt(before))
	}
	if (after) {
		guilds = guilds.filter((g) => BigInt(g.id) > BigInt(after))
	}

	// Apply limit
	guilds = guilds.slice(0, limit)

	// Map to partial guild objects
	const botUser = session.state.botUser
	return guilds.map((guild) => {
		const isOwner = guild.ownerId === botUser.id

		// Calculate permissions - for simplicity, give Administrator if owner
		// Otherwise, calculate from roles (simplified to all permissions for now)
		const permissions = isOwner ? '8' : '0' // 8 = Administrator

		const result: Record<string, unknown> = {
			id: guild.id,
			name: guild.name,
			icon: guild.icon,
			owner: isOwner,
			permissions: permissions,
			features: guild.features || []
		}

		if (withCounts) {
			result.approximate_member_count = guild.members.length
			result.approximate_presence_count = guild.members.length // Simplified
		}

		return result
	})
}
