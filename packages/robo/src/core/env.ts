import { loadEnv } from './dotenv.js'

interface EnvVariable {
	env: string
	default?: string
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

export class Env<T> {
	private _variables: T

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

	public static async load() {
		return loadEnv()
	}
}

export const env = new Env({
	discord: {
		clientId: { env: 'DISCORD_CLIENT_ID' },
		debugChannelId: { env: 'DISCORD_DEBUG_CHANNEL_ID' },
		guildId: { env: 'DISCORD_GUILD_ID' },
		token: { env: 'DISCORD_TOKEN' }
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
