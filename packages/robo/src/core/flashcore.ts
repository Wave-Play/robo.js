import { getConfig } from './config.js'
import { FlashcoreFileAdapter } from './flashcore-fs.js'
import { Globals } from './globals.js'
import { logger } from './logger.js'

type WatcherCallback<V = unknown> = (oldValue: V, newValue: V) => void | Promise<void>

// Watchers for listening to changes in the store.
const _watchers = new Map<string, Set<WatcherCallback>>()

interface FlashcoreOptions {
	namespace?: string | Array<string>
}

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
	}
}

export async function prepareFlashcore() {
	const config = getConfig()

	if (config.flashcore?.keyv) {
		try {
			logger.debug(`Using Keyv Flashcore adapter`)
			const Keyv = (await import('keyv')).default
			const keyv = new Keyv(config.flashcore.keyv)

			keyv.on('error', (error: unknown) => {
				logger.error(`Keyv error:`, error)
			})
			Globals.registerFlashcore(keyv)
		} catch (error) {
			logger.error(error)
			throw new Error('Failed to import or setup the adapter with keyv package.')
		}
	} else {
		Globals.registerFlashcore(new FlashcoreFileAdapter())
		await Globals.getFlashcoreAdapter().init()
	}
}
