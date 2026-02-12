import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../core/manager.js'
import { parseMockToken } from '../../../../utils/id.js'
import { generateSnowflake } from '../../../../utils/snowflake.js'

/**
 * GET /api/v10/guilds/:id/onboarding - Get guild onboarding
 * PUT /api/v10/guilds/:id/onboarding - Modify guild onboarding
 *
 * @see https://discord.com/developers/docs/resources/guild#get-guild-onboarding
 * @see https://discord.com/developers/docs/resources/guild#modify-guild-onboarding
 */
function resolveGuild(request: RoboRequest) {
	// Parse Authorization header -> get session
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
		return new Response(JSON.stringify({ message: 'Unauthorized', code: 0 }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Extract guild ID from params
	const { id: guildId } = request.params as { id: string }

	// Validate guild exists
	const guild = session.state.guilds.get(guildId)
	if (!guild) {
		return new Response(JSON.stringify({ message: 'Unknown Guild', code: 10004 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Initialize onboarding if not exists
	if (!guild.onboarding) {
		guild.onboarding = {
			guild_id: guildId,
			prompts: [],
			default_channel_ids: [],
			enabled: false,
			mode: 0 // GuildOnboardingMode.Default
		}
	}

	return { session, guild, guildId }
}

export async function GET(request: RoboRequest) {
	const resolved = resolveGuild(request)
	if (resolved instanceof Response) return resolved
	const { guild, guildId } = resolved

	// Return onboarding
	return {
		guild_id: guildId,
		prompts: guild.onboarding.prompts.map((prompt) => ({
			id: prompt.id,
			type: prompt.type,
			title: prompt.title,
			single_select: prompt.single_select,
			required: prompt.required,
			in_onboarding: prompt.in_onboarding,
			options: prompt.options.map((option) => ({
				id: option.id,
				title: option.title,
				description: option.description,
				channel_ids: option.channel_ids,
				role_ids: option.role_ids,
				emoji: option.emoji
			}))
		})),
		default_channel_ids: guild.onboarding.default_channel_ids,
		enabled: guild.onboarding.enabled,
		mode: guild.onboarding.mode
	}
}

export async function PUT(request: RoboRequest) {
	const resolved = resolveGuild(request)
	if (resolved instanceof Response) return resolved
	const { guild, guildId } = resolved

	// Parse request body
	let body: {
		prompts?: Array<{
			id?: string
			type: number
			title: string
			single_select: boolean
			required: boolean
			in_onboarding: boolean
			options: Array<{
				id?: string
				title: string
				description?: string | null
				channel_ids: string[]
				role_ids: string[]
				emoji?: {
					id?: string | null
					name?: string | null
					animated?: boolean
				}
			}>
		}>
		default_channel_ids?: string[]
		enabled?: boolean
		mode?: number
	}

	try {
		body = await request.json()
	} catch {
		return new Response(JSON.stringify({ message: 'Invalid JSON body', code: 50035 }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Update onboarding
	if (body.prompts !== undefined) {
		guild.onboarding.prompts = body.prompts.map((prompt) => ({
			id: prompt.id ?? generateSnowflake(),
			type: prompt.type,
			title: prompt.title,
			single_select: prompt.single_select,
			required: prompt.required,
			in_onboarding: prompt.in_onboarding,
			options: prompt.options.map((option) => ({
				id: option.id ?? generateSnowflake(),
				title: option.title,
				description: option.description ?? null,
				channel_ids: option.channel_ids,
				role_ids: option.role_ids,
				emoji: option.emoji ?? null
			}))
		}))
	}

	if (body.default_channel_ids !== undefined) {
		guild.onboarding.default_channel_ids = body.default_channel_ids
	}

	if (body.enabled !== undefined) {
		guild.onboarding.enabled = body.enabled
	}

	if (body.mode !== undefined) {
		guild.onboarding.mode = body.mode
	}

	// Return onboarding
	return {
		guild_id: guildId,
		prompts: guild.onboarding.prompts.map((prompt) => ({
			id: prompt.id,
			type: prompt.type,
			title: prompt.title,
			single_select: prompt.single_select,
			required: prompt.required,
			in_onboarding: prompt.in_onboarding,
			options: prompt.options.map((option) => ({
				id: option.id,
				title: option.title,
				description: option.description,
				channel_ids: option.channel_ids,
				role_ids: option.role_ids,
				emoji: option.emoji
			}))
		})),
		default_channel_ids: guild.onboarding.default_channel_ids,
		enabled: guild.onboarding.enabled,
		mode: guild.onboarding.mode
	}
}
