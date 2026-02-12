import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../core/manager.js'
import { notFound } from '../../utils.js'

/**
 * GET /api/control/sessions/:id/guilds - List guilds with stats
 *
 * Query Parameters:
 * - name: Filter by guild name (case-insensitive partial match)
 * - include_channels: Include channel IDs list (default: false)
 * - include_members: Include member IDs list (default: false)
 *
 * Response:
 * {
 *   guilds: [{
 *     id: string,
 *     name: string,
 *     owner_id: string,
 *     channel_count: number,
 *     member_count: number,
 *     role_count: number,
 *     channels?: string[],
 *     members?: string[]
 *   }],
 *   total: number
 * }
 */
export async function GET(request: RoboRequest) {
	const { id } = request.params as { id: string }
	const url = new URL(request.url, 'http://localhost')
	const nameFilter = url.searchParams.get('name')
	const includeChannels = url.searchParams.get('include_channels') === 'true'
	const includeMembers = url.searchParams.get('include_members') === 'true'

	if (!id) {
		return notFound('Session ID required')
	}

	const session = sessionManager.get(id)

	if (!session) {
		return notFound('Session not found')
	}

	let guilds = Array.from(session.state.guilds.values())

	// Apply name filter (case-insensitive partial match)
	if (nameFilter) {
		const lowerFilter = nameFilter.toLowerCase()
		guilds = guilds.filter((guild) => guild.name.toLowerCase().includes(lowerFilter))
	}

	// Map to response format with stats
	const guildList = guilds.map((guild) => {
		const result: Record<string, unknown> = {
			id: guild.id,
			name: guild.name,
			owner_id: guild.ownerId,
			channel_count: guild.channels.length,
			member_count: guild.members.length,
			role_count: guild.roles.length
		}

		if (includeChannels) {
			result.channels = [...guild.channels]
		}

		if (includeMembers) {
			result.members = [...guild.members]
		}

		return result
	})

	return {
		guilds: guildList,
		total: guildList.length
	}
}
