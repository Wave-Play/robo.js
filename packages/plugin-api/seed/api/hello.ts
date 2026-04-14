/**
 * This is an example API route for /api/hello
 *
 * You can use named exports for specific HTTP methods:
 * - GET /api/hello  → calls GET()
 * - POST /api/hello → calls POST()
 *
 * Or use a default export to handle all methods.
 *
 * See it in action:
 * http://localhost:3000/api/hello
 *
 * Learn more:
 * https://robojs.dev/plugins/server
 */
// @ts-expect-error - resolved at runtime in consumer projects
import type { RoboRequest } from '@robojs/server'

export function GET() {
	return { message: 'Hello, world!' }
}

export async function POST(request: RoboRequest) {
	const body = await request.json()
	return { received: body }
}
