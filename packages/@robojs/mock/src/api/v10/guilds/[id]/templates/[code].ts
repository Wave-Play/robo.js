import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../../core/manager.js'
import { parseMockToken } from '../../../../../utils/id.js'
import { getTemplatesForSession } from '../../template-storage.js'

/**
 * GET /api/v10/guilds/:id/templates/:code - Get Template
 * PUT /api/v10/guilds/:id/templates/:code - Sync Template
 * PATCH /api/v10/guilds/:id/templates/:code - Edit Template
 * DELETE /api/v10/guilds/:id/templates/:code - Delete Template
 */
export default async (request: RoboRequest) => {
	const authHeader = request.headers.get('Authorization') || ''
	const sessionId = parseMockToken(authHeader)

	if (!sessionId) {
		return new Response(JSON.stringify({ message: 'Unauthorized', code: 0 }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	const session = sessionManager.get(sessionId)
	if (!session) {
		return new Response(JSON.stringify({ message: 'Invalid session', code: 0 }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	const { id, code } = request.params as { id: string; code: string }
	const guild = session.state.guilds.get(id)

	if (!guild) {
		return new Response(JSON.stringify({ message: 'Unknown Guild', code: 10004 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	const templates = getTemplatesForSession(sessionId)
	const template = templates.get(code)

	if (!template || template.source_guild_id !== id) {
		return new Response(JSON.stringify({ message: 'Unknown Guild Template', code: 10057 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	if (request.method === 'GET') {
		return template
	}

	if (request.method === 'PUT') {
		// Sync template - update serialized_source_guild from current guild state
		const channels = Array.from(session.state.channels.values())
			.filter((c) => c.guildId === id)
			.map((c) => ({
				id: c.id,
				type: c.type,
				name: c.name,
				position: c.position ?? 0,
				topic: c.topic ?? null,
				parent_id: c.parentId ?? null,
				permission_overwrites: []
			}))

		const roles = Array.from(session.state.roles?.values() ?? [])
			.filter((r) => r.guildId === id)
			.map((r) => ({
				id: r.id,
				name: r.name,
				color: r.color ?? 0,
				hoist: r.hoist ?? false,
				mentionable: r.mentionable ?? false,
				permissions: r.permissions ?? '0'
			}))

		template.serialized_source_guild = {
			name: guild.name,
			description: guild.description ?? null,
			region: null,
			icon_hash: guild.icon ?? null,
			verification_level: guild.verificationLevel ?? 0,
			default_message_notifications: guild.defaultMessageNotifications ?? 0,
			explicit_content_filter: guild.explicitContentFilter ?? 0,
			roles,
			channels,
			afk_channel_id: guild.afkChannelId ?? null,
			afk_timeout: guild.afkTimeout ?? 300,
			system_channel_id: guild.systemChannelId ?? null,
			system_channel_flags: guild.systemChannelFlags ?? 0
		}
		template.updated_at = new Date().toISOString()
		template.is_dirty = false

		return template
	}

	if (request.method === 'PATCH') {
		const body = (await request.json()) as { name?: string; description?: string }

		if (body.name !== undefined) {
			template.name = body.name
		}
		if (body.description !== undefined) {
			template.description = body.description
		}
		template.updated_at = new Date().toISOString()

		return template
	}

	if (request.method === 'DELETE') {
		templates.delete(code)
		return new Response(null, { status: 204 })
	}

	return new Response(JSON.stringify({ message: 'Method not allowed' }), {
		status: 405,
		headers: { 'Content-Type': 'application/json' }
	})
}
