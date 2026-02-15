import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../core/manager.js'
import { notFound } from '../../utils.js'
import { getActivityHostManager } from '../../../../activity/index.js'

/**
 * GET /api/control/sessions/:id/activity
 *
 * Returns the current Activity state for this mock session, including:
 * - Activity instance/frame ids + auth state
 * - Proxy status + computed iframe URL (if proxy is running)
 * - Active subscriptions summary
 */
export async function GET(request: RoboRequest) {
	const { id: sessionId } = request.params as { id: string }
	if (!sessionId) return notFound('Session ID required')

	const session = sessionManager.get(sessionId)
	if (!session) return notFound('Session not found')

	const hostManager = getActivityHostManager()
	const record = hostManager.getRecord(sessionId) ?? null

	// Best-effort: include proxy server status/config if available.
	let proxy: Record<string, unknown> | null = null
	try {
		const { getActivityProxyServer } = await import('../../../../core/activity-proxy/server.js')
		const { getProxyConfigStore } = await import('../../../../core/activity-proxy/config-store.js')

		const proxyServer = getActivityProxyServer()
		if (proxyServer.isStarted()) {
			const port = proxyServer.getPort()
			const originTemplate = `http://{session}.{app_id}.discordsays.localhost:${port}`

			const cfg = getProxyConfigStore().get(sessionId)
			if (cfg && record) {
				const actQueryParams: Record<string, string> = {
					client_id: record.application_id,
					instance_id: record.instance_id,
					frame_id: record.frame_id,
					platform: record.platform,
					locale: record.locale
				}
				if (record.guild_id) actQueryParams.guild_id = record.guild_id
				if (record.channel_id) actQueryParams.channel_id = record.channel_id

				const proxyOrigin = proxyServer.getProxyOrigin(sessionId, cfg.application_id)
				const queryStr = Object.entries(actQueryParams)
					.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
					.join('&')
				const launchPath = cfg.launch_path ?? '/'
				const iframeUrl = `${proxyOrigin}/.proxy${launchPath}?${queryStr}`

				proxy = {
					running: true,
					port,
					origin_template: originTemplate,
					proxy_origin: proxyOrigin,
					iframe_url: iframeUrl,
					launch_url: cfg.launch_url,
					launch_path: cfg.launch_path,
					csp_mode: cfg.csp_mode,
					url_mappings: cfg.url_mappings,
					sdk_shim_enabled: cfg.sdk_shim_enabled ?? false
				}
			} else {
				proxy = {
					running: true,
					port,
					origin_template: originTemplate
				}
			}
		}
	} catch {
		// Proxy not available
	}

	const subs = record ? hostManager.getSubscriptions(record.instance_id) : null
	const subscriptionEntries = subs?.getAll() ?? []

	return {
		session_id: sessionId,
		running: Boolean(record),
		activity: record
			? {
					instance_id: record.instance_id,
					frame_id: record.frame_id,
					application_id: record.application_id,
					guild_id: record.guild_id,
					channel_id: record.channel_id,
					user_id: record.user_id,
					locale: record.locale,
					platform: record.platform,
					launch_url: record.launch_url,
					created_at: new Date(record.created_at).toISOString(),
					handshake_received: record.handshake_received,
					ready_emitted: record.ready_emitted,
					auth: record.auth,
					devtools_auth: record.devtools_auth,
					subscriptions: {
						count: subscriptionEntries.length,
						events: subscriptionEntries
					}
				}
			: null,
		proxy
	}
}

