import { Command } from 'commander'
import nodeWatch from 'node-watch'
import { run } from '../utils/run.js'
import { spawn, type ChildProcess } from 'child_process'
import { logger } from '../../core/logger.js'
import chalk from 'chalk'
import { DEFAULT_CONFIG } from '../../core/constants.js'
import { loadConfig, loadConfigPath } from '../../core/config.js'
import { IS_WINDOWS, cmd, getPkgManager, getWatchedPlugins, timeout } from '../utils/utils.js'
import path from 'node:path'
import url from 'node:url'
import { getStateSave } from '../../core/state.js'
import type { Config } from '../../types/index.js'

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

const buildCommand = 'robo build --dev --silent'

async function devAction(options: DevCommandOptions) {
	// Create a logger
	logger({
		enabled: !options.silent,
		level: options.verbose ? 'debug' : 'info'
	}).info('Starting Robo in development mode...')
	logger.warn(`Thank you for trying Robo.js! This is a pre-release version, so please let us know of issues on GitHub.`)

	// Load the configuration before anything else
	const config = await loadConfig()
	const configPath = await loadConfigPath()
	let configRelative: string

	if (configPath) {
		configRelative = path.relative(process.cwd(), url.fileURLToPath(configPath))
	} else {
		logger.warn(`Could not find configuration file. Using default configuration.`)
	}

	// Run after preparing first build
	await buildInSeparateProcess(buildCommand)
	let botProcess: ChildProcess
	const botPromise = run()

	// Make sure to kill the bot process when the process exits
	process.on('SIGINT', () => {
		botProcess?.kill('SIGINT')
		process.exit(0)
	})
	process.on('SIGTERM', () => {
		botProcess?.kill('SIGTERM')
		process.exit(0)
	})
	botProcess = await botPromise

	// Watch for changes in the "src" directory or config file
	const watchedPaths = ['src']
	if (configPath) {
		watchedPaths.push(configRelative)
	}

	// Watch all plugins that are also currently in development mode
	const watchedPlugins = await getWatchedPlugins(config)
	Object.keys(watchedPlugins).forEach((pluginPath) => watchedPaths.push(pluginPath))

	// Watch while preventing multiple restarts from happening at the same time
	const watcher = nodeWatch(watchedPaths, {
		recursive: true,
		filter: (f) => !/(^|[/\\])\.(?!config)[^.]/.test(f) // ignore dotfiles except .config and directories
	})
	let isUpdating = false

	watcher.on('change', async (event: string, path: string) => {
		logger.debug(`Watcher event: ${event}`)
		if (isUpdating) {
			return logger.debug(`Already updating, skipping...`)
		}
		isUpdating = true

		try {
			if (path === configRelative) {
				const fileName = path.split('/').pop()
				logger.wait(`${chalk.bold(fileName)} file was updated. Restarting to apply configuration...`)
			} else if (Object.keys(watchedPlugins).includes(path)) {
				const plugin = watchedPlugins[path]
				logger.wait(`${chalk.bold(plugin.name)} plugin was updated. Restarting to apply changes...`)
			} else {
				logger.wait(`Change detected. Restarting Robo...`)
			}

			const updatedBot = await rebuildAndRestartBot(botProcess, config)
			if (updatedBot) {
				botProcess = updatedBot
			}
		} finally {
			isUpdating = false
		}
	})
}

// Use a separate process to avoid module cache issues
export async function buildInSeparateProcess(command: string) {
	return new Promise<void>((resolve, reject) => {
		const args = command.split(' ')
		let pkgManager = getPkgManager()

		// Unfortunately, Windows has issues recursively spawning processes via PNPM
		// If you're reading this and know how to fix it, please open a PR!
		if (pkgManager === 'pnpm' && IS_WINDOWS) {
			logger.debug(`Detected Windows. Using ${chalk.bold(cmd('npm'))} instead of ${chalk.bold(cmd('pnpm'))} to build.`)
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
				resolve()
			} else {
				reject(new Error(`Child process exited with code ${code}`))
			}
		})

		childProcess.on('error', (error) => {
			reject(error)
		})
	})
}

async function rebuildAndRestartBot(bot: ChildProcess | null, config: Config) {
	// Guard against accidentally killing the new process
	const currentBot = bot

	// Kill the previous process if it's still running
	// We wait for the process to exit before starting a new one
	let isTerminated = false
	const terminate = new Promise<void>((resolve) =>
		currentBot?.on('exit', () => {
			logger.debug('Terminated previous bot process')
			isTerminated = true
			resolve()
		})
	)

	// Force abort the bot if it doesn't exit after n seconds
	// This is to prevent the bot from running multiple instances
	const forceAbort = timeout(() => {
		if (!isTerminated) {
			logger.warn('Robo termination timed out. Force stopping...')
		}
		currentBot?.kill('SIGKILL')
	}, config?.timeouts?.lifecycle ?? DEFAULT_CONFIG.timeouts.lifecycle)

	// Get state dump before restarting
	const savedState = await getStateSave(currentBot)

	// Wait for the bot to exit or force abort
	currentBot?.send({ type: 'restart' })
	await Promise.all([buildInSeparateProcess(buildCommand), Promise.race([terminate, forceAbort])])

	// Start a new process
	const newBot = await run()
	newBot.send({ type: 'state-load', state: savedState })
	return newBot
}
