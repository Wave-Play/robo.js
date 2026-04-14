/**
 * Test route: Named exports with dynamic parameters
 * - GET returns id from params
 * - POST returns id + body
 */
// @ts-expect-error - resolved at runtime
import type { RoboRequest } from '@robojs/server'

export function GET(request: RoboRequest) {
	return { id: request.params.id, method: 'GET' }
}

export async function POST(request: RoboRequest) {
	const body = await request.json()
	return { id: request.params.id, method: 'POST', body }
}
