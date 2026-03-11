import { define } from '@robojs/server'
import type { RoboRequest } from '@robojs/server'
import { z } from 'zod'
import { sessionManager } from '../../../../../core/manager.js'
import { parseMockToken } from '../../../../../utils/id.js'

/**
 * GET /api/v10/applications/:app_id/entitlements/:entitlement_id - Get Entitlement
 * DELETE /api/v10/applications/:app_id/entitlements/:entitlement_id - Delete Test Entitlement
 *
 * @see https://discord.com/developers/docs/monetization/entitlements#get-entitlement
 * @see https://discord.com/developers/docs/monetization/entitlements#delete-test-entitlement
 */

const EntitlementResponseSchema = z
	.object({
		id: z.string(),
		sku_id: z.string(),
		application_id: z.string(),
		user_id: z.string(),
		guild_id: z.string().nullable().optional(),
		deleted: z.boolean(),
		starts_at: z.string().nullable().optional(),
		ends_at: z.string().nullable().optional(),
		type: z.number().int(),
		fulfilled_at: z.string().nullable().optional(),
		fulfillment_status: z.number().nullable().optional(),
		consumed: z.boolean().nullable().optional(),
		gifter_user_id: z.string().nullable().optional(),
		parent_id: z.string().nullable().optional()
	})
	.passthrough()

function resolveEntitlement(request: RoboRequest) {
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

	const { app_id: appId, entitlement_id: entitlementId } = request.params as { app_id: string; entitlement_id: string }

	// Verify app ID matches bot user ID (or is @me)
	if (appId !== '@me' && appId !== session.state.botUser.id) {
		return new Response(JSON.stringify({ message: 'Unknown Application', code: 10002 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	return { session, appId, entitlementId }
}

export const GET = define(
	{
		summary: 'Get entitlement',
		description: 'Returns an entitlement object for the given application and entitlement IDs',
		tags: ['Application Entitlements'],
		params: z.object({
			app_id: z.string().describe('The application ID (Snowflake)'),
			entitlement_id: z.string().describe('The entitlement ID (Snowflake)')
		}),
		response: {
			200: EntitlementResponseSchema
		}
	},
	async (request) => {
		const resolved = resolveEntitlement(request as unknown as RoboRequest)
		if (resolved instanceof Response) return resolved

		// In a full implementation, we'd look up the entitlement in state by resolved.entitlementId
		// For mock purposes, return a 404 since entitlements are transient
		return new Response(JSON.stringify({ message: 'Unknown Entitlement', code: 10053 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}
)

export const DELETE = define(
	{
		summary: 'Delete test entitlement',
		description: 'Deletes a currently-active test entitlement. Discord only allows deleting entitlements created via the API',
		tags: ['Application Entitlements'],
		params: z.object({
			app_id: z.string().describe('The application ID (Snowflake)'),
			entitlement_id: z.string().describe('The entitlement ID (Snowflake)')
		}),
		response: {
			204: z.undefined()
		}
	},
	async (request) => {
		const resolved = resolveEntitlement(request as unknown as RoboRequest)
		if (resolved instanceof Response) return resolved

		// In a real implementation, we'd remove from state
		// For mock purposes, we just return 204 No Content
		return new Response(null, {
			status: 204
		})
	}
)
