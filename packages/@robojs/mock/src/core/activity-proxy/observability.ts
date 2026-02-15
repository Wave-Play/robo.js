// ============================================================================
// Observability: DevTools Network Entries
// Emit proxy network entries to Stage DevTools
// ============================================================================

/**
 * Proxy network entry for Stage DevTools.
 */
export interface ProxyNetworkEntry {
	/** Request ID for correlation */
	id: string
	/** Timestamp when request started */
	timestamp: number
	/** HTTP method or "WS" for WebSocket */
	method: string
	/** Full proxy URL (as seen by browser) */
	proxyUrl: string
	/** Full upstream URL (where request was forwarded) */
	upstreamUrl: string
	/** HTTP status code (0 for WS connect/disconnect) */
	statusCode: number
	/** Response time in milliseconds */
	duration: number
	/** Content type of response */
	contentType?: string
	/** Content length of response */
	contentLength?: number
	/** Whether HTML was rewritten */
	htmlRewritten?: boolean
	/** Matched mapping prefix (if any) */
	mappingPrefix?: string
	/** Error message (if request failed) */
	error?: string
	/** Type: "http" | "ws_connect" | "ws_disconnect" */
	type: 'http' | 'ws_connect' | 'ws_disconnect'
}

/**
 * Generate a unique entry ID for observability.
 */
export function generateEntryId(): string {
	return `proxy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Emit a proxy network entry to Stage DevTools via broadcastToSession.
 * Uses dynamic import to avoid circular dependencies with stage.ts.
 */
export function emitProxyNetworkEntry(sessionId: string, entry: ProxyNetworkEntry): void {
	import('../stage.js')
		.then(({ getStageServer }) => {
			const stageServer = getStageServer()
			stageServer.broadcastToSession(sessionId, {
				type: 'activity.proxy.network' as never,
				data: entry
			})
		})
		.catch(() => {
			// Stage server may not be available
		})
}

/**
 * Record an HTTP proxy request as an activity_proxy_http action in the session recorder.
 * Uses dynamic imports to avoid circular dependencies.
 */
export function recordProxyHttpAction(
	sessionId: string,
	data: {
		instance_id: string
		method: string
		url: string
		upstream_url: string
		status_code: number
		duration_ms: number
		content_type?: string
		request_size?: number
		response_size?: number
		mapping_prefix?: string | null
	}
): void {
	import('../manager.js')
		.then(({ sessionManager }) => {
			const session = sessionManager.get(sessionId)
			if (session) {
				session.recorder.record('activity_proxy_http', data)
			}
		})
		.catch(() => {
			// Session manager may not be available
		})
}

/**
 * Record a WebSocket proxy lifecycle event as an activity_proxy_ws action in the session recorder.
 * Uses dynamic imports to avoid circular dependencies.
 */
export function recordProxyWsAction(
	sessionId: string,
	data: {
		instance_id: string
		event: 'connect' | 'disconnect' | 'message_up' | 'message_down'
		url: string
		upstream_url: string
		mapping_prefix?: string | null
		close_code?: number
		message_size?: number
	}
): void {
	import('../manager.js')
		.then(({ sessionManager }) => {
			const session = sessionManager.get(sessionId)
			if (session) {
				session.recorder.record('activity_proxy_ws', data)
			}
		})
		.catch(() => {
			// Session manager may not be available
		})
}
