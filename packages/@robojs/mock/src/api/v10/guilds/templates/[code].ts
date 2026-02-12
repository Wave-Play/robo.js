import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../core/manager.js'
import { parseMockToken } from '../../../../utils/id.js'
import { getTemplatesForSession } from '../template-storage.js'

/**
 * GET /api/v10/guilds/templates/:code - Fetch Template by Code
 *
 * This is a global endpoint to fetch any template by its code.
 * Used by client.fetchGuildTemplate(code)
 */
export async function GET(request: RoboRequest) {
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
