import { portal } from '@roboplay/robo.js'
import Server from '../core/server.js'

export default async () => {
	// Start HTTP server only if API Routes are defined
	if (portal.apis.size > 0) {
		await Server.start()
	}
}
