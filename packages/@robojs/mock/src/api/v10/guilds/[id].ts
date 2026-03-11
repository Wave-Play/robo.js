import { define } from '@robojs/server'
import type { RoboRequest } from '@robojs/server'
import { z } from 'zod'
import { sessionManager } from '../../../core/manager.js'
import { getGatewayServer } from '../../../core/gateway.js'
import { parseMockToken } from '../../../utils/id.js'
import { buildGuildCreatePayload } from '../../../discord/payloads.js'

/**
 * Generate a fake Discord CDN image hash
 * Discord uses hex strings for image hashes, with 'a_' prefix for animated images
 */
function generateImageHash(dataUrl: string | null): string | null {
	if (dataUrl === null) {
		return null
	}
	// Check if animated (gif)
	const isAnimated = dataUrl.includes('image/gif')
	// Generate a random hex hash (32 chars like Discord)
	const hash = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
	return isAnimated ? `a_${hash}` : hash
}

/**
 * GET /api/v10/guilds/:id - Fetch guild
 * PATCH /api/v10/guilds/:id - Modify guild
 *
 * Returns the guild object for the given ID based on the session identified
 * by the Authorization header (mock token).
 *
 * @see https://discord.com/developers/docs/resources/guild#get-guild
 * @see https://discord.com/developers/docs/resources/guild#modify-guild
 */
function resolveGuild(request: RoboRequest) {
	// Extract session from Authorization header
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

	const { id: guildId } = request.params as { id: string }
	const guild = session.state.guilds.get(guildId)

	if (!guild) {
		return new Response(JSON.stringify({ message: 'Unknown Guild', code: 10004 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	return { session, guild, guildId }
}

const GuildResponseSchema = z
	.object({
		id: z.string(),
		name: z.string(),
		icon: z.string().nullable(),
		description: z.string().nullable(),
		home_header: z.string().nullable(),
		splash: z.string().nullable(),
		discovery_splash: z.string().nullable(),
		features: z.array(z.string()),
		banner: z.string().nullable(),
		owner_id: z.string(),
		application_id: z.string().nullable(),
		region: z.string(),
		afk_channel_id: z.string().nullable(),
		afk_timeout: z.number().int(),
		system_channel_id: z.string().nullable(),
		system_channel_flags: z.number().int(),
		widget_enabled: z.boolean(),
		widget_channel_id: z.string().nullable(),
		verification_level: z.number().int(),
		roles: z.array(z.object({}).passthrough()),
		default_message_notifications: z.number().int(),
		mfa_level: z.number().int(),
		explicit_content_filter: z.number().int(),
		max_presences: z.number().int().nullable(),
		max_members: z.number().int(),
		max_stage_video_channel_users: z.number().int(),
		max_video_channel_users: z.number().int(),
		vanity_url_code: z.string().nullable(),
		premium_tier: z.number().int(),
		premium_subscription_count: z.number().int(),
		preferred_locale: z.string(),
		rules_channel_id: z.string().nullable(),
		safety_alerts_channel_id: z.string().nullable(),
		public_updates_channel_id: z.string().nullable(),
		premium_progress_bar_enabled: z.boolean(),
		nsfw: z.boolean(),
		nsfw_level: z.number().int(),
		emojis: z.array(z.object({}).passthrough()),
		stickers: z.array(z.object({}).passthrough()),
		premium_progress_bar_enabled_user_updated_at: z.string().nullable().optional(),
		approximate_member_count: z.number().int().nullable().optional(),
		approximate_presence_count: z.number().int().nullable().optional()
	})
	.passthrough()

export const GET = define(
	{
		summary: 'Get guild',
		description: 'Returns the guild object for the given ID',
		tags: ['Guilds'],
		params: z.object({
			id: z.string().describe('The guild ID (Snowflake)')
		}),
		query: z.object({
			with_counts: z.coerce.boolean().optional().describe('Whether to include approximate member and presence counts')
		}),
		response: {
			200: GuildResponseSchema
		}
	},
	async (request) => {
		const resolved = resolveGuild(request)
		if (resolved instanceof Response) return resolved
		const { session, guild } = resolved

		// Build and return the guild payload
		const payload = buildGuildCreatePayload({
			sessionState: session.state,
			guild,
			sequence: session.state.sequence
		})

		// payload.d is the guild object
		return payload.d
	}
)

export const PATCH = define(
	{
		summary: 'Update guild',
		description: 'Modify a guild\'s settings',
		tags: ['Guilds'],
		params: z.object({
			id: z.string().describe('The guild ID (Snowflake)')
		}),
		body: z
			.object({
				name: z.string().min(2).max(100).optional(),
				description: z.string().max(300).nullable().optional(),
				region: z.string().nullable().optional(),
				icon: z.string().nullable().optional(),
				verification_level: z.number().int().nullable().optional(),
				default_message_notifications: z.number().int().nullable().optional(),
				explicit_content_filter: z.number().int().nullable().optional(),
				preferred_locale: z.string().nullable().optional(),
				afk_timeout: z.number().int().nullable().optional(),
				afk_channel_id: z.string().nullable().optional(),
				system_channel_id: z.string().nullable().optional(),
				splash: z.string().nullable().optional(),
				banner: z.string().nullable().optional(),
				system_channel_flags: z.number().int().nullable().optional(),
				features: z.array(z.string()).nullable().optional(),
				discovery_splash: z.string().nullable().optional(),
				home_header: z.string().nullable().optional(),
				rules_channel_id: z.string().nullable().optional(),
				safety_alerts_channel_id: z.string().nullable().optional(),
				public_updates_channel_id: z.string().nullable().optional(),
				premium_progress_bar_enabled: z.boolean().nullable().optional(),
				owner_id: z.string().optional()
			})
			.passthrough(),
		response: {
			200: GuildResponseSchema
		}
	},
	async (request) => {
		const resolved = resolveGuild(request)
		if (resolved instanceof Response) return resolved
		const { session, guild, guildId } = resolved

		let body: Record<string, unknown>
		try {
			body = await request.json()
		} catch {
			return new Response(JSON.stringify({ message: 'Invalid JSON body', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Update guild fields
		if (body.name !== undefined) {
			guild.name = String(body.name)
		}
		if (body.description !== undefined) {
			guild.description = body.description === null ? null : String(body.description)
		}
		if (body.afk_channel_id !== undefined) {
			guild.afkChannelId = body.afk_channel_id as string | null
		}
		if (body.afk_timeout !== undefined) {
			guild.afkTimeout = Number(body.afk_timeout)
		}
		if (body.system_channel_id !== undefined) {
			guild.systemChannelId = body.system_channel_id as string | null
		}
		if (body.system_channel_flags !== undefined) {
			guild.systemChannelFlags = Number(body.system_channel_flags)
		}
		if (body.verification_level !== undefined) {
			guild.verificationLevel = Number(body.verification_level)
		}
		if (body.default_message_notifications !== undefined) {
			guild.defaultMessageNotifications = Number(body.default_message_notifications)
		}
		if (body.explicit_content_filter !== undefined) {
			guild.explicitContentFilter = Number(body.explicit_content_filter)
		}
		if (body.mfa_level !== undefined) {
			guild.mfaLevel = Number(body.mfa_level)
		}
		// Handle image fields - generate hashes from data URLs
		if (body.icon !== undefined) {
			guild.icon = generateImageHash(body.icon as string | null)
		}
		if (body.splash !== undefined) {
			guild.splash = generateImageHash(body.splash as string | null)
		}
		if (body.banner !== undefined) {
			guild.banner = generateImageHash(body.banner as string | null)
		}
		if (body.discovery_splash !== undefined) {
			guild.discoverySplash = generateImageHash(body.discovery_splash as string | null)
		}
		// Handle premium tier and features
		if (body.premium_tier !== undefined) {
			guild.premiumTier = Number(body.premium_tier)
		}
		if (body.features !== undefined) {
			guild.features = body.features as string[]
		}
		// Premium progress bar and preferred locale
		if (body.premium_progress_bar_enabled !== undefined) {
			guild.premiumProgressBarEnabled = Boolean(body.premium_progress_bar_enabled)
		}
		if (body.preferred_locale !== undefined) {
			guild.preferredLocale = String(body.preferred_locale)
		}
		// Guild ownership transfer
		if (body.owner_id !== undefined) {
			guild.ownerId = String(body.owner_id)
		}

		// Dispatch GUILD_UPDATE event
		session.state.sequence++
		const payload = buildGuildCreatePayload({
			sessionState: session.state,
			guild,
			sequence: session.state.sequence
		})

		// Dispatch GUILD_UPDATE to connected clients
		getGatewayServer().dispatchToSession(session.id, 'GUILD_UPDATE', payload.d, guildId)

		// Record the action
		session.recordAction('guild_update', {
			guild_id: guildId,
			changes: body
		})

		// Build and return the guild payload
		const returnPayload = buildGuildCreatePayload({
			sessionState: session.state,
			guild,
			sequence: session.state.sequence
		})

		// payload.d is the guild object
		return returnPayload.d
	}
)
