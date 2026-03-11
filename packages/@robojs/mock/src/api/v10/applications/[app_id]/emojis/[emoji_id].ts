import { define } from '@robojs/server'
import type { RoboRequest } from '@robojs/server'
import { z } from 'zod'
import { sessionManager } from '../../../../../core/manager.js'
import { parseMockToken } from '../../../../../utils/id.js'

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

function resolveAppEmoji(request: RoboRequest) {
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

	const { app_id, emoji_id } = request.params as { app_id: string; emoji_id: string }

	// Validate app_id matches session
	if (app_id !== session.state.applicationId && app_id !== '@me') {
		return new Response(JSON.stringify({ message: 'Forbidden', code: 50001 }), {
			status: 403,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	return { session, emoji_id }
}

// GET - Fetch specific emoji
export const GET = define(
	{
		summary: 'Get application emoji',
		description: 'Returns an emoji object for the given application and emoji IDs',
		tags: ['Application Emojis'],
		params: z.object({
			app_id: z.string().describe('The application ID (Snowflake)'),
			emoji_id: z.string().describe('The emoji ID (Snowflake)')
		}),
		response: {
			200: EmojiResponseSchema
		}
	},
	async (request) => {
		const resolved = resolveAppEmoji(request as unknown as RoboRequest)
		if (resolved instanceof Response) return resolved
		const { session, emoji_id } = resolved

		const emoji = session.state.applicationEmojis.get(emoji_id)
		if (!emoji) {
			return new Response(JSON.stringify({ message: 'Unknown Emoji', code: 10014 }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		return {
			id: emoji.id,
			name: emoji.name,
			roles: [],
			require_colons: true,
			managed: false,
			animated: emoji.animated ?? false,
			available: emoji.available ?? true
		}
	}
)

// PATCH - Update emoji
export const PATCH = define(
	{
		summary: 'Update application emoji',
		description: 'Modify the given emoji. Returns the updated emoji object on success',
		tags: ['Application Emojis'],
		params: z.object({
			app_id: z.string().describe('The application ID (Snowflake)'),
			emoji_id: z.string().describe('The emoji ID (Snowflake)')
		}),
		body: z
			.object({
				name: z.string().min(2).max(32).optional()
			})
			.passthrough(),
		response: {
			200: EmojiResponseSchema
		}
	},
	async (request) => {
		const resolved = resolveAppEmoji(request as unknown as RoboRequest)
		if (resolved instanceof Response) return resolved
		const { session, emoji_id } = resolved

		const emoji = session.state.applicationEmojis.get(emoji_id)
		if (!emoji) {
			return new Response(JSON.stringify({ message: 'Unknown Emoji', code: 10014 }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		const body = (await request.json()) as { name?: string }

		// Update name if provided
		if (body.name !== undefined) {
			if (typeof body.name !== 'string' || body.name.length < 2 || body.name.length > 32) {
				return new Response(JSON.stringify({ message: 'Invalid emoji name', code: 50035 }), {
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				})
			}
			emoji.name = body.name
		}

		return {
			id: emoji.id,
			name: emoji.name,
			roles: [],
			require_colons: true,
			managed: false,
			animated: emoji.animated ?? false,
			available: emoji.available ?? true
		}
	}
)

// DELETE - Delete emoji
export const DELETE = define(
	{
		summary: 'Delete application emoji',
		description: 'Delete the given emoji from the application',
		tags: ['Application Emojis'],
		params: z.object({
			app_id: z.string().describe('The application ID (Snowflake)'),
			emoji_id: z.string().describe('The emoji ID (Snowflake)')
		}),
		response: {
			204: z.undefined()
		}
	},
	async (request) => {
		const resolved = resolveAppEmoji(request as unknown as RoboRequest)
		if (resolved instanceof Response) return resolved
		const { session, emoji_id } = resolved

		const emoji = session.state.applicationEmojis.get(emoji_id)
		if (!emoji) {
			return new Response(JSON.stringify({ message: 'Unknown Emoji', code: 10014 }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		session.state.applicationEmojis.delete(emoji_id)

		return new Response(null, { status: 204 })
	}
)
