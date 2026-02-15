import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../../core/manager.js'
import { badRequest, notFound } from '../../../utils.js'

interface PutBody {
	url_mappings: Array<{ prefix: string; target: string }>
}

/**
 * PUT /api/control/sessions/:id/activity/url-mappings
 *
 * Update proxy URL mappings for the session's currently configured Activity proxy.
 */
export async function PUT(request: RoboRequest): Promise<Response> {
	const { id: sessionId } = request.params as { id: string }
	if (!sessionId) return notFound('Session ID required')

	const session = sessionManager.get(sessionId)
	if (!session) return notFound('Session not found')

	let body: PutBody
	try {
		body = await request.json()
	} catch {
		return badRequest('Invalid JSON body')
	}

	if (!body || !Array.isArray(body.url_mappings)) {
		return badRequest('url_mappings must be an array')
	}

	// Best-effort: update proxy config store if present.
	try {
		const { getProxyConfigStore } = await import('../../../../../core/activity-proxy/config-store.js')
		const ok = getProxyConfigStore().updateMappings(
			sessionId,
			body.url_mappings.map((m) => ({ prefix: m.prefix, target: m.target }))
		)
		if (!ok) {
			return new Response(JSON.stringify({ message: 'No proxy config for session', code: 'NO_PROXY_CONFIG' }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			})
		}
	} catch {
		return new Response(JSON.stringify({ message: 'Proxy not available', code: 'PROXY_NOT_AVAILABLE' }), {
			status: 503,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	return new Response(JSON.stringify({ success: true }), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	})
}

