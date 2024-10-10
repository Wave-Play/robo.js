import { promises as fs } from 'node:fs'
import path from 'node:path'
import { logger } from '../../core/logger.js'
import { __DIRNAME, hasProperties } from './utils.js'
import { DEBUG_MODE } from '../../core/debug.js'
import { env } from '../../core/env.js'
import { getConfig } from '../../core/config.js'
import type { Config } from '../../types/config.js'

const srcDir = path.join(process.cwd(), 'src')
const defaultCommandsDir = path.join(__DIRNAME, '..', '..', 'default', 'commands')
const defaultEventsDir = path.join(__DIRNAME, '..', '..', 'default', 'events')
const supportedExtensions = ['.ts', '.tsx', '.js', '.jsx']
const devCommands = [`dev${path.sep}logs`, `dev${path.sep}restart`, `dev${path.sep}status`]

export interface DefaultGen {
	commands: Record<string, boolean>
	context: Record<string, boolean>
	events: Record<string, boolean>
}

/**
 * Generates default commands and events provided by Robo.js
 *
 * Generated commands can be disabled via the config file or by creating your own with the same name.
 * Generated events cannot be disabled as they are required for Robo.js to function properly.
 */
export async function generateDefaults(buildDir = path.join('.robo', 'build')): Promise<DefaultGen> {
	const distDir = path.join(process.cwd(), buildDir)
	const config = getConfig()

	// Only useful for bots, so skip if not in a bot project
	if (config.experimental?.disableBot === true) {
		logger.debug(`Skipping default file generation for disabled bot...`)
		return { commands: {}, context: {}, events: {} }
	}

	try {
		const commands = await generateCommands(distDir, config)
		const context = {}
		const events = await generateEvents(distDir)
		return { commands, context, events }
	} catch (err) {
		logger.error('Error generating default files', err)
		process.exit(1)
	}
}

/**
 * Check if a file exists with any of the supported extensions
 * This is to prevent accidentally overwriting a command that already exists
 */
async function checkFileExistence(srcPathBase: string, module?: string) {
	for (const ext of supportedExtensions) {
		const modulePath = module ? path.join('modules', module) : '.'
		const srcPath = path.join(srcDir, modulePath, srcPathBase + ext)
		try {
			await fs.access(srcPath)
			return true
		} catch (e) {
			if (hasProperties<{ code: unknown }>(e, ['code']) && e.code !== 'ENOENT') {
				throw e
			}
		}
	}

	// Check if there are modules and call recursively if so
	if (!module) {
		const modules = path.join(srcDir, 'modules')
		let modulesExist = false
		try {
			modulesExist = (await fs.stat(modules))?.isDirectory()
		} catch (e) {
			if (hasProperties<{ code: unknown }>(e, ['code']) && e.code !== 'ENOENT') {
				throw e
			}
		}

		if (!modulesExist) {
			return false
		}

		const files = await fs.readdir(modules)

		for (const file of files) {
			const fullPath = path.join(modules, file)
			const fileStat = await fs.stat(fullPath)

			if (fileStat.isDirectory()) {
				const exists = await checkFileExistence(srcPathBase, file)
				if (exists) {
					return true
				}
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
async function generateCommands(distDir: string, config: Config) {
	const generated: Record<string, boolean> = {}

	await recursiveDirScan(defaultCommandsDir, async (file, fullPath) => {
		// Only copy over files with the supported extensions
		const fileExtensionPattern = /\.(ts|tsx|js|jsx)$/
		if (!fileExtensionPattern.test(file)) {
			return
		}

		// Only apply the "dev" command outside of production
		// A guild ID is also required to prevent accidental exposure to the public
		const extension = path.extname(file)
		const commandKey = path.relative(defaultCommandsDir, fullPath).replace(extension, '')
		const shouldCreateDev = config.defaults?.dev ?? true
		const shouldCreateHelp = config.defaults?.help ?? true
		logger.debug(
			`Validating default command "${commandKey}":`,
			`dev: ${shouldCreateDev}, help: ${shouldCreateHelp}, debug: ${DEBUG_MODE}, guildId: ${
				env('discord.guildId') ? 'exists' : 'none'
			}`
		)

		if (devCommands.includes(commandKey) && (!DEBUG_MODE || !env('discord.guildId') || !shouldCreateDev)) {
			logger.debug(`Skipping default command:`, file)
			return
		}
		if (commandKey === 'help' && !shouldCreateHelp) {
			logger.debug(`Skipping default command:`, file)
			return
		}

		// Check if such command already exists
		const baseFilename = path.basename(file, extension)
		const srcPathBase = path.join('commands', commandKey.substring(0, commandKey.lastIndexOf(path.sep)), baseFilename)
		const distPath = path.join(distDir, 'commands', path.relative(defaultCommandsDir, fullPath))
		const fileExists = await checkFileExistence(srcPathBase)

		// Only copy over the file if it doesn't exist to prevent overwriting
		if (!fileExists) {
			logger.debug(`Generating default command:`, file)
			await fs.mkdir(path.dirname(distPath), { recursive: true })
			await fs.copyFile(fullPath, distPath)
			generated[commandKey] = true
		}
	})

	return generated
}

/**
 * Generates events provided by Robo.js by default.
 *
 * These events are not overridable by developers nor can they be disabled.
 * They are required for Robo.js to function properly.
 * However, they don't override developer events either, so they can be used in conjunction.
 */
async function generateEvents(distDir: string) {
	const generated: Record<string, boolean> = {}

	await recursiveDirScan(defaultEventsDir, async (file, fullPath) => {
		// Only copy over files with the supported extensions
		const fileExtensionPattern = /\.(ts|tsx|js|jsx)$/
		if (!fileExtensionPattern.test(file)) {
			return
		}

		// Copy the file to the .robo build directory using a special prefix to prevent collisions
		const baseFilename = path.basename(file, path.extname(file))
		const distFile = '__robo_' + file
		const distPath = path.join(distDir, 'events', baseFilename, distFile)
		const extension = path.extname(file)
		const eventKey = baseFilename + path.sep + distFile.replace(extension, '')
		await fs.mkdir(path.dirname(distPath), { recursive: true })
		await fs.copyFile(fullPath, distPath)
		generated[eventKey] = true
	})

	return generated
}

// Recursive helper function to scan directories and apply a predicate function to each file
async function recursiveDirScan(dirPath: string, predicate: (file: string, fullPath: string) => Promise<void>) {
	const files = await fs.readdir(dirPath)

	for (const file of files) {
		const fullPath = path.join(dirPath, file)
		const fileStat = await fs.stat(fullPath)

		if (fileStat.isDirectory()) {
			// Recursive call for directories
			await recursiveDirScan(fullPath, predicate)
		} else {
			await predicate(file, fullPath)
		}
	}
}
