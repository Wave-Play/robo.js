import { define } from '@robojs/server'
import type { RoboRequest } from '@robojs/server'
import { z } from 'zod'
import { sessionManager } from '../../../../../../core/manager.js'
import { mockMessageToAPIMessage } from '../../../../../../discord/payloads.js'
import { getGatewayServer } from '../../../../../../core/gateway.js'
import { getStageBridge } from '../../../../../../core/stage-bridge.js'
import { generateSnowflake } from '../../../../../../utils/snowflake.js'
import { isMultipartRequest, parseMultipartMessage, MultipartError } from '../../../../../../utils/multipart.js'
import { getImageDimensions, isImageContentType } from '../../../../../../utils/image.js'
import type {
	MockInteraction,
	MockMessage,
	MockAttachment,
	AttachmentPayload,
	StoredAttachment,
	MockWebhook,
	Session
} from '../../../../../../types/index.js'
import { MessageFlags, createComponentValidationError, createV2ConflictError } from '../../../../../../types/index.js'
import { validateComponentsV2 } from '../../../../../../session/state.js'

// Default port for CDN URLs (can be overridden via environment)
const CDN_BASE_URL = process.env.MOCK_CDN_URL || 'http://localhost:53596'

/**
 * This route handles both:
 * 1. Regular webhook message operations (GET/PATCH/DELETE with token auth)
 * 2. Interaction followup message operations
 *
 * GET - Get a message sent by webhook
 * PATCH - Edit a message sent by webhook
 * DELETE - Delete a message sent by webhook
 *
 * Request body (PATCH - JSON or multipart):
 * {
 *   content?: string,      // New message content
 *   embeds?: object[],     // New embed objects
 *   components?: object[], // New message components
 *   attachments?: object[] // Attachment metadata (IDs to keep, new file metadata)
 * }
 *
 * Response (GET/PATCH): APIMessage object
 * Response (DELETE): 204 No Content
 */

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
 * Resolve the interaction webhook context from request params.
 * Returns context object or a Response for errors.
 */
function resolveInteractionWebhookMessage(request: RoboRequest): {
	session: Session
	interaction: MockInteraction
	message: MockMessage
	webhookOrAppId: string
	token: string
	messageId: string
	actualMessageId: string
	isOriginal: boolean
} | Response {
	// Extract params from URL (decode messageId since @ may be URL-encoded as %40)
	const { app_id: webhookOrAppId, token, messageId: rawMessageId } = request.params as { app_id: string; token: string; messageId: string }
	const messageId = decodeURIComponent(rawMessageId)

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

	// Get the interaction from state
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

	// Validate app_id matches interaction's applicationId
	if (interaction.applicationId !== webhookOrAppId) {
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

	// Check expiration (interactions expire after 15 minutes)
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

	// Handle @original as a special case (original interaction response)
	let actualMessageId = messageId
	const isOriginal = messageId === '@original'
	if (isOriginal) {
		// @original refers to the original interaction response
		if (!interaction.responseMessageId) {
			return new Response(
				JSON.stringify({
					error: 'Unknown Message',
					code: 10008
				}),
				{
					status: 404,
					headers: { 'Content-Type': 'application/json' }
				}
			)
		}
		actualMessageId = interaction.responseMessageId
	} else {
		// For other messageIds, validate it's a followup message
		const isFollowup = interaction.followupMessageIds?.includes(messageId) ?? false
		if (!isFollowup) {
			return new Response(
				JSON.stringify({
					error: 'Unknown Message',
					code: 10008
				}),
				{
					status: 404,
					headers: { 'Content-Type': 'application/json' }
				}
			)
		}
	}

	// Get the message
	const message = session.state.getMessage(actualMessageId)
	if (!message) {
		return new Response(
			JSON.stringify({
				error: 'Unknown Message',
				code: 10008
			}),
			{
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			}
		)
	}

	return { session, interaction, message, webhookOrAppId, token, messageId, actualMessageId, isOriginal }
}

const MessageResponseSchema = z.object({
	id: z.string(),
	type: z.number(),
	content: z.string(),
	channel_id: z.string(),
	author: z.object({
		id: z.string(),
		username: z.string(),
		avatar: z.string().nullable(),
		discriminator: z.string(),
		public_flags: z.number(),
		flags: z.number(),
		global_name: z.string().nullable(),
		primary_guild: z.unknown().nullable()
	}).passthrough(),
	attachments: z.array(z.object({}).passthrough()),
	embeds: z.array(z.object({}).passthrough()),
	mentions: z.array(z.object({}).passthrough()),
	mention_roles: z.array(z.string()),
	pinned: z.boolean(),
	mention_everyone: z.boolean(),
	tts: z.boolean(),
	timestamp: z.string(),
	edited_timestamp: z.string().nullable(),
	flags: z.number(),
	components: z.array(z.object({}).passthrough())
}).passthrough()

const WebhookMessageParamsSchema = z.object({
	app_id: z.string().describe('Webhook ID or application ID'),
	token: z.string().describe('Webhook token or interaction token'),
	messageId: z.string().describe('Message ID or @original for the initial interaction response')
})

export const GET = define(
	{
		summary: 'Get webhook message',
		tags: ['Webhooks'],
		params: WebhookMessageParamsSchema,
		query: z.object({
			thread_id: z.string().optional().describe('ID of the thread the message is in')
		}),
		response: {
			200: MessageResponseSchema
		}
	},
	async (request: RoboRequest) => {
	// Extract params from URL (decode messageId since @ may be URL-encoded as %40)
	const { app_id: webhookOrAppId, token, messageId: rawMessageId } = request.params as { app_id: string; token: string; messageId: string }
	const messageId = decodeURIComponent(rawMessageId)

	// Try to find a regular webhook first (by looking up the token)
	const webhookResult = findWebhookByToken(token)
	if (webhookResult) {
		const resolved = resolveRegularWebhookMessage(webhookResult.session, webhookResult.webhook, webhookOrAppId, messageId)
		if (resolved instanceof Response) return resolved
		return handleGet(resolved.session, resolved.message)
	}

	// Not a regular webhook - try interaction webhook
	const resolved = resolveInteractionWebhookMessage(request)
	if (resolved instanceof Response) return resolved
	return handleGet(resolved.session, resolved.message)
})

export const PATCH = define(
	{
		summary: 'Edit webhook message',
		tags: ['Webhooks'],
		params: WebhookMessageParamsSchema,
		query: z.object({
			thread_id: z.string().optional().describe('ID of the thread the message is in'),
			with_components: z.boolean().optional().describe('Whether to include components in the response')
		}),
		body: z.object({
			content: z.string().nullable().optional().describe('Message content (up to 2000 characters)'),
			embeds: z.array(z.object({}).passthrough()).nullable().optional().describe('Array of embed objects (up to 10)'),
			components: z.array(z.object({}).passthrough()).nullable().optional().describe('Array of message component objects'),
			flags: z.number().int().nullable().optional().describe('Message flags combined as a bitfield'),
			attachments: z.array(z.object({}).passthrough()).nullable().optional().describe('Array of attachment objects with IDs to keep and new file metadata'),
			allowed_mentions: z.object({}).passthrough().nullable().optional().describe('Allowed mentions object'),
			poll: z.object({}).passthrough().nullable().optional().describe('Poll object')
		}).passthrough(),
		response: {
			200: MessageResponseSchema
		}
	},
	async (request: RoboRequest) => {
	// Extract params from URL (decode messageId since @ may be URL-encoded as %40)
	const { app_id: webhookOrAppId, token, messageId: rawMessageId } = request.params as { app_id: string; token: string; messageId: string }
	const messageId = decodeURIComponent(rawMessageId)

	// Try to find a regular webhook first (by looking up the token)
	const webhookResult = findWebhookByToken(token)
	if (webhookResult) {
		const resolved = resolveRegularWebhookMessage(webhookResult.session, webhookResult.webhook, webhookOrAppId, messageId)
		if (resolved instanceof Response) return resolved
		return handleWebhookMessagePatch(request, resolved.session, resolved.webhook, resolved.message, messageId)
	}

	// Not a regular webhook - try interaction webhook
	const resolved = resolveInteractionWebhookMessage(request)
	if (resolved instanceof Response) return resolved
	return handleInteractionPatch(request, resolved.session, resolved.interaction, resolved.message, webhookOrAppId, token, resolved.actualMessageId, resolved.isOriginal)
})

export const DELETE = define(
	{
		summary: 'Delete webhook message',
		tags: ['Webhooks'],
		params: WebhookMessageParamsSchema,
		query: z.object({
			thread_id: z.string().optional().describe('ID of the thread the message is in')
		}),
		response: {
			204: z.undefined()
		}
	},
	async (request: RoboRequest) => {
	// Extract params from URL (decode messageId since @ may be URL-encoded as %40)
	const { app_id: webhookOrAppId, token, messageId: rawMessageId } = request.params as { app_id: string; token: string; messageId: string }
	const messageId = decodeURIComponent(rawMessageId)

	// Try to find a regular webhook first (by looking up the token)
	const webhookResult = findWebhookByToken(token)
	if (webhookResult) {
		const resolved = resolveRegularWebhookMessage(webhookResult.session, webhookResult.webhook, webhookOrAppId, messageId)
		if (resolved instanceof Response) return resolved
		return handleWebhookMessageDelete(resolved.session, resolved.webhook, resolved.message, messageId)
	}

	// Not a regular webhook - try interaction webhook
	const resolved = resolveInteractionWebhookMessage(request)
	if (resolved instanceof Response) return resolved
	return handleInteractionDelete(resolved.session, resolved.interaction, resolved.message, webhookOrAppId, token, resolved.actualMessageId, resolved.isOriginal)
})

/**
 * Resolve regular webhook message context.
 * Returns context object or a Response for errors.
 */
function resolveRegularWebhookMessage(
	session: Session,
	webhook: MockWebhook,
	webhookId: string,
	messageId: string
): { session: Session; webhook: MockWebhook; message: MockMessage } | Response {
	// Validate webhook ID matches
	if (webhook.id !== webhookId) {
		return new Response(JSON.stringify({ message: 'Unknown Webhook', code: 10015 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Get the message
	const message = session.state.getMessage(messageId)
	if (!message) {
		return new Response(JSON.stringify({ message: 'Unknown Message', code: 10008 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Verify message is in webhook's channel (or a thread under it)
	const channel = session.state.getChannel(message.channelId)
	if (!channel) {
		return new Response(JSON.stringify({ message: 'Unknown Message', code: 10008 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Message must be in webhook's channel or a thread parented to it
	const isInWebhookChannel = message.channelId === webhook.channel_id || channel.parentId === webhook.channel_id
	if (!isInWebhookChannel) {
		return new Response(JSON.stringify({ message: 'Unknown Message', code: 10008 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	return { session, webhook, message }
}

/**
 * Handle PATCH for regular webhook messages
 */
async function handleWebhookMessagePatch(
	request: RoboRequest,
	session: Session,
	webhook: MockWebhook,
	message: MockMessage,
	messageId: string
): Promise<Response> {
	const channelId = message.channelId

	// Parse body (JSON or multipart)
	let body: {
		content?: string
		embeds?: unknown[]
		components?: unknown[]
		flags?: number
		attachments?: (AttachmentPayload | { id: string })[]
	}

	const newAttachments: MockAttachment[] = []

	try {
		if (isMultipartRequest(request)) {
			const parsed = await parseMultipartMessage(request)
			body = parsed.body as typeof body

			for (let i = 0; i < parsed.files.length; i++) {
				const file = parsed.files[i]
				const attachmentId = generateSnowflake()
				const meta = body.attachments?.find((a) => a.id === i) as AttachmentPayload | undefined

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
					filename: meta?.filename || file.filename,
					contentType: file.contentType,
					size: file.size,
					data: file.data,
					width,
					height
				}
				session.state.storeAttachment(storedAttachment)

				newAttachments.push({
					id: attachmentId,
					filename: storedAttachment.filename,
					title: meta?.title,
					description: meta?.description,
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
		return new Response(JSON.stringify({ message: 'Invalid JSON body' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Validate Components V2 if flag is set
	if (body.flags && body.flags & MessageFlags.IsComponentsV2) {
		if (body.content || (body.embeds && body.embeds.length > 0)) {
			return new Response(JSON.stringify(createV2ConflictError()), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		const attachmentFilenames = new Set(newAttachments.map((a) => a.filename))
		const validation = validateComponentsV2(body.components ?? [], attachmentFilenames)
		if (!validation.valid) {
			return new Response(JSON.stringify(createComponentValidationError(validation.errors)), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}
	}

	// Determine final attachments
	let finalAttachments: MockAttachment[]
	if (body.attachments !== undefined) {
		finalAttachments = []
		for (const attachmentRef of body.attachments) {
			if (typeof attachmentRef.id === 'string') {
				const existing = message.attachments.find((a) => a.id === attachmentRef.id)
				if (existing) {
					finalAttachments.push(existing)
				}
			}
		}
		finalAttachments.push(...newAttachments)

		for (const oldAttachment of message.attachments) {
			if (!finalAttachments.find((a) => a.id === oldAttachment.id)) {
				session.state.deleteAttachment(oldAttachment.id)
			}
		}
	} else {
		finalAttachments = [...message.attachments, ...newAttachments]
	}

	// Update message
	const updatedMessage = session.state.updateMessage(message.id, {
		content: body.content ?? message.content,
		embeds: body.embeds ?? message.embeds,
		attachments: finalAttachments,
		flags: body.flags ?? message.flags,
		components: body.components ?? message.components
	})

	if (!updatedMessage) {
		return new Response(JSON.stringify({ message: 'Failed to update message' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Record action
	session.recordAction(
		'message_edited',
		{
			webhook_id: webhook.id,
			message_id: messageId,
			channel_id: channelId,
			guild_id: message.guildId,
			content: updatedMessage.content
		},
		{
			endpoint: `PATCH /webhooks/${webhook.id}/:token/messages/${messageId}`,
			method: 'PATCH'
		}
	)

	// Dispatch MESSAGE_UPDATE
	const author = session.state.getUser(message.authorId) || session.state.botUser
	const apiMessage = mockMessageToAPIMessage(updatedMessage, author)
	const dispatchData: Record<string, unknown> = { ...apiMessage }
	if (updatedMessage.guildId) {
		dispatchData.guild_id = updatedMessage.guildId
	}

	const channel = session.state.getChannel(message.channelId)
	getGatewayServer().dispatchToSession(session.id, 'MESSAGE_UPDATE', dispatchData, channel?.guildId)

	return new Response(JSON.stringify(apiMessage), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	})
}

/**
 * Handle DELETE for regular webhook messages
 */
function handleWebhookMessageDelete(
	session: Session,
	webhook: MockWebhook,
	message: MockMessage,
	messageId: string
): Response {
	const channel = session.state.getChannel(message.channelId)

	const deleted = session.state.deleteMessage(message.id)
	if (!deleted) {
		return new Response(JSON.stringify({ message: 'Failed to delete message' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Record action
	session.recordAction(
		'message_deleted',
		{
			webhook_id: webhook.id,
			message_id: messageId,
			channel_id: message.channelId,
			guild_id: message.guildId
		},
		{
			endpoint: `DELETE /webhooks/${webhook.id}/:token/messages/${messageId}`,
			method: 'DELETE'
		}
	)

	// Dispatch MESSAGE_DELETE
	const dispatchData: { id: string; channel_id: string; guild_id?: string } = {
		id: messageId,
		channel_id: message.channelId
	}
	if (message.guildId) {
		dispatchData.guild_id = message.guildId
	}

	getGatewayServer().dispatchToSession(session.id, 'MESSAGE_DELETE', dispatchData, channel?.guildId)

	return new Response(null, { status: 204 })
}

function handleGet(session: Session, message: MockMessage): Response {
	const author = session.state.getUser(message.authorId) || session.state.botUser
	return new Response(JSON.stringify(mockMessageToAPIMessage(message, author)), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	})
}

async function handleInteractionPatch(
	request: RoboRequest,
	session: Session,
	interaction: MockInteraction,
	message: MockMessage,
	appId: string,
	token: string,
	messageId: string,
	isOriginal = false
) {
	const channelId = message.channelId

	// Parse body (JSON or multipart)
	let body: {
		content?: string
		embeds?: unknown[]
		components?: unknown[]
		flags?: number
		attachments?: (AttachmentPayload | { id: string })[]
	}

	const newAttachments: MockAttachment[] = []

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
				const meta = body.attachments?.find((a) => a.id === i) as AttachmentPayload | undefined

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
					filename: meta?.filename || file.filename,
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
					title: meta?.title,
					description: meta?.description,
					content_type: file.contentType,
					size: file.size,
					url: `${CDN_BASE_URL}/cdn/attachments/${channelId}/${attachmentId}/${encodeURIComponent(storedAttachment.filename)}`,
					proxy_url: `${CDN_BASE_URL}/cdn/attachments/${channelId}/${attachmentId}/${encodeURIComponent(storedAttachment.filename)}`,
					width,
					height
				}
				newAttachments.push(attachment)
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
		return new Response(JSON.stringify({ message: 'Invalid JSON body' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Validate Components V2 if flag is set
	if (body.flags && body.flags & MessageFlags.IsComponentsV2) {
		// V2 components cannot coexist with content or embeds
		if (body.content || (body.embeds && body.embeds.length > 0)) {
			return new Response(JSON.stringify(createV2ConflictError()), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Validate V2 component structure
		const attachmentFilenames = new Set(newAttachments.map((a) => a.filename))
		const validation = validateComponentsV2(body.components ?? [], attachmentFilenames)
		if (!validation.valid) {
			return new Response(JSON.stringify(createComponentValidationError(validation.errors)), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}
	}

	// Determine final attachments array
	let finalAttachments: MockAttachment[]

	if (body.attachments !== undefined) {
		// If attachments array is provided, only keep listed existing attachments + add new ones
		finalAttachments = []

		// Process attachment references in body
		for (const attachmentRef of body.attachments) {
			// Check if this is an existing attachment reference (string ID)
			if (typeof attachmentRef.id === 'string') {
				const existing = message.attachments.find((a) => a.id === attachmentRef.id)
				if (existing) {
					finalAttachments.push(existing)
				}
			}
		}

		// Add newly uploaded files
		finalAttachments.push(...newAttachments)

		// Clean up removed attachments from storage
		for (const oldAttachment of message.attachments) {
			if (!finalAttachments.find((a) => a.id === oldAttachment.id)) {
				session.state.deleteAttachment(oldAttachment.id)
			}
		}
	} else {
		// No attachments field means keep existing + add new
		finalAttachments = [...message.attachments, ...newAttachments]
	}

	// Update message in state
	const updatedMessage = session.state.updateMessage(message.id, {
		content: body.content ?? message.content,
		embeds: body.embeds ?? message.embeds,
		attachments: finalAttachments,
		// Components V2 support
		flags: body.flags ?? message.flags,
		components: body.components ?? message.components
	})

	if (!updatedMessage) {
		return new Response(JSON.stringify({ message: 'Failed to update message' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Get channel for guild ID
	const channel = session.state.getChannel(message.channelId)

	// Record action (use session.recordAction for metadata propagation)
	session.recordAction(
		'interaction_edit',
		{
			interaction_id: interaction.id,
			message_id: messageId,
			channel_id: message.channelId,
			guild_id: message.guildId,
			content: updatedMessage.content,
			embeds: updatedMessage.embeds,
			attachments: updatedMessage.attachments,
			edited_timestamp: updatedMessage.editedTimestamp,
			is_original: isOriginal,
			command_name: interaction.commandName
		},
		{
			endpoint: `PATCH /webhooks/${appId}/${token}/messages/${messageId}`,
			method: 'PATCH',
			interactionId: interaction.id
		}
	)

	// Dispatch MESSAGE_UPDATE event via Gateway
	const author = session.state.getUser(message.authorId) || session.state.botUser
	const apiMessage = mockMessageToAPIMessage(updatedMessage, author)

	// Build dispatch data with guild-specific fields
	const dispatchData: Record<string, unknown> = { ...apiMessage }
	if (updatedMessage.guildId) {
		dispatchData.guild_id = updatedMessage.guildId
	}

	getGatewayServer().dispatchToSession(session.id, 'MESSAGE_UPDATE', dispatchData, channel?.guildId)

	// Notify stage that interaction edit is complete (clears "Bot is thinking..." indicator)
	try {
		getStageBridge().onInteractionEdit(session.id, interaction.id)
	} catch {
		// Stage bridge may not be initialized
	}

	// Return updated message
	return mockMessageToAPIMessage(updatedMessage, author)
}

function handleInteractionDelete(
	session: Session,
	interaction: MockInteraction,
	message: MockMessage,
	appId: string,
	token: string,
	messageId: string,
	isOriginal = false
) {
	// Get channel before deleting for dispatch
	const channel = session.state.getChannel(message.channelId)

	// Delete message from state (this also cleans up attachments)
	const deleted = session.state.deleteMessage(message.id)
	if (!deleted) {
		return new Response(JSON.stringify({ message: 'Failed to delete message' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Clear original response tracking or remove followup tracking
	if (isOriginal) {
		interaction.responseMessageId = undefined
	} else if (interaction.followupMessageIds) {
		const index = interaction.followupMessageIds.indexOf(messageId)
		if (index !== -1) {
			interaction.followupMessageIds.splice(index, 1)
		}
	}

	// Record action (use session.recordAction for metadata propagation)
	session.recordAction(
		'interaction_edit',
		{
			interaction_id: interaction.id,
			message_id: messageId,
			channel_id: message.channelId,
			guild_id: message.guildId,
			deleted: true,
			is_original: isOriginal,
			command_name: interaction.commandName
		},
		{
			endpoint: `DELETE /webhooks/${appId}/${token}/messages/${messageId}`,
			method: 'DELETE',
			interactionId: interaction.id
		}
	)

	// Dispatch MESSAGE_DELETE event via Gateway
	const dispatchData: { id: string; channel_id: string; guild_id?: string } = {
		id: messageId,
		channel_id: message.channelId
	}

	if (message.guildId) {
		dispatchData.guild_id = message.guildId
	}

	getGatewayServer().dispatchToSession(session.id, 'MESSAGE_DELETE', dispatchData, channel?.guildId)

	// Return 204 No Content (Discord API behavior)
	return new Response(null, { status: 204 })
}
