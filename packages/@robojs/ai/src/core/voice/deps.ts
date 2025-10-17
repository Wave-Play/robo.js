/** Optional dependency loaders for voice stack components with helpful error hints. */

/**
 * Custom error for missing optional dependencies, including installation hints.
 */
export class OptionalDependencyError extends Error {
	/** Npm package specifier that failed to load. */
	public readonly specifier: string
	/** Suggested installation hint for the caller. */
	public readonly hint: string

	public constructor(specifier: string, hint: string, options?: { cause?: unknown }) {
		super(`Missing optional dependency "${specifier}". ${hint}`.trim())
		this.name = 'OptionalDependencyError'
		this.specifier = specifier
		this.hint = hint
		if (options?.cause !== undefined) {
			;(this as Error & { cause?: unknown }).cause = options.cause
		}
	}
}

/**
 * Checks whether an error represents a module-not-found condition for the given specifier.
 */
function isModuleNotFound(error: unknown, specifier: string): boolean {
	// Validate error is an object.
	if (!error || typeof error !== 'object') {
		return false
	}

	const err = error as { code?: string; message?: string }
	// Extract error code from code property or message.
	const code =
		err.code ??
		(typeof err.message === 'string' && err.message.includes('Cannot find package')
			? 'ERR_MODULE_NOT_FOUND'
			: undefined)
	if (!code) {
		return false
	}
	// Check for module-not-found codes.
	if (code !== 'MODULE_NOT_FOUND' && code !== 'ERR_MODULE_NOT_FOUND') {
		return false
	}
	// Verify specifier is mentioned in error message.
	return typeof err.message === 'string' ? err.message.includes(specifier) : true
}

/** Loader API exposing throwing and non-throwing dependency loaders. */
type LoaderResult<T> = {
	load(): Promise<T>
	tryLoad(): Promise<T | null>
}

/**
 * Creates a lazy loader for an optional dependency with cached results and helpful errors.
 */
function createOptionalLoader<T>(loadFn: () => Promise<T>, specifier: string, hint: string): LoaderResult<T> {
	// Cache promise to avoid duplicate loads.
	let promise: Promise<T> | null = null

	// Throwing loader: fails with OptionalDependencyError if missing.
	async function load(): Promise<T> {
		if (!promise) {
			promise = loadFn().catch((error) => {
				promise = null
				if (isModuleNotFound(error, specifier)) {
					throw new OptionalDependencyError(specifier, hint, { cause: error })
				}
				throw error
			})
		}

		return promise
	}

	// Non-throwing loader: returns null if missing.
	async function tryLoad(): Promise<T | null> {
		try {
			return await load()
		} catch (error) {
			if (error instanceof OptionalDependencyError) {
				return null
			}

			throw error
		}
	}

	return { load, tryLoad }
}

/** Installation instructions for the full voice stack. */
const VOICE_HINT =
	'Install the voice stack to enable voice features: npm install @discordjs/voice prism-media opusscript ws'
/** Installation instructions for prism-media. */
const PRISM_HINT = 'Install the voice stack to enable voice features: npm install prism-media'
/** Installation instructions for ws. */
const WS_HINT = 'Install ws to enable realtime voice streaming: npm install ws'

/** Lazy loader for @discordjs/voice. */
const discordVoiceLoader = createOptionalLoader(
	() => import(/* webpackIgnore: true */ '@discordjs/voice'),
	'@discordjs/voice',
	VOICE_HINT
)

/** Lazy loader for prism-media. */
const prismLoader = createOptionalLoader(
	() => import(/* webpackIgnore: true */ 'prism-media'),
	'prism-media',
	PRISM_HINT
)

/** Lazy loader for ws. */
const wsLoader = createOptionalLoader(() => import(/* webpackIgnore: true */ 'ws'), 'ws', WS_HINT)

/** @discordjs/voice module type. */
export type DiscordVoiceModule = typeof import('@discordjs/voice')
/** prism-media module type. */
export type PrismMediaModule = typeof import('prism-media')
/** ws module type. */
export type WsModule = typeof import('ws')

/** Loads @discordjs/voice or throws with installation hint if missing. */
export async function loadDiscordVoice(): Promise<DiscordVoiceModule> {
	return discordVoiceLoader.load()
}

/** Attempts to load @discordjs/voice, returning null when unavailable. */
export async function tryLoadDiscordVoice(): Promise<DiscordVoiceModule | null> {
	return discordVoiceLoader.tryLoad()
}

/** Loads prism-media or throws with installation hint if missing. */
export async function loadPrism(): Promise<PrismMediaModule> {
	return prismLoader.load()
}

/** Loads ws or throws with installation hint if missing. */
export async function loadWs(): Promise<WsModule> {
	return wsLoader.load()
}

/** Attempts to load ws, returning null when unavailable. */
export async function tryLoadWs(): Promise<WsModule | null> {
	return wsLoader.tryLoad()
}
