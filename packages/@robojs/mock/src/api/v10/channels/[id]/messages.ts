import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../core/manager.js'
import { parseMockToken } from '../../../../utils/id.js'
import { mockMessageToAPIMessage } from '../../../../discord/payloads.js'
import { generateSnowflake } from '../../../../utils/snowflake.js'
import { isMultipartRequest, parseMultipartMessage, MultipartError } from '../../../../utils/multipart.js'
import { getImageDimensions, isImageContentType } from '../../../../utils/image.js'
import type { MockAttachment, AttachmentPayload, StoredAttachment } from '../../../../types/index.js'
import { MessageFlags, createComponentValidationError, createV2ConflictError } from '../../../../types/index.js'
import { validateComponents, validateComponentsV2 } from '../../../../session/state.js'
import { enforcePermissions } from '../../../../utils/permission-check.js'
import { checkRateLimitForEndpoint } from '../../../../utils/rate-limit-check.js'

// Default port for CDN URLs (can be overridden via environment)
const CDN_BASE_URL = process.env.MOCK_CDN_URL || 'http://localhost:53596'

/**
 * GET /api/v10/channels/:id/messages - List messages in a channel
 * POST /api/v10/channels/:id/messages - Create a message in a channel
 *
 * GET: Returns an array of messages with optional limit, before, after, around
 * POST: Creates a message and returns APIMessage object
 *
 * Supports both:
 * - JSON body: { content, embeds, components, tts, message_reference }
 * - Multipart: payload_json + files[0], files[1], etc.
 */
export default async (request: RoboRequest) => {
	// 1. Validate method
	if (request.method !== 'GET' && request.method !== 'POST') {
		return new Response(JSON.stringify({ message: 'Method not allowed' }), {
			status: 405,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 2. Parse Authorization header → get session
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

	// 3. Extract channel ID from params
	const { id: channelId } = request.params as { id: string }

	// 3.5. Check for rate limit simulation
	const rateLimitResponse = checkRateLimitForEndpoint(session, `/channels/${channelId}/messages`)
	if (rateLimitResponse) {
		return rateLimitResponse
	}

	// 4. Validate channel exists in session state
	const channel = session.state.getChannel(channelId)
	if (!channel) {
		return new Response(JSON.stringify({ message: 'Unknown Channel', code: 10003 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// GET - List messages
	if (request.method === 'GET') {
		// Check permissions
		const permError = enforcePermissions(session, 'GET', `/channels/${channelId}/messages`, channelId)
		if (permError) return permError

		// Parse query parameters
		const url = new URL(request.url)
		const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100)
		const before = url.searchParams.get('before')
		const after = url.searchParams.get('after')
		const around = url.searchParams.get('around')

		// Get messages for channel
		let messages = session.state.getMessagesForChannel(channelId)

		// Sort by snowflake ID descending (newest first)
		// Discord snowflake IDs contain a timestamp component, so larger ID = newer message
		messages.sort((a, b) => {
			return BigInt(b.id) > BigInt(a.id) ? 1 : BigInt(b.id) < BigInt(a.id) ? -1 : 0
		})

		// Apply pagination
		if (around) {
			// Find message and return messages around it
			const aroundIndex = messages.findIndex((m) => m.id === around)
			if (aroundIndex >= 0) {
				const start = Math.max(0, aroundIndex - Math.floor(limit / 2))
				messages = messages.slice(start, start + limit)
			} else {
				messages = messages.slice(0, limit)
			}
		} else if (before) {
			// Get messages before this ID
			const beforeIndex = messages.findIndex((m) => m.id === before)
			if (beforeIndex >= 0) {
				messages = messages.slice(beforeIndex + 1, beforeIndex + 1 + limit)
			} else {
				messages = messages.slice(0, limit)
			}
		} else if (after) {
			// Get messages after this ID
			const afterIndex = messages.findIndex((m) => m.id === after)
			if (afterIndex >= 0) {
				messages = messages.slice(0, afterIndex).slice(-limit)
			} else {
				messages = messages.slice(0, limit)
			}
		} else {
			// Just limit
			messages = messages.slice(0, limit)
		}

		// Convert to API format
		const apiMessages = messages.map((msg) => {
			const author = session.state.getUser(msg.authorId) || session.state.botUser
			return mockMessageToAPIMessage(msg, author)
		})

		return apiMessages
	}

	// POST - Create message
	// 4b. Check permissions (Phase 4L-Extended)
	const permError = enforcePermissions(
		session,
		'POST',
		`/channels/${channelId}/messages`,
		channelId
	)
	if (permError) return permError

	// 5. Parse message payload (JSON or multipart)
	let body: {
		content?: string
		embeds?: unknown[]
		components?: unknown[]
		flags?: number
		tts?: boolean
		message_reference?: { message_id: string }
		attachments?: AttachmentPayload[] // Metadata for uploaded files
		// Phase 13: Message nonce support
		nonce?: string | number
		enforceNonce?: boolean
		// Phase 4G: Poll support
		poll?: {
			question: { text: string; emoji?: { id?: string; name?: string } }
			answers: Array<{ poll_media: { text?: string; emoji?: { id?: string; name?: string } } }>
			duration?: number // Hours until expiry
			allow_multiselect?: boolean
			layout_type?: number
		}
		// Phase 4I: Sticker support
		sticker_ids?: string[]
	}

	const attachments: MockAttachment[] = []
	const messageId = generateSnowflake()

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

	// 5b. Validate Components V2 if flag is set
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

	// 5b1. Validate message length (2000 character limit)
	if (body.content && body.content.length > 2000) {
		return new Response(JSON.stringify({ message: 'Message content exceeds 2000 characters', code: 50035 }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 5c. Validate poll if present
	if (body.poll) {
		if (!body.poll.question?.text) {
			return new Response(JSON.stringify({ message: 'Poll question text is required', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}
		if (body.poll.question.text.length > 300) {
			return new Response(JSON.stringify({ message: 'Poll question text cannot exceed 300 characters', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}
		if (!body.poll.answers || body.poll.answers.length < 1) {
			return new Response(JSON.stringify({ message: 'Poll must have at least 1 answer', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}
		if (body.poll.answers.length > 10) {
			return new Response(JSON.stringify({ message: 'Poll cannot have more than 10 answers', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}
		// Validate answer text lengths
		for (let i = 0; i < body.poll.answers.length; i++) {
			const answerText = body.poll.answers[i].poll_media?.text
			if (answerText && answerText.length > 55) {
				return new Response(JSON.stringify({ message: `Poll answer ${i + 1} text cannot exceed 55 characters`, code: 50035 }), {
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				})
			}
		}
	}

	// 5d. Validate sticker_ids if present
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

	// 6. Create message in state (author is bot user)
	// Set type to 19 (Reply) when message_reference is present
	const messageType = body.message_reference ? 19 : 0 // 19 = Reply, 0 = Default
	const message = session.state.createMessage({
		id: messageId,
		channelId,
		guildId: channel.guildId,
		authorId: session.state.botUser.id,
		content: body.content ?? '',
		embeds: body.embeds ?? [],
		attachments,
		tts: body.tts ?? false,
		type: messageType,
		nonce: body.nonce,
		flags: body.flags,
		components: body.components,
		poll: body.poll,
		sticker_ids: body.sticker_ids,
		message_reference: body.message_reference
			? {
					message_id: body.message_reference.message_id,
					channel_id: channelId,
					guild_id: channel.guildId
				}
			: undefined
	})

	// 7. Record as 'message_sent' action (use session.recordAction for metadata propagation)
	session.recordAction(
		'message_sent',
		{
			message_id: message.id,
			channel_id: channelId,
			guild_id: channel.guildId,
			content: message.content,
			embeds: message.embeds,
			attachments: message.attachments,
			components: message.components,
			flags: message.flags,
			poll: message.poll
		},
		{
			endpoint: `POST /channels/${channelId}/messages`,
			method: 'POST'
		}
	)

	// 8. Dispatch MESSAGE_CREATE event via Gateway (routed through session for loop detection)
	const author = session.state.botUser
	const apiMessage = mockMessageToAPIMessage(message, author)
	const dispatchData: Record<string, unknown> = { ...apiMessage }
	if (message.guildId) {
		dispatchData.guild_id = message.guildId
	}
	await session.dispatch('MESSAGE_CREATE', dispatchData)

	// 9. Return APIMessage response
	return apiMessage
}
