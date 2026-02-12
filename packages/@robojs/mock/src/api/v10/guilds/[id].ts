import type { RoboRequest } from '@robojs/server'
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
export default async (request: RoboRequest) => {
	// Validate method
	if (request.method !== 'GET' && request.method !== 'PATCH') {
		return new Response(JSON.stringify({ message: 'Method not allowed' }), {
			status: 405,
			headers: { 'Content-Type': 'application/json' }
		})
	}

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

	// Handle PATCH - Modify guild
	if (request.method === 'PATCH') {
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
		session.recordAction('GUILD_UPDATE', {
			guild_id: guildId,
			changes: body
		})
	}

	// Build and return the guild payload
	const payload = buildGuildCreatePayload({
		sessionState: session.state,
		guild,
		sequence: session.state.sequence
	})

	// payload.d is the guild object
	return payload.d
}
