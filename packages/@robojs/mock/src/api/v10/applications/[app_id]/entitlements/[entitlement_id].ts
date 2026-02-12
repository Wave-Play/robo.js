import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../../core/manager.js'
import { parseMockToken } from '../../../../../utils/id.js'

/**
 * DELETE /api/v10/applications/:app_id/entitlements/:entitlement_id - Delete Test Entitlement
 *
 * Deletes a currently-active test entitlement.
 * Discord.js uses this for entitlement.delete()
 *
 * @see https://discord.com/developers/docs/monetization/entitlements#delete-test-entitlement
 */
export async function DELETE(request: RoboRequest) {
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

	// 2. Extract params
	const { app_id: appId, entitlement_id: _entitlementId } = request.params as {
		app_id: string
		entitlement_id: string
	}

	// Verify app ID matches bot user ID (or is @me)
	if (appId !== '@me' && appId !== session.state.botUser.id) {
		return new Response(JSON.stringify({ message: 'Unknown Application', code: 10002 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// In a real implementation, we'd remove from state
	// For mock purposes, we just return 204 No Content
	return new Response(null, {
		status: 204
	})
}
