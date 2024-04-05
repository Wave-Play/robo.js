import { hasDependency } from './runtime-utils.js'
import { logger } from '../../core/logger.js'
import { cpSync, existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import type { ConfigEnv, UserConfig } from 'vite'

const PublicPath = path.join(process.cwd(), 'public')
const PublicBuildPath = path.join(process.cwd(), '.robo', 'public')

// TODO: Move into server plugin once build hooks are implemented
export async function buildPublicDirectory() {
	try {
		if (await hasDependency('vite', true)) {
			await buildVite()
		} else {
			// Clean up .robo/public directory
			let time = Date.now()
			await rm(PublicBuildPath, { force: true, recursive: true })
			logger.debug('Public directory cleaned in', Date.now() - time, 'ms')

			// Return if public directory doesn't exist
			if (!existsSync(PublicPath)) {
				logger.debug('No public directory found. Skipping...')
				return
			}

			// Copy public directory
			time = Date.now()
			logger.debug('Copying public directory...')
			cpSync(PublicPath, PublicBuildPath, { force: true, recursive: true })
			logger.debug('Public directory copied in', Date.now() - time, 'ms')
		}
	} catch (error) {
		logger.error('Failed to build Vite:', error)
	}
}

export async function buildVite() {
	// Let's try to take a... vite! OwO
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
}
