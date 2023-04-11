import { Command } from 'commander'
import chokidar from 'chokidar'
import { run } from '../utils/run.js'
import { spawn, type ChildProcess } from 'child_process'
import { logger } from '../utils/logger.js'
import chalk from 'chalk'
import { CONFIG_FILES, DEFAULT_CONFIG } from '../../core/constants.js'
import { loadConfig } from '../utils/config.js'
import { Config } from 'src/types/index.js'
import { IS_WINDOWS, cmd, getPkgManager, timeout } from '../utils/utils.js'

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

async function devAction(options: DevCommandOptions) {
	// Create a logger
	logger({
		enabled: !options.silent,
		level: options.verbose ? 'debug' : 'info'
	}).event('Starting Robo in development mode...')
	logger.warn(`Thank you for trying Robo! This is a pre-release version, so please let us know of issues on GitHub.`)
	const config = await loadConfig()
	if (!config) {
		logger.warn(`Could not find configuration file.`)
	}

	// Run after preparing first build
	await buildInSeparateProcess()
	let botProcess = run()

	// Make sure to kill the bot process when the process exits
	process.on('SIGINT', () => {
		botProcess?.kill('SIGINT')
		process.exit(0)
	})
	process.on('SIGTERM', () => {
		botProcess?.kill('SIGTERM')
		process.exit(0)
	})

	// Watch for changes in the "src" directory or config file
	const watcher = chokidar.watch(['src', ...CONFIG_FILES], {
		ignored: /(^|[/\\])\.(?!config)[^.]/, // ignore dotfiles except .config and directories
		persistent: true,
		ignoreInitial: true
	})

	// This `watch` wrapper is used to prevent multiple restarts from happening at the same time
	let isUpdating = false
	const watch = (event: 'add' | 'change' | 'unlink') => async (path: string) => {
		logger.debug(`Watcher event: ${event}`)
		if (isUpdating) {
			return logger.debug(`Already updating, skipping...`)
		}
		isUpdating = true

		try {
			const fileName = path.split('/').pop()
			if (CONFIG_FILES.includes(path)) {
				logger.info(`${chalk.bold(fileName)} file was updated. Restarting to apply configuration...`)
			} else {
				logger.info(`Change detected. Restarting Robo...`)
			}

			const updatedBot = await rebuildAndRestartBot(botProcess, config)
			if (updatedBot) {
				botProcess = updatedBot
			}
		} finally {
			isUpdating = false
		}
	}

	watcher.on('add', watch('add'))
	watcher.on('change', watch('change'))
	watcher.on('unlink', watch('unlink'))
}

// Use a separate process to avoid module cache issues
async function buildInSeparateProcess() {
	return new Promise<void>((resolve, reject) => {
		const args = ['robo', 'build', '--dev', '--silent']
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

		logger.debug(`Running ${cmd(pkgManager)} ${args.join(' ')}`)
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
	// Kill the previous process if it's still running
	// We wait for the process to exit before starting a new one
	let isTerminated = false
	const terminate = new Promise<void>((resolve) =>
		bot?.on('exit', () => {
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
			bot?.kill('SIGKILL')
		}
	}, config?.timeouts?.lifecycle ?? DEFAULT_CONFIG.timeouts.lifecycle)

	// Wait for the bot to exit or force abort
	bot?.send({ type: 'restart' })
	await Promise.all([buildInSeparateProcess(), Promise.race([terminate, forceAbort])])

	// Start a new process
	return run()
}
