import { define } from '@robojs/server'
import type { RoboRequest } from '@robojs/server'
import { z } from 'zod'
import { sessionManager } from '../../../../core/manager.js'
import { parseMockToken } from '../../../../utils/id.js'
import { generateTemplateCode, getTemplatesForSession, type GuildTemplate } from '../template-storage.js'

/**
 * GET /api/v10/guilds/:id/templates - List Guild Templates
 * POST /api/v10/guilds/:id/templates - Create Guild Template
 *
 * Templates allow guilds to be duplicated with their structure.
 */
function resolveGuild(request: RoboRequest) {
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

	const { id } = request.params as { id: string }
	const guild = session.state.guilds.get(id)

	if (!guild) {
		return new Response(JSON.stringify({ message: 'Unknown Guild', code: 10004 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	return { session, sessionId, guild, id }
}

const GuildTemplateResponseSchema = z
	.object({
		code: z.string(),
		name: z.string(),
		description: z.string().nullable(),
		usage_count: z.number(),
		creator_id: z.string(),
		creator: z.object({}).passthrough().nullable(),
		created_at: z.string(),
		updated_at: z.string(),
		source_guild_id: z.string(),
		serialized_source_guild: z.object({}).passthrough(),
		is_dirty: z.boolean().nullable()
	})
	.passthrough()

export const GET = define(
	{
		summary: 'List guild templates',
		description: 'Returns an array of guild template objects',
		tags: ['Guild Templates'],
		params: z.object({
			id: z.string().describe('The guild ID (Snowflake)')
		}),
		response: {
			200: z.array(GuildTemplateResponseSchema)
		}
	},
	async (request) => {
		const resolved = resolveGuild(request)
		if (resolved instanceof Response) return resolved
		const { sessionId, id } = resolved

		const templates = getTemplatesForSession(sessionId)

		// Return all templates for this guild
		const guildTemplates = Array.from(templates.values()).filter((t) => t.source_guild_id === id)
		return guildTemplates
	}
)

export const POST = define(
	{
		summary: 'Create guild template',
		description: 'Creates a template for the guild',
		tags: ['Guild Templates'],
		params: z.object({
			id: z.string().describe('The guild ID (Snowflake)')
		}),
		body: z
			.object({
				name: z.string().min(1).max(100),
				description: z.string().nullable().max(120).optional()
			})
			.passthrough(),
		response: {
			200: GuildTemplateResponseSchema
		}
	},
	async (request) => {
		const resolved = resolveGuild(request)
		if (resolved instanceof Response) return resolved
		const { session, sessionId, guild, id } = resolved

		const templates = getTemplatesForSession(sessionId)
		const body = (await request.json()) as { name: string; description?: string }

		if (!body.name) {
			return new Response(JSON.stringify({ message: 'Template name is required', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		const now = new Date().toISOString()
		const code = generateTemplateCode()

		// Build serialized guild structure
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

		const template: GuildTemplate = {
			code,
			name: body.name,
			description: body.description ?? null,
			usage_count: 0,
			creator_id: session.state.botUser.id,
			creator: {
				id: session.state.botUser.id,
				username: session.state.botUser.username,
				discriminator: session.state.botUser.discriminator ?? '0',
				avatar: session.state.botUser.avatar ?? null
			},
			created_at: now,
			updated_at: now,
			source_guild_id: id,
			serialized_source_guild: {
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
			},
			is_dirty: null
		}

		templates.set(code, template)

		return template
	}
)
