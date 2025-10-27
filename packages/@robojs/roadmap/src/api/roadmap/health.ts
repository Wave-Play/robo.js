import { isProviderReady, getProvider } from '../../events/_start.js'
import { success, wrapHandler } from './utils.js'

/**
 * Health check endpoint
 *
 * @route GET /api/roadmap/health
 * @returns Current health status of the roadmap plugin and provider
 */
export default wrapHandler(async () => {
	// Get provider ready state and instance
	const ready = isProviderReady()
	const provider = getProvider()

	// Only get provider info when ready to avoid errors
	let providerInfo = undefined
	if (ready && provider) {
		try {
			providerInfo = await provider.getProviderInfo()
		} catch {
			// If getProviderInfo fails, omit info but keep endpoint resilient
		}
	}

	// Build health status response with provider state and timestamp
	const healthData = {
		status: ready ? 'healthy' : 'degraded',
		provider: {
			ready,
			info: providerInfo
		},
		timestamp: Date.now()
	}

	return success(healthData)
})
