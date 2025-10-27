import type { RoboRequest } from '@robojs/server'
import { client, logger } from 'robo.js'
import { wrapHandler, success, validateMethod } from './utils.js'

const apiLogger = logger.fork('xp-api')

/**
 * Health Check Endpoint
 *
 * Provides health status information for monitoring and uptime checks.
 *
 * **Use Cases:**
 * - Monitoring dashboards
 * - Uptime checks
 * - Service health verification
 * - Load balancer health probes
 *
 * **Status Determination:**
 * - 'healthy': Discord ready AND Flashcore accessible
 * - 'degraded': Either Discord not ready OR Flashcore not accessible
 *
 * **Route:**
 * - GET /api/xp/health - Get service health status
 */
export default wrapHandler(async (request: RoboRequest) => {
	// Validate method
	validateMethod(request, ['GET'])

	try {
		// Check Discord client status
		const discordReady = client.isReady()
		const guildCount = client.guilds.cache.size

		// Check Flashcore accessibility
		let flashcoreAccessible = false
		try {
			// Try to access Flashcore with a simple operation
			const { Flashcore } = await import('robo.js/flashcore.js')
			await Flashcore.get('__health_check__')
			flashcoreAccessible = true
		} catch (err) {
			apiLogger.warn('Flashcore health check failed:', err)
			flashcoreAccessible = false
		}

		// Determine overall status
		const status = discordReady && flashcoreAccessible ? 'healthy' : 'degraded'

		// Get plugin version
		let version = 'unknown'
		try {
			const packageJson = await import('../../../package.json')
			version = packageJson.default.version
		} catch {
			// Ignore version read errors
		}

		return success({
			status,
			timestamp: Date.now(),
			uptime: process.uptime(),
			discord: {
				ready: discordReady,
				guilds: guildCount
			},
			flashcore: {
				accessible: flashcoreAccessible
			},
			version
		})
	} catch (err) {
		// Health check itself failed - return degraded status
		apiLogger.error('Health check failed:', err)

		return success({
			status: 'degraded',
			timestamp: Date.now(),
			uptime: process.uptime(),
			discord: {
				ready: false,
				guilds: 0
			},
			flashcore: {
				accessible: false
			},
			version: 'unknown'
		})
	}
})
