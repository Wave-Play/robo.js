/**
 * Creates a Discord-formatted error response.
 * Discord's error format uses `message` (not `error`) as the key.
 */
export function discordError(message: string, code: number, status: number = 400): Response {
	return new Response(JSON.stringify({ message, code }), {
		status,
		headers: { 'Content-Type': 'application/json' }
	})
}

/**
 * Creates a Discord-formatted validation error response with field-level errors.
 */
export function discordValidationError(message: string, code: number, errors: Record<string, unknown>, status: number = 400): Response {
	return new Response(JSON.stringify({ message, code, errors }), {
		status,
		headers: { 'Content-Type': 'application/json' }
	})
}
