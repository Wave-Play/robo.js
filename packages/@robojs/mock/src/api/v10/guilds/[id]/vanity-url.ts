import { define } from '@robojs/server'
import type { RoboRequest } from '@robojs/server'
import { z } from 'zod'
import { sessionManager } from '../../../../core/manager.js'
import { parseMockToken } from '../../../../utils/id.js'

/**
 * GET /api/v10/guilds/:id/vanity-url - Guild Vanity URL endpoint mock
 * PATCH /api/v10/guilds/:id/vanity-url - Set Guild Vanity URL
 *
 * Returns or sets the vanity URL for a guild (requires VANITY_URL feature).
 */

function resolveGuildVanity(request: RoboRequest) {
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

	const { id } = request.params as { id: string }
	const guild = session.state.guilds.get(id)

	if (!guild) {
		return new Response(JSON.stringify({ message: 'Unknown Guild', code: 10004 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	return { session, guild }
}

const VanityURLResponseSchema = z
	.object({
		code: z.string().nullable(),
		uses: z.number().int(),
		error: z.object({}).passthrough().nullable().optional()
	})
	.passthrough()

export const GET = define(
	{
		summary: 'Get guild vanity URL',
		description: 'Returns the vanity URL for the guild',
		tags: ['Guilds'],
		params: z.object({
			id: z.string().describe('The guild ID (Snowflake)')
		}),
		response: {
			200: VanityURLResponseSchema
		}
	},
	async (request) => {
		const resolved = resolveGuildVanity(request)
		if (resolved instanceof Response) return resolved
		const { guild } = resolved

		// Check if guild has VANITY_URL feature
		const hasVanityFeature = guild.features?.includes('VANITY_URL')

		if (!hasVanityFeature) {
			return new Response(
				JSON.stringify({
					message: 'This guild does not have the VANITY_URL feature',
					code: 50020
				}),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				}
			)
		}

		// Return vanity data
		return {
			code: guild.vanityUrlCode || null,
			uses: guild.vanityUrlUses || 0
		}
	}
)

export const PATCH = define(
	{
		summary: 'Update guild vanity URL',
		description: 'Set the vanity URL for the guild',
		tags: ['Guilds'],
		params: z.object({
			id: z.string().describe('The guild ID (Snowflake)')
		}),
		body: z
			.object({
				code: z.string().optional()
			})
			.passthrough(),
		response: {
			200: VanityURLResponseSchema
		}
	},
	async (request) => {
		const resolved = resolveGuildVanity(request)
		if (resolved instanceof Response) return resolved
		const { guild } = resolved

		// Check if guild has VANITY_URL feature
		const hasVanityFeature = guild.features?.includes('VANITY_URL')

		if (!hasVanityFeature) {
			return new Response(
				JSON.stringify({
					message: 'This guild does not have the VANITY_URL feature',
					code: 50020
				}),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				}
			)
		}

		const body = (await request.json()) as { code?: string }

		if (body.code !== undefined) {
			guild.vanityUrlCode = body.code
		}

		return {
			code: guild.vanityUrlCode || null,
			uses: guild.vanityUrlUses || 0
		}
	}
)
