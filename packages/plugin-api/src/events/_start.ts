import { logger } from '~/core/logger.js'
import { BaseServer } from '~/server/base.js'
import { NodeServer } from '~/server/node.js'
import { portal } from '@roboplay/robo.js'
import type { Client } from 'discord.js'

interface PluginOptions {
	cors?: boolean
	port?: number
	prefix?: string | null
	server?: BaseServer
}
export let pluginOptions: PluginOptions = {}

export default async (_client: Client, options: PluginOptions) => {
	pluginOptions = options ?? {}

	// Set default options
	if (pluginOptions.prefix === undefined) {
		pluginOptions.prefix = '/api'
	}
	if (!pluginOptions.server) {
		pluginOptions.server = new NodeServer()
	}

	// Start HTTP server only if API Routes are defined
	const { server } = pluginOptions
	if (portal.apis.size > 0) {
		logger.debug(`Found ${portal.apis.size} API routes. Starting server...`)
		await server.start({
			port: options?.port ?? parseInt(process.env.PORT ?? '3000')
		})
	} else {
		logger.debug('No API routes defined. Skipping server start.')
	}
}
