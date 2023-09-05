import { portal } from '@roboplay/robo.js'
import Server from '../core/server.js'
import type { Client } from 'discord.js'

interface PluginOptions {
	cors?: boolean
	port?: number
}
export let pluginOptions: PluginOptions = {}

export default async (_client: Client, options: PluginOptions) => {
	pluginOptions = options ?? {}

	// Start HTTP server only if API Routes are defined
	if (portal.apis.size > 0) {
		await Server.start(options?.port ?? parseInt(process.env.PORT ?? '3000'))
	}
}
