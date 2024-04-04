import { hasDependency } from './runtime-utils.js'
import { logger } from '../../core/logger.js'
import path from 'node:path'
import type { ConfigEnv, UserConfig } from 'vite'
import { existsSync } from 'node:fs'

// TODO: Move into server plugin once build hooks are implemented
export async function buildVite() {
	try {
		// Return if Vite is not installed
		if (!(await hasDependency('vite', true))) {
			return
		}

		// Let's try to take a vite! OwO
		const time = Date.now()
		logger.debug('Building Vite...')
		const { build, loadConfigFromFile } = await import('vite')

		// Load Vite config
		let config: UserConfig | undefined
		const configEnv: ConfigEnv = {
			command: 'build',
			isPreview: false,
			isSsrBuild: false,
			mode: 'production'
		}

		const configPath = path.join(process.cwd(), 'config', 'vite.mjs')
		if (existsSync(configPath)) {
			config = (await loadConfigFromFile(configEnv, configPath))?.config
		} else if (existsSync(path.join(process.cwd(), 'vite.config.js'))) {
			config = (await loadConfigFromFile(configEnv))?.config
		} else {
			logger.debug('No Vite config found. Skipping...')
			return
		}
		logger.debug('Vite config loaded:', config)

		// Now build it!
		await build({
			logLevel: 'warn',
			...(config ?? {}),
			build: {
				...(config?.build ?? {}),
				emptyOutDir: true,
				outDir: path.join('.robo', 'public')
			}
		})
		logger.debug('Vite build completed in', Date.now() - time, 'ms')
	} catch (error) {
		logger.error('Failed to build Vite:', error)
	}
}
