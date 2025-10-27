import { isProviderReady, getProvider } from '../../../events/_start.js'
import { success, wrapHandler, validateMethod, ERROR_CODES } from '../utils.js'
import type { RoboRequest } from '@robojs/server'

/**
 * Query parameters for cards endpoint
 */
interface CardsQueryParams {
	limit?: string
}

/**
 * Provider cards fetch endpoint
 *
 * @route GET /api/roadmap/provider/cards
 * @query limit - Optional limit on number of cards returned (default: 100)
 * @returns Array of roadmap cards from the provider
 * @note Primarily for testing and debugging provider integration
 */
export default wrapHandler(async (request: RoboRequest) => {
	// Only allow GET requests
	validateMethod(request, ['GET'])

	// Check provider initialization
	if (!isProviderReady()) {
		const err = new Error('Provider not ready. Please configure a roadmap provider and restart the bot.')
		err.name = ERROR_CODES.PROVIDER_NOT_READY
		throw err
	}

	// Get provider instance
	const provider = getProvider()
	if (!provider) {
		const err = new Error('Provider not available')
		err.name = ERROR_CODES.PROVIDER_NOT_READY
		throw err
	}

	// Parse query parameters
	const query = request.query as CardsQueryParams
	const limit = parseInt(query.limit ?? '100', 10)

	try {
		// Fetch all cards from provider
		const cards = await provider.fetchCards()

		// Apply limit to card list
		const limitedCards = cards.slice(0, limit)

		// Build response with card data and metadata
		const cardsData = {
			cards: limitedCards,
			count: limitedCards.length,
			total: cards.length,
			limited: cards.length > limit
		}

		return success(cardsData)
	} catch (err) {
		// Handle provider-specific errors
		if (err instanceof Error) {
			// Map authentication errors
			if (err.message.includes('authentication') || err.message.includes('unauthorized')) {
				const authErr = new Error('Provider authentication failed. Check your credentials.')
				authErr.name = 'PROVIDER_AUTH_FAILED'
				throw authErr
			}

			// Map network errors
			if (err.message.includes('network') || err.message.includes('timeout')) {
				const netErr = new Error('Network error while fetching cards from provider')
				netErr.name = 'NETWORK_ERROR'
				throw netErr
			}
		}

		throw err
	}
})
