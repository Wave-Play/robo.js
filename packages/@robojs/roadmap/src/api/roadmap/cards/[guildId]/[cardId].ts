/**
 * Roadmap card retrieval and update API endpoint
 *
 * GET /api/roadmap/cards/:guildId/:cardId
 * PUT /api/roadmap/cards/:guildId/:cardId
 *
 * GET: Retrieves details of a specific roadmap card from the external provider.
 * Supports JSON response with card metadata including title, description, labels,
 * column assignment, and Discord sync information.
 *
 * PUT: Updates an existing roadmap card in the external provider and optionally
 * syncs changes to Discord. Supports partial updates where only provided fields
 * are modified. Thread tags are always synced to reflect current card labels.
 *
 * ⚠️ **SECURITY WARNING**: These endpoints currently do not enforce authorization checks.
 * In production, you MUST implement authentication to verify the requester's identity
 * and authorization. Recommended approaches:
 * - Discord OAuth with guild member verification
 * - API key/token with role mapping
 * - JWT with embedded user/role claims
 * - Mutual TLS with client certificates
 *
 * Once authenticated, use `canUserCreateCards(guildId, userRoleIds, isAdmin)` from
 * `src/core/settings.ts` to verify the user has permission to update cards.
 *
 * Request Body (PUT):
 * ```json
 * {
 *   "title": "Updated title",
 *   "description": "Updated description",
 *   "column": "In Progress",
 *   "labels": ["bug", "urgent"],
 *   "syncDiscord": true
 * }
 * ```
 *
 * Response (GET):
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "card": {
 *       "id": "PROJ-123",
 *       "title": "Add dark mode support",
 *       "description": "...",
 *       "column": "In Progress",
 *       "labels": ["enhancement", "ui"],
 *       "assignees": [...],
 *       "url": "https://jira.example.com/browse/PROJ-123",
 *       "updatedAt": "2024-01-01T12:00:00.000Z"
 *     }
 *   }
 * }
 * ```
 *
 * Response (PUT):
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "card": {...},
 *     "discordSynced": true,
 *     "threadId": "1234567890123456789",
 *     "threadUrl": "https://discord.com/channels/123456789/1234567890123456789",
 *     "message": "Card updated successfully"
 *   }
 * }
 * ```
 *
 * @example
 * ```bash
 * # GET a card
 * curl http://localhost:3000/api/roadmap/cards/123456789/PROJ-123
 *
 * # PUT to update a card
 * curl -X PUT http://localhost:3000/api/roadmap/cards/123456789/PROJ-123 \
 *   -H "Content-Type: application/json" \
 *   -d '{
 *     "title": "Updated title",
 *     "labels": ["bug", "urgent"],
 *     "syncDiscord": true
 *   }'
 * ```
 */

import type { RoboRequest } from '@robojs/server'
import { client, logger } from 'robo.js'
import { ChannelType, type ForumChannel } from 'discord.js'
import { getProvider, isProviderReady } from '../../../../events/_start.js'
import { getSyncedPostId } from '../../../../core/settings.js'
import { formatCardContent } from '../../../../core/sync-engine.js'
import {
	getGuildFromRequest,
	success,
	wrapHandler,
	validateMethod,
	ERROR_CODES,
	type ApiResponse
} from '../../utils.js'
import type { UpdateCardInput } from '../../../../types.js'

const apiLogger = logger.fork('roadmap')

/**
 * Request body structure for card updates
 */
interface UpdateCardRequest {
	/**
	 * Updated card title
	 */
	title?: string
	/**
	 * Updated card description
	 */
	description?: string
	/**
	 * Updated target column name
	 */
	column?: string
	/**
	 * Updated array of label names
	 */
	labels?: string[]
	/**
	 * Whether to sync changes to Discord (default: true)
	 */
	syncDiscord?: boolean
}

/**
 * Response data structure for successful card retrieval
 */
interface GetCardResponse {
	/**
	 * The card with full details
	 */
	card: {
		id: string
		title: string
		description: string
		column: string
		labels: string[]
		assignees: Array<{
			id: string
			name: string
			avatarUrl?: string
		}>
		url: string
		updatedAt: string
	}
}

/**
 * Response data structure for successful card update
 */
interface UpdateCardResponse {
	/**
	 * The updated card with full details
	 */
	card: {
		id: string
		title: string
		description: string
		column: string
		labels: string[]
		assignees: Array<{
			id: string
			name: string
			avatarUrl?: string
		}>
		url: string
		updatedAt: string
	}
	/**
	 * Whether the card was synced to Discord
	 */
	discordSynced: boolean
	/**
	 * Discord thread ID if synced
	 */
	threadId?: string
	/**
	 * Full Discord thread URL if synced
	 */
	threadUrl?: string
	/**
	 * Success message
	 */
	message: string
}

/**
 * Card retrieval and update endpoint handler
 *
 * @param request - Incoming HTTP request
 * @returns API response with card data or error
 */
export default wrapHandler(async (request: RoboRequest): Promise<ApiResponse<GetCardResponse | UpdateCardResponse>> => {
	// Get guild from request parameters
	const guild = await getGuildFromRequest(request)

	// Extract cardId from request parameters
	const { cardId } = request.params as { cardId?: string }
	if (!cardId) {
		const error = new Error('Card ID is required')
		error.name = ERROR_CODES.INVALID_REQUEST
		throw error
	}

	// Gate allowed methods
	validateMethod(request, ['GET', 'PUT'])

	// Check provider initialization
	if (!isProviderReady()) {
		const error = new Error('Roadmap provider is not configured. Contact an administrator.')
		error.name = ERROR_CODES.PROVIDER_NOT_READY
		throw error
	}

	// Get provider instance
	const provider = getProvider()
	if (!provider) {
		const error = new Error('Roadmap provider is not available')
		error.name = ERROR_CODES.PROVIDER_NOT_READY
		throw error
	}

	// Handle GET request
	if (request.method === 'GET') {
		// Log card retrieval attempt
		apiLogger.debug(`Fetching card via API: ${cardId} from guild ${guild.id}`)

		// Fetch card from provider
		const card = await provider.getCard(cardId)
		if (!card) {
			const error = new Error('Card not found')
			error.name = ERROR_CODES.CARD_NOT_FOUND
			throw error
		}

		// Map to response shape with ISO string for updatedAt
		const response: GetCardResponse = {
			card: {
				id: card.id,
				title: card.title,
				description: card.description,
				column: card.column,
				labels: card.labels,
				assignees: card.assignees,
				url: card.url,
				updatedAt: card.updatedAt.toISOString()
			}
		}

		// Log successful card retrieval
		apiLogger.info(`Card retrieved via API: ${card.id} from guild ${guild.id}`)

		return success(response)
	}

	// Handle PUT request
	if (request.method === 'PUT') {
		// Log card update attempt
		apiLogger.debug(`Updating card via API: ${cardId} from guild ${guild.id}`)

		// Parse and validate request body
		let body: UpdateCardRequest
		try {
			body = (await request.json()) as UpdateCardRequest
		} catch (err) {
			const error = new Error('Invalid JSON in request body')
			error.name = ERROR_CODES.INVALID_REQUEST
			throw error
		}

		// Ensure at least one field is provided
		if (
			body.title === undefined &&
			body.description === undefined &&
			body.column === undefined &&
			body.labels === undefined
		) {
			const error = new Error('At least one of title, description, column, or labels must be provided')
			error.name = ERROR_CODES.INVALID_REQUEST
			throw error
		}

		// Validate column if provided
		if (body.column) {
			const columns = await provider.getColumns()
			const validColumn = columns.find((col) => col.name === body.column)
			if (!validColumn) {
				const columnNames = columns.map((col) => col.name).join(', ')
				const error = new Error(`Invalid column "${body.column}". Valid columns: ${columnNames}`)
				error.name = ERROR_CODES.INVALID_REQUEST
				throw error
			}
		}

		// Build UpdateCardInput with only provided fields
		const input: UpdateCardInput = {
			...(body.title !== undefined && { title: body.title }),
			...(body.description !== undefined && { description: body.description }),
			...(body.column !== undefined && { column: body.column }),
			...(body.labels !== undefined && { labels: body.labels })
		}

		// Update card via provider
		let result
		try {
			result = await provider.updateCard(cardId, input)

			// Check provider-level success flag
			if (!result.success) {
				const error = new Error(result.message || 'Card update failed')
				error.name = ERROR_CODES.CARD_UPDATE_FAILED
				throw error
			}
		} catch (err) {
			// Categorize error by message content
			const message = err instanceof Error ? err.message : String(err)
			const errorMessage = message.toLowerCase()

			// Map authentication/credentials errors
			if (errorMessage.includes('authentication') || errorMessage.includes('credentials')) {
				const error = new Error('Provider authentication failed')
				error.name = ERROR_CODES.PROVIDER_AUTH_FAILED
				throw error
			}

			// Map network/timeout/reachability errors
			if (errorMessage.includes('network') || errorMessage.includes('timeout') || errorMessage.includes('reach')) {
				const error = new Error('Unable to reach provider')
				error.name = ERROR_CODES.NETWORK_ERROR
				throw error
			}

			// Map card not found errors
			if (errorMessage.includes('not found')) {
				const error = new Error('Card not found')
				error.name = ERROR_CODES.CARD_NOT_FOUND
				throw error
			}

			// Default to card update failed
			const error = new Error(message)
			error.name = ERROR_CODES.CARD_UPDATE_FAILED
			throw error
		}

		// Log successful card update
		apiLogger.info(`Card updated successfully via API: ${result.card.id} from guild ${guild.id}`)

		// Sync to Discord if requested (default: true)
		let discordSynced = false
		let threadId: string | undefined
		let threadUrl: string | undefined
		if (body.syncDiscord !== false) {
			try {
				// Get Discord thread ID from sync mapping
				threadId = getSyncedPostId(guild.id, cardId)
				if (threadId) {
					try {
						// Fetch Discord thread channel
						const channel = await client.channels.fetch(threadId)
						if (channel && channel.isThread()) {
							const thread = channel
							const forum = thread.parent as ForumChannel | null

							// Update thread name to match card title
							try {
								await thread.edit({ name: result.card.title.substring(0, 100) })
							} catch (error) {
								const errorCode =
									error && typeof error === 'object' && 'code' in error ? (error as { code: number }).code : undefined

								// Silently handle permission and not found errors
								if (errorCode !== 403 && errorCode !== 10003 && errorCode !== 10008) {
									apiLogger.warn(`Failed to update thread name for ${threadId}:`, error)
								}
							}

							// Update thread tags from card labels
							if (forum && forum.type === ChannelType.GuildForum) {
								try {
									// Build tag mapping for this forum (case-insensitive)
									const labelToTagId = new Map<string, string>()
									for (const tag of forum.availableTags) {
										labelToTagId.set(tag.name.toLowerCase(), tag.id)
									}

									// Map labels to tag IDs (max 5)
									const appliedTags = result.card.labels
										.map((label) => labelToTagId.get(label.toLowerCase()))
										.filter((tagId): tagId is string => Boolean(tagId))
										.slice(0, 5)

									// Always update tags, even if empty (to clear existing tags)
									await thread.edit({ appliedTags })
								} catch (error) {
									const errorCode =
										error && typeof error === 'object' && 'code' in error ? (error as { code: number }).code : undefined

									// Silently handle permission and not found errors
									if (errorCode !== 403 && errorCode !== 10003 && errorCode !== 10008) {
										apiLogger.warn(`Failed to update thread tags for ${threadId}:`, error)
									}
								}
							}

							// Update starter message if bot authored it
							// Message edits have a 2000 character limit in Discord
							try {
								// Fetch starter message for editing
								const starter = await thread.fetchStarterMessage()

								// Only edit if message was created by bot
								if (starter && starter.author?.id === client.user?.id) {
									// Format card content to fit within Discord message limits
									const formattedContent = formatCardContent(result.card, 2000)

									// Edit message with updated content
									await starter.edit({ content: formattedContent })
								}
							} catch (error) {
								const errorCode =
									error && typeof error === 'object' && 'code' in error ? (error as { code: number }).code : undefined

								// Silently handle permission and not found errors
								if (errorCode !== 403 && errorCode !== 10003 && errorCode !== 10008) {
									apiLogger.warn(`Failed to update starter message for ${threadId}:`, error)
								}
							}

							// Mark sync as successful
							discordSynced = true

							// Build thread URL if sync succeeded
							if (threadId && discordSynced) {
								threadUrl = `https://discord.com/channels/${guild.id}/${threadId}`
							}

							// Log successful Discord sync
							apiLogger.debug(`Discord thread synced for card ${cardId}`)
						}
					} catch (error) {
						const errorCode =
							error && typeof error === 'object' && 'code' in error ? (error as { code: number }).code : undefined

						// Silently handle permission and not found errors
						if (errorCode !== 403 && errorCode !== 10003 && errorCode !== 10008) {
							apiLogger.warn(`Failed to fetch thread ${threadId}:`, error)
						}
					}
				}
			} catch (error) {
				// Log sync failure but don't fail the request
				apiLogger.warn('Failed to sync Discord thread after card update:', error)
				// Don't fail the request - card was updated successfully
			}
		}

		// Build response with updated card data and sync status
		// Include thread metadata if available
		const responseData: UpdateCardResponse = {
			card: {
				id: result.card.id,
				title: result.card.title,
				description: result.card.description,
				column: result.card.column,
				labels: result.card.labels,
				assignees: result.card.assignees,
				url: result.card.url,
				updatedAt: result.card.updatedAt.toISOString()
			},
			discordSynced,
			...(threadId && { threadId }),
			...(threadUrl && { threadUrl }),
			message: 'Card updated'
		}

		return success(responseData)
	}

	// Should not reach here due to validateMethod
	const error = new Error(`Unsupported method: ${request.method}`)
	error.name = ERROR_CODES.METHOD_NOT_ALLOWED
	throw error
})
