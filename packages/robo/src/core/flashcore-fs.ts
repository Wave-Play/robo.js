import fs from 'node:fs/promises'
import path from 'node:path'
import { createReadStream, createWriteStream } from 'node:fs'
import { logger } from './logger.js'
import type { FlashcoreAdapter } from '../types/index.js'

interface FlashcoreFileAdapterOptions {
	dataDir?: string
}

export class FlashcoreFileAdapter<K = string, V = unknown> implements FlashcoreAdapter<K, V> {
	public readonly dataDir: string

	constructor(options: FlashcoreFileAdapterOptions = {}) {
		this.dataDir = options.dataDir ?? path.join(process.cwd(), '.robo', 'data')
	}

	public async clear(): Promise<boolean> {
		try {
			await fs.rm(this.dataDir, { recursive: true, force: true })
			await fs.mkdir(this.dataDir, { recursive: true })
			return true
		} catch {
			return false
		}
	}

	public async delete(key: K): Promise<boolean> {
		try {
			const fileName = path.join(this.dataDir, await _getSafeKey(key))
			await fs.unlink(fileName)
			return true
		} catch (e) {
			// Warn about failures except ENOENT because that just means the key doesn't exist (normal)
			if (e && typeof e === 'object' && 'code' in e && (e as { code: unknown }).code !== 'ENOENT') {
				logger.warn(`Failed to delete key "${key}" from Flashcore file adapter.`, e)
			}

			return false
		}
	}

	public async get(key: K): Promise<V | undefined> {
		try {
			const zlib = await import('node:zlib')
			const { pipeline } = await import('node:stream/promises')
			const fileName = path.join(this.dataDir, await _getSafeKey(key))
			const gunzip = zlib.createGunzip()
			await pipeline(createReadStream(fileName), gunzip)
			const decompressed = gunzip.read()
			return decompressed ? (JSON.parse(decompressed.toString()) as V) : undefined
		} catch {
			return undefined
		}
	}

	public async has(key: K): Promise<boolean> {
		return !!(await this.get(key))
	}

	public async init() {
		try {
			await fs.mkdir(this.dataDir, { recursive: true })
		} catch (e) {
			logger.error('Failed to create data directory for Flashcore file adapter.', e)
		}
	}

	public async set(key: K, value: V): Promise<boolean> {
		try {
			const zlib = await import('node:zlib')
			const { pipeline } = await import('node:stream/promises')
			const fileName = path.join(this.dataDir, await _getSafeKey(key))
			const gzip = zlib.createGzip()
			gzip.write(JSON.stringify(value))
			gzip.end()
			await pipeline(gzip, createWriteStream(fileName))
			return true
		} catch {
			return false
		}
	}
}

async function _getSafeKey<K>(key: K): Promise<string> {
	const { createHash } = await import('node:crypto')
	return createHash('sha256').update(key.toString()).digest('hex')
}
