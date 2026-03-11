import { define } from '@robojs/server'
import type { RoboRequest } from '@robojs/server'
import { z } from 'zod'
import { sessionManager } from '../../../../core/manager.js'
import { parseMockToken } from '../../../../utils/id.js'

/**
 * GET /api/v10/guilds/:id/welcome-screen - Get guild welcome screen
 * PATCH /api/v10/guilds/:id/welcome-screen - Modify guild welcome screen
 *
 * @see https://discord.com/developers/docs/resources/guild#get-guild-welcome-screen
 * @see https://discord.com/developers/docs/resources/guild#modify-guild-welcome-screen
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

	// Initialize welcome screen if not exists
	if (!guild.welcomeScreen) {
		guild.welcomeScreen = {
			description: null,
			welcome_channels: []
		}
	}

	return { session, guild, guildId }
}

const GuildWelcomeScreenResponseSchema = z
	.object({
		description: z.string().nullable(),
		welcome_channels: z.array(
			z
				.object({
					channel_id: z.string(),
					description: z.string(),
					emoji_id: z.string().nullable().optional(),
					emoji_name: z.string().nullable().optional()
				})
				.passthrough()
		)
	})
	.passthrough()

export const GET = define(
	{
		summary: 'Get guild welcome screen',
		description: 'Returns the welcome screen object for the guild',
		tags: ['Guilds'],
		params: z.object({
			id: z.string().describe('The guild ID (Snowflake)')
		}),
		response: {
			200: GuildWelcomeScreenResponseSchema
		}
	},
	async (request) => {
		const resolved = resolveGuild(request)
		if (resolved instanceof Response) return resolved
		const { guild } = resolved

		// Return welcome screen
		// Note: Discord API doesn't return 'enabled' in the response - it's input-only
		return {
			description: guild.welcomeScreen.description,
			welcome_channels: guild.welcomeScreen.welcome_channels.map((channel) => ({
				channel_id: channel.channel_id,
				description: channel.description,
				emoji_id: channel.emoji_id,
				emoji_name: channel.emoji_name
			}))
		}
	}
)

export const PATCH = define(
	{
		summary: 'Update guild welcome screen',
		description: 'Modify the guild\'s welcome screen',
		tags: ['Guilds'],
		params: z.object({
			id: z.string().describe('The guild ID (Snowflake)')
		}),
		body: z
			.object({
				description: z.string().max(140).nullable().optional(),
				welcome_channels: z.array(z.object({}).passthrough()).nullable().optional(),
				enabled: z.boolean().nullable().optional()
			})
			.passthrough(),
		response: {
			200: GuildWelcomeScreenResponseSchema
		}
	},
	async (request) => {
		const resolved = resolveGuild(request)
		if (resolved instanceof Response) return resolved
		const { guild } = resolved

		// Parse request body
		let body: {
			enabled?: boolean
			welcome_channels?: Array<{
				channel_id: string
				description: string
				emoji_id?: string | null
				emoji_name?: string | null
			}>
			description?: string | null
		}

		try {
			body = await request.json()
		} catch {
			return new Response(JSON.stringify({ message: 'Invalid JSON body', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Update welcome screen
		if (body.description !== undefined) {
			guild.welcomeScreen.description = body.description
		}

		if (body.welcome_channels !== undefined) {
			guild.welcomeScreen.welcome_channels = body.welcome_channels.map((channel) => ({
				channel_id: channel.channel_id,
				description: channel.description,
				emoji_id: channel.emoji_id ?? null,
				emoji_name: channel.emoji_name ?? null
			}))
		}

		if (body.enabled !== undefined) {
			guild.welcomeScreen.enabled = body.enabled
		}

		// Return welcome screen
		// Note: Discord API doesn't return 'enabled' in the response - it's input-only
		return {
			description: guild.welcomeScreen.description,
			welcome_channels: guild.welcomeScreen.welcome_channels.map((channel) => ({
				channel_id: channel.channel_id,
				description: channel.description,
				emoji_id: channel.emoji_id,
				emoji_name: channel.emoji_name
			}))
		}
	}
)
