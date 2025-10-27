import { isProviderReady, getProvider } from '../../../events/_start.js'
import { success, wrapHandler, validateMethod, ERROR_CODES } from '../utils.js'
import type { RoboRequest } from '@robojs/server'

/**
 * Provider columns fetch endpoint
 *
 * @route GET /api/roadmap/provider/columns
 * @returns Array of roadmap columns from the provider
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

	try {
		// Fetch columns from provider
		const columns = await provider.getColumns()

		// Build response with column data and count
		const columnsData = {
			columns,
			count: columns.length
		}

		return success(columnsData)
	} catch (err) {
		// Handle provider-specific errors
		if (err instanceof Error) {
			// Map authentication errors
			if (err.message.includes('authentication') || err.message.includes('unauthorized')) {
				const authErr = new Error('Provider authentication failed. Check your credentials.')
				authErr.name = 'PROVIDER_AUTH_FAILED'
				throw authErr
			}
		}

		throw err
	}
})
