import { IS_BUN_RUNTIME } from '../cli/utils/runtime-utils.js'
import { logger } from './logger.js'
import { existsSync, readFileSync } from 'node:fs'
import { readFile, stat as statAsync } from 'node:fs/promises'
import path from 'node:path'

interface EnvVariable {
	env: string
	default?: string
}

export interface LoadOptions {
	/**
	 * The mode to load environment variables for.
	 */
	mode?: string

	/**
	 * The path to the environment file. Defaults to `.env`.
	 */
	path?: string

	/**
	 * Whether to overwrite existing environment variables.
	 * Can be a boolean or an array of keys to overwrite.
	 */
	overwrite?: boolean | string[]
}

type IsLeaf<T> = T extends { env: string } ? true : false

type DotPaths<T> = T extends object
	? IsLeaf<T> extends true
		? never
		: {
				[K in keyof T & string]: IsLeaf<T[K]> extends true ? `${K}` : `${K}.${DotPaths<T[K]>}`
		  }[keyof T & string]
	: never

type ValueAtPath<T, P extends string> = P extends `${infer Key}.${infer Rest}`
	? Key extends keyof T
		? ValueAtPath<T[Key], Rest>
		: never
	: P extends keyof T
	? IsLeaf<T[P]> extends true
		? T[P] extends { env: infer E }
			? E
			: never
		: never
	: never

// Variable keys to always overwrite unless specified otherwise
let _globalOverwrites: string[] = []

/**
 * Sometimes you need to store sensitive information, like API keys, database URLs, or other credentials.
 *
 * ```ts
 * import { Env } from 'robo.js'
 *
 * Env.loadSync({ mode: 'dev' })
 * Env.data().NODE_ENV // 'development'
 * ```
 *
 * Use the `Env` class to load environment variables from a file and access them in a type-safe way.
 *
 * [**Learn more:** Environment Variables](https://robojs.dev/robojs/environment-variables)
 */
export class Env<T> {
	private _variables: T
	private static _data: Record<string, string>
	private static _loadedMode: string | undefined

	/**
	 * Creates a new instance of the Env class with the specified schema with type-checking and default values.
	 *
	 * ```ts
	 * const env = new Env({
	 * 	database: {
	 * 		url: { env: 'DATABASE_URL' }
	 * 	},
	 * 	example: {
	 * 		default: 'This is an example',
	 * 		env: 'EXAMPLE_ENV'
	 * 	},
	 * 	nodeEnv: { env: 'NODE_ENV' }
	 * })
	 *
	 * // Returns the value of the DATABASE_URL environment variable
	 * env.get('database.url')
	 * ```
	 *
	 * @param schema - The schema of environment variables to use for type-checking and default values.
	 */
	constructor(schema: T) {
		this._variables = schema
	}

	/**
	 * Retrieves the value of the environment variable specified by the dot-separated key.
	 * If the environment variable is not set, it returns the default value if provided.
	 *
	 * @param key - The dot-separated path to the environment variable in the schema.
	 * @returns The value of the environment variable or its default.
	 */
	public get<K extends DotPaths<T>>(key: K): ValueAtPath<T, K> {
		const keys = key.split('.')
		let result: unknown = this._variables

		// Traverse the schema to locate the desired key
		for (const k of keys) {
			if (typeof result === 'object' && result !== null && k in result) {
				result = (result as Record<string, unknown>)[k]
			} else {
				throw new Error(`Invalid key path: ${key}`)
			}
		}

		// At this point, result should be an EnvVariable
		if (typeof result === 'object' && result !== null && 'env' in result) {
			const envKey = (result as EnvVariable).env
			const envValue = process.env[envKey]

			if (envValue !== undefined) {
				return envValue as ValueAtPath<T, K>
			} else if ('default' in result && (result as EnvVariable).default !== undefined) {
				return (result as EnvVariable).default as ValueAtPath<T, K>
			} else {
				return undefined as ValueAtPath<T, K>
			}
		}

		throw new Error(`Invalid schema configuration for key: ${key}`)
	}

	/**
	 * @returns The environment variables that have been loaded most recently.
	 */
	public static data() {
		return this._data
	}

	/**
	 * Loads environment variables from a file and applies them to the current process.
	 *
	 * @param options - Customize where the file path, mode, and overwrite behavior.
	 * @returns Record object containing loaded environment variables.
	 */
	public static async load(options: LoadOptions = {}) {
		// Short-circuit if already loaded with the same mode (unless overwrite is requested)
		const mode = options.mode ?? ''
		if (!options.overwrite && Env._loadedMode !== undefined && Env._loadedMode === mode) {
			return Env._data ?? {}
		}

		const filePath = await getFilePathAsync(options)

		if (filePath) {
			const envContent = await readFile(filePath, 'utf-8')
			const newEnv = parseEnvFile(envContent)
			Env._data = newEnv
			Env._loadedMode = mode

			return applyEnv(options, newEnv)
		} else {
			Env._loadedMode = mode
			return {}
		}
	}

	/**
	 * Loads environment variables from a file and applies them to the current process.
	 *
	 * **This operation is synchronous and will block the event loop.** Use {@link load} for asynchronous loading.
	 *
	 * @param options - Customize where the file path, mode, and overwrite behavior.
	 * @returns Record object containing loaded environment variables.
	 */
	public static loadSync(options: LoadOptions = {}) {
		// Short-circuit if already loaded with the same mode (unless overwrite is requested)
		const mode = options.mode ?? ''
		if (!options.overwrite && Env._loadedMode !== undefined && Env._loadedMode === mode) {
			return Env._data ?? {}
		}

		const filePath = getFilePath(options)

		if (filePath) {
			const envContent = readFileSync(filePath, 'utf-8')
			const newEnv = parseEnvFile(envContent)
			Env._data = newEnv
			Env._loadedMode = mode

			return applyEnv(options, newEnv)
		} else {
			Env._loadedMode = mode
			return {}
		}
	}
}

export const env = new Env({
	boot: {
		disableCheck: { env: 'DISABLE_BOOT_CHECK' }
	},
	nodeEnv: { env: 'NODE_ENV' },
	roboplay: {
		api: {
			env: 'ROBOPLAY_API',
			default: 'https://api.roboplay.dev'
		},
		debug: { env: 'ROBOPLAY_DEBUG' },
		env: { env: 'ROBOPLAY_ENV' },
		frontend: {
			env: 'ROBOPLAY_FRONTEND',
			default: 'https://roboplay.dev'
		}
	}
})

function applyEnv(options: LoadOptions, newEnvVars: Record<string, string>) {
	const { overwrite = _globalOverwrites } = options
	const varSubstitutionRegex = /\${(.+?)}/g

	// Create a clone of process.env to maintain a consistent state in case of an error
	const envClone = { ...process.env }

	try {
		for (const key in newEnvVars) {
			// Don't overwrite existing values unless specified
			const shouldOverwrite = overwrite === true || (Array.isArray(overwrite) && overwrite.includes(key))

			if (!shouldOverwrite && key in envClone) {
				continue
			}

			const visited = new Set<string>()
			let value = newEnvVars[key]

			while (varSubstitutionRegex.test(value)) {
				value = value.replace(varSubstitutionRegex, (_, varName) => {
					if (visited.has(varName)) {
						throw new Error(`Circular reference detected in environment variable "${key}"`)
					}
					visited.add(varName)
					return envClone[varName] || newEnvVars[varName] || ''
				})
			}

			envClone[key] = value
		}

		Object.assign(process.env, envClone)
	} catch (err) {
		logger.error(`Could not load environment variables:`, err)
	}

	return newEnvVars
}

function getFilePath(options: LoadOptions): string | null {
	// No need to load .env file if using Bun (it's already loaded)
	if (IS_BUN_RUNTIME) {
		return null
	}

	// Look for .env.{mode} file first, then fallback to standard .env
	const { mode } = options
	let { path: filePath = path.join(process.cwd(), '.env') } = options

	if (mode && existsSync(filePath + '.' + mode)) {
		logger.debug('Found .env file for mode:', mode, ':', filePath + '.' + mode)
		filePath = path.join(process.cwd(), '.env' + '.' + mode)
	}
	if (!existsSync(filePath)) {
		logger.debug(`No .env file found at "${filePath}"`)
		return
	}

	return filePath
}

async function getFilePathAsync(options: LoadOptions): Promise<string | null> {
	if (IS_BUN_RUNTIME) {
		return null
	}

	const { mode } = options
	let { path: filePath = path.join(process.cwd(), '.env') } = options

	if (mode) {
		const modePath = filePath + '.' + mode
		try {
			await statAsync(modePath)
			logger.debug('Found .env file for mode:', mode, ':', modePath)
			filePath = path.join(process.cwd(), '.env' + '.' + mode)
		} catch {
			// Mode-specific file doesn't exist, use default
		}
	}

	try {
		await statAsync(filePath)
		return filePath
	} catch {
		logger.debug(`No .env file found at "${filePath}"`)
		return null
	}
}

function parseEnvFile(envFileContent: string): Record<string, string> {
	const lines = envFileContent.split('\n')
	const commentRegex = /^\s*#/
	const quotesRegex = /^['"]/
	const escapedCharsRegex = /\\(.)/g

	let currentLine = ''
	const newEnvVars: { [key: string]: string } = {}

	for (let i = 0; i < lines.length; i++) {
		currentLine += lines[i]

		// Ignore comments
		if (commentRegex.test(currentLine)) {
			currentLine = ''
			continue
		}

		// Multiline support
		if (currentLine.endsWith('\\')) {
			currentLine = currentLine.slice(0, -1)
			continue
		}

		// Find first index of '=', and split key/value there
		const delimiterIndex = currentLine.indexOf('=')
		if (delimiterIndex === -1) {
			currentLine = ''
			continue // Ignore lines that aren't key-value pairs
		}

		const key = currentLine.substring(0, delimiterIndex).trim()
		let value = currentLine.substring(delimiterIndex + 1).trim()

		// Remove surrounding quotes and unescape
		if (quotesRegex.test(value)) {
			value = value.slice(1, -1).replace(escapedCharsRegex, '$1')
		}

		newEnvVars[key] = value
		currentLine = ''
	}

	return newEnvVars
}

export function setGlobalOverwrites(overwrites: string[]) {
	_globalOverwrites = overwrites
}
