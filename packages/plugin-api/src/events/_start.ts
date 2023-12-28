import { logger } from '~/core/logger.js'
import { hasDependency } from '~/core/runtime-utils.js'
import { portal } from '@roboplay/robo.js'
import type { BaseEngine } from '~/engines/base.js'
import type { Client } from 'discord.js'

const PATH_REGEX = new RegExp(/\[(.+?)\]/g)

interface PluginOptions {
	cors?: boolean
	engine?: BaseEngine
	port?: number
	prefix?: string | null | false
}
export let pluginOptions: PluginOptions = {}

export default async (_client: Client, options: PluginOptions) => {
	pluginOptions = options ?? {}

	// Set default options
	if (pluginOptions.prefix === undefined) {
		pluginOptions.prefix = '/api'
	}
	if (!pluginOptions.engine) {
		pluginOptions.engine = await getDefaultEngine()
	}

	// Start HTTP server only if API Routes are defined
	const { engine } = pluginOptions
	if (portal.apis.size > 0) {
		logger.debug(`Found ${portal.apis.size} API routes. Preparing server...`)
		await engine.init()

		// Add loaded API modules onto new router instance
		const prefix = pluginOptions.prefix ?? ''
		const paths: string[] = []

		portal.apis.forEach((api) => {
			const key = prefix + '/' + api.key.replace(PATH_REGEX, ':$1')
			paths.push(key)
			engine.registerRoute(key, api.handler.default)
		})
		logger.debug(`Registered routes:`, paths)

		logger.debug(`Starting server...`)
		await engine.start({
			port: options?.port ?? parseInt(process.env.PORT ?? '3000')
		})
	} else {
		logger.debug('No API routes defined. Skipping server start.')
	}
}

async function getDefaultEngine() {
	// Return Fastify if available
	const isFastifyAvailable = await hasDependency('fastify')
	if (isFastifyAvailable) {
		logger.debug('Fastify is available. Using it as the server engine.')
		const { FastifyEngine } = await import('~/engines/fastify.js')
		return new FastifyEngine()
	}

	// Default engine
	logger.debug('Using Node.js as the server engine.')
	const { NodeEngine } = await import('~/engines/node.js')
	return new NodeEngine()
}
