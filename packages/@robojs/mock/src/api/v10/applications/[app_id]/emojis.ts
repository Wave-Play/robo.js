import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../core/manager.js'
import { parseMockToken } from '../../../../utils/id.js'
import { generateSnowflake } from '../../../../utils/snowflake.js'
import type { MockEmoji } from '../../../../types/index.js'

function resolveAppEmojis(request: RoboRequest) {
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

	const { app_id } = request.params as { app_id: string }

	// Validate app_id matches session
	if (app_id !== session.state.applicationId && app_id !== '@me') {
		return new Response(JSON.stringify({ message: 'Forbidden', code: 50001 }), {
			status: 403,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	return { session }
}

// GET - List application emojis
export async function GET(request: RoboRequest) {
	const resolved = resolveAppEmojis(request)
	if (resolved instanceof Response) return resolved
	const { session } = resolved

	const emojis = Array.from(session.state.applicationEmojis.values()).map(emoji => ({
		id: emoji.id,
		name: emoji.name,
		animated: emoji.animated ?? false
	}))

	return emojis
}

// POST - Create application emoji
export async function POST(request: RoboRequest) {
	const resolved = resolveAppEmojis(request)
	if (resolved instanceof Response) return resolved
	const { session } = resolved

	const body = await request.json() as { image?: string; name?: string }

	if (!body.name || typeof body.name !== 'string') {
		return new Response(JSON.stringify({ message: 'Missing name', code: 50035 }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	if (!body.image || typeof body.image !== 'string') {
		return new Response(JSON.stringify({ message: 'Missing image', code: 50035 }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Validate base64 data URI
	if (!body.image.startsWith('data:image/')) {
		return new Response(JSON.stringify({ message: 'Invalid image data', code: 50035 }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Check emoji limit (max 200 application emojis)
	if (session.state.applicationEmojis.size >= 200) {
		return new Response(JSON.stringify({ message: 'Maximum number of emojis reached (200)', code: 30008 }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	const emojiId = generateSnowflake()
	const isAnimated = body.image.includes('data:image/gif')

	const emoji: MockEmoji = {
		id: emojiId,
		name: body.name,
		animated: isAnimated,
		available: true
	}

	session.state.applicationEmojis.set(emojiId, emoji)

	return new Response(
		JSON.stringify({
			id: emoji.id,
			name: emoji.name,
			animated: emoji.animated
		}),
		{
			status: 201,
			headers: { 'Content-Type': 'application/json' }
		}
	)
}
