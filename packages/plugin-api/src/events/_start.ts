import { BaseServer } from '~/server/base.js'
import { NodeServer } from '~/server/node.js'
import { portal } from '@roboplay/robo.js'
import type { Client } from 'discord.js'

interface PluginOptions {
	cors?: boolean
	port?: number
	server?: BaseServer
}
export let pluginOptions: PluginOptions = {}

export default async (_client: Client, options: PluginOptions) => {
	pluginOptions = options ?? {}
	if (!pluginOptions.server) {
		pluginOptions.server = new NodeServer()
	}

	// Start HTTP server only if API Routes are defined
	const { server } = pluginOptions
	if (portal.apis.size > 0) {
		await server.start({
			port: options?.port ?? parseInt(process.env.PORT ?? '3000')
		})
	}
}
