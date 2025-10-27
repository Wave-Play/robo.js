import { isProviderReady, getProvider } from '../../../events/_start.js'
import { success, wrapHandler, validateMethod } from '../utils.js'
import type { RoboRequest } from '@robojs/server'

/**
 * Provider status endpoint
 *
 * @route GET /api/roadmap/provider/status
 * @returns Provider initialization status
 */
export default wrapHandler(async (request: RoboRequest) => {
	// Only allow GET requests
	validateMethod(request, ['GET'])

	// Get provider ready state and instance
	const ready = isProviderReady()
	const provider = getProvider()

	// Build status response with ready state and configuration
	const statusData = {
		ready,
		configured: !!provider
	}

	return success(statusData)
})
