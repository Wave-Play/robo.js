import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../core/manager.js'
import { parseMockToken } from '../../../../utils/id.js'
import { generateSnowflake } from '../../../../utils/snowflake.js'

/**
 * GET/POST /api/v10/applications/:app_id/entitlements - List/Create Entitlements
 *
 * GET: Returns a list of entitlement objects for the application.
 * POST: Creates a test entitlement (for testing monetization).
 *
 * Discord.js uses this for:
 * - client.application.entitlements.fetch()
 * - client.application.entitlements.createTest()
 *
 * @see https://discord.com/developers/docs/monetization/entitlements#list-entitlements
 * @see https://discord.com/developers/docs/monetization/entitlements#create-test-entitlement
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

	// Handle GET - List Entitlements
	if (request.method === 'GET') {
		// Return empty array by default - entitlements can be added via control API if needed
		const entitlements: unknown[] = []

		return new Response(JSON.stringify(entitlements), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Handle POST - Create Test Entitlement
	if (request.method === 'POST') {
		let body: {
			sku_id: string
			owner_id: string
			owner_type: 1 | 2 // 1 = guild, 2 = user
		}

		try {
			body = await request.json()
		} catch {
			return new Response(JSON.stringify({ message: 'Invalid JSON body', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		if (!body.sku_id) {
			return new Response(JSON.stringify({ message: 'Missing sku_id', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		if (!body.owner_id) {
			return new Response(JSON.stringify({ message: 'Missing owner_id', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Create a test entitlement
		const entitlement = {
			id: generateSnowflake(),
			sku_id: body.sku_id,
			application_id: session.state.botUser.id,
			user_id: body.owner_type === 2 ? body.owner_id : undefined,
			guild_id: body.owner_type === 1 ? body.owner_id : undefined,
			type: 5, // TestModePurchase
			deleted: false,
			starts_at: null,
			ends_at: null,
			consumed: false
		}

		return new Response(JSON.stringify(entitlement), {
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
