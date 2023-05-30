import fs from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import zlib from 'node:zlib'
import { createReadStream, createWriteStream } from 'node:fs'
import { getConfig } from './config.js'
import { logger } from './logger.js'
import { createHash } from 'node:crypto'
import type { FlashcoreAdapter } from '../types/index.js'

let _adapter: FlashcoreAdapter | undefined

export const Flashcore = {
	/**
	 * Clears all key-value pairs from the store.
	 *
	 * @returns {Promise<boolean> | boolean} - Resolves to a boolean indicating whether the operation was successful.
	 */
	clear: (): Promise<boolean> | boolean => {
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
	if (config.flashcore?.adapter) {
		try {
			// @ts-expect-error - This is a dynamic peer import
			const Keyv = (await import('keyv')).default
			const Adapter = await import(config.flashcore?.adapter)
			_adapter = new Keyv({ store: new Adapter() })
		} catch (error) {
			throw new Error('Failed to import or setup the adapter with keyv package.')
		}
	} else {
		_adapter = new FileAdapter()
		await _adapter.init()
	}
}

class FileAdapter<K = string, V = unknown> implements FlashcoreAdapter<K, V> {
	private static DATA_DIR = path.join(process.cwd(), '.robo', 'data')

	async clear(): Promise<boolean> {
		try {
			await fs.rm(FileAdapter.DATA_DIR, { recursive: true, force: true })
			await fs.mkdir(FileAdapter.DATA_DIR, { recursive: true })
			return true
		} catch {
			return false
		}
	}

	async delete(key: K): Promise<boolean> {
		try {
			const fileName = path.join(FileAdapter.DATA_DIR, key.toString())
			await fs.unlink(fileName)
			return true
		} catch {
			return false
		}
	}

	async get(key: K): Promise<V | undefined> {
		try {
			const fileName = path.join(FileAdapter.DATA_DIR, this._getSafeKey(key))
			const gunzip = zlib.createGunzip()
			await pipeline(createReadStream(fileName), gunzip)
			const decompressed = gunzip.read()
			return decompressed ? (JSON.parse(decompressed.toString()) as V) : undefined
		} catch {
			return undefined
		}
	}

	async init() {
		try {
			await fs.mkdir(FileAdapter.DATA_DIR, { recursive: true })
		} catch (e) {
			logger.error('Failed to create data directory for Flashcore file adapter.', e)
		}
	}

	async set(key: K, value: V): Promise<boolean> {
		try {
			const fileName = path.join(FileAdapter.DATA_DIR, this._getSafeKey(key))
			const gzip = zlib.createGzip()
			gzip.write(JSON.stringify(value))
			gzip.end()
			await pipeline(gzip, createWriteStream(fileName))
			return true
		} catch {
			return false
		}
	}

	private _getSafeKey(key: K): string {
		return createHash('sha256').update(key.toString()).digest('hex')
	}
}
