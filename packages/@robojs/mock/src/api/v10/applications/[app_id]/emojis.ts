import { define } from '@robojs/server'
import type { RoboRequest } from '@robojs/server'
import { z } from 'zod'
import { sessionManager } from '../../../../core/manager.js'
import { parseMockToken } from '../../../../utils/id.js'
import { generateSnowflake } from '../../../../utils/snowflake.js'
import type { MockEmoji } from '../../../../types/index.js'

const UserResponseSchema = z
	.object({
		id: z.string(),
		username: z.string(),
		avatar: z.string().nullable(),
		discriminator: z.string(),
		public_flags: z.number().int(),
		flags: z.number(),
		bot: z.boolean().optional(),
		system: z.boolean().optional(),
		banner: z.string().nullable().optional(),
		accent_color: z.number().int().nullable().optional(),
		global_name: z.string().nullable(),
		avatar_decoration_data: z.object({}).passthrough().nullable().optional(),
		collectibles: z.object({}).passthrough().nullable().optional(),
		primary_guild: z.object({}).passthrough().nullable()
	})
	.passthrough()

const EmojiResponseSchema = z
	.object({
		id: z.string(),
		name: z.string(),
		user: UserResponseSchema.optional(),
		roles: z.array(z.string()),
		require_colons: z.boolean(),
		managed: z.boolean(),
		animated: z.boolean(),
		available: z.boolean()
	})
	.passthrough()

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
export const GET = define(
	{
		summary: 'List application emojis',
		description: 'Returns a list of emojis for the given application',
		tags: ['Application Emojis'],
		params: z.object({
			app_id: z.string().describe('The application ID (Snowflake)')
		}),
		response: {
			200: z.object({
				items: z.array(EmojiResponseSchema)
			})
		}
	},
	async (request) => {
		const resolved = resolveAppEmojis(request as unknown as RoboRequest)
		if (resolved instanceof Response) return resolved
		const { session } = resolved

		const emojis = Array.from(session.state.applicationEmojis.values()).map((emoji) => ({
			id: emoji.id,
			name: emoji.name,
			roles: [],
			require_colons: true,
			managed: false,
			animated: emoji.animated ?? false,
			available: emoji.available ?? true
		}))

		return { items: emojis }
	}
)

// POST - Create application emoji
export const POST = define(
	{
		summary: 'Create application emoji',
		description: 'Create a new emoji for the application. Returns the new emoji object on success',
		tags: ['Application Emojis'],
		params: z.object({
			app_id: z.string().describe('The application ID (Snowflake)')
		}),
		body: z.object({
			name: z.string().min(2).max(32),
			image: z.string().describe('Base64 encoded image data')
		}),
		response: {
			201: EmojiResponseSchema
		}
	},
	async (request) => {
		const resolved = resolveAppEmojis(request as unknown as RoboRequest)
		if (resolved instanceof Response) return resolved
		const { session } = resolved

		const body = (await request.json()) as { image?: string; name?: string }

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
				roles: [],
				require_colons: true,
				managed: false,
				animated: emoji.animated,
				available: emoji.available ?? true
			}),
			{
				status: 201,
				headers: { 'Content-Type': 'application/json' }
			}
		)
	}
)
