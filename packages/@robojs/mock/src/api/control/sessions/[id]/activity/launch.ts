import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../../core/manager.js'
import { getStageServer } from '../../../../../core/stage.js'
import { badRequest, notFound } from '../../../utils.js'
import { getActivityHostManager } from '../../../../../activity/index.js'

interface LaunchBody {
	launch_url: string
	application_id: string
	guild_id?: string | null
	channel_id?: string | null
	locale?: string
	platform?: string
	launch_path?: string
	csp_mode?: 'discord_strict' | 'relaxed'
	sdk_shim_enabled?: boolean
	url_mappings?: Array<{ prefix: string; target: string }>
}

/**
 * POST /api/control/sessions/:id/activity/launch
 *
 * Headless/automation entrypoint to launch an Activity instance for a session.
 * Mirrors the Stage WS `launch_activity` behavior.
 */
export async function POST(request: RoboRequest): Promise<Response> {
	const { id: sessionId } = request.params as { id: string }
	if (!sessionId) return notFound('Session ID required')

	const session = sessionManager.get(sessionId)
	if (!session) return notFound('Session not found')

	let body: LaunchBody
	try {
		body = await request.json()
	} catch {
		return badRequest('Invalid JSON body')
	}

	if (!body?.launch_url || typeof body.launch_url !== 'string') {
		return badRequest('launch_url is required')
	}
	if (!body?.application_id || typeof body.application_id !== 'string') {
		return badRequest('application_id is required')
	}
	try {
		new URL(body.launch_url)
	} catch {
		return badRequest(`launch_url is not a valid URL: ${body.launch_url}`)
	}

	const hostManager = getActivityHostManager()
	const record = hostManager.launchActivity({
		session_id: sessionId,
		application_id: body.application_id,
		guild_id: body.guild_id ?? null,
		channel_id: body.channel_id ?? null,
		launch_url: body.launch_url,
		locale: body.locale,
		platform: body.platform
	})

	const query_params: Record<string, string> = {
		client_id: record.application_id,
		instance_id: record.instance_id,
		frame_id: record.frame_id,
		platform: record.platform,
		locale: record.locale
	}
	if (record.guild_id) query_params.guild_id = record.guild_id
	if (record.channel_id) query_params.channel_id = record.channel_id

	// Best-effort: configure proxy + compute iframe_url when proxy is running.
	let proxy_origin: string | undefined
	let iframe_url: string | undefined
	let proxy_port: number | undefined
	try {
		const { getProxyConfigStore } = await import('../../../../../core/activity-proxy/config-store.js')
		const { getActivityProxyServer } = await import('../../../../../core/activity-proxy/server.js')

		const proxyServer = getActivityProxyServer()
		if (proxyServer.isStarted()) {
			const launchPath = typeof body.launch_path === 'string' && body.launch_path.startsWith('/')
				? body.launch_path
				: '/'
			const urlMappings = (body.url_mappings ?? []).map((m) => ({ prefix: m.prefix, target: m.target }))

			getProxyConfigStore().set(sessionId, {
				launch_url: body.launch_url,
				launch_path: launchPath,
				url_mappings: urlMappings,
				csp_mode: body.csp_mode ?? 'relaxed',
				application_id: body.application_id,
				sdk_shim_enabled: body.sdk_shim_enabled ?? true
			})

			proxy_port = proxyServer.getPort()
			proxy_origin = proxyServer.getProxyOrigin(sessionId, body.application_id)
			const queryStr = Object.entries(query_params)
				.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
				.join('&')
			iframe_url = `${proxy_origin}/.proxy${launchPath}?${queryStr}`
		}
	} catch {
		// Proxy may not be initialized
	}

	// Notify Stage UI (if connected) so it can render the iframe.
	try {
		getStageServer().broadcastToSession(sessionId, {
			type: 'activity.launched',
			data: {
				instance_id: record.instance_id,
				frame_id: record.frame_id,
				application_id: record.application_id,
				guild_id: record.guild_id,
				channel_id: record.channel_id,
				user_id: record.user_id,
				launch_url: record.launch_url,
				query_params,
				...(proxy_origin ? { proxy_origin } : {}),
				...(iframe_url ? { iframe_url } : {}),
				sdk_shim_enabled: body.sdk_shim_enabled ?? true
			}
		})
	} catch {
		// Stage server may not be available in some contexts
	}

	return new Response(
		JSON.stringify({
			session_id: sessionId,
			instance_id: record.instance_id,
			frame_id: record.frame_id,
			query_params,
			proxy_origin: proxy_origin ?? null,
			iframe_url: iframe_url ?? null,
			proxy_port: proxy_port ?? null,
			sdk_shim_enabled: body.sdk_shim_enabled ?? true
		}),
		{ status: 200, headers: { 'Content-Type': 'application/json' } }
	)
}

