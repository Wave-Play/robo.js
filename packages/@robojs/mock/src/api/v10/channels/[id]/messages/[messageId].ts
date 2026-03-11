import { define } from '@robojs/server'
import type { RoboRequest } from '@robojs/server'
import { z } from 'zod'
import { sessionManager } from '../../../../../core/manager.js'
import { parseMockToken } from '../../../../../utils/id.js'
import { mockMessageToAPIMessage } from '../../../../../discord/payloads.js'
import { getGatewayServer } from '../../../../../core/gateway.js'
import { generateSnowflake } from '../../../../../utils/snowflake.js'
import { isMultipartRequest, parseMultipartMessage, MultipartError } from '../../../../../utils/multipart.js'
import { getImageDimensions, isImageContentType } from '../../../../../utils/image.js'
import type { MockChannel, MockMessage, MockAttachment, AttachmentPayload, StoredAttachment } from '../../../../../types/index.js'
import type { Session } from '../../../../../session/session.js'
import { enforcePermissions } from '../../../../../utils/permission-check.js'

// Default port for CDN URLs (can be overridden via environment)
const CDN_BASE_URL = process.env.MOCK_CDN_URL || 'http://localhost:53596'

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

const MessageIdParamsSchema = z.object({
	id: z.string(),
	messageId: z.string()
})

/**
 * GET/PATCH/DELETE /api/v10/channels/:id/messages/:messageId
 *
 * GET - Fetch a single message
 * PATCH - Edit a message (bot can only edit its own messages)
 * DELETE - Delete a message
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
function resolveMessage(request: RoboRequest) {
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

	const { id: channelId, messageId } = request.params as { id: string; messageId: string }

	const channel = session.state.getChannel(channelId)
	if (!channel) {
		return new Response(JSON.stringify({ message: 'Unknown Channel', code: 10003 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	const message = session.state.getMessage(messageId)
	if (!message) {
		return new Response(JSON.stringify({ message: 'Unknown Message', code: 10008 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	if (message.channelId !== channelId) {
		return new Response(JSON.stringify({ message: 'Unknown Message', code: 10008 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	return { session, channel, message, channelId, messageId }
}

export const GET = define(
	{
		summary: 'Get channel message',
		tags: ['Messages'],
		params: MessageIdParamsSchema,
		response: {
			200: MessageResponseSchema
		}
	},
	async (request) => {
		const resolved = resolveMessage(request as unknown as RoboRequest)
		if (resolved instanceof Response) return resolved
		const { session, channel, channelId, messageId, message } = resolved

		// Check permissions
		const permError = enforcePermissions(
			session,
			'GET',
			`/channels/${channelId}/messages/${messageId}`,
			channelId,
			undefined,
			{ messageId, messageAuthorId: message.authorId }
		)
		if (permError) return permError

		// GET - Return the message (re-fetch to ensure latest state)
		const freshMessage = session.state.getMessage(messageId)!
		const author = session.state.getUser(freshMessage.authorId) || session.state.botUser
		return mockMessageToAPIMessage(freshMessage, author)
	}
)

export const PATCH = define(
	{
		summary: 'Update message',
		tags: ['Messages'],
		params: MessageIdParamsSchema,
		body: z.object({
			content: z.string().max(4000).nullable().optional(),
			embeds: z.array(z.object({}).passthrough()).nullable().optional(),
			flags: z.number().nullable().optional(),
			allowed_mentions: z.object({}).passthrough().nullable().optional(),
			sticker_ids: z.array(z.string()).nullable().optional(),
			components: z.array(z.object({}).passthrough()).nullable().optional(),
			attachments: z.array(z.object({}).passthrough()).nullable().optional()
		}).passthrough(),
		response: {
			200: MessageResponseSchema
		}
	},
	async (request) => {
		const resolved = resolveMessage(request as unknown as RoboRequest)
		if (resolved instanceof Response) return resolved
		const { session, channel, channelId, messageId, message } = resolved

		// Check permissions
		const permError = enforcePermissions(
			session,
			'PATCH',
			`/channels/${channelId}/messages/${messageId}`,
			channelId,
			undefined,
			{ messageId, messageAuthorId: message.authorId }
		)
		if (permError) return permError

		return handlePatch(request as unknown as RoboRequest, session, channel, message, channelId, messageId)
	}
)

export const DELETE = define(
	{
		summary: 'Delete message',
		tags: ['Messages'],
		params: MessageIdParamsSchema,
		response: {
			204: z.undefined()
		}
	},
	async (request) => {
		const resolved = resolveMessage(request as unknown as RoboRequest)
		if (resolved instanceof Response) return resolved
		const { session, channel, channelId, messageId, message } = resolved

		// Check permissions
		const permError = enforcePermissions(
			session,
			'DELETE',
			`/channels/${channelId}/messages/${messageId}`,
			channelId,
			undefined,
			{ messageId, messageAuthorId: message.authorId }
		)
		if (permError) return permError

		return handleDelete(session, channel, channelId, messageId)
	}
)

async function handlePatch(
	request: RoboRequest,
	session: Session,
	channel: MockChannel,
	message: MockMessage,
	channelId: string,
	messageId: string
) {
	// Verify message belongs to bot (Discord only allows editing your own messages)
	if (message.authorId !== session.state.botUser.id) {
		return new Response(JSON.stringify({ message: 'Cannot edit a message authored by another user', code: 50005 }), {
			status: 403,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Parse body (JSON or multipart)
	let body: {
		content?: string
		embeds?: unknown[]
		components?: unknown[]
		attachments?: (AttachmentPayload | { id: string })[] // Can include existing attachment IDs or new file metadata
		flags?: number // Message flags (e.g., SuppressEmbeds)
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
				// New files use numeric IDs, existing attachments use string snowflake IDs
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
		return new Response(JSON.stringify({ message: 'Invalid request body' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
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
			// Numeric IDs are handled above (new files)
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
	const updatedMessage = session.state.updateMessage(messageId, {
		content: body.content ?? message.content,
		embeds: body.embeds ?? message.embeds,
		attachments: finalAttachments,
		flags: body.flags ?? message.flags
	})

	if (!updatedMessage) {
		return new Response(JSON.stringify({ message: 'Failed to update message' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Record action (use session.recordAction for metadata propagation)
	session.recordAction(
		'message_edited',
		{
			message_id: messageId,
			channel_id: channelId,
			guild_id: channel.guildId,
			content: updatedMessage.content,
			embeds: updatedMessage.embeds,
			attachments: updatedMessage.attachments,
			edited_timestamp: updatedMessage.editedTimestamp
		},
		{
			endpoint: `PATCH /channels/${channelId}/messages/${messageId}`,
			method: 'PATCH'
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

	getGatewayServer().dispatchToSession(session.id, 'MESSAGE_UPDATE', dispatchData, channel.guildId)

	// Return updated message
	return mockMessageToAPIMessage(updatedMessage, author)
}

function handleDelete(session: Session, channel: MockChannel, channelId: string, messageId: string) {
	// Delete message from state (this also cleans up attachments)
	const deleted = session.state.deleteMessage(messageId)
	if (!deleted) {
		return new Response(JSON.stringify({ message: 'Failed to delete message' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Record action (use session.recordAction for metadata propagation)
	session.recordAction(
		'message_deleted',
		{
			message_id: messageId,
			channel_id: channelId,
			guild_id: channel.guildId
		},
		{
			endpoint: `DELETE /channels/${channelId}/messages/${messageId}`,
			method: 'DELETE'
		}
	)

	// Dispatch MESSAGE_DELETE event via Gateway
	const dispatchData: { id: string; channel_id: string; guild_id?: string } = {
		id: messageId,
		channel_id: channelId
	}

	if (channel.guildId) {
		dispatchData.guild_id = channel.guildId
	}

	getGatewayServer().dispatchToSession(session.id, 'MESSAGE_DELETE', dispatchData, channel.guildId)

	// Return 204 No Content (Discord API behavior)
	return new Response(null, { status: 204 })
}
