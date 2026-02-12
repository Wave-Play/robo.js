import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../core/manager.js'
import { getStageBridge } from '../../../../core/stage-bridge.js'
import { mockMessageToAPIMessage, mockWebhookToAPIWebhook } from '../../../../discord/payloads.js'
import { generateSnowflake } from '../../../../utils/snowflake.js'
import { isMultipartRequest, parseMultipartMessage, MultipartError } from '../../../../utils/multipart.js'
import { getImageDimensions, isImageContentType } from '../../../../utils/image.js'
import type { MockAttachment, AttachmentPayload, StoredAttachment, MockWebhook, MockPollConfig } from '../../../../types/index.js'
import { MessageFlags, createComponentValidationError, createV2ConflictError, WebhookLimits, WebhookType } from '../../../../types/index.js'
import { validateComponents, validateComponentsV2 } from '../../../../session/state.js'
import type { Session } from '../../../../types/index.js'

// Default port for CDN URLs (can be overridden via environment)
const CDN_BASE_URL = process.env.MOCK_CDN_URL || 'http://localhost:53596'

/**
 * This route handles both:
 * 1. Regular webhook operations (GET/PATCH/DELETE/POST with token auth)
 * 2. Interaction followup messages (POST only, for interaction.followUp())
 *
 * The route first tries to find a regular webhook by token, then falls back to interaction webhooks.
 *
 * @see https://discord.com/developers/docs/resources/webhook
 */
export default async (request: RoboRequest) => {
	// Extract id and token from URL params
	const { app_id: webhookOrAppId, token } = request.params as { app_id: string; token: string }

	// Try to find a regular webhook first (by looking up the token)
	const webhookResult = findWebhookByToken(token)
	if (webhookResult) {
		return handleRegularWebhook(request, webhookResult.session, webhookResult.webhook, webhookOrAppId)
	}

	// Not a regular webhook - try interaction webhook
	return handleInteractionWebhook(request, webhookOrAppId, token)
}

/**
 * Find a webhook by its token across all sessions
 */
function findWebhookByToken(token: string): { session: Session; webhook: MockWebhook } | null {
	for (const session of sessionManager.getAll()) {
		const webhook = session.state.getWebhookByToken(token)
		if (webhook) {
			return { session, webhook }
		}
	}
	return null
}

/**
 * Handle regular webhook operations (GET/PATCH/DELETE/POST with token)
 */
async function handleRegularWebhook(
	request: RoboRequest,
	session: Session,
	webhook: MockWebhook,
	webhookId: string
): Promise<Response> {
	// Validate webhook ID matches
	if (webhook.id !== webhookId) {
		return new Response(JSON.stringify({ message: 'Unknown Webhook', code: 10015 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Handle GET - Get webhook (no auth needed with token)
	if (request.method === 'GET') {
		// When fetching with token, always include token but don't include user
		const result = mockWebhookToAPIWebhook(webhook, true)
		// Remove user when fetching via token (Discord behavior)
		delete (result as { user?: unknown }).user
		return new Response(JSON.stringify(result), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Handle PATCH - Modify webhook (no auth needed with token)
	if (request.method === 'PATCH') {
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
			if (typeof body.name !== 'string' || body.name.length < WebhookLimits.MIN_NAME_LENGTH || body.name.length > WebhookLimits.MAX_NAME_LENGTH) {
				return new Response(JSON.stringify({ message: 'Invalid webhook name', code: 50035 }), {
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				})
			}
			const nameLower = body.name.toLowerCase()
			if (nameLower.includes('clyde')) {
				return new Response(JSON.stringify({ message: 'Webhook name cannot contain "clyde"', code: 50035 }), {
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				})
			}
			if (nameLower.includes('discord')) {
				return new Response(JSON.stringify({ message: 'Webhook name cannot contain "discord"', code: 50035 }), {
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				})
			}
		}

		// Capture old channel for WEBHOOKS_UPDATE dispatch when moving
		const oldChannelId = webhook.channel_id

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

		session.recordAction(
			'webhook_updated',
			{ webhook_id: webhookId, updates: body },
			{ endpoint: `PATCH /webhooks/${webhookId}/:token`, method: 'PATCH' }
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

		const result = mockWebhookToAPIWebhook(updatedWebhook, true)
		delete (result as { user?: unknown }).user
		return new Response(JSON.stringify(result), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Handle DELETE - Delete webhook (no auth needed with token)
	if (request.method === 'DELETE') {
		// Capture channel/guild info before deletion for WEBHOOKS_UPDATE event
		const channelId = webhook.channel_id
		const guildId = webhook.guild_id

		const deleted = session.state.deleteWebhook(webhookId)
		if (!deleted) {
			return new Response(JSON.stringify({ message: 'Failed to delete webhook', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		session.recordAction(
			'webhook_deleted',
			{ webhook_id: webhookId },
			{ endpoint: `DELETE /webhooks/${webhookId}/:token`, method: 'DELETE' }
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

	// Handle POST - Execute webhook (send message)
	if (request.method === 'POST') {
		return executeWebhook(request, session, webhook)
	}

	return new Response(JSON.stringify({ message: 'Method not allowed' }), {
		status: 405,
		headers: { 'Content-Type': 'application/json' }
	})
}

/**
 * Execute a webhook - send a message
 */
async function executeWebhook(request: RoboRequest, session: Session, webhook: MockWebhook): Promise<Response> {
	const url = new URL(request.url)
	const wait = url.searchParams.get('wait') === 'true'
	const threadId = url.searchParams.get('thread_id')
	const withComponents = url.searchParams.get('with_components') === 'true'

	// Determine target channel
	let channelId = webhook.channel_id
	if (threadId) {
		// Validate thread exists and belongs to webhook's channel
		const thread = session.state.getChannel(threadId)
		if (!thread || thread.parentId !== webhook.channel_id) {
			return new Response(JSON.stringify({ message: 'Unknown Channel', code: 10003 }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			})
		}
		channelId = threadId
	}

	// Parse message payload
	let body: {
		content?: string
		username?: string
		avatar_url?: string
		tts?: boolean
		embeds?: unknown[]
		components?: unknown[]
		flags?: number
		attachments?: AttachmentPayload[]
		poll?: MockPollConfig
		allowed_mentions?: unknown // Accepted for API compatibility (no effect in mock)
		sticker_ids?: string[]
		thread_name?: string // For creating a new forum thread
		applied_tags?: string[] // Forum tags when creating via thread_name
	}

	const attachments: MockAttachment[] = []
	const messageId = generateSnowflake()

	try {
		if (isMultipartRequest(request)) {
			const parsed = await parseMultipartMessage(request)
			body = parsed.body as typeof body

			for (let i = 0; i < parsed.files.length; i++) {
				const file = parsed.files[i]
				const attachmentId = generateSnowflake()
				const meta: Partial<AttachmentPayload> = body.attachments?.find((a) => a.id === i) || {}

				let width: number | undefined
				let height: number | undefined
				if (isImageContentType(file.contentType)) {
					const dims = getImageDimensions(file.data, file.contentType)
					if (dims) {
						width = dims.width
						height = dims.height
					}
				}

				const storedAttachment: StoredAttachment = {
					id: attachmentId,
					channelId,
					messageId,
					filename: meta.filename || file.filename,
					contentType: file.contentType,
					size: file.size,
					data: file.data,
					width,
					height
				}
				session.state.storeAttachment(storedAttachment)

				attachments.push({
					id: attachmentId,
					filename: storedAttachment.filename,
					title: meta.title,
					description: meta.description,
					content_type: file.contentType,
					size: file.size,
					url: `${CDN_BASE_URL}/cdn/attachments/${channelId}/${attachmentId}/${encodeURIComponent(storedAttachment.filename)}`,
					proxy_url: `${CDN_BASE_URL}/cdn/attachments/${channelId}/${attachmentId}/${encodeURIComponent(storedAttachment.filename)}`,
					width,
					height
				})
			}
		} else {
			body = await request.json()
		}
	} catch (error) {
		if (error instanceof MultipartError) {
			return new Response(JSON.stringify({ message: error.message, code: error.code }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}
		return new Response(JSON.stringify({ message: 'Invalid request body' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Handle thread_name for forum channel thread creation
	if (body.thread_name) {
		// Check if webhook's channel is a forum channel
		const forumChannel = session.state.getForumChannel(webhook.channel_id)
		if (!forumChannel) {
			return new Response(JSON.stringify({ message: 'thread_name can only be used with forum channels', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Validate thread_name length (1-100 characters)
		if (body.thread_name.length < 1 || body.thread_name.length > 100) {
			return new Response(JSON.stringify({ message: 'Thread name must be between 1 and 100 characters', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Validate applied_tags if provided
		if (body.applied_tags?.length) {
			if (body.applied_tags.length > 5) {
				return new Response(JSON.stringify({ message: 'Cannot apply more than 5 tags', code: 50035 }), {
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				})
			}
			const validTagIds = new Set(forumChannel.available_tags.map((t) => t.id))
			for (const tagId of body.applied_tags) {
				if (!validTagIds.has(tagId)) {
					return new Response(JSON.stringify({ message: `Invalid tag: ${tagId}`, code: 50035 }), {
						status: 400,
						headers: { 'Content-Type': 'application/json' }
					})
				}
			}
		}

		// Create webhook author for the forum post
		const webhookAuthorId = generateSnowflake()
		const webhookAuthor = {
			id: webhookAuthorId,
			username: body.username || webhook.name || 'Webhook',
			discriminator: '0000',
			globalName: null,
			avatar: body.avatar_url || webhook.avatar,
			bot: true
		}

		// Create the forum post
		try {
			const { thread, message } = session.state.createForumPost({
				name: body.thread_name,
				parentId: webhook.channel_id,
				ownerId: webhookAuthorId,
				applied_tags: body.applied_tags,
				message: {
					content: body.content,
					embeds: body.embeds,
					components: body.components,
					attachments
				}
			})

			// Record action
			session.recordAction(
				'webhook_executed',
				{
					webhook_id: webhook.id,
					message_id: message.id,
					thread_id: thread.id,
					channel_id: webhook.channel_id,
					guild_id: webhook.guild_id,
					thread_name: body.thread_name,
					content: message.content
				},
				{
					endpoint: `POST /webhooks/${webhook.id}/:token`,
					method: 'POST'
				}
			)

			// Return message only if wait=true
			if (wait) {
				return new Response(JSON.stringify(mockMessageToAPIMessage(message, webhookAuthor)), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				})
			}

			return new Response(null, { status: 204 })
		} catch (error) {
			return new Response(JSON.stringify({ message: (error as Error).message, code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}
	}

	// Handle components for non-application webhooks
	// Application webhooks (type 3) can always send interactive components
	// Other webhooks need with_components=true query param to send interactive components
	// Without it, components are silently ignored (Discord behavior)
	if (body.components && body.components.length > 0) {
		const canSendComponents = webhook.type === WebhookType.Application || withComponents
		if (!canSendComponents) {
			// Strip interactive components, keep only link buttons (style 5)
			body.components = filterNonInteractiveComponents(body.components)
		}
	}

	// Validate content - must have content, embeds, attachments, poll, or stickers
	const hasStickers = body.sticker_ids && body.sticker_ids.length > 0
	if (!body.content && (!body.embeds || body.embeds.length === 0) && attachments.length === 0 && !body.poll && !hasStickers) {
		return new Response(JSON.stringify({ message: 'Cannot send an empty message', code: 50006 }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Validate sticker_ids if present
	if (body.sticker_ids?.length) {
		if (body.sticker_ids.length > 3) {
			return new Response(JSON.stringify({ message: 'Cannot send more than 3 stickers', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}
		// Validate all stickers exist
		for (const stickerId of body.sticker_ids) {
			if (!session.state.getSticker(stickerId)) {
				return new Response(JSON.stringify({ message: `Unknown sticker: ${stickerId}`, code: 50035 }), {
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				})
			}
		}
	}

	// Validate Components V2 if flag is set
	if (body.flags && body.flags & MessageFlags.IsComponentsV2) {
		if (body.content || (body.embeds && body.embeds.length > 0)) {
			return new Response(JSON.stringify(createV2ConflictError()), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		const attachmentFilenames = new Set(attachments.map((a) => a.filename))
		const validation = validateComponentsV2(body.components ?? [], attachmentFilenames)
		if (!validation.valid) {
			return new Response(JSON.stringify(createComponentValidationError(validation.errors)), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}
	} else if (body.components && body.components.length > 0) {
		// Validate classic (V1) components
		const validation = validateComponents(body.components)
		if (!validation.valid) {
			return new Response(JSON.stringify(createComponentValidationError(validation.errors)), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}
	}

	// Create a temporary "webhook author" user for the message
	// Webhook messages use the webhook's name/avatar or custom ones from the request
	const webhookAuthorId = generateSnowflake()
	const webhookAuthor = {
		id: webhookAuthorId,
		username: body.username || webhook.name || 'Webhook',
		discriminator: '0000',
		globalName: null,
		avatar: body.avatar_url || webhook.avatar, // Custom avatar_url takes precedence
		bot: true
	}

	// Create message
	const message = session.state.createMessage({
		id: messageId,
		channelId,
		guildId: webhook.guild_id,
		authorId: webhookAuthorId,
		content: body.content ?? '',
		embeds: body.embeds ?? [],
		attachments,
		tts: body.tts ?? false,
		flags: body.flags,
		components: body.components,
		poll: body.poll,
		sticker_ids: body.sticker_ids
	})

	// Record action
	session.recordAction(
		'webhook_executed',
		{
			webhook_id: webhook.id,
			message_id: message.id,
			channel_id: channelId,
			guild_id: webhook.guild_id,
			content: message.content
		},
		{
			endpoint: `POST /webhooks/${webhook.id}/:token`,
			method: 'POST'
		}
	)

	// Return message only if wait=true
	if (wait) {
		return new Response(JSON.stringify(mockMessageToAPIMessage(message, webhookAuthor)), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	return new Response(null, { status: 204 })
}

/**
 * Handle interaction webhook (followup messages)
 */
async function handleInteractionWebhook(request: RoboRequest, appId: string, token: string): Promise<Response> {
	// Only POST is supported for interaction webhooks
	if (request.method !== 'POST') {
		return new Response(JSON.stringify({ message: 'Method not allowed' }), {
			status: 405,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Find session containing this interaction (lookup by token)
	const session = sessionManager.findSessionByInteractionToken(token)
	if (!session) {
		return new Response(
			JSON.stringify({
				error: 'Unknown Webhook',
				code: 10015
			}),
			{
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			}
		)
	}

	// 4. Get the interaction from state
	const interaction = session.state.getInteractionByToken(token)
	if (!interaction) {
		return new Response(
			JSON.stringify({
				error: 'Unknown Webhook',
				code: 10015
			}),
			{
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			}
		)
	}

	// 5. Validate app_id matches interaction's applicationId
	if (interaction.applicationId !== appId) {
		return new Response(
			JSON.stringify({
				error: 'Unknown Webhook',
				code: 10015
			}),
			{
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			}
		)
	}

	// 6. Check expiration (interactions expire after 15 minutes)
	if (Date.now() > interaction.expiresAt) {
		return new Response(
			JSON.stringify({
				error: 'Unknown Webhook',
				code: 10015
			}),
			{
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			}
		)
	}

	// 7. Validate interaction has been responded to (deferred or replied)
	if (!interaction.response) {
		return new Response(
			JSON.stringify({
				error: 'Interaction has not been acknowledged',
				code: 40060
			}),
			{
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			}
		)
	}

	// 8. Parse message payload (JSON or multipart)
	let body: {
		content?: string
		embeds?: unknown[]
		components?: unknown[]
		tts?: boolean
		flags?: number
		attachments?: AttachmentPayload[] // Metadata for uploaded files
	}

	const attachments: MockAttachment[] = []
	const messageId = generateSnowflake() // Pre-generate for attachment URLs
	const channelId = interaction.channelId

	try {
		if (isMultipartRequest(request)) {
			// Handle multipart/form-data (file uploads)
			const parsed = await parseMultipartMessage(request)
			body = parsed.body as typeof body

			// Process each uploaded file
			for (let i = 0; i < parsed.files.length; i++) {
				const file = parsed.files[i]
				const attachmentId = generateSnowflake()

				// Find metadata from payload_json.attachments (if provided)
				const meta: Partial<AttachmentPayload> = body.attachments?.find((a) => a.id === i) || {}

				// Detect image dimensions if applicable
				let width: number | undefined
				let height: number | undefined
				if (isImageContentType(file.contentType)) {
					const dims = getImageDimensions(file.data, file.contentType)
					if (dims) {
						width = dims.width
						height = dims.height
					}
				}

				// Store attachment data in session state
				const storedAttachment: StoredAttachment = {
					id: attachmentId,
					channelId,
					messageId,
					filename: meta.filename || file.filename,
					contentType: file.contentType,
					size: file.size,
					data: file.data,
					width,
					height
				}
				session.state.storeAttachment(storedAttachment)

				// Build attachment metadata for message
				const attachment: MockAttachment = {
					id: attachmentId,
					filename: storedAttachment.filename,
					title: meta.title,
					description: meta.description,
					content_type: file.contentType,
					size: file.size,
					url: `${CDN_BASE_URL}/cdn/attachments/${channelId}/${attachmentId}/${encodeURIComponent(storedAttachment.filename)}`,
					proxy_url: `${CDN_BASE_URL}/cdn/attachments/${channelId}/${attachmentId}/${encodeURIComponent(storedAttachment.filename)}`,
					width,
					height
				}
				attachments.push(attachment)
			}
		} else {
			// Standard JSON body
			body = await request.json()
		}
	} catch (error) {
		if (error instanceof MultipartError) {
			return new Response(JSON.stringify({ message: error.message, code: error.code }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}
		return new Response(JSON.stringify({ message: 'Invalid request body' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 8b. Validate Components V2 if flag is set
	if (body.flags && body.flags & MessageFlags.IsComponentsV2) {
		// V2 components cannot coexist with content or embeds
		if (body.content || (body.embeds && body.embeds.length > 0)) {
			return new Response(JSON.stringify(createV2ConflictError()), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Validate V2 component structure
		const attachmentFilenames = new Set(attachments.map((a) => a.filename))
		const validation = validateComponentsV2(body.components ?? [], attachmentFilenames)
		if (!validation.valid) {
			return new Response(JSON.stringify(createComponentValidationError(validation.errors)), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}
	} else if (body.components && body.components.length > 0) {
		// Validate classic (V1) components
		const validation = validateComponents(body.components)
		if (!validation.valid) {
			return new Response(JSON.stringify(createComponentValidationError(validation.errors)), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}
	}

	// 9. Create followup message in state
	const message = session.state.createMessage({
		id: messageId, // Use pre-generated ID for attachment consistency
		channelId: interaction.channelId,
		guildId: interaction.guildId,
		authorId: session.state.botUser.id,
		content: body.content ?? '',
		embeds: body.embeds ?? [],
		attachments, // Include uploaded attachments
		tts: body.tts ?? false,
		// Components V2 support
		flags: body.flags,
		components: body.components
	})

	// 10. Track followup message ID on interaction
	if (!interaction.followupMessageIds) {
		interaction.followupMessageIds = []
	}
	interaction.followupMessageIds.push(message.id)

	// 10b. Dispatch MESSAGE_CREATE event so the followup message appears in Stage UI
	const apiMessage = mockMessageToAPIMessage(message, session.state.botUser)
	const dispatchData: Record<string, unknown> = { ...apiMessage }
	if (interaction.guildId) {
		dispatchData.guild_id = interaction.guildId
	}
	await session.dispatch('MESSAGE_CREATE', dispatchData)

	// 11. Record as 'interaction_followup' action (use session.recordAction for metadata propagation)
	session.recordAction(
		'interaction_followup',
		{
			interaction_id: interaction.id,
			message_id: message.id,
			channel_id: interaction.channelId,
			guild_id: interaction.guildId,
			content: message.content,
			embeds: message.embeds,
			attachments: attachments.length > 0 ? attachments : undefined,
			components: message.components,
			flags: message.flags,
			command_name: interaction.commandName
		},
		{
			endpoint: `POST /webhooks/${appId}/${token}`,
			method: 'POST',
			interactionId: interaction.id
		}
	)

	// 12. Notify stage clients of interaction followup
	try {
		getStageBridge().onInteractionFollowup(session.id, interaction.id, message)
	} catch {
		// Stage bridge may not be initialized
	}

	// 13. Return APIMessage response
	return new Response(JSON.stringify(mockMessageToAPIMessage(message, session.state.botUser)), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	})
}

/**
 * Filter components to keep only non-interactive ones (link buttons).
 * Used when non-application webhooks send components without with_components=true.
 *
 * Interactive components that get filtered out:
 * - Buttons with style 1-4 (primary, secondary, success, danger)
 * - Select menus (string, user, role, mentionable, channel)
 * - Text inputs (shouldn't appear in messages anyway)
 *
 * Non-interactive components that are kept:
 * - Link buttons (style 5)
 */
function filterNonInteractiveComponents(components: unknown[]): unknown[] {
	const BUTTON_STYLE_LINK = 5
	const COMPONENT_TYPE_ACTION_ROW = 1
	const COMPONENT_TYPE_BUTTON = 2

	return components
		.map((row) => {
			if (!row || typeof row !== 'object') return null
			const actionRow = row as { type?: number; components?: unknown[] }

			if (actionRow.type !== COMPONENT_TYPE_ACTION_ROW || !Array.isArray(actionRow.components)) {
				return null
			}

			// Filter to only keep link buttons
			const filteredChildren = actionRow.components.filter((child) => {
				if (!child || typeof child !== 'object') return false
				const component = child as { type?: number; style?: number }
				// Only keep buttons with link style (5)
				return component.type === COMPONENT_TYPE_BUTTON && component.style === BUTTON_STYLE_LINK
			})

			// Only keep the action row if it has children left
			if (filteredChildren.length === 0) return null

			return { ...actionRow, components: filteredChildren }
		})
		.filter((row): row is NonNullable<typeof row> => row !== null)
}
