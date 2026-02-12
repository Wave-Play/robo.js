import type { RoboRequest } from '@robojs/server'

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

/**
 * Validate that the request method is allowed
 */
export function validateMethod(request: RoboRequest, allowed: HttpMethod[]): void {
	if (!allowed.includes(request.method as HttpMethod)) {
		throw new Error(`Method ${request.method} not allowed`)
	}
}

/**
 * Create a 404 Not Found response
 */
export function notFound(message = 'Not found'): Response {
	return new Response(JSON.stringify({ message, code: 0 }), {
		status: 404,
		headers: { 'Content-Type': 'application/json' }
	})
}

/**
 * Create a 400 Bad Request response
 */
export function badRequest(message = 'Bad request'): Response {
	return new Response(JSON.stringify({ message, code: 0 }), {
		status: 400,
		headers: { 'Content-Type': 'application/json' }
	})
}

/**
 * Create a 500 Internal Server Error response
 */
export function serverError(message = 'Internal server error'): Response {
	return new Response(JSON.stringify({ message, code: 0 }), {
		status: 500,
		headers: { 'Content-Type': 'application/json' }
	})
}
