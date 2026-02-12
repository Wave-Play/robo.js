import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../core/manager.js'
import { getStageServer } from '../../../../core/stage.js'
import { notFound } from '../../utils.js'

/**
 * GET /api/control/sessions/:id/emojis - List all emojis for all guilds
 * POST /api/control/sessions/:id/emojis - Create a new emoji
 *
 * POST body:
 * {
 *   guild_id: string,   // Guild to add emoji to
 *   name: string,       // Emoji name (2-32 chars, alphanumeric + underscore)
 *   image: string,      // Base64 data URI of the image
 *   roles?: string[],   // Optional role IDs that can use this emoji
 * }
 */

function resolveSession(request: RoboRequest) {
	const { id } = request.params as { id: string }
	if (!id) return notFound('Session ID required')
	const session = sessionManager.get(id)
	if (!session) return notFound('Session not found')
	return { session, id }
}

export async function GET(request: RoboRequest) {
	const resolved = resolveSession(request)
	if (resolved instanceof Response) return resolved
	const { session } = resolved

	const guilds: Array<{ guild_id: string; guild_name: string; emojis: unknown[] }> = []

	for (const guild of session.state.guilds.values()) {
		const guildEmojis = session.state.getGuildEmojis(guild.id)
		guilds.push({
			guild_id: guild.id,
			guild_name: guild.name,
			emojis: guildEmojis.map((e) => ({
				id: e.id,
				name: e.name,
				animated: e.animated,
				guild_id: guild.id,
				available: e.available
			}))
		})
	}

	return { guilds }
}

export async function POST(request: RoboRequest) {
	const resolved = resolveSession(request)
	if (resolved instanceof Response) return resolved
	const { session, id } = resolved

	const body = (await request.json()) as {
		guild_id: string
		name: string
		image: string
		roles?: string[]
	}

	if (!body.guild_id || !body.name || !body.image) {
		return new Response(JSON.stringify({ message: 'guild_id, name, and image are required' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Validate name
	if (!/^[a-zA-Z0-9_]+$/.test(body.name)) {
		return new Response(JSON.stringify({ message: 'Name must be alphanumeric with underscores only' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	if (body.name.length < 2 || body.name.length > 32) {
		return new Response(JSON.stringify({ message: 'Name must be 2-32 characters' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Check guild exists
	const guild = session.state.guilds.get(body.guild_id)
	if (!guild) {
		return new Response(JSON.stringify({ message: 'Guild not found' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Determine if animated based on image format
	const isAnimated = body.image.startsWith('data:image/gif')

	// Create emoji
	const emoji = session.state.createGuildEmoji(
		body.guild_id,
		{
			name: body.name,
			animated: isAnimated,
			roles: body.roles ?? []
		},
		session.state.botUser.id
	)

	if (!emoji) {
		return new Response(JSON.stringify({ message: 'Failed to create emoji (limit reached or invalid data)' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Dispatch emoji update event
	await session.dispatchGuildEmojisUpdate(body.guild_id)

	// Broadcast control action for toast notification
	const stageServer = getStageServer()
	stageServer.broadcastControlAction(
		id,
		'emoji_create',
		`Emoji :${emoji.name}: was added`,
		'success',
		{ type: 'user', name: 'DevTools' }
	)

	return {
		success: true,
		emoji: {
			id: emoji.id,
			name: emoji.name,
			animated: emoji.animated,
			guild_id: body.guild_id,
			available: emoji.available
		}
	}
}
