import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../core/manager.js'
import { parseMockToken } from '../../../utils/id.js'
import { mockWebhookToAPIWebhook } from '../../../discord/payloads.js'
import { WebhookLimits } from '../../../types/index.js'

/**
 * GET /api/v10/webhooks/:webhook_id - Get a webhook by ID (requires auth)
 * PATCH /api/v10/webhooks/:webhook_id - Modify a webhook (requires auth)
 * DELETE /api/v10/webhooks/:webhook_id - Delete a webhook (requires auth)
 *
 * @see https://discord.com/developers/docs/resources/webhook#get-webhook
 * @see https://discord.com/developers/docs/resources/webhook#modify-webhook
 * @see https://discord.com/developers/docs/resources/webhook#delete-webhook
 */

function resolveWebhook(request: RoboRequest) {
	// 1. Parse Authorization header → get session
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

	// 2. Extract webhook ID from params
	const { id: webhookId } = request.params as { id: string }

	// 3. Get the webhook
	const webhook = session.state.getWebhook(webhookId)
	if (!webhook) {
		return new Response(JSON.stringify({ message: 'Unknown Webhook', code: 10015 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	return { session, webhookId, webhook }
}

export async function GET(request: RoboRequest) {
	const resolved = resolveWebhook(request)
	if (resolved instanceof Response) return resolved
	const { session, webhook } = resolved

	// Include token only if the requesting user is the webhook creator
	const isCreator = webhook.user?.id === session.state.botUser.id
	return mockWebhookToAPIWebhook(webhook, isCreator)
}

export async function PATCH(request: RoboRequest) {
	const resolved = resolveWebhook(request)
	if (resolved instanceof Response) return resolved
	const { session, webhookId, webhook } = resolved

	let body: {
		name?: string
		avatar?: string | null
		channel_id?: string
	}

	try {
		body = await request.json()
	} catch {
		return new Response(JSON.stringify({ message: 'Invalid request body', code: 50035 }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Validate name if provided
	if (body.name !== undefined) {
		if (typeof body.name !== 'string') {
			return new Response(JSON.stringify({ message: 'Name must be a string', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

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

		// Validate name doesn't contain reserved words
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
	}

	// Validate channel_id if provided
	if (body.channel_id !== undefined) {
		const targetChannel = session.state.getChannel(body.channel_id)
		if (!targetChannel) {
			return new Response(JSON.stringify({ message: 'Unknown Channel', code: 10003 }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Check target channel webhook limit
		const targetWebhooks = session.state.getWebhooksForChannel(body.channel_id)
		// Exclude current webhook if it's being moved
		const existingInTarget = targetWebhooks.filter((w) => w.id !== webhookId)
		if (existingInTarget.length >= WebhookLimits.MAX_WEBHOOKS_PER_CHANNEL) {
			return new Response(
				JSON.stringify({
					error: `Target channel has reached maximum webhook limit of ${WebhookLimits.MAX_WEBHOOKS_PER_CHANNEL}`,
					code: 30007
				}),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				}
			)
		}
	}

	// Capture old channel for WEBHOOKS_UPDATE dispatch when moving
	const oldChannelId = webhook.channel_id

	// Update the webhook
	const updatedWebhook = session.state.updateWebhook(webhookId, {
		name: body.name,
		avatar: body.avatar,
		channel_id: body.channel_id
	})

	if (!updatedWebhook) {
		return new Response(JSON.stringify({ message: 'Failed to update webhook', code: 50035 }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Record action
	session.recordAction(
		'webhook_updated',
		{
			webhook_id: webhookId,
			channel_id: updatedWebhook.channel_id,
			guild_id: updatedWebhook.guild_id,
			name: updatedWebhook.name,
			updates: body
		},
		{
			endpoint: `PATCH /webhooks/${webhookId}`,
			method: 'PATCH'
		}
	)

	// Dispatch WEBHOOKS_UPDATE gateway event
	if (updatedWebhook.guild_id) {
		// If channel changed, dispatch for both old and new channels
		if (oldChannelId !== updatedWebhook.channel_id) {
			await session.dispatch('WEBHOOKS_UPDATE', {
				guild_id: updatedWebhook.guild_id,
				channel_id: oldChannelId
			})
		}
		await session.dispatch('WEBHOOKS_UPDATE', {
			guild_id: updatedWebhook.guild_id,
			channel_id: updatedWebhook.channel_id
		})
	}

	// Include token only if the requesting user is the webhook creator
	const isCreator = updatedWebhook.user?.id === session.state.botUser.id
	return mockWebhookToAPIWebhook(updatedWebhook, isCreator)
}

export async function DELETE(request: RoboRequest) {
	const resolved = resolveWebhook(request)
	if (resolved instanceof Response) return resolved
	const { session, webhookId, webhook } = resolved

	const channelId = webhook.channel_id
	const guildId = webhook.guild_id

	const deleted = session.state.deleteWebhook(webhookId)
	if (!deleted) {
		return new Response(JSON.stringify({ message: 'Failed to delete webhook', code: 50035 }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Record action
	session.recordAction(
		'webhook_deleted',
		{
			webhook_id: webhookId,
			channel_id: channelId,
			guild_id: guildId
		},
		{
			endpoint: `DELETE /webhooks/${webhookId}`,
			method: 'DELETE'
		}
	)

	// Dispatch WEBHOOKS_UPDATE gateway event
	if (guildId) {
		await session.dispatch('WEBHOOKS_UPDATE', {
			guild_id: guildId,
			channel_id: channelId
		})
	}

	return new Response(null, { status: 204 })
}

export default async function webhookByIdHandler(request: RoboRequest): Promise<unknown> {
	switch (request.method) {
		case 'GET':
			return GET(request)
		case 'PATCH':
			return PATCH(request)
		case 'DELETE':
			return DELETE(request)
		default:
			return new Response(null, { status: 405 })
	}
}
