import { define } from '@robojs/server'
import { z } from 'zod'
import { sessionManager } from '../../../../core/manager.js'
import { parseMockToken } from '../../../../utils/id.js'
import { mockInviteToAPIExtendedInvite } from '../../../../discord/payloads.js'
import { enforcePermissions } from '../../../../utils/permission-check.js'

/**
 * GET /api/v10/guilds/:id/invites - List all invites for a guild
 *
 * Returns a list of invite objects (with invite metadata) for the guild.
 * Requires the MANAGE_GUILD permission.
 *
 * @see https://discord.com/developers/docs/resources/guild#get-guild-invites
 */
export const GET = define(
	{
		summary: 'List guild invites',
		description: 'Returns a list of invite objects for the guild',
		tags: ['Guilds'],
		params: z.object({
			id: z.string().describe('The guild ID (Snowflake)')
		}),
		response: {
			200: z.array(z.object({}).passthrough()).nullable()
		}
	},
	async (request) => {
		// 1. Parse Authorization header -> get session
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

		// 4. Check permissions (MANAGE_GUILD required)
		const permError = enforcePermissions(session, 'GET', `/guilds/${guildId}/invites`, undefined, guildId)
		if (permError) return permError

		// 5. Get all invites for the guild
		const invites = session.state.getGuildInvites(guildId)

		// 6. Convert to API format (extended invite includes metadata)
		const apiInvites = invites.map((invite) => mockInviteToAPIExtendedInvite(invite, session.state))

		return apiInvites
	}
)
