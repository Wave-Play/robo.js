import { syncLogger } from '../core/logger.js'
import { SyncServer } from '../core/server.js'
import { initializeSyncHandlers } from './routes/sync.js'
import { clearHandlers } from '../server/handlers.js'
import { ready } from '@robojs/server'
import { portal } from 'robo.js'

export default async () => {
	// Wait for the server plugin to be ready first
	syncLogger.debug('Waiting for server plugin to be ready...')
	await ready()

	// Initialize sync handlers from portal
	try {
		clearHandlers()
		await initializeSyncHandlers(portal)
		syncLogger.debug('Sync handlers initialized')
	} catch (error) {
		// Handlers are optional - continue without them
		syncLogger.debug('No sync handlers found or initialization skipped:', error)
	}

	SyncServer.start()
}
