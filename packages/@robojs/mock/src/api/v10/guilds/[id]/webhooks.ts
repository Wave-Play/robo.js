import { define } from '@robojs/server'
import type { RoboRequest } from '@robojs/server'
import { z } from 'zod'
import { sessionManager } from '../../../../core/manager.js'
import { parseMockToken } from '../../../../utils/id.js'
import { mockWebhookToAPIWebhook } from '../../../../discord/payloads.js'

/**
 * GET /api/v10/guilds/:id/webhooks - List all webhooks for a guild
 *
 * @see https://discord.com/developers/docs/resources/webhook#get-guild-webhooks
 */
export const GET = define(
	{
		summary: 'Get guild webhooks',
		description: 'Returns a list of guild webhook objects',
		tags: ['Webhooks'],
		params: z.object({
			id: z.string().describe('The guild ID (Snowflake)')
		}),
		response: {
			200: z.array(
				z
					.object({
						id: z.string(),
						type: z.number(),
						guild_id: z.string().nullable().optional(),
						channel_id: z.string().nullable(),
						name: z.string().nullable(),
						avatar: z.string().nullable(),
						token: z.string().optional(),
						application_id: z.string().nullable().optional(),
						user: z.object({}).passthrough().optional(),
						url: z.string().optional()
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

		// Get all webhooks for this guild
		const webhooks = session.state.getWebhooksForGuild(guildId)

		// Include token for webhooks created by the requesting user (bot)
		return webhooks.map((w) => mockWebhookToAPIWebhook(w, w.user?.id === session.state.botUser.id))
	}
)
