import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../core/manager.js'
import { parseMockToken } from '../../../../utils/id.js'

/**
 * GET /api/v10/applications/:app_id/skus - List Application SKUs
 *
 * Returns a list of SKU objects for the application.
 * Discord.js uses this for client.application.fetchSKUs()
 *
 * @see https://discord.com/developers/docs/monetization/skus#list-skus
 */
export default async (request: RoboRequest) => {
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

	// 2. Extract app ID from params
	const { app_id: appId } = request.params as { app_id: string }

	// Verify app ID matches bot user ID (or is @me)
	if (appId !== '@me' && appId !== session.state.botUser.id) {
		return new Response(JSON.stringify({ message: 'Unknown Application', code: 10002 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Handle GET - List SKUs
	if (request.method === 'GET') {
		// Return empty array by default - SKUs can be added via control API if needed
		const skus: unknown[] = []

		return new Response(JSON.stringify(skus), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Method not allowed
	return new Response(JSON.stringify({ message: 'Method not allowed' }), {
		status: 405,
		headers: { 'Content-Type': 'application/json' }
	})
}
