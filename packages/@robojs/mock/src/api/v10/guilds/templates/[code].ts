import { define } from '@robojs/server'
import type { RoboRequest } from '@robojs/server'
import { z } from 'zod'
import { sessionManager } from '../../../../core/manager.js'
import { parseMockToken } from '../../../../utils/id.js'
import { getTemplatesForSession } from '../template-storage.js'

/**
 * GET /api/v10/guilds/templates/:code - Fetch Template by Code
 *
 * This is a global endpoint to fetch any template by its code.
 * Used by client.fetchGuildTemplate(code)
 */
export const GET = define(
	{
		summary: 'Get guild template',
		description: 'Returns a guild template object for the given code',
		tags: ['Guild Templates'],
		params: z.object({
			code: z.string().describe('The template code')
		}),
		response: {
			200: z
				.object({
					code: z.string(),
					name: z.string(),
					description: z.string().nullable(),
					usage_count: z.number(),
					creator_id: z.string(),
					creator: z.object({}).passthrough().nullable(),
					created_at: z.string(),
					updated_at: z.string(),
					source_guild_id: z.string(),
					serialized_source_guild: z.object({}).passthrough(),
					is_dirty: z.boolean().nullable()
				})
				.passthrough()
		}
	},
	async (request) => {
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
			return new Response(JSON.stringify({ message: 'Invalid session', code: 0 }), {
				status: 401,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		const { code } = request.params as { code: string }
		const templates = getTemplatesForSession(sessionId)
		const template = templates.get(code)

		if (!template) {
			return new Response(JSON.stringify({ message: 'Unknown Guild Template', code: 10057 }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		return template
	}
)
