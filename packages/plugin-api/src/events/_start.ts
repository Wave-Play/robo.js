import { logger } from '../core/logger.js'
import { hasDependency } from '../core/runtime-utils.js'
import { _readyPromiseResolve } from '~/core/plugin-utils.js'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { portal } from 'robo.js'
import type { BaseEngine } from '../engines/base.js'
import type { Client } from 'discord.js'
import type { ViteDevServer } from 'vite'

const PATH_REGEX = new RegExp(/\[(.+?)\]/g)

interface PluginOptions {
	cors?: boolean
	engine?: BaseEngine
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

	// Start HTTP server only if API Routes are defined
	const { engine, port = parseInt(process.env.PORT ?? '3000') } = pluginOptions
	let vite: ViteDevServer | undefined = pluginOptions.vite

	logger.debug(`Preparing server with ${portal.apis.size} API routes...`)
	await engine.init({ vite })

	// If Vite is available, start the dev server
	if (vite) {
		logger.debug('Using Vite server specified in options.')
	} else if (process.env.NODE_ENV !== 'production' && (await hasDependency('vite', true))) {
		try {
			const { createServer: createViteServer } = await import('vite')
			const viteConfigPath = path.join(process.cwd(), 'config', 'vite.mjs')

			vite = await createViteServer({
				configFile: existsSync(viteConfigPath) ? viteConfigPath : undefined,
				server: {
					hmr: { path: '/hmr', server: engine.getHttpServer() },
					middlewareMode: { server: engine.getHttpServer() }
				}
			})
			logger.debug('Vite server created successfully.')
		} catch (e) {
			logger.error(`Failed to start Vite server:`, e)
		}
	}

	// Setup Vite if available and register socket bypass
	if (vite) {
		await engine.setupVite(vite)

		// Prevent other plugins from registering the HMR route
		engine.registerWebsocket('/hmr', () => {
			logger.debug('Vite HMR connection detected. Skipping registration...')
		})
	}

	// Add loaded API modules onto new router instance
	const prefix = pluginOptions.prefix ?? ''
	const paths: string[] = []

	portal.apis.forEach((api) => {
		const key = prefix + '/' + api.key.replace(PATH_REGEX, ':$1')
		paths.push(key)
		// @ts-expect-error - Outdated Robo API typings
		engine.registerRoute(key, api.handler.default)
	})

	logger.debug(`Starting server...`)
	await engine.start({ port })
	_readyPromiseResolve()
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
