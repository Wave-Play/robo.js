import { FlashcoreFileAdapter } from './flashcore-fs.js'
import { Globals } from './globals.js'
import { logger } from './logger.js'
import type { FlashcoreAdapter } from '../types/index.js'
import type KeyvType from 'keyv'

// Make sure it's initialized just once
let _initialized = false

// Watchers for listening to changes in the store.
const _watchers = new Map<string, Set<WatcherCallback>>()

// Type definitions
interface FlashcoreOptions {
	namespace?: string | Array<string>
}
interface InitFlashcoreOptions {
	adapter?: FlashcoreAdapter
	keyvOptions?: unknown
}
type WatcherCallback<V = unknown> = (oldValue: V, newValue: V) => void | Promise<void>

/**
 * Built-in KV database for long-term storage.
 *
 * ```ts
 * import { Flashcore } from 'robo.js'
 *
 * await Flashcore.set('key', 'value')
 * const value = await Flashcore.get('key')
 * await Flashcore.delete('key')
 * ```
 *
 * Use this to store and retrieve data across sessions. All APIs are asynchronous.
 * Defaults to file-based storage, but can be configured to use other engines using Keyv adapters.
 *
 * [**Learn more:** Flashcore Database](https://robojs.dev/robojs/flashcore)
 */
export const Flashcore = {
	/**
	 * Clears all key-value pairs from the store.
	 *
	 * @returns {Promise<boolean> | boolean} - Resolves to a boolean indicating whether the operation was successful.
	 */
	clear: (): Promise<boolean> | Promise<void> | boolean | void => {
		return Globals.getFlashcoreAdapter().clear()
	},

	/**
	 * Deletes the value associated with a key from the store.
	 *
	 * @param {string} key - The key associated with the value to delete.
	 * @returns {Promise<boolean> | boolean} - Resolves to a boolean indicating whether the operation was successful.
	 */
	delete: (key: string, options?: FlashcoreOptions): Promise<boolean> | boolean => {
		// If a namespace is provided, prepend it to the key
		if (options?.namespace) {
			key = Array.isArray(options.namespace) ? `${options.namespace.join('/')}__${key}` : `${options.namespace}__${key}`
		}

		if (_watchers.has(key)) {
			const oldValue = Globals.getFlashcoreAdapter().get(key)
			if (oldValue instanceof Promise) {
				// Return as promise to avoid race condition fetching the old value.
				// I believe this is ideal, as promise-based values are likely to be used with async/await.
				return oldValue
					.then((oldValue) => {
						_watchers.get(key).forEach((callback) => callback(oldValue, undefined))
					})
					.then(() => Globals.getFlashcoreAdapter().delete(key))
					.catch(() => Globals.getFlashcoreAdapter().delete(key))
			} else {
				_watchers.get(key).forEach((callback) => callback(oldValue, undefined))
			}
		}

		return Globals.getFlashcoreAdapter().delete(key)
	},

	/**
	 * Gets the value associated with a key.
	 *
	 * @template V - The type of the value.
	 * @param {string} key - The key associated with the value.
	 * @returns {Promise<V> | V} - May return a promise you can await or the value directly.
	 */
	get: <V>(key: string, options?: FlashcoreOptions & { default?: unknown }): Promise<V> | V => {
		// If a namespace is provided, prepend it to the key
		if (options?.namespace) {
			key = Array.isArray(options.namespace) ? `${options.namespace.join('/')}__${key}` : `${options.namespace}__${key}`
		}

		return (Globals.getFlashcoreAdapter().get(key) ?? options?.default) as V
	},

	/**
	 * Checks if a key exists in the store.
	 *
	 * @param key - The key to check.
	 * @param options  - Options for the operation.
	 * @returns - A boolean indicating whether the key exists.
	 */
	has: (key: string, options?: FlashcoreOptions): Promise<boolean> | boolean => {
		if (options?.namespace) {
			key = `${options.namespace}__${key}`
		}
		return Globals.getFlashcoreAdapter().has(key)
	},

	/**
	 * Unregisters a callback from a key, so it will no longer be executed when the key's value changes.
	 *
	 * @param {string} key - The key to stop watching.
	 * @param {WatcherCallback} callback - The callback function to remove from the key's watch list.
	 * If no callback is provided, all callbacks associated with the key are removed.
	 */
	off: (key: string, callback?: WatcherCallback, options?: FlashcoreOptions) => {
		// If a namespace is provided, prepend it to the key
		if (options?.namespace) {
			key = Array.isArray(options.namespace) ? `${options.namespace.join('/')}__${key}` : `${options.namespace}__${key}`
		}

		if (_watchers.has(key) && callback) {
			_watchers.get(key)?.delete(callback)

			if (_watchers.get(key)?.size === 0) {
				_watchers.delete(key)
			}
		} else if (_watchers.has(key)) {
			_watchers.delete(key)
		}
	},

	/**
	 * Registers a callback to be executed when a specific key's value changes in the store.
	 *
	 * @template V - The type of the value.
	 * @param {string} key - The key to watch for changes.
	 * @param {WatcherCallback} callback - The callback function to execute when the key's value changes.
	 * The callback receives the new and old values as arguments.
	 */
	on: (key: string, callback: WatcherCallback, options?: FlashcoreOptions) => {
		// If a namespace is provided, prepend it to the key
		if (options?.namespace) {
			key = Array.isArray(options.namespace) ? `${options.namespace.join('/')}__${key}` : `${options.namespace}__${key}`
		}

		if (!_watchers.has(key)) {
			_watchers.set(key, new Set())
		}

		_watchers.get(key)?.add(callback)
	},

	/**
	 * Sets a key-value pair in the store.
	 *
	 * @template V - The type of the value.
	 * @param {string} key - The key to associate with the value.
	 * @param {V} value - The value to set.
	 * @returns {Promise<boolean> | boolean} - Resolves to a boolean indicating whether the operation was successful.
	 */
	set: <V>(key: string, value: V, options?: FlashcoreOptions): Promise<boolean> | boolean => {
		// If a namespace is provided, prepend it to the key
		if (options?.namespace) {
			key = Array.isArray(options.namespace) ? `${options.namespace.join('/')}__${key}` : `${options.namespace}__${key}`
		}

		if (_watchers.has(key) || typeof value === 'function') {
			// Fetch the old value only when necessary for minimal overhead
			const oldValue: unknown = Globals.getFlashcoreAdapter().get(key)

			const setValue = async (resolvedOldValue: V) => {
				let newValue = value

				// If value is an updater function, use it to compute the new value based on the old value
				if (typeof value === 'function') {
					newValue = (value as (oldValue: V) => V)(resolvedOldValue as V)
				}

				// Run the watcher callbacks if any are set for this key
				if (_watchers.has(key)) {
					_watchers.get(key).forEach((callback) => callback(resolvedOldValue, newValue))
				}

				// Set the new value in the adapter
				return Globals.getFlashcoreAdapter().set(key, newValue)
			}

			// If the old value is a promise, wait for it to resolve before proceeding
			if (oldValue instanceof Promise) {
				// Return as promise to avoid race condition fetching the old value.
				// I believe this is ideal, as promise-based values are likely to be used with async/await.
				return oldValue
					.then(async (resolvedOldValue) => await setValue(resolvedOldValue))
					.catch(() => Globals.getFlashcoreAdapter().set(key, value)) // Fallback to set the value directly in case of an error
			} else {
				return setValue(oldValue as V)
			}
		}

		return Globals.getFlashcoreAdapter().set(key, value)
	},

	/**
	 * Prepares Flashcore for usage.
	 * This must be called before using any other Flashcore functions.
	 *
	 * Can only be called once per process.
	 *
	 * @param options - Options for initializing Flashcore, such as custom adapters.
	 */
	$init: async (options: InitFlashcoreOptions) => {
		const { keyvOptions } = options
		logger.debug('Initializing Flashcore with options:', options)

		// Prevent multiple initializations
		if (_initialized) {
			logger.debug('Flashcore has already been initialized. Ignoring...')
			return
		}

		try {
			if (keyvOptions) {
				let Keyv: typeof KeyvType
				try {
					Keyv = (await import('keyv')).default
				} catch (error) {
					throw new Error('Failed to import Keyv. Did you remember to install `keyv`?', { cause: error })
				}
				const keyv = new Keyv(keyvOptions)

				keyv.on('error', (error: unknown) => {
					logger.error(`Keyv error:`, error)
				})
				Globals.registerFlashcore(keyv)
			} else {
				const adapter = options.adapter ?? new FlashcoreFileAdapter()
				await adapter.init()
				Globals.registerFlashcore(adapter)
			}
		} catch (error) {
			logger.error('Failed to initialize Flashcore:', error)
			throw new Error('Failed to initialize Flashcore', { cause: error })
		}

		_initialized = true
	}
}
