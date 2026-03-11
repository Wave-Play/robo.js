import { define } from '@robojs/server'
import type { RoboRequest } from '@robojs/server'
import { z } from 'zod'
import { sessionManager } from '../../../../core/manager.js'
import { parseMockToken } from '../../../../utils/id.js'
import { mockWebhookToAPIWebhook } from '../../../../discord/payloads.js'
import { WebhookLimits } from '../../../../types/index.js'

/**
 * GET /api/v10/channels/:id/webhooks - List all webhooks for a channel
 * POST /api/v10/channels/:id/webhooks - Create a webhook in a channel
 *
 * @see https://discord.com/developers/docs/resources/webhook#get-channel-webhooks
 * @see https://discord.com/developers/docs/resources/webhook#create-webhook
 */

const WebhookChannelParams = z.object({
	id: z.string().describe('Channel ID (Snowflake)')
})

const WebhookUserSchema = z.object({
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
}).passthrough()

const WebhookResponseSchema = z.object({
	id: z.string(),
	type: z.number().int(),
	guild_id: z.string().nullable().optional(),
	channel_id: z.string().nullable(),
	name: z.string(),
	avatar: z.string().nullable(),
	application_id: z.string().nullable(),
	user: WebhookUserSchema.optional(),
	token: z.string().optional(),
	url: z.string().optional()
}).passthrough()

const CreateWebhookBodySchema = z.object({
	name: z.string().min(1).max(80),
	avatar: z.string().nullable().optional()
}).passthrough()
function resolveChannelForWebhook(request: RoboRequest) {
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

	const { id: channelId } = request.params as { id: string }

	const channel = session.state.getChannel(channelId)
	if (!channel) {
		return new Response(JSON.stringify({ message: 'Unknown Channel', code: 10003 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	return { session, channel, channelId }
}

export const GET = define(
	{
		summary: 'List channel webhooks',
		tags: ['Channels'],
		params: WebhookChannelParams,
		response: {
			200: z.array(WebhookResponseSchema).nullable()
		}
	},
	async (request) => {
		const resolved = resolveChannelForWebhook(request as unknown as RoboRequest)
		if (resolved instanceof Response) return resolved
		const { session, channelId } = resolved

		const webhooks = session.state.getWebhooksForChannel(channelId)
		// Include token for webhooks created by the requesting user (bot)
		return webhooks.map((w) => mockWebhookToAPIWebhook(w, w.user?.id === session.state.botUser.id))
	}
)

export const POST = define(
	{
		summary: 'Create webhook',
		tags: ['Channels'],
		params: WebhookChannelParams,
		body: CreateWebhookBodySchema,
		response: {
			200: WebhookResponseSchema
		}
	},
	async (request) => {
		const resolved = resolveChannelForWebhook(request as unknown as RoboRequest)
		if (resolved instanceof Response) return resolved
		const { session, channel, channelId } = resolved

		let body: {
			name: string
			avatar?: string | null
		}

		try {
			body = await request.json()
		} catch {
			return new Response(JSON.stringify({ message: 'Invalid request body', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Validate required name field
		if (!body.name || typeof body.name !== 'string') {
			return new Response(JSON.stringify({ message: 'Name is required', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Validate name length
		if (body.name.length < WebhookLimits.MIN_NAME_LENGTH) {
			return new Response(
				JSON.stringify({ message: `Webhook name must be at least ${WebhookLimits.MIN_NAME_LENGTH} character`, code: 50035 }),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				}
			)
		}

		if (body.name.length > WebhookLimits.MAX_NAME_LENGTH) {
			return new Response(
				JSON.stringify({ message: `Webhook name cannot exceed ${WebhookLimits.MAX_NAME_LENGTH} characters`, code: 50035 }),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				}
			)
		}

		// Validate name doesn't contain reserved words (Discord reserved)
		const nameLower = body.name.toLowerCase()
		if (nameLower.includes('clyde')) {
			return new Response(
				JSON.stringify({ message: 'Webhook name cannot contain "clyde"', code: 50035 }),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				}
			)
		}
		if (nameLower.includes('discord')) {
			return new Response(
				JSON.stringify({ message: 'Webhook name cannot contain "discord"', code: 50035 }),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				}
			)
		}

		// Check channel webhook limit
		const channelWebhooks = session.state.getWebhooksForChannel(channelId)
		if (channelWebhooks.length >= WebhookLimits.MAX_WEBHOOKS_PER_CHANNEL) {
			return new Response(
				JSON.stringify({
					error: `Channel has reached maximum webhook limit of ${WebhookLimits.MAX_WEBHOOKS_PER_CHANNEL}`,
					code: 30007
				}),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				}
			)
		}

		// Create the webhook
		const webhook = session.state.createWebhook(
			channelId,
			{
				name: body.name,
				avatar: body.avatar
			},
			session.state.botUser.id
		)

		if (!webhook) {
			return new Response(JSON.stringify({ message: 'Failed to create webhook', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Record action
		session.recordAction(
			'webhook_created',
			{
				webhook_id: webhook.id,
				channel_id: channelId,
				guild_id: channel.guildId,
				name: webhook.name
			},
			{
				endpoint: `POST /channels/${channelId}/webhooks`,
				method: 'POST'
			}
		)

		// Dispatch WEBHOOKS_UPDATE gateway event
		if (channel.guildId) {
			await session.dispatch('WEBHOOKS_UPDATE', {
				guild_id: channel.guildId,
				channel_id: channelId
			})
		}

		// Return webhook with token (creator always gets token)
		return new Response(JSON.stringify(mockWebhookToAPIWebhook(webhook, true)), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		})
	}
)
