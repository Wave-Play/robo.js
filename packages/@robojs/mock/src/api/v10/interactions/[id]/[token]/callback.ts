import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../../core/manager.js'
import { getStageBridge } from '../../../../../core/stage-bridge.js'
import { mockMessageToAPIMessage } from '../../../../../discord/payloads.js'
import { generateSnowflake } from '../../../../../utils/snowflake.js'
import { isMultipartRequest, parseMultipartMessage, MultipartError } from '../../../../../utils/multipart.js'
import { getImageDimensions, isImageContentType } from '../../../../../utils/image.js'
import type {
	InteractionResponseData,
	MockAttachment,
	AttachmentPayload,
	StoredAttachment
} from '../../../../../types/index.js'
import { MessageFlags, createComponentValidationError, createV2ConflictError } from '../../../../../types/index.js'
import { validateComponents, validateComponentsV2 } from '../../../../../session/state.js'

// Default port for CDN URLs (can be overridden via environment)
const CDN_BASE_URL = process.env.MOCK_CDN_URL || 'http://localhost:53596'

/**
 * POST /api/v10/interactions/:id/:token/callback - Respond to an interaction
 *
 * This endpoint captures interaction responses from bots.
 * Discord uses this endpoint when a bot calls interaction.reply(), interaction.deferReply(), etc.
 *
 * Supports both:
 * - JSON body: { type, data: { content, embeds, components, flags, tts, allowed_mentions } }
 * - Multipart: payload_json + files[0], files[1], etc.
 *
 * Response: 204 No Content on success
 */
export default async (request: RoboRequest) => {
	// 1. Validate POST method
	if (request.method !== 'POST') {
		return new Response(JSON.stringify({ error: 'Method not allowed' }), {
			status: 405,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 2. Extract interaction ID and token from URL params
	const { id: interactionId, token } = request.params as { id: string; token: string }

	// 3. Find session containing this interaction (lookup by token, not session token)
	const session = sessionManager.findSessionByInteractionToken(token)
	if (!session) {
		return new Response(
			JSON.stringify({
				error: 'Unknown Interaction',
				code: 10062
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
				error: 'Unknown Interaction',
				code: 10062
			}),
			{
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			}
		)
	}

	// 5. Validate interaction ID matches (Discord includes this for verification)
	if (interaction.id !== interactionId) {
		return new Response(
			JSON.stringify({
				error: 'Unknown Interaction',
				code: 10062
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
				error: 'Interaction token expired',
				code: 10062
			}),
			{
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			}
		)
	}

	// 7. Check if already responded (can only respond once to initial callback)
	if (interaction.response) {
		return new Response(
			JSON.stringify({
				error: 'Interaction has already been acknowledged',
				code: 40060
			}),
			{
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			}
		)
	}

	// 8. Parse response body (JSON or multipart)
	let body: { type: number; data?: InteractionResponseData & { attachments?: AttachmentPayload[] } }
	const attachments: MockAttachment[] = []
	const messageId = generateSnowflake() // Pre-generate for attachment URLs

	try {
		if (isMultipartRequest(request)) {
			// Handle multipart/form-data (file uploads)
			const parsed = await parseMultipartMessage(request)
			body = parsed.body as typeof body

			// Process each uploaded file
			for (let i = 0; i < parsed.files.length; i++) {
				const file = parsed.files[i]
				const attachmentId = generateSnowflake()

				// Find metadata from payload_json.data.attachments (if provided)
				const meta: Partial<AttachmentPayload> = body.data?.attachments?.find((a) => a.id === i) || {}

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
				const channelId = interaction.channelId
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
			return new Response(JSON.stringify({ error: error.message, code: error.code }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}
		return new Response(JSON.stringify({ error: 'Invalid request body' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 9. Validate response type is present
	if (typeof body.type !== 'number') {
		return new Response(JSON.stringify({ error: 'Invalid response type', code: 50035 }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 9b. Validate autocomplete response format (type 8) - Phase 3F
	if (body.type === 8) {
		// Validate interaction was an autocomplete request (type 4)
		if (interaction.type !== 4) {
			return new Response(
				JSON.stringify({
					error: 'Autocomplete response (type 8) only valid for autocomplete interactions',
					code: 50035
				}),
				{ status: 400, headers: { 'Content-Type': 'application/json' } }
			)
		}

		// Validate choices array exists
		const data = body.data as { choices?: unknown[] } | undefined
		if (!data?.choices || !Array.isArray(data.choices)) {
			return new Response(
				JSON.stringify({
					error: 'Autocomplete response requires "choices" array in data',
					code: 50035
				}),
				{ status: 400, headers: { 'Content-Type': 'application/json' } }
			)
		}

		// Validate choices limit (max 25)
		if (data.choices.length > 25) {
			return new Response(
				JSON.stringify({
					error: 'Autocomplete choices limited to 25 items',
					code: 50035
				}),
				{ status: 400, headers: { 'Content-Type': 'application/json' } }
			)
		}
	}

	// 9c. Validate Components V2 if flag is set (Phase 4F)
	const responseData = body.data as InteractionResponseData | undefined
	if (responseData?.flags && responseData.flags & MessageFlags.IsComponentsV2) {
		// V2 components cannot coexist with content or embeds
		if (responseData.content || (responseData.embeds && responseData.embeds.length > 0)) {
			return new Response(JSON.stringify(createV2ConflictError()), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Validate V2 component structure
		const attachmentFilenames = new Set(attachments.map((a) => a.filename))
		const validation = validateComponentsV2(responseData.components ?? [], attachmentFilenames)
		if (!validation.valid) {
			return new Response(JSON.stringify(createComponentValidationError(validation.errors)), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}
	} else if (responseData?.components && responseData.components.length > 0) {
		// Validate classic (V1) components
		const validation = validateComponents(responseData.components)
		if (!validation.valid) {
			return new Response(JSON.stringify(createComponentValidationError(validation.errors)), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}
	}

	// 10. Store response on interaction
	const now = Date.now()
	interaction.response = {
		type: body.type,
		timestamp: now,
		data: responseData
	}
	interaction.respondedAt = now

	// 10b. Create message for type 4 (ChannelMessageWithSource), type 5 (DeferredChannelMessageWithSource),
	// type 6 (DeferredUpdateMessage), or type 7 (UpdateMessage) - Phase 3H/7
	if (body.type === 5) {
		// Type 5: Deferred reply - create an empty placeholder message for editReply() to update later
		const message = session.state.createMessage({
			id: messageId,
			channelId: interaction.channelId,
			guildId: interaction.guildId,
			authorId: session.state.botUser.id,
			content: '',
			embeds: [],
			tts: false,
			// Ephemeral deferred replies have the ephemeral flag
			flags: responseData?.flags
		})
		interaction.responseMessageId = message.id
	} else if (body.type === 6 && interaction.messageId) {
		// Type 6: Deferred update - point to the original component message
		interaction.responseMessageId = interaction.messageId
	} else if (body.type === 4 && responseData) {
		// Type 4: Create a new message as the response
		// Phase 3I: Get the user who triggered the interaction for interaction_metadata
		const interactionUser = session.state.getUser(interaction.userId)

		const message = session.state.createMessage({
			id: messageId, // Use pre-generated ID for attachment consistency
			channelId: interaction.channelId,
			guildId: interaction.guildId,
			authorId: session.state.botUser.id,
			content: responseData.content ?? '',
			embeds: responseData.embeds,
			attachments, // Phase 4E: Include uploaded attachments
			tts: responseData.tts ?? false,
			// Phase 4F: Components V2 support
			flags: responseData.flags,
			components: responseData.components,
			// Phase 3I: Add interaction metadata to the response message
			interactionMetadata: interactionUser
				? {
						id: interaction.id,
						type: interaction.type,
						name: interaction.commandName,
						user: interactionUser,
						authorizing_integration_owners: {},
						// Add target info for context menu commands (Phase 3G)
						...(interaction.targetId &&
							interaction.contextMenuType === 2 && {
								target_user: session.state.getUser(interaction.targetId)
							}),
						...(interaction.targetId &&
							interaction.contextMenuType === 3 && {
								target_message_id: interaction.targetId
							})
					}
				: undefined,
			interactionName: interaction.commandName
		})
		interaction.responseMessageId = message.id

		// Dispatch MESSAGE_CREATE event so the message appears in Stage UI
		const apiMessage = mockMessageToAPIMessage(message, session.state.botUser)
		const dispatchData: Record<string, unknown> = { ...apiMessage }
		if (interaction.guildId) {
			dispatchData.guild_id = interaction.guildId
		}
		await session.dispatch('MESSAGE_CREATE', dispatchData)
	} else if (body.type === 7 && responseData && interaction.messageId) {
		// Type 7: Update the original component message
		// Merge existing attachments with new ones if provided
		const existingMessage = session.state.getMessage(interaction.messageId)
		const finalAttachments = attachments.length > 0 ? attachments : existingMessage?.attachments ?? []

		session.state.updateMessage(interaction.messageId, {
			content: responseData.content ?? '',
			embeds: responseData.embeds as unknown[],
			attachments: finalAttachments,
			// Phase 4F: Components V2 support
			flags: responseData.flags,
			components: responseData.components as unknown[]
		})
		interaction.responseMessageId = interaction.messageId

		// Dispatch MESSAGE_UPDATE event so the updated message appears in Stage UI
		const updatedMessage = session.state.getMessage(interaction.messageId)
		if (updatedMessage) {
			const apiMessage = mockMessageToAPIMessage(updatedMessage, session.state.botUser)
			const dispatchData: Record<string, unknown> = { ...apiMessage }
			if (interaction.guildId) {
				dispatchData.guild_id = interaction.guildId
			}
			await session.dispatch('MESSAGE_UPDATE', dispatchData)
		}
	}

	// 11. Record as 'interaction_response' action
	session.recorder.record(
		'interaction_response',
		{
			interaction_id: interaction.id,
			response_type: body.type,
			response_data: body.data,
			command_name: interaction.commandName,
			response_time_ms: now - interaction.createdAt,
			attachments: attachments.length > 0 ? attachments : undefined
		},
		{
			endpoint: `POST /interactions/${interactionId}/${token}/callback`,
			method: 'POST',
			interactionId: interaction.id,
			responseType: body.type
		}
	)

	// 12. Notify stage clients of interaction response
	try {
		// Phase 5O: Include channel and bot info for "Bot is thinking..." indicator
		const botUser = session.state.botUser
		getStageBridge().onInteractionResponse(
			session.id,
			interaction.id,
			{
				type: body.type,
				data: responseData
			},
			interaction.channelId,
			{
				id: botUser.id,
				username: botUser.username,
				avatar: botUser.avatar ?? null
			}
		)
	} catch {
		// Stage bridge may not be initialized
	}

	// 13. Discord returns 204 No Content on success
	return new Response(null, { status: 204 })
}
