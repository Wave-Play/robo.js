/**
 * Roadmap card creation API endpoint
 *
 * POST /api/roadmap/cards/:guildId
 *
 * Creates a new roadmap card in the external provider (e.g., Jira) and optionally
 * syncs it to Discord forums. This endpoint provides programmatic access to card
 * creation functionality.
 *
 * ⚠️ **SECURITY WARNING**: This endpoint currently does not enforce authorization checks.
 * In production, you MUST implement authentication to verify the requester's identity
 * and authorization. Recommended approaches:
 * - Discord OAuth with guild member verification
 * - API key/token with role mapping
 * - JWT with embedded user/role claims
 * - Mutual TLS with client certificates
 *
 * Once authenticated, use `canUserCreateCards(guildId, userRoleIds, isAdmin)` from
 * `src/core/settings.ts` to verify the user has permission to create cards.
 *
 * Request Body:
 * ```json
 * {
 *   "title": "Add dark mode support",
 *   "description": "Implement dark mode theme across the application",
 *   "column": "Backlog",
 *   "labels": ["enhancement", "ui"],
 *   "sync": true
 * }
 * ```
 *
 * Response:
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "card": {
 *       "id": "PROJ-123",
 *       "title": "Add dark mode support",
 *       "description": "...",
 *       "column": "Backlog",
 *       "labels": ["enhancement", "ui"],
 *       "url": "https://jira.example.com/browse/PROJ-123",
 *       "updatedAt": "2024-01-01T12:00:00.000Z"
 *     },
 *     "synced": true,
 *     "threadId": "1234567890123456789",
 *     "threadUrl": "https://discord.com/channels/123456789/1234567890123456789",
 *     "message": "Card created successfully"
 *   }
 * }
 * ```
 *
 * Error Response:
 * ```json
 * {
 *   "success": false,
 *   "error": {
 *     "code": "PROVIDER_NOT_READY",
 *     "message": "Roadmap provider is not configured"
 *   }
 * }
 * ```
 *
 * @example
 * ```bash
 * curl -X POST http://localhost:3000/api/roadmap/cards/123456789 \
 *   -H "Content-Type: application/json" \
 *   -d '{
 *     "title": "Add dark mode",
 *     "description": "Implement dark mode theme",
 *     "column": "Backlog",
 *     "labels": ["enhancement", "ui"],
 *     "sync": true
 *   }'
 * ```
 */

import type { RoboRequest } from '@robojs/server'
import { getProvider, isProviderReady } from '../../../events/_start.js'
import { syncSingleCard } from '../../../core/sync-engine.js'
import { getAllForumChannels } from '../../../core/forum-manager.js'
import {
	getGuildFromRequest,
	success,
	wrapHandler,
	validateMethod,
	ERROR_CODES,
	type ApiResponse
} from '../utils.js'
import type { CreateCardInput } from '../../../types.js'
import { logger } from 'robo.js'

const apiLogger = logger.fork('roadmap')

/**
 * Request body structure for card creation
 */
interface CreateCardRequest {
	/**
	 * Card title or summary (required)
	 */
	title: string
	/**
	 * Detailed card description (required)
	 */
	description: string
	/**
	 * Target column name (required)
	 */
	column: string
	/**
	 * Optional array of label names
	 */
	labels?: string[]
	/**
	 * Whether to trigger sync after creation (default: true)
	 */
	sync?: boolean
}

/**
 * Response data structure for successful card creation
 */
interface CreateCardResponse {
	/**
	 * The created card with full details
	 */
	card: {
		id: string
		title: string
		description: string
		column: string
		labels: string[]
		url: string
		updatedAt: string
	}
	/**
	 * Whether the card was synced to Discord
	 */
	synced: boolean
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
 * Card creation endpoint handler
 *
 * Processes POST requests to create new roadmap cards. Validates the request,
 * creates the card in the provider, optionally syncs to Discord, and returns
 * the created card data.
 *
 * @param request - Incoming HTTP request
 * @returns API response with created card data or error
 */
export default wrapHandler(async (request: RoboRequest): Promise<ApiResponse<CreateCardResponse>> => {
	// Only allow POST requests
	validateMethod(request, ['POST'])

	// Get guild from request parameters
	const guild = await getGuildFromRequest(request)

	// TODO: Implement authentication and authorization
	// This endpoint currently does not verify the requester's identity or permissions.
	// Before deploying to production, implement an authentication mechanism and use
	// canUserCreateCards(guildId, userRoleIds, isAdmin) to verify authorization.
	apiLogger.warn('Card creation API called without authentication for guild %s', guild.id)

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

	// Check forum setup
	const forums = await getAllForumChannels(guild)
	if (forums.size === 0) {
		const error = new Error('Roadmap forums are not set up. Run /roadmap setup first.')
		error.name = ERROR_CODES.FORUM_NOT_SETUP
		throw error
	}

	// Parse and validate request body
	let body: CreateCardRequest
	try {
		body = (await request.json()) as CreateCardRequest
	} catch (err) {
		const error = new Error('Invalid JSON in request body')
		error.name = ERROR_CODES.INVALID_REQUEST
		throw error
	}

	// Validate required field: title
	if (!body.title || !body.title.trim()) {
		const error = new Error('Title is required')
		error.name = ERROR_CODES.INVALID_REQUEST
		throw error
	}

	// Validate required field: description
	if (!body.description || !body.description.trim()) {
		const error = new Error('Description is required')
		error.name = ERROR_CODES.INVALID_REQUEST
		throw error
	}

	// Validate required field: column
	if (!body.column || !body.column.trim()) {
		const error = new Error('Column is required')
		error.name = ERROR_CODES.INVALID_REQUEST
		throw error
	}

	// Validate column against provider columns
	const columns = await provider.getColumns()
	const validColumn = columns.find((col) => col.name === body.column)
	if (!validColumn) {
		const columnNames = columns.map((col) => col.name).join(', ')
		const error = new Error(`Invalid column "${body.column}". Valid columns: ${columnNames}`)
		error.name = ERROR_CODES.INVALID_REQUEST
		throw error
	}

	// Build CreateCardInput
	const input: CreateCardInput = {
		title: body.title.trim(),
		description: body.description.trim(),
		column: body.column,
		labels: body.labels || []
	}

	// Log card creation attempt
	apiLogger.info(`Creating card via API: "${input.title}" in column "${input.column}" for guild ${guild.id}`)

	// Create card via provider
	let result
	try {
		result = await provider.createCard(input)

		// Check provider-level success flag
		if (!result.success) {
			const error = new Error(result.message || 'Card creation failed')
			error.name = ERROR_CODES.CARD_CREATION_FAILED
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

		// Default to card creation failed
		const error = new Error(message)
		error.name = ERROR_CODES.CARD_CREATION_FAILED
		throw error
	}

	// Log successful card creation
	apiLogger.info(`Card created successfully via API: ${result.card.id} for guild ${guild.id}`)

	// Sync the new card to Discord (targeted sync for efficiency)
	let synced = false
	let threadId: string | undefined
	let threadUrl: string | undefined
	if (body.sync !== false) {
		try {
			const syncResult = await syncSingleCard(result.card, guild, provider)
			if (syncResult) {
				threadId = syncResult.threadId
				threadUrl = syncResult.threadUrl
				synced = true

				// Log successful sync
				apiLogger.debug(`Synced card ${result.card.id} to thread ${threadId}`)
			} else {
				apiLogger.debug(`Skipped syncing card ${result.card.id} (likely archived column)`)
			}
		} catch (error) {
			// Log sync failure but don't fail the request
			apiLogger.warn('Failed to sync card after creation:', error)
			// Don't fail the request - card was created successfully
		}
	}

	// Build response with card data and sync status
	// Include thread metadata if sync succeeded
	const responseData: CreateCardResponse = {
		card: {
			id: result.card.id,
			title: result.card.title,
			description: result.card.description,
			column: result.card.column,
			labels: result.card.labels,
			url: result.card.url,
			updatedAt: result.card.updatedAt.toISOString()
		},
		synced,
		...(threadId && { threadId }),
		...(threadUrl && { threadUrl }),
		message: result.message || 'Card created successfully'
	}

	return success(responseData)
})
