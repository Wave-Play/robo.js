import { logger } from '~/core/logger.js'
import { hasDependency } from '~/core/runtime-utils.js'
import { setConfig, setEngine } from '~/core/server.js'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { color, portal } from 'robo.js'
import type { BaseEngine } from '~/engines/base.js'
import type { Client } from 'discord.js'
import type { ViteDevServer } from 'vite'

const PATH_REGEX = new RegExp(/\[(.+?)\]/g)

export interface PluginConfig {
    cors?: boolean
    engine?: BaseEngine
    hostname?: string
    port?: number
    prefix?: string | null | false
    vite?: ViteDevServer
}

export let pluginOptions: PluginConfig = {}

export default async (_client: Client, options: PluginConfig) => {
    pluginOptions = options ?? {}
    globalThis.roboServer = {}

    // Set default options
    if (pluginOptions.prefix === undefined) {
        pluginOptions.prefix = '/api'
    }
    if (!pluginOptions.engine) {
        pluginOptions.engine = await getDefaultEngine()
    }


    // Assign config instance for `Server.config()`
    setConfig(pluginOptions)

    // Assign engine instance for `Server.getEngine()`
    setEngine(pluginOptions.engine)

    // Start HTTP server only if API Routes are defined
    const { engine, hostname = process.env.HOSTNAME, port = parseInt(process.env.PORT ?? '3000') } = pluginOptions
    let vite: ViteDevServer | undefined = pluginOptions.vite
    globalThis.roboServer.engine = engine

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
                    hmr: {
                        path: '/hmr',
                        server: engine.getHttpServer()
                    },
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
        engine.registerRoute(key, api.handler.default)
    })

    logger.debug(`Starting server...`)
    await engine.start({ hostname, port })

    // Let the rest of the app know that the server is ready
    globalThis.roboServer.ready = true
}

async function getDefaultEngine() {
    // Return Fastify if available
    const isFastifyAvailable = await hasDependency('fastify')
    if (isFastifyAvailable) {
        logger.debug(color.bold('Fastify'), 'is available. Using it as the server engine.')
        const { FastifyEngine } = await import('../engines/fastify.js')
        return new FastifyEngine()
    }

    // Default engine
    logger.debug('Using', color.bold('Node.js'), 'as the server engine.')
    const { NodeEngine } = await import('../engines/node.js')
    return new NodeEngine()
}