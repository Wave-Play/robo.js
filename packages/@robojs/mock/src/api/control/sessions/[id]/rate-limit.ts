import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../core/manager.js'
import { notFound, badRequest } from '../../utils.js'

type RateLimitScope = 'all' | 'messages' | 'interactions' | 'guilds' | 'channels'

/**
 * GET/POST /api/control/sessions/:id/rate-limit - Rate limit simulation control
 *
 * GET Response:
 * {
 *   enabled: boolean,
 *   retry_after: number,
 *   persistent: boolean,
 *   scope: 'all' | 'messages' | 'interactions' | 'guilds' | 'channels',
 *   triggered_count: number
 * }
 *
 * POST Request body:
 * {
 *   enabled?: boolean       // Whether to enable rate limit simulation (default: true)
 *   retry_after?: number    // Retry-After value in seconds (default: 1)
 *   persistent?: boolean    // If true, doesn't auto-disable after triggering (default: false)
 *   scope?: string          // Which endpoints to affect: 'all', 'messages', 'interactions', 'guilds', 'channels'
 * }
 *
 * POST Response:
 * {
 *   success: true,
 *   enabled: boolean,
 *   retry_after: number,
 *   persistent: boolean,
 *   scope: string
 * }
 *
 * In one-shot mode (persistent: false), the rate limit automatically disables after
 * returning the first 429 response. In persistent mode, it continues returning 429
 * until manually disabled.
 */

function resolveSession(request: RoboRequest) {
	const { id } = request.params as { id: string }
	if (!id) return notFound('Session ID required')
	const session = sessionManager.get(id) ?? sessionManager.getByToken(id)
	if (!session) return notFound('Session not found')
	return { session, id }
}

export async function GET(request: RoboRequest) {
	const resolved = resolveSession(request)
	if (resolved instanceof Response) return resolved
	const { session } = resolved

	const config = session.rateLimitConfig
	return {
		enabled: config.enabled,
		retry_after: config.retryAfter,
		persistent: config.persistent,
		scope: config.scope,
		triggered_count: config.triggeredCount
	}
}

export async function POST(request: RoboRequest) {
	const resolved = resolveSession(request)
	if (resolved instanceof Response) return resolved
	const { session } = resolved

	let body: {
		enabled?: boolean
		retry_after?: number
		persistent?: boolean
		scope?: RateLimitScope
	}

	try {
		body = await request.json()
	} catch {
		return badRequest('Invalid JSON body')
	}

	const enabled = body.enabled ?? true
	const retryAfter = body.retry_after ?? 1
	const persistent = body.persistent ?? false
	const scope = body.scope ?? 'all'

	if (typeof retryAfter !== 'number' || retryAfter < 0) {
		return badRequest('retry_after must be a non-negative number')
	}

	const validScopes: RateLimitScope[] = ['all', 'messages', 'interactions', 'guilds', 'channels']
	if (!validScopes.includes(scope)) {
		return badRequest(`scope must be one of: ${validScopes.join(', ')}`)
	}

	session.setRateLimitSimulation({
		enabled,
		retryAfter,
		persistent,
		scope
	})

	return {
		success: true,
		enabled,
		retry_after: retryAfter,
		persistent,
		scope
	}
}
