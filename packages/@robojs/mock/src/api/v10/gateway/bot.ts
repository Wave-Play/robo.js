import { define } from '@robojs/server'
import type { RoboRequest } from '@robojs/server'
import { z } from 'zod'

/**
 * GET /api/v10/gateway/bot - Discord Gateway Bot endpoint mock
 *
 * This endpoint mimics Discord's REST API response for fetching gateway info.
 * Discord.js calls this to determine where to connect for WebSocket.
 *
 * Response matches Discord's format:
 * {
 *   url: string,           // WebSocket URL to connect to
 *   shards: number,        // Recommended number of shards
 *   session_start_limit: {
 *     total: number,
 *     remaining: number,
 *     reset_after: number,
 *     max_concurrency: number
 *   }
 * }
 */
export const GET = define(
	{
		summary: 'Get gateway bot',
		tags: ['Gateway'],
		response: {
			200: z.object({
				url: z.string(),
				shards: z.number().int(),
				session_start_limit: z.object({
					total: z.number().int(),
					remaining: z.number().int(),
					reset_after: z.number().int(),
					max_concurrency: z.number().int()
				})
			})
		}
	},
	async (request: RoboRequest) => {
	// Get host from request header (includes port)
	const host = request.headers.get('host') || 'localhost:3000'

	// Determine protocol (ws for http, wss for https)
	const protocol = host.includes('localhost') || host.startsWith('127.') ? 'ws' : 'wss'

	const response = {
		url: `${protocol}://${host}`,
		shards: 1,
		session_start_limit: {
			total: 1000,
			remaining: 1000,
			reset_after: 0,
			max_concurrency: 1
		}
	}

	return new Response(JSON.stringify(response), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	})
})
