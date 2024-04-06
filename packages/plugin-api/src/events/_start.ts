import { logger } from '../core/logger.js'
import { hasDependency } from '../core/runtime-utils.js'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { portal } from '@roboplay/robo.js'
import type { BaseEngine } from '../engines/base.js'
import type { Client } from 'discord.js'
import type { ViteDevServer } from 'vite'

const PATH_REGEX = new RegExp(/\[(.+?)\]/g)

interface PluginOptions {
	cors?: boolean
	engine?: BaseEngine
	parseBody?: boolean
	port?: number
	prefix?: string | null | false
	vite?: ViteDevServer
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

	// If Vite is available, start the dev server
	if (pluginOptions.vite) {
		logger.debug('Using Vite server specified in options.')
	} else if (process.env.NODE_ENV !== 'production' && (await hasDependency('vite', true))) {
		try {
			const { createServer: createViteServer } = await import('vite')
			const viteConfigPath = path.join(process.cwd(), 'config', 'vite.mjs')

			pluginOptions.vite = await createViteServer({
				configFile: existsSync(viteConfigPath) ? viteConfigPath : undefined,
				server: { middlewareMode: true }
			})
			logger.debug('Vite server created successfully.')
		} catch (e) {
			logger.error(`Failed to start Vite server:`, e)
		}
	}

	// Start HTTP server only if API Routes are defined
	const { engine, port = parseInt(process.env.PORT ?? '3000') } = pluginOptions

	logger.debug(`Preparing server with ${portal.apis.size} API routes...`)
	await engine.init({ vite: pluginOptions.vite })

	// Add loaded API modules onto new router instance
	const prefix = pluginOptions.prefix ?? ''
	const paths: string[] = []

	portal.apis.forEach((api) => {
		const key = prefix + '/' + api.key.replace(PATH_REGEX, ':$1')
		paths.push(key)
		engine.registerRoute(key, api.handler.default)
	})

	logger.debug(`Starting server...`)
	await engine.start({ port })
}

async function getDefaultEngine() {
	// Return Fastify if available
	const isFastifyAvailable = await hasDependency('fastify')
	if (isFastifyAvailable) {
		logger.debug('Fastify is available. Using it as the server engine.')
		const { FastifyEngine } = await import('../engines/fastify.js')
		return new FastifyEngine()
	}

	// Default engine
	logger.debug('Using Node.js as the server engine.')
	const { NodeEngine } = await import('../engines/node.js')
	return new NodeEngine()
}
