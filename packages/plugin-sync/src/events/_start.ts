import { syncLogger } from '../core/logger.js'
import { SyncServer } from '../core/server.js'
import { ready } from '@robojs/server'

export default async () => {
	// Wait for the server plugin to be ready first
	syncLogger.debug('Waiting for server plugin to be ready...')
	await ready()
	SyncServer.start()
}
