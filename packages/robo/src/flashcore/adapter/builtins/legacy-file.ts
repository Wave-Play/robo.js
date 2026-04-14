/**
 * Flashcore v1 Legacy File Adapter (spec rev 4.3)
 *
 * Wraps the existing .robo/data hashed-file storage for backward compatibility.
 * Uses SHA256 hashing for filenames, which means keys are NOT enumerable.
 *
 * This adapter is used to maintain access to existing Robo.js Flashcore data
 * after upgrading to Flashcore v1.
 */

import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import zlib from 'node:zlib'
import type { FlashcoreAdapter } from '../types.js'
import { DataCorruptionError } from '../../core/errors.js'

const gzipAsync = promisify(zlib.gzip)
const gunzipAsync = promisify(zlib.gunzip)

export interface LegacyFileAdapterOptions {
	/**
	 * Directory for data storage.
	 * Default: `${process.cwd()}/.robo/data`
	 */
	dataDir?: string
}

/**
 * Legacy file adapter for backward compatibility with existing .robo/data stores.
 *
 * Key characteristics:
 * - Filenames are SHA256 hashes of keys (not reversible)
 * - Values are gzip-compressed JSON
 * - No scan capability (keys are not enumerable)
 * - Fixes the `has()` truthiness bug from the original implementation
 *
 * Use this adapter to preserve access to existing Flashcore data.
 * For new projects, consider using a v1 adapter with deterministic key storage.
 */
export class LegacyFileAdapter<K = string, V = unknown> implements FlashcoreAdapter<K, V> {
	readonly name = 'LegacyFileAdapter'
	readonly dataDir: string

	constructor(options: LegacyFileAdapterOptions = {}) {
		this.dataDir = options.dataDir ?? path.join(process.cwd(), '.robo', 'data')
	}

	// ─────────────────────────────────────────────────────────────
	// Required Methods
	// ─────────────────────────────────────────────────────────────

	async get(key: K): Promise<V | undefined> {
		try {
			const fileName = this.getFilePath(key)
			const compressed = await fs.readFile(fileName)
			try {
				const decompressed = await gunzipAsync(Uint8Array.from(compressed))
				return JSON.parse(decompressed.toString('utf-8')) as V
			} catch (error) {
				throw new DataCorruptionError(
					`Legacy Flashcore data for key "${String(key)}" is corrupted.`,
					{
						structure: 'chunk',
						repairGuidance: 'Restore the legacy .robo/data backup before retrying migration.',
						cause: error instanceof Error ? error : new Error(String(error))
					}
				)
			}
		} catch (e) {
			// Missing key
			if (this.isNodeError(e) && e.code === 'ENOENT') {
				return undefined
			}
			// Corruption or IO errors should surface so callers can handle appropriately.
			throw e
		}
	}

	async set(key: K, value: V): Promise<boolean> {
		const fileName = this.getFilePath(key)
		const tempPath = `${fileName}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`

		const json = JSON.stringify(value)
		const compressed = await gzipAsync(json)

		try {
			await fs.mkdir(this.dataDir, { recursive: true })

			// Atomic write: temp file + rename.
			const handle = await fs.open(tempPath, 'w')
			try {
				await handle.writeFile(Uint8Array.from(compressed))
				await handle.sync()
			} finally {
				await handle.close()
			}

			await fs.rename(tempPath, fileName)
			await this.fsyncDirectory(this.dataDir)
			return true
		} catch (e) {
			// Clean up temp file on failure
			try {
				await fs.unlink(tempPath)
			} catch {
				// Ignore cleanup errors
			}
			throw e
		}
	}

	async delete(key: K): Promise<boolean> {
		try {
			const fileName = this.getFilePath(key)
			await fs.unlink(fileName)
			return true
		} catch (e) {
			// ENOENT means key doesn't exist (normal case)
			if (this.isNodeError(e) && e.code === 'ENOENT') {
				return false
			}
			throw e
		}
	}

	/**
	 * Check if a key exists.
	 *
	 * FIXED: Unlike the original implementation which used `!!get()`,
	 * this properly checks file existence to handle falsy stored values.
	 */
	async has(key: K): Promise<boolean> {
		try {
			const fileName = this.getFilePath(key)
			await fs.access(fileName)
			return true
		} catch {
			return false
		}
	}

	async clear(): Promise<boolean> {
		try {
			await fs.rm(this.dataDir, { recursive: true, force: true })
			await fs.mkdir(this.dataDir, { recursive: true })
			return true
		} catch (e) {
			throw e
		}
	}

	// ─────────────────────────────────────────────────────────────
	// Optional Lifecycle
	// ─────────────────────────────────────────────────────────────

	async init(): Promise<void> {
		try {
			await fs.mkdir(this.dataDir, { recursive: true })
		} catch (e) {
			throw new Error(`Failed to create data directory for LegacyFileAdapter: ${e}`)
		}
	}

	// ─────────────────────────────────────────────────────────────
	// NOTE: No scan capability
	// ─────────────────────────────────────────────────────────────
	//
	// Legacy file adapter uses SHA256 hashed filenames, which means:
	// - Keys cannot be recovered from filenames
	// - Prefix-based scanning is not possible
	// - WAL recovery is NOT available with this adapter
	//
	// If you need scan capability, migrate to a v1 file adapter.
	// ─────────────────────────────────────────────────────────────

	// ─────────────────────────────────────────────────────────────
	// Private Helpers
	// ─────────────────────────────────────────────────────────────

	/**
	 * Get the file path for a key using SHA256 hash.
	 */
	private getFilePath(key: K): string {
		const hash = createHash('sha256').update(String(key)).digest('hex')
		return path.join(this.dataDir, hash)
	}

	/**
	 * Type guard for Node.js errors with code property.
	 */
	private isNodeError(error: unknown): error is NodeJS.ErrnoException {
		return (
			typeof error === 'object' &&
			error !== null &&
			'code' in error &&
			typeof (error as { code?: unknown }).code === 'string'
		)
	}

	private async fsyncDirectory(dir: string): Promise<void> {
		try {
			const handle = await fs.open(dir, 'r')
			try {
				await handle.sync()
			} finally {
				await handle.close()
			}
		} catch {
			// Best-effort only.
		}
	}
}

/**
 * Create a new LegacyFileAdapter instance.
 */
export function createLegacyFileAdapter<K = string, V = unknown>(
	options?: LegacyFileAdapterOptions
): LegacyFileAdapter<K, V> {
	return new LegacyFileAdapter<K, V>(options)
}
