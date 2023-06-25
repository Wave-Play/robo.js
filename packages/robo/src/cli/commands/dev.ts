import { Command } from 'commander'
import { run } from '../utils/run.js'
import { spawn } from 'child_process'
import { logger } from '../../core/logger.js'
import { DEFAULT_CONFIG, FLASHCORE_KEYS } from '../../core/constants.js'
import { loadConfig, loadConfigPath } from '../../core/config.js'
import { IS_WINDOWS, cmd, filterExistingPaths, getPkgManager, getWatchedPlugins, timeout } from '../utils/utils.js'
import path from 'node:path'
import url from 'node:url'
import { getStateSave } from '../../core/state.js'
import Watcher, { Change } from '../utils/watcher.js'
import { loadManifest } from '../utils/manifest.js'
import { color, composeColors } from '../../core/color.js'
import { Spirits } from '../utils/spirits.js'
import { buildAction } from './build/index.js'
import { Flashcore, prepareFlashcore } from '../../core/flashcore.js'
import type { Config, RoboMessage, SpiritMessage } from '../../types/index.js'
import type { ChildProcess } from 'child_process'

const command = new Command('dev')
	.description('Ready, set, code your bot to life! Starts development mode.')
	.option('-s --silent', 'do not print anything')
	.option('-v --verbose', 'print more information for debugging')
	.action(devAction)
export default command

interface DevCommandOptions {
	silent?: boolean
	verbose?: boolean
}

const buildCommand = 'robo build --dev'

let spirits: Spirits | undefined

async function devAction(options: DevCommandOptions) {
	// Create a logger
	logger({
		enabled: !options.silent,
		level: options.verbose ? 'debug' : 'info'
	}).info('Starting Robo in development mode...')
	logger.warn(`Thank you for trying Robo.js! This is a pre-release version, so please let us know of issues on GitHub.`)
	logger.debug(`Current working directory:`, process.cwd())

	// Load the configuration before anything else
	const config = await loadConfig()
	const configPath = await loadConfigPath()
	let configRelative: string

	if (configPath) {
		configRelative = path.relative(process.cwd(), url.fileURLToPath(configPath))
	} else {
		logger.warn(`Could not find configuration file. Using default configuration.`)
	}

	// Experimental warning
	const experimentalKeys = Object.entries(config.experimental ?? {})
		.filter(([, value]) => value)
		.map(([key]) => key)
	if (experimentalKeys.length > 0) {
		const features = experimentalKeys.map((key) => color.bold(key)).join(', ')
		logger.warn(`Experimental flags enabled: ${features}.`)
	}

	// Ensure worker spirits are ready
	if (config.experimental?.spirits) {
		spirits = new Spirits()

		// Stop spirits on process exit
		let isStopping = false
		const callback = async () => {
			if (isStopping) {
				return
			}
			isStopping = true
			await spirits.stopAll()
			process.exit(0)
		}
		process.on('SIGINT', callback)
		process.on('SIGTERM', callback)
	}

	// Run first build
	let buildSuccess = false
	try {
		const start = Date.now()
		await buildAction([], {
			dev: true,
			verbose: options.verbose
		})
		logger.debug(`Build completed in ${Date.now() - start}ms`)
		buildSuccess = true
	} catch (error) {
		logger.error(error)
	}
	let botProcess: ChildProcess
	let roboSpirit: string

	// These callbacks are necessary to ensure "/dev restart" works
	const registerProcessEvents = () => {
		botProcess?.on('message', async (message: RoboMessage) => {
			if (message.type === 'restart') {
				logger.wait(`Restarting Robo...`)
				botProcess = await rebuildAndRestartBot(botProcess, config, options.verbose, [])
				registerProcessEvents()
			}
		})
	}

	const restartCallback = async (message: SpiritMessage) => {
		if (message.event === 'restart' && message.payload === 'trigger') {
			logger.wait(`Restarting Robo...`)
			spirits.off(roboSpirit, restartCallback)
			roboSpirit = await rebuildRobo(roboSpirit, config, options.verbose, [])
			spirits.on(roboSpirit, restartCallback)
		}
	}

	// Get state saved to disk as the default
	const stateStart = Date.now()
	await prepareFlashcore()
	const persistedState = (await Flashcore.get<Record<string, unknown>>(FLASHCORE_KEYS.state)) ?? {}
	logger.debug(`State loaded in ${Date.now() - stateStart}ms`)

	// Start the Robo!
	if (buildSuccess && config.experimental?.spirits) {
		roboSpirit = await spirits.newTask<string>({
			event: 'start',
			onExit: (exitCode: number) => {
				if (exitCode !== 0) {
					logger.error(
						composeColors(color.bgBlack, color.redBright, color.underline, color.bold)(`Robo exited with code ${exitCode}.`),
						`Restarting...`
					)
					return true
				}
			},
			onRetry: (value: string) => {
				roboSpirit = value
				spirits.on(roboSpirit, restartCallback)
				spirits.send(roboSpirit, { event: 'set-state', state: persistedState })
			}
		})
		spirits.on(roboSpirit, restartCallback)
		spirits.send(roboSpirit, { event: 'set-state', state: persistedState })
	} else if (buildSuccess) {
		botProcess = await run()
		registerProcessEvents()
		botProcess.send({ type: 'state-load', state: persistedState })
	} else {
		logger.wait(`Build failed! Waiting for changes before retrying...`)
	}

	// Load manifest to compare later
	let manifest = await loadManifest()

	// Watch for changes in the "src" directory alongside special files
	const watchedPaths = ['src']
	const additionalFiles = await filterExistingPaths(['.env', 'tsconfig.json', configRelative])
	watchedPaths.push(...additionalFiles)

	// Watch all plugins that are also currently in development mode
	const watchedPlugins = await getWatchedPlugins(config)
	Object.keys(watchedPlugins).forEach((pluginPath) => watchedPaths.push(pluginPath))

	// Watch while preventing multiple restarts from happening at the same time
	logger.debug(`Watching:`, watchedPaths)
	const watcher = new Watcher(watchedPaths, {
		exclude: ['node_modules', '.git']
	})
	let isUpdating = false

	watcher.start(async (changes) => {
		logger.debug(`Watcher events: ${changes.map((change) => change.changeType).join(', ')}`)
		if (isUpdating) {
			return logger.debug(`Already updating, skipping...`)
		}
		isUpdating = true

		try {
			const configChange = changes.find((change) => change.filePath === configRelative)
			const pluginChange = changes.find((change) => Object.keys(watchedPlugins).includes(change.filePath))
			if (configChange) {
				const fileName = configChange.filePath.split('/').pop()
				logger.wait(`${color.bold(fileName)} file was updated. Restarting to apply configuration...`)
			} else if (pluginChange) {
				const plugin = watchedPlugins[pluginChange.filePath]
				logger.wait(`${color.bold(plugin.name)} plugin was updated. Restarting to apply changes...`)
			} else {
				logger.wait(`Change detected. Restarting Robo...`)
			}

			// Rebuild and restart
			if (config.experimental?.spirits) {
				roboSpirit = await rebuildRobo(roboSpirit, config, options.verbose, changes)
				spirits.on(roboSpirit, restartCallback)
			} else {
				botProcess = await rebuildAndRestartBot(botProcess, config, options.verbose, changes)
				registerProcessEvents()
			}

			// Compare manifest to warn about permission changes
			const newManifest = await loadManifest()
			const oldPermissions = manifest.permissions ?? []
			const newPermissions = newManifest.permissions ?? []
			manifest = newManifest

			if (JSON.stringify(oldPermissions) !== JSON.stringify(newPermissions)) {
				logger.warn(
					`Permissions have changed! Run ${color.bold('robo invite')} to update your Robo's guild permissions.`
				)
			}
		} finally {
			isUpdating = false
		}
	})
}

/**
 * Building in a separate process/thread clears the import cache.
 * This is necessary to prevent the bot from using old code.
 */
export async function buildAsync(command: string, config: Config, verbose: boolean, changes: Change[]) {
	return new Promise<boolean>((resolve, reject) => {
		const args = command.split(' ')
		const start = Date.now()

		if (config.experimental?.spirits) {
			spirits
				.newTask({
					event: 'build',
					payload: {
						files: changes.map((change) => change.filePath)
					},
					verbose: verbose
				})
				.then(() => {
					logger.debug(`Build completed in ${Date.now() - start}ms`)
					resolve(true)
				})
				.catch(() => resolve(false))
		} else {
			let pkgManager = getPkgManager()

			// Unfortunately, Windows has issues recursively spawning processes via PNPM
			// If you're reading this and know how to fix it, please open a PR!
			if (pkgManager === 'pnpm' && IS_WINDOWS) {
				logger.debug(
					`Detected Windows. Using ${color.bold(cmd('npm'))} instead of ${color.bold(cmd('pnpm'))} to build.`
				)
				pkgManager = 'npm'
			}

			// Check if args include option flags
			if (pkgManager === 'npm' || pkgManager === 'pnpm') {
				args.splice(0, 0, 'exec')
			}

			// Inserts -- before options to make sure they're being passed correctly
			if (pkgManager === 'npm') {
				const optionsIndex = args.findIndex((arg) => arg.startsWith('-'))
				if (optionsIndex !== -1) {
					args.splice(optionsIndex, 0, '--')
				}
			}

			logger.debug(`> ${cmd(pkgManager)} ${args.join(' ')}`)
			const childProcess = spawn(cmd(pkgManager), args, {
				env: { ...process.env, FORCE_COLOR: '1' },
				stdio: 'inherit'
			})

			childProcess.on('close', (code) => {
				if (code === 0) {
					logger.debug(`Build completed in ${Date.now() - start}ms`)
					resolve(true)
				} else {
					resolve(false)
				}
			})

			childProcess.on('error', (error) => {
				reject(error)
				resolve(false)
			})
		}
	})
}

async function rebuildRobo(spiritId: string, config: Config, verbose: boolean, changes: Change[]) {
	// Guard against accidentally killing the new spirit
	const roboSpirit = spiritId
	const isValid = roboSpirit !== null && roboSpirit !== undefined

	// Get state dump before restarting
	const stateSaveStart = Date.now()
	logger.debug('Saving state...')
	const savedState = await spirits.exec<Record<string, unknown>>(roboSpirit, {
		event: 'get-state'
	}) ?? {}
	logger.debug(`Saved state in ${Date.now() - stateSaveStart}ms:`, savedState)

	// Stop the previous spirit if it's still running
	// We wait for the spirit to exit before starting a new one
	let isTerminated = false
	const terminate = new Promise<void>((resolve) => {
		if (!isValid) {
			return resolve()
		}
		const spirit = spirits.get(roboSpirit)

		const callback = () => {
			logger.debug(`Gracefully stopped Robo spirit (${composeColors(color.bold, color.cyan)(roboSpirit)})`)
			spirit.worker.off('exit', callback)
			spirit.isTerminated = true
			isTerminated = true
			resolve()
		}

		spirit.worker.once('exit', callback)
		spirit.worker.on('message', (message: SpiritMessage) => {
			if (message.payload === 'exit') {
				callback()
			}
		})
		spirits.send(roboSpirit, { event: 'restart', verbose })
	})

	// Force abort the bot if it doesn't exit after n seconds
	// This is to prevent the bot from running multiple instances
	const forceAbort = timeout(() => {
		if (!isTerminated && isValid) {
			logger.warn('Robo termination timed out. Force stopping...')
			spirits.stop(roboSpirit, true)
		}
	}, config?.timeouts?.lifecycle ?? DEFAULT_CONFIG.timeouts.lifecycle)

	// Wait for the bot to exit or force abort
	const awaitStop = Promise.race([terminate, forceAbort])
	const [success] = await Promise.all([
		buildAsync(buildCommand + (verbose ? ' --verbose' : ''), config, verbose, changes),
		awaitStop
	])

	// Return null for the bot if the build failed so we can retry later
	if (!success) {
		logger.wait(`Build failed! Waiting for changes before retrying...`)
		return null
	}

	// Start bot via spirit if worker threads are enabled
	const start = Date.now()
	const newSpiritId = await spirits.newTask<string>({ event: 'start' })
	logger.debug(`Robo spirit (${composeColors(color.bold, color.cyan)(newSpiritId)}) started in ${Date.now() - start}ms`)
	spirits.send(newSpiritId, { event: 'set-state', state: savedState })
	return newSpiritId
}

async function rebuildAndRestartBot(bot: ChildProcess | null, config: Config, verbose: boolean, changes: Change[]) {
	// Guard against accidentally killing the new process
	const currentBot = bot

	// Kill the previous process if it's still running
	// We wait for the process to exit before starting a new one
	let isTerminated = false
	const terminate = new Promise<void>((resolve) => {
		if (!currentBot) {
			return resolve()
		}

		currentBot?.on('exit', () => {
			logger.debug('Terminated previous bot process')
			isTerminated = true
			resolve()
		})
	})

	// Force abort the bot if it doesn't exit after n seconds
	// This is to prevent the bot from running multiple instances
	const forceAbort = timeout(() => {
		if (!isTerminated && currentBot) {
			logger.warn('Robo termination timed out. Force stopping...')
		}
		currentBot?.kill('SIGKILL')
	}, config?.timeouts?.lifecycle ?? DEFAULT_CONFIG.timeouts.lifecycle)

	// Get state dump before restarting
	logger.debug('Saving state...')
	const savedState = await getStateSave(currentBot)

	// Wait for the bot to exit or force abort
	logger.debug('Sending restart signal...')
	currentBot?.send({ type: 'restart' })
	const awaitStop = Promise.race([terminate, forceAbort])
	const [success] = await Promise.all([
		buildAsync(buildCommand + (verbose ? ' --verbose' : ''), config, verbose, changes),
		awaitStop
	])

	// Return null for the bot if the build failed so we can retry later
	if (!success) {
		logger.wait(`Build failed! Waiting for changes before retrying...`)
		return null
	}

	// Start a new process
	const newBot = await run()
	newBot.send({ type: 'state-load', state: savedState })
	return newBot
}
