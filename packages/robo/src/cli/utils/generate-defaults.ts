import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { logger } from '../../core/logger.js'
import { hasProperties } from './utils.js'
import { DEBUG_MODE } from '../../core/debug.js'
import { env } from '../../core/env.js'

const srcDir = 'src'
const distDir = path.join('.robo', 'build')
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const defaultCommandsDir = path.join(__dirname, '..', '..', 'default', 'commands')
const defaultEventsDir = path.join(__dirname, '..', '..', 'default', 'events')
const supportedExtensions = ['.ts', '.tsx', '.js', '.jsx']

export interface DefaultGen {
	commands: Record<string, boolean>
	events: Record<string, boolean>
}

/**
 * Generates default commands and events provided by Robo.js
 *
 * Generated commands can be disabled via the config file or by creating your own with the same name.
 * Generated events cannot be disabled as they are required for Robo.js to function properly.
 */
export async function generateDefaults(): Promise<DefaultGen> {
	try {
		const commands = await generateCommands()
		const events = await generateEvents()
		return { commands, events }
	} catch (err) {
		logger.error('Error generating default files', err)
		process.exit(1)
	}
}

/**
 * Check if a file exists with any of the supported extensions
 * This is to prevent accidentally overwriting a command that already exists
 */
async function checkFileExistence(srcPathBase: string) {
	for (const ext of supportedExtensions) {
		const srcPath = srcPathBase + ext
		try {
			await fs.access(srcPath)
			return true
		} catch (e) {
			if (hasProperties<{ code: unknown }>(e, ['code']) && e.code !== 'ENOENT') {
				throw e
			}
		}
	}
	return false
}

/**
 * Generates commands provided by Robo.js by default.
 *
 * Developers can override these commands by creating their own with the same name.
 * Additionally, they can be disabled via the config file.
 */
async function generateCommands() {
	const defaultFiles = await fs.readdir(defaultCommandsDir)
	const generated: Record<string, boolean> = {}

	for (const file of defaultFiles) {
		// Only copy over files with the supported extensions
		const fileExtensionPattern = /\.(ts|tsx|js|jsx)$/
		if (!fileExtensionPattern.test(file)) {
			continue
		}

		// Only apply the "dev" command outside of production
		// A guild ID is also required to prevent accidental exposure to the public
		if (file === 'dev.js' && (!DEBUG_MODE || !env.discord.guildId)) {
			continue
		}

		// Check if such command already exists
		const baseFilename = path.basename(file, path.extname(file))
		const srcPathBase = path.join(srcDir, 'commands', baseFilename)
		const distPath = path.join(distDir, 'commands', file)
		const fileExists = await checkFileExistence(srcPathBase)

		// Only copy over the file if it doesn't exist to prevent overwriting
		if (!fileExists) {
			await fs.mkdir(path.dirname(distPath), { recursive: true })
			await fs.copyFile(path.join(defaultCommandsDir, file), distPath)
			generated[baseFilename] = true
		}
	}

	return generated
}

/**
 * Generates events provided by Robo.js by default.
 *
 * These events are not overridable by developers nor can they be disabled.
 * They are required for Robo.js to function properly.
 * However, they don't override developer events either, so they can be used in conjunction.
 */
async function generateEvents() {
	const defaultFiles = await fs.readdir(defaultEventsDir)
	const generated: Record<string, boolean> = {}

	for (const file of defaultFiles) {
		// Only copy over files with the supported extensions
		const fileExtensionPattern = /\.(ts|tsx|js|jsx)$/
		if (!fileExtensionPattern.test(file)) {
			continue
		}

		// Copy the file to the .robo build directory using a special prefix to prevent collisions
		const baseFilename = path.basename(file, path.extname(file))
		const distPath = path.join(distDir, 'events', baseFilename, '__robo_' + file)
		await fs.mkdir(path.dirname(distPath), { recursive: true })
		await fs.copyFile(path.join(defaultEventsDir, file), distPath)
		generated[baseFilename] = true
	}

	return generated
}
