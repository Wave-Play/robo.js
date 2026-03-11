import { define } from '@robojs/server'
import { z } from 'zod'
import { sessionManager } from '../../../../core/manager.js'
import { parseMockToken } from '../../../../utils/id.js'

/**
 * GET /api/v10/guilds/:id/regions - Guild Voice Regions endpoint mock
 *
 * Returns a list of voice regions available for a specific guild.
 * This is similar to the global voice regions but may include
 * VIP regions for partnered/verified guilds.
 */
export const GET = define(
	{
		summary: 'List guild voice regions',
		description: 'Returns a list of voice region objects for the guild',
		tags: ['Guilds'],
		params: z.object({
			id: z.string().describe('The guild ID (Snowflake)')
		}),
		response: {
			200: z
				.array(
					z
						.object({
							id: z.string(),
							name: z.string(),
							optimal: z.boolean(),
							deprecated: z.boolean(),
							custom: z.boolean()
						})
						.passthrough()
				)
				.nullable()
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

		const { id } = request.params as { id: string }
		const guild = session.state.guilds.get(id)

		if (!guild) {
			return new Response(JSON.stringify({ message: 'Unknown Guild', code: 10004 }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Return mock voice regions - same as global but guild-specific
		// In production, VIP guilds might have additional regions
		return [
			{
				id: 'us-west',
				name: 'US West',
				optimal: true,
				deprecated: false,
				custom: false
			},
			{
				id: 'us-east',
				name: 'US East',
				optimal: false,
				deprecated: false,
				custom: false
			},
			{
				id: 'us-central',
				name: 'US Central',
				optimal: false,
				deprecated: false,
				custom: false
			},
			{
				id: 'us-south',
				name: 'US South',
				optimal: false,
				deprecated: false,
				custom: false
			},
			{
				id: 'singapore',
				name: 'Singapore',
				optimal: false,
				deprecated: false,
				custom: false
			},
			{
				id: 'southafrica',
				name: 'South Africa',
				optimal: false,
				deprecated: false,
				custom: false
			},
			{
				id: 'sydney',
				name: 'Sydney',
				optimal: false,
				deprecated: false,
				custom: false
			},
			{
				id: 'europe',
				name: 'Europe',
				optimal: false,
				deprecated: false,
				custom: false
			},
			{
				id: 'brazil',
				name: 'Brazil',
				optimal: false,
				deprecated: false,
				custom: false
			},
			{
				id: 'hongkong',
				name: 'Hong Kong',
				optimal: false,
				deprecated: false,
				custom: false
			},
			{
				id: 'russia',
				name: 'Russia',
				optimal: false,
				deprecated: false,
				custom: false
			},
			{
				id: 'japan',
				name: 'Japan',
				optimal: false,
				deprecated: false,
				custom: false
			},
			{
				id: 'india',
				name: 'India',
				optimal: false,
				deprecated: false,
				custom: false
			}
		]
	}
)
