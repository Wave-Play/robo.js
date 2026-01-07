import type { RoboRequest } from '@robojs/server'

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
export default async (request: RoboRequest) => {
	if (request.method !== 'GET') {
		return new Response(JSON.stringify({ error: 'Method not allowed' }), {
			status: 405,
			headers: { 'Content-Type': 'application/json' }
		})
	}

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
}
