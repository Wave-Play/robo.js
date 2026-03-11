import { define } from '@robojs/server'
import type { RoboRequest } from '@robojs/server'
import { z } from 'zod'
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

function resolveEntitlements(request: RoboRequest) {
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

	return { session }
}

export const GET = define(
	{
		summary: 'List entitlements',
		description: 'Returns all entitlements for a given app, active and expired',
		tags: ['Application Entitlements'],
		params: z.object({
			app_id: z.string().describe('The application ID (Snowflake)')
		}),
		query: z.object({
			user_id: z.string().optional().describe('User ID to look up entitlements for'),
			sku_ids: z.string().optional().describe('Comma-delimited set of SKU IDs to check entitlements for'),
			guild_id: z.string().optional().describe('Guild ID to look up entitlements for'),
			before: z.string().optional().describe('Retrieve entitlements before this entitlement ID'),
			after: z.string().optional().describe('Retrieve entitlements after this entitlement ID'),
			limit: z.string().optional().describe('Number of entitlements to return (1-100, default 100)'),
			exclude_ended: z.string().optional().describe('Whether to exclude ended entitlements'),
			exclude_deleted: z.string().optional().describe('Whether to exclude deleted entitlements'),
			only_active: z.string().optional().describe('Whether to only return active entitlements')
		}),
		response: {
			200: z.array(EntitlementResponseSchema.nullable())
		}
	},
	async (request) => {
		const resolved = resolveEntitlements(request as unknown as RoboRequest)
		if (resolved instanceof Response) return resolved

		// Return empty array by default - entitlements can be added via control API if needed
		const entitlements: unknown[] = []

		return new Response(JSON.stringify(entitlements), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		})
	}
)

export const POST = define(
	{
		summary: 'Create test entitlement',
		description: 'Creates a test entitlement to a given SKU for a given guild or user',
		tags: ['Application Entitlements'],
		params: z.object({
			app_id: z.string().describe('The application ID (Snowflake)')
		}),
		body: z
			.object({
				sku_id: z.string().describe('ID of the SKU to grant the entitlement to'),
				owner_id: z.string().describe('ID of the guild or user to grant the entitlement to'),
				owner_type: z.number().int().describe('1 for guild subscription, 2 for user subscription')
			})
			.passthrough(),
		response: {
			200: EntitlementResponseSchema
		}
	},
	async (request) => {
		const resolved = resolveEntitlements(request as unknown as RoboRequest)
		if (resolved instanceof Response) return resolved
		const { session } = resolved

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
)
