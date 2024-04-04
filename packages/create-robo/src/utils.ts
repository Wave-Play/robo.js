import { spawn } from 'node:child_process'
import chalk from 'chalk'
import { logger } from '@roboplay/robo.js'
import type { SpawnOptions } from 'node:child_process'
import type { Logger } from '@roboplay/robo.js'

type PackageManager = 'npm' | 'bun' | 'pnpm' | 'yarn'

export const ESLINT_IGNORE = `node_modules
.config
.robo\n`

export const Indent = ' '.repeat(3)

export const Space = ' '.repeat(8)

export const IS_WINDOWS = /^win/.test(process.platform)

export const PRETTIER_CONFIG = `module.exports = {
	printWidth: 120,
	semi: false,
	singleQuote: true,
	trailingComma: 'none',
	tabWidth: 2,
	useTabs: true
}\n`

export const ROBO_CONFIG = `// @ts-check

/**
 * @type {import('@roboplay/robo.js').Config}
 **/
export default {
	clientOptions: {
		intents: [
			'Guilds',
			'GuildMessages',
			'MessageContent'
		]
	},
	plugins: [],
	type: 'robo'
}\n`


export const ROBO_CONFIG_APP = `// @ts-check

/**
 * @type {import('@roboplay/robo.js').Config}
 **/
export default {
	clientOptions: {
		intents: [
			'Guilds',
			'GuildMessages',
			'MessageContent'
		]
	},
	experimental: {
		app: true,
		disableBot: false
	}
	plugins: [],
	type: 'robo'
}\n`

export function cmd(packageManager: PackageManager): string {
	return IS_WINDOWS ? `${packageManager}.cmd` : packageManager
}

export interface ExecOptions extends SpawnOptions {
	logger?: Logger | typeof logger
	resolveOnEvent?: 'close' | 'exit'
	verbose?: boolean
}
/**
 * Run a command as a child process
 */
export function exec(command: string, options?: ExecOptions) {
	const { logger: customLogger = logger, resolveOnEvent = 'close', verbose, ...spawnOptions } = options ?? {}
	return new Promise<void>((resolve, reject) => {
		customLogger.debug(`> ${chalk.bold(command)}`)

		// Run command as child process
		const args = command.split(' ')
		const childProcess = spawn(args.shift(), args, {
			env: { ...process.env, FORCE_COLOR: '1' },
			stdio: verbose ? 'pipe' : 'inherit',
			...(spawnOptions ?? {})
		})

		if (verbose) {
			const onData = (data: Buffer) => {
				const output = data.toString()
				customLogger.debug(Indent, chalk.dim(output))
			}
			childProcess.stderr?.on('data', onData)
			childProcess.stdout?.on('data', onData)
		}

		// Resolve promise when child process exits
		childProcess.on(resolveOnEvent, (code) => (code ? reject(`Command exited with code ${code}`) : resolve()))
	})
}

/**
 * Get the package manager used to run this CLI
 * This allows developers to use their preferred package manager seamlessly
 */
export function getPackageManager(): PackageManager {
	const userAgent = process.env.npm_config_user_agent

	if (userAgent?.startsWith('bun')) {
		return 'bun'
	} else if (userAgent?.startsWith('yarn')) {
		return 'yarn'
	} else if (userAgent?.startsWith('pnpm')) {
		return 'pnpm'
	} else {
		return 'npm'
	}
}

export function getPackageExecutor(): string {
	const packageManager = getPackageManager()
	if (packageManager === 'yarn') {
		return 'yarn dlx'
	} else if (packageManager === 'pnpm') {
		return 'pnpx'
	} else if (packageManager === 'bun') {
		return 'bunx'
	} else {
		return 'npx'
	}
}

export function hasProperties<T extends Record<string, unknown>>(
	obj: unknown,
	props: (keyof T)[]
): obj is T & Record<keyof T, unknown> {
	return typeof obj === 'object' && obj !== null && props.every((prop) => prop in obj)
}

/**
 * Stringifies an object, array, or primitive to a readable string.
 * Handles special cases like omitting optional quotes and supporting environment variables.
 *
 * @param obj - The object, array, or primitive to stringify.
 * @param indentation - The current indentation level (used for recursion).
 * @returns A string representation of the object, array, or primitive.
 */
export function prettyStringify(obj: unknown, indentation = 0): string {
	if (obj === null || obj === undefined || typeof obj === 'number' || typeof obj === 'boolean') {
		return `${obj}`
	}

	if (typeof obj === 'string') {
		if (obj.startsWith('process.env.')) {
			return obj
		}
		return `'${obj}'`
	}

	if (Array.isArray(obj)) {
		if (obj.length === 0) {
			return '[]'
		}
		const arrElements = obj.map((value) => `${'\t'.repeat(indentation + 1)}${prettyStringify(value, indentation + 1)}`)
		return `[\n${arrElements.join(',\n')}\n${'\t'.repeat(indentation)}]`
	}

	if (typeof obj === 'object') {
		const objKeys = Object.keys(obj as Record<string, unknown>)
		if (objKeys.length === 0) {
			return '{}'
		}
		const objElements = objKeys.map((key) => {
			const formattedKey = /^[a-zA-Z_$][a-zA-Z_$0-9]*$/.test(key) ? key : `"${key}"`
			return `${'\t'.repeat(indentation + 1)}${formattedKey}: ${prettyStringify(
				(obj as Record<string, unknown>)[key],
				indentation + 1
			)}`
		})
		return `{\n${objElements.join(',\n')}\n${'\t'.repeat(indentation)}}`
	}

	return ''
}

export function sortObjectKeys(obj: Record<string, string>) {
	return Object.keys(obj)
		.sort()
		.reduce((acc, key) => {
			acc[key] = obj[key]
			return acc
		}, {} as Record<string, string>)
}

// Helper function to update or add a variable
export function updateOrAddVariable(content: string, variable: string, value: string): string {
	const regex = new RegExp(`(${variable}\\s*=)(.*)`, 'i')

	if (regex.test(content)) {
		return content.replace(regex, `$1${value}`)
	} else {
		return `${content}${variable}="${value}"\n`
	}
}
