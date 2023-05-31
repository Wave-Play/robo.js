import { Command } from 'commander'
import { run } from '../utils/run.js'
import { spawn } from 'child_process'
import { logger } from '../../core/logger.js'
import { DEFAULT_CONFIG } from '../../core/constants.js'
import { loadConfig, loadConfigPath } from '../../core/config.js'
import {
	IS_WINDOWS,
	__DIRNAME,
	cmd,
	filterExistingPaths,
	getPkgManager,
	getWatchedPlugins,
	timeout
} from '../utils/utils.js'
import path from 'node:path'
import url from 'node:url'
import { getStateSave } from '../../core/state.js'
import Watcher from '../utils/watcher.js'
import { color } from '../utils/color.js'
import { Worker } from 'node:worker_threads'
import type { Config, RoboMessage } from '../../types/index.js'
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

let workerThread: Worker | undefined

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
	const experimentalKeys = Object.keys(config.experimental ?? {})
	if (experimentalKeys.length > 0) {
		const features = experimentalKeys.map((key) => color.bold(key)).join(', ')
		logger.warn(`Experimental flags enabled: ${features}. These may be unstable and change often!`)
	}

	// Ensure worker thread is ready
	if (config.experimental?.workerThreads) {
		workerThread = new Worker(path.join(__DIRNAME, '..', 'worker.js'))
	}

	// Run after preparing first build
	const buildSuccess = await buildAsync(buildCommand + (options.verbose ? ' --verbose' : ''), config, options.verbose)
	let botProcess: ChildProcess

	const registerProcessEvents = () => {
		botProcess?.on('message', async (message: RoboMessage) => {
			if (message.type === 'restart') {
				logger.wait(`Restarting Robo...`)
				botProcess = await rebuildAndRestartBot(botProcess, config, options.verbose)
			}
		})
	}

	if (buildSuccess) {
		botProcess = await run()
		registerProcessEvents()
		botProcess.send({ type: 'state-load', state: {} })
	} else {
		logger.wait(`Build failed! Waiting for changes before retrying...`)
	}

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

	watcher.start(async (event: string, path: string) => {
		logger.debug(`Watcher event: ${event}`)
		if (isUpdating) {
			return logger.debug(`Already updating, skipping...`)
		}
		isUpdating = true

		try {
			if (path === configRelative) {
				const fileName = path.split('/').pop()
				logger.wait(`${color.bold(fileName)} file was updated. Restarting to apply configuration...`)
			} else if (Object.keys(watchedPlugins).includes(path)) {
				const plugin = watchedPlugins[path]
				logger.wait(`${color.bold(plugin.name)} plugin was updated. Restarting to apply changes...`)
			} else {
				logger.wait(`Change detected. Restarting Robo...`)
			}

			botProcess = await rebuildAndRestartBot(botProcess, config, options.verbose)
			registerProcessEvents()
		} finally {
			isUpdating = false
		}
	})
}

/**
 * Building in a separate process/thread clears the import cache.
 * This is necessary to prevent the bot from using old code.
 */
export async function buildAsync(command: string, config: Config, verbose?: boolean) {
	return new Promise<boolean>((resolve, reject) => {
		const args = command.split(' ')
		const start = Date.now()

		if (config.experimental?.workerThreads) {
			workerThread.postMessage({
				command: 'build',
				verbose: verbose
			})

			workerThread.on('exit', (code) => {
				workerThread = new Worker(path.join(__DIRNAME, '..', 'worker.js'))
				if (code === 0) {
					logger.debug(`Build completed in ${Date.now() - start}ms`)
					resolve(true)
				} else {
					resolve(false)
				}
			})

			workerThread.on('error', (error) => {
				workerThread = new Worker(path.join(__DIRNAME, '..', 'worker.js'))
				reject(error)
				resolve(false)
			})
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

async function rebuildAndRestartBot(bot: ChildProcess | null, config: Config, verbose: boolean) {
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
	const savedState = await getStateSave(currentBot)

	// Wait for the bot to exit or force abort
	currentBot?.send({ type: 'restart' })
	const awaitStop = Promise.race([terminate, forceAbort])
	const [success] = await Promise.all([
		buildAsync(buildCommand + (verbose ? ' --verbose' : ''), config, verbose),
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
