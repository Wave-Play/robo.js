import fs from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import zlib from 'node:zlib'
import { createReadStream, createWriteStream } from 'node:fs'
import { logger } from './logger.js'
import { hasProperties } from '../cli/utils/utils.js'
import { createHash } from 'node:crypto'
import type { FlashcoreAdapter } from '../types/index.js'

export class FlashcoreFileAdapter<K = string, V = unknown> implements FlashcoreAdapter<K, V> {
	private static DATA_DIR = path.join(process.cwd(), '.robo', 'data')

	async clear(): Promise<boolean> {
		try {
			await fs.rm(FlashcoreFileAdapter.DATA_DIR, { recursive: true, force: true })
			await fs.mkdir(FlashcoreFileAdapter.DATA_DIR, { recursive: true })
			return true
		} catch {
			return false
		}
	}

	async delete(key: K): Promise<boolean> {
		try {
			const fileName = path.join(FlashcoreFileAdapter.DATA_DIR, this._getSafeKey(key))
			await fs.unlink(fileName)
			return true
		} catch (e) {
			// Warn about failures except ENOENT because that just means the key doesn't exist (normal)
			if (hasProperties<{ code: unknown }>(e, ['code']) && e.code !== 'ENOENT') {
				logger.warn(`Failed to delete key "${key}" from Flashcore file adapter.`, e)
			}

			return false
		}
	}

	async get(key: K): Promise<V | undefined> {
		try {
			const fileName = path.join(FlashcoreFileAdapter.DATA_DIR, this._getSafeKey(key))
			const gunzip = zlib.createGunzip()
			await pipeline(createReadStream(fileName), gunzip)
			const decompressed = gunzip.read()
			return decompressed ? (JSON.parse(decompressed.toString()) as V) : undefined
		} catch {
			return undefined
		}
	}

	async has(key: K): Promise<boolean> {
		return !!(await this.get(key))
	}

	async init() {
		try {
			await fs.mkdir(FlashcoreFileAdapter.DATA_DIR, { recursive: true })
		} catch (e) {
			logger.error('Failed to create data directory for Flashcore file adapter.', e)
		}
	}

	async set(key: K, value: V): Promise<boolean> {
		try {
			const fileName = path.join(FlashcoreFileAdapter.DATA_DIR, this._getSafeKey(key))
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
