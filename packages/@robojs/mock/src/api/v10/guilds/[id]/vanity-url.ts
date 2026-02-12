import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../core/manager.js'
import { parseMockToken } from '../../../../utils/id.js'

/**
 * GET /api/v10/guilds/:id/vanity-url - Guild Vanity URL endpoint mock
 * PATCH /api/v10/guilds/:id/vanity-url - Set Guild Vanity URL
 *
 * Returns or sets the vanity URL for a guild (requires VANITY_URL feature).
 */
export default async (request: RoboRequest) => {
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

	// Check if guild has VANITY_URL feature
	const hasVanityFeature = guild.features?.includes('VANITY_URL')

	if (request.method === 'GET') {
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

	if (request.method === 'PATCH') {
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

	return new Response(JSON.stringify({ message: 'Method not allowed' }), {
		status: 405,
		headers: { 'Content-Type': 'application/json' }
	})
}
