import { color, type Styler } from './color.js'
import { logger } from './logger.js'

let _mode: string | null = null
let _modeColor: Styler | undefined

/**
 * Modes are a way to define "profiles" for your Robo session. Each with its own config(s), envionment variables, and code.
 *
 * ```ts
 * import { Mode } from 'robo.js'
 *
 * // Get the current mode
 * const mode = Mode.get()
 *
 * // Check if the current mode is "dev"
 * if (Mode.is('dev')) {
 *  // Do something
 * }
 *
 * // Colorize text based on the current mode
 * console.log(Mode.color('Hello, world!'))
 * ```
 *
 * Everything is granular. You can even run multiple modes at the same time!
 *
 * [**Learn more:** Mode](https://robojs.dev/robojs/mode)
 */
export const Mode = Object.freeze({ color: colorMode, get, is })

/**
 * @internal
 */
export function resolveCliMode(mode?: string | null): string | undefined {
	if (!mode) {
		return
	}

	const modes = mode
		.split(',')
		.flatMap((m) => m.split(' '))
		.map((m) => m.trim())
		.filter(Boolean)

	return modes[0]
}

/**
 * @internal
 */
export function getModeColor(mode: string) {
	const Colors = [color.cyan, color.yellow, color.red, color.blue, color.green, color.magenta]
	const hash = mode.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)

	return Colors[hash % Colors.length]
}

/**
 * @internal
 */
export function setMode(mode: string) {
	// Only set mode to valid value, otherwise keep it as is
	if (mode) {
		_mode = mode
	}

	// Use the NODE_ENV if no mode is provided
	if (!_mode && process.env.NODE_ENV) {
		_mode = process.env.NODE_ENV
	}

	// See if there's multiple modes in this (e.g. "dev, beta")
	const modes =
		_mode
			?.split(',')
			?.flatMap((m) => m.split(' '))
			?.filter(Boolean) ?? []
	logger.debug(`Setting mode(s) to`, modes)

	// If there's multiple modes, return a way to shard
	let shardModes = null

	if (modes.length > 1) {
		const longestMode = modes.reduce((a, b) => (a.length > b.length ? a : b))

		shardModes = async () => {
			const { fork } = await import('node:child_process')

			// When multiple modes are provided, we need to shard the process
			modes.forEach((mode) => {
				// Update args to remove all other mode flags
				const args = process.argv.slice(2)
				const newArgs: string[] = []
				let ignoreArgs = false

				args.forEach((arg) => {
					if (ignoreArgs && arg.startsWith('-')) {
						ignoreArgs = false
					} else if (ignoreArgs) {
						return
					}

					newArgs.push(arg)
					if (arg === '--mode' || arg === '-m') {
						newArgs.push(arg, mode)
						ignoreArgs = true
					}
				})

				// Launch a new process with the new args
				const child = fork(process.argv[1], newArgs, {
					env: {
						...process.env,
						ROBO_SHARD_MODE: mode,
						ROBO_SHARD_MODES: modes.join(','),
						ROBO_SHARD_LONGEST_MODE: longestMode
					}
				})

				child.on('exit', (code) => {
					logger.debug(`Child process exited with code ${code}`)
				})
			})
		}
	} else {
		// Update mode color
		_modeColor = getModeColor(_mode)
	}

	return { shardModes }
}

/**
 * Returns the color function for the current mode.
 * This is used to colorize logs based on the mode when multiple exist.
 */
export function colorMode(text: string) {
	if (!_modeColor) {
		_modeColor = getModeColor(_mode)
	}

	return _modeColor(text)
}

/**
 * The current mode this Robo instance is running in.
 * This is set by the `--mode` CLI flag.
 *
 * Defaults to `production` for `robo start` and `development` for `robo dev`.
 */
function get(): string {
	// Default to NODE_ENV
	if (!_mode && process.env.NODE_ENV) {
		_mode = process.env.NODE_ENV
	}

	return _mode
}

/**
 * Checks if the current mode matches the provided mode.
 *
 * @param mode The mode to check against.
 * @returns `true` if the current mode matches the provided mode.
 */
function is(mode: string) {
	return get() === mode
}
