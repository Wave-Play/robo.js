import { define } from '@robojs/server'
import { z } from 'zod'
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

const SKUResponseSchema = z
	.object({
		id: z.string(),
		type: z.number().describe('SKU type (5 = subscription, 6 = subscription_group)'),
		application_id: z.string(),
		name: z.string(),
		slug: z.string(),
		flags: z.number().optional(),
		price: z.object({}).passthrough().optional()
	})
	.passthrough()

export const GET = define(
	{
		summary: 'List SKUs',
		description: 'Returns all SKUs for a given application',
		tags: ['Application SKUs'],
		params: z.object({
			app_id: z.string().describe('The application ID (Snowflake)')
		}),
		response: {
			200: z.array(SKUResponseSchema)
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

		// 2. Extract app ID from params
		const { app_id: appId } = request.params

		// Verify app ID matches bot user ID (or is @me)
		if (appId !== '@me' && appId !== session.state.botUser.id) {
			return new Response(JSON.stringify({ message: 'Unknown Application', code: 10002 }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Return empty array by default - SKUs can be added via control API if needed
		const skus: unknown[] = []

		return new Response(JSON.stringify(skus), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		})
	}
)
