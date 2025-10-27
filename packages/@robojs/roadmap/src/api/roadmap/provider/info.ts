import { isProviderReady, getProvider } from '../../../events/_start.js'
import { success, wrapHandler, validateMethod, ERROR_CODES } from '../utils.js'
import type { RoboRequest } from '@robojs/server'

/**
 * Provider information endpoint
 *
 * @route GET /api/roadmap/provider/info
 * @returns Provider metadata including name, version, and capabilities
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

	// Fetch provider metadata
	const providerInfo = await provider.getProviderInfo()

	return success(providerInfo)
})
