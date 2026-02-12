import type { RoboRequest } from '@robojs/server'
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

export async function GET(request: RoboRequest) {
	const resolved = resolveChannelForWebhook(request)
	if (resolved instanceof Response) return resolved
	const { session, channelId } = resolved

	const webhooks = session.state.getWebhooksForChannel(channelId)
	// Include token for webhooks created by the requesting user (bot)
	return webhooks.map((w) => mockWebhookToAPIWebhook(w, w.user?.id === session.state.botUser.id))
}

export async function POST(request: RoboRequest) {
	const resolved = resolveChannelForWebhook(request)
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
