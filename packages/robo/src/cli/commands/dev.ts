import { Command } from '../utils/cli-handler.js'
import { ChildProcess, spawn } from 'child_process'
import { logger } from '../../core/logger.js'
import { DEFAULT_CONFIG, FLASHCORE_KEYS, Indent, cloudflareLogger } from '../../core/constants.js'
import { getConfigPaths, loadConfig, loadConfigPath } from '../../core/config.js'
import { installCloudflared, isCloudflaredInstalled, startCloudflared, stopCloudflared } from '../utils/cloudflared.js'
import { IS_WINDOWS, filterExistingPaths, getWatchedPlugins, packageJson, timeout } from '../utils/utils.js'
import path from 'node:path'
import Watcher, { Change } from '../utils/watcher.js'
import { color, composeColors } from '../../core/color.js'
import { Spirits } from '../utils/spirits.js'
import { buildAction } from './build/index.js'
import { Flashcore, prepareFlashcore } from '../../core/flashcore.js'
import { getPackageExecutor, getPackageManager } from '../utils/runtime-utils.js'
import { Mode, setMode } from '../../core/mode.js'
import { Compiler } from '../utils/compiler.js'
import { loadEnv } from '../../core/dotenv.js'
import type { Config, SpiritMessage } from '../../types/index.js'

const command = new Command('dev')
	.description('Ready, set, code your bot to life! Starts development mode.')
	.option('-h', '--help', 'Shows the available command options')
	.option('-m', '--mode', 'specify the mode(s) to run in (dev, beta, prod, etc...)')
	.option('-s', '--silent', 'do not print anything')
	.option('-t', '--tunnel', 'expose your local server to the internet')
	.option('-v', '--verbose', 'print more information for debugging')
	.handler(devAction)
export default command

interface DevCommandOptions {
	mode?: string
	silent?: boolean
	tunnel?: boolean
	verbose?: boolean
}

let spirits: Spirits | undefined

async function devAction(_args: string[], options: DevCommandOptions) {
	// Create a logger
	logger({
		enabled: !options.silent,
		level: options.verbose ? 'debug' : 'info'
	})
	logger.debug('CLI options:', options)
	logger.debug(`Package manager:`, getPackageManager())
	logger.debug(`Robo.js version:`, packageJson.version)
	logger.debug(`Current working directory:`, process.cwd())

	// Set NODE_ENV if not already set
	if (!process.env.NODE_ENV) {
		process.env.NODE_ENV = 'development'
	}

	// Make sure environment variables are loaded
	const defaultMode = Mode.get()
	await loadEnv({ mode: defaultMode })

	// Handle mode(s)
	const { shardModes } = setMode(options.mode)

	if (shardModes) {
		return shardModes()
	}

	// Welcomeee
	const projectName = path.basename(process.cwd()).toLowerCase()
	logger.log('')
	logger.log(Indent, color.bold(`🚀 Starting ${color.cyan(projectName)} in ${Mode.color(Mode.get())} mode`))
	logger.log(Indent, '   Beep boop... Code your Robo to life! Got feedback? Tell us on Discord.')
	logger.log('')

	// Load the configuration before anything else
	const config = await loadConfig()
	const configPath = await loadConfigPath()
	let configRelative: string

	if (configPath) {
		configRelative = path.relative(process.cwd(), configPath)
	} else {
		logger.error(`Could not find configuration file. Please make sure ${color.bold('/config/robo.mjs')} exists.`)
		process.exit(1)
	}

	// Experimental warning, except for the disableBot flag which is a special case
	const experimentalKeys = Object.entries(config.experimental ?? {})
		.filter(([, value]) => value)
		.map(([key]) => key)
		.filter((key) => key !== 'disableBot')

	if (experimentalKeys.length > 0) {
		const features = experimentalKeys.map((key) => color.bold(key)).join(', ')
		logger.warn(`Experimental flags enabled: ${features}.`)
	}

	// Install cloudflared & ensure PORT is set because we need it for the tunnel
	if (options.tunnel && !isCloudflaredInstalled()) {
		cloudflareLogger.event(`Installing Cloudflared...`)
		await installCloudflared()
		cloudflareLogger.info(`Cloudflared installed successfully!`)
	}

	if (options.tunnel && !process.env.PORT) {
		cloudflareLogger.error(`Cannot start tunnel without a PORT environment variable.`)
		process.exit(1)
	}

	// Ensure worker spirits are ready
	spirits = new Spirits()

	// Stop spirits & tunnel on process exit
	let isStopping = false
	let tunnelProcess: ChildProcess | undefined

	const callback = async (signal: NodeJS.Signals) => {
		if (isStopping) {
			return
		}

		isStopping = true
		await Promise.allSettled([spirits.stopAll(), stopCloudflared(tunnelProcess, signal)])
		process.exit(0)
	}
	process.on('SIGINT', () => callback('SIGINT'))
	process.on('SIGTERM', () => callback('SIGTERM'))

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
	let roboSpirit: string

	// These callbacks are necessary to ensure "/dev restart" works
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
	if (buildSuccess) {
		roboSpirit = await spirits.newTask<string>({
			event: 'start',
			onExit: (exitCode: number) => {
				if (exitCode !== 0) {
					logger.error(
						composeColors(
							color.bgBlack,
							color.redBright,
							color.underline,
							color.bold
						)(`Robo exited with code ${exitCode}`)
					)
					return false
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
	} else {
		logger.wait(`Build failed! Waiting for changes before retrying...`)
	}

	// Load manifest to compare later
	let manifest = await Compiler.useManifest()

	// Watch for changes in the "src" directory alongside special files
	const watchedPaths = ['src']
	const ignoredPaths = ['node_modules', '.git', ...(config.watcher?.ignore ?? [])]
	const additionalFiles = await filterExistingPaths(['.env', 'tsconfig.json'])
	watchedPaths.push(...additionalFiles)

	// Watch all plugins that are also currently in development mode, along with their config files
	const watchedPlugins = await getWatchedPlugins(config)
	Object.keys(watchedPlugins).forEach((pluginPath) => watchedPaths.push(pluginPath))
	getConfigPaths().forEach((configPath) => watchedPaths.push(path.relative(process.cwd(), configPath)))

	// Watch while preventing multiple restarts from happening at the same time
	logger.debug(`Watching:`, watchedPaths)
	logger.debug(`Ignoring paths:`, ignoredPaths)
	const watcher = new Watcher(watchedPaths, { exclude: ignoredPaths })
	let isUpdating = false

	watcher.start(async (changes) => {
		logger.debug('Watcher events:', changes)
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
			roboSpirit = await rebuildRobo(roboSpirit, config, options.verbose, changes)
			spirits.on(roboSpirit, restartCallback)

			// Compare manifest to warn about permission changes
			if (config.experimental?.disableBot !== true) {
				const newManifest = await Compiler.useManifest()
				const oldPermissions = manifest.permissions ?? []
				const newPermissions = newManifest.permissions ?? []
				manifest = newManifest

				if (JSON.stringify(oldPermissions) !== JSON.stringify(newPermissions)) {
					logger.warn(
						`Permissions have changed! Run ${color.bold('robo invite')} to update your Robo's guild permissions.`
					)
				}
			}
		} finally {
			isUpdating = false
		}
	})

	// Run the tunnel if requested
	if (options.tunnel) {
		tunnelProcess = startCloudflared('http://localhost:' + process.env.PORT)
	}

	// Check for updates
	try {
		await checkUpdates(config)
	} catch (error) {
		logger.warn(error)
	}
}

/**
 * Building in a separate process/thread clears the import cache.
 * This is necessary to prevent the bot from using old code.
 */
export async function buildAsync(command: string | null, config: Config, verbose: boolean, changes: Change[]) {
	return new Promise<boolean>((resolve, reject) => {
		const start = Date.now()

		if (!command) {
			spirits
				.newTask({
					event: 'build',
					payload: {
						files: changes.map((change) => change.filePath),
						mode: Mode.get()
					},
					verbose: verbose
				})
				.then(() => {
					logger.debug(`Build completed in ${Date.now() - start}ms`)
					resolve(true)
				})
				.catch(() => resolve(false))
		} else {
			const args = command.split(' ')
			let pkgManager = getPackageManager()

			// Unfortunately, Windows has issues recursively spawning processes via PNPM
			// If you're reading this and know how to fix it, please open a PR!
			if (pkgManager === 'pnpm' && IS_WINDOWS) {
				logger.debug(`Detected Windows. Using ${color.bold('npm')} instead of ${color.bold('pnpm')} to build.`)
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

			logger.debug(`> ${pkgManager} ${args.join(' ')}`)
			const childProcess = spawn(pkgManager, args, {
				env: { ...process.env, FORCE_COLOR: '1' },
				shell: IS_WINDOWS,
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

export async function checkUpdates(config: Config, forceCheck = false, suggest = true) {
	const { updateCheckInterval = 60 * 60 } = config

	const update = {
		currentVersion: packageJson.version,
		hasUpdate: false,
		latestVersion: ''
	}

	// Ignore if disabled
	if (!forceCheck && updateCheckInterval <= 0) {
		return update
	}

	// Check if update check is due
	const lastUpdateCheck = (await Flashcore.get<number>(FLASHCORE_KEYS.lastUpdateCheck)) ?? 0
	const now = Date.now()
	const isDue = now - lastUpdateCheck > updateCheckInterval * 1000

	if (!forceCheck && !isDue) {
		return update
	}

	// Check NPM registry for updates
	const response = await fetch(`https://registry.npmjs.org/${packageJson.name}/latest`)
	const latestVersion = (await response.json()).version
	update.hasUpdate = packageJson.version !== latestVersion
	update.latestVersion = latestVersion

	// Update last update check time
	await Flashcore.set(FLASHCORE_KEYS.lastUpdateCheck, now)

	// Compare versions
	if (update.hasUpdate) {
		// Prepare commands
		const packageExecutor = getPackageExecutor()
		const command = `${packageExecutor} sage upgrade`

		// Print update message
		const highlightColor = composeColors(color.green, color.bold)
		const highlight = highlightColor(
			`A new version of Robo.js is available! (v${packageJson.version} -> v${latestVersion})`
		)
		const suggestion = suggest ? `Run ${color.bold(command)} to update.` : ''
		logger.info(highlight, suggestion)
	}

	return update
}

async function rebuildRobo(spiritId: string, config: Config, verbose: boolean, changes: Change[]) {
	// Guard against accidentally killing the new spirit
	const roboSpirit = spiritId
	const isValid = roboSpirit !== null && roboSpirit !== undefined

	// Get state dump before restarting
	const stateSaveStart = Date.now()
	logger.debug('Saving state...')
	const savedState =
		(await spirits.exec<Record<string, unknown>>(roboSpirit, {
			event: 'get-state'
		})) ?? {}
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
			spirit.worker?.off('exit', callback)
			spirit.isTerminated = true
			isTerminated = true
			resolve()
		}

		if (spirit?.isTerminated) {
			return callback()
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
	const [success] = await Promise.all([buildAsync(null, config, verbose, changes), awaitStop])

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
