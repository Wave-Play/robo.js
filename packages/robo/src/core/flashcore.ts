import { getConfig } from './config.js'
import { FlashcoreFileAdapter } from './flashcore-fs.js'
import { logger } from './logger.js'
import type { FlashcoreAdapter } from '../types/index.js'

let _adapter: FlashcoreAdapter | undefined

export const Flashcore = {
	/**
	 * Clears all key-value pairs from the store.
	 *
	 * @returns {Promise<boolean> | boolean} - Resolves to a boolean indicating whether the operation was successful.
	 */
	clear: (): Promise<boolean> | Promise<void> | boolean | void => {
		return _adapter.clear()
	},

	/**
	 * Deletes the value associated with a key from the store.
	 *
	 * @param {string} key - The key associated with the value to delete.
	 * @returns {Promise<boolean> | boolean} - Resolves to a boolean indicating whether the operation was successful.
	 */
	delete: (key: string): Promise<boolean> | boolean => {
		return _adapter.delete(key)
	},

	/**
	 * Gets the value associated with a key.
	 *
	 * @template V - The type of the value.
	 * @param {string} key - The key associated with the value.
	 * @returns {Promise<V> | V} - May return a promise you can await or the value directly.
	 */
	get: <V>(key: string): Promise<V> | V => {
		return _adapter.get(key) as V
	},

	/**
	 * Sets a key-value pair in the store.
	 *
	 * @template V - The type of the value.
	 * @param {string} key - The key to associate with the value.
	 * @param {V} value - The value to set.
	 * @returns {Promise<boolean> | boolean} - Resolves to a boolean indicating whether the operation was successful.
	 */
	set: <V>(key: string, value: V): Promise<boolean> | boolean => {
		return _adapter.set(key, value)
	}
}

export async function prepareFlashcore() {
	const config = getConfig()
	if (config.flashcore?.keyv) {
		try {
			logger.debug(`Using Keyv Flashcore adapter`)
			const Keyv = (await import('keyv')).default
			const keyv = new Keyv(config.flashcore.keyv)
			keyv.on('error', (error) => {
				logger.error(`Keyv error:`, error)
			})
			_adapter = keyv
		} catch (error) {
			logger.error(error)
			throw new Error('Failed to import or setup the adapter with keyv package.')
		}
	} else {
		_adapter = new FlashcoreFileAdapter()
		await (_adapter as FlashcoreFileAdapter).init()
	}
}
