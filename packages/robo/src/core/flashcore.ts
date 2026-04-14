import { access, cp, mkdir, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import {
	Flashcore as V1Flashcore,
	FlashcoreSystem,
	FileAdapter,
	LegacyFileAdapter,
	createKeyvAdapterFromOptions,
	type FlashcoreAdapter,
	type FlashcoreKVOptions,
	type FlashcoreGetOptions,
	type WatcherCallback,
	type BatchOperation,
	type AdapterCapabilitiesReport
} from '../flashcore/index.js'
import { DataCorruptionError, MigrationError } from '../flashcore/core/errors.js'
import { logger } from './logger.js'

interface FlashcoreOptions {
	namespace?: string | Array<string>
}

interface InitFlashcoreOptions {
	adapter?: FlashcoreAdapter
	keyvOptions?: unknown
	namespaceSeparator?: string
}

interface RuntimeMigrationMetadata {
	version: 1
	mode: 'idle' | 'lazy-read-through'
	legacyDataDir: string
	fileBaseDir: string
	backupDir?: string
	backupCreatedAt?: string
	lastMigratedAt?: string
	legacyFallbackDisabled?: boolean
	totalLegacyKeys?: number
	migratedKeys?: number
}

const DEFAULT_FILE_DIR = path.join(process.cwd(), '.robo', 'flashcore')
const DEFAULT_LEGACY_DIR = path.join(process.cwd(), '.robo', 'data')
const DEFAULT_BACKUP_DIR = path.join(process.cwd(), '.robo', 'flashcore-backups')
const MIGRATION_METADATA_KEY = '_flashcore:migration:metadata'
const LEGACY_CLEAR_MARKER_KEY = '_flashcore:migration:legacy-disabled'
const LEGACY_TOMBSTONE_PREFIX = '_flashcore:migration:tombstone:'

class SimpleAsyncMutex {
	private locked = false
	private queue: Array<() => void> = []

	async withLock<T>(fn: () => Promise<T>): Promise<T> {
		if (!this.locked) {
			this.locked = true
		} else {
			await new Promise<void>((resolve) => this.queue.push(resolve))
		}
		try {
			return await fn()
		} finally {
			if (this.queue.length > 0) {
				const next = this.queue.shift()
				next?.()
			} else {
				this.locked = false
			}
		}
	}
}

/** @internal Exported for testing only. Not part of the public API. */
export class RuntimeMigrationAdapter implements FlashcoreAdapter<string, unknown> {
	readonly name = 'RuntimeMigrationAdapter'

	private readonly fileAdapter: FileAdapter<string, unknown>
	private readonly legacyAdapter: LegacyFileAdapter<string, unknown>
	private readonly fileBaseDir: string
	private readonly legacyDataDir: string
	private readonly metadataLock = new SimpleAsyncMutex()
	private migrationEnabled = false
	private legacyFallbackDisabled = false
	private totalLegacyKeys = 0
	private migratedKeys = 0

	constructor(fileBaseDir = DEFAULT_FILE_DIR, legacyDataDir = DEFAULT_LEGACY_DIR) {
		this.fileBaseDir = fileBaseDir
		this.legacyDataDir = legacyDataDir
		this.fileAdapter = new FileAdapter({ baseDir: fileBaseDir })
		this.legacyAdapter = new LegacyFileAdapter({ dataDir: legacyDataDir })
	}

	async init(): Promise<void> {
		await this.fileAdapter.init?.()

		const legacyFileCount = await this.countLegacyFiles()
		if (legacyFileCount === 0) {
			await this.writeMetadata({
				version: 1,
				mode: 'idle',
				legacyDataDir: this.legacyDataDir,
				fileBaseDir: this.fileBaseDir,
				totalLegacyKeys: 0,
				migratedKeys: 0
			})
			return
		}

		const fileStoreEntryCount = await this.countDirectoryEntries(this.fileBaseDir)
		if (fileStoreEntryCount === 0) {
			this.totalLegacyKeys = legacyFileCount
			this.migratedKeys = 0

			const backupDir = path.join(
				DEFAULT_BACKUP_DIR,
				`legacy-${new Date().toISOString().replace(/[:.]/g, '-')}`
			)

			await mkdir(path.dirname(backupDir), { recursive: true })
			try {
				await cp(this.legacyDataDir, backupDir, { recursive: true, errorOnExist: true, force: false })
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === 'ERR_FS_CP_EEXIST') {
					await rm(backupDir, { recursive: true, force: true })
					await cp(this.legacyDataDir, backupDir, { recursive: true })
				} else {
					throw error
				}
			}

			await this.writeMetadata({
				version: 1,
				mode: 'lazy-read-through',
				legacyDataDir: this.legacyDataDir,
				fileBaseDir: this.fileBaseDir,
				backupDir,
				backupCreatedAt: new Date().toISOString(),
				totalLegacyKeys: this.totalLegacyKeys,
				migratedKeys: 0
			})
			this.migrationEnabled = true
			logger.info(`Legacy migration: ${this.totalLegacyKeys} keys to migrate from .robo/data/`)
			return
		}

		const metadata = await this.fileAdapter.get(MIGRATION_METADATA_KEY) as RuntimeMigrationMetadata | undefined
		this.migrationEnabled = metadata?.mode === 'lazy-read-through'
		this.legacyFallbackDisabled = Boolean(metadata?.legacyFallbackDisabled)
		this.totalLegacyKeys = metadata?.totalLegacyKeys ?? 0
		this.migratedKeys = metadata?.migratedKeys ?? 0

		if (this.migrationEnabled && this.totalLegacyKeys > 0 && this.migratedKeys >= this.totalLegacyKeys) {
			await this.completeMigration()
		}
	}

	async shutdown(): Promise<void> {
		await this.fileAdapter.shutdown?.()
	}

	async get(key: string): Promise<unknown> {
		if (await this.fileAdapter.has(this.tombstoneKey(key))) {
			return undefined
		}

		const current = await this.fileAdapter.get(key)
		if (current !== undefined) {
			return current
		}

		if (!this.migrationEnabled || this.legacyFallbackDisabled) {
			return undefined
		}

		const legacyValue = await this.legacyAdapter.get(key)
		if (legacyValue === undefined) {
			return undefined
		}

		try {
			await this.fileAdapter.set(key, legacyValue)
			this.migratedKeys++
			await this.writeMetadata({
				lastMigratedAt: new Date().toISOString(),
				migratedKeys: this.migratedKeys
			})
			if (this.totalLegacyKeys > 0 && this.migratedKeys >= this.totalLegacyKeys) {
				await this.completeMigration()
			}
			return legacyValue
		} catch (error) {
			throw new MigrationError(
				`Failed to persist lazily migrated Flashcore key "${key}" into ${this.fileBaseDir}.`,
				{
					phase: 'up',
					cause: error instanceof Error ? error : new Error(String(error))
				}
			)
		}
	}

	async set(key: string, value: unknown): Promise<boolean> {
		const tombstone = this.tombstoneKey(key)
		const hadTombstone = await this.fileAdapter.has(tombstone)
		if (hadTombstone) {
			await this.fileAdapter.delete(tombstone)
		}
		try {
			return await this.fileAdapter.set(key, value)
		} catch (error) {
			if (hadTombstone) {
				await this.fileAdapter.set(tombstone, true).catch((restoreErr) => {
					logger.error(`Failed to restore tombstone for key "${key}" after set() failure. Legacy key may be resurrected on next read.`, restoreErr)
				})
			}
			throw error
		}
	}

	async delete(key: string): Promise<boolean> {
		const [primaryDeleted, legacyExists] = await Promise.all([
			this.fileAdapter.delete(key),
			this.migrationEnabled && !this.legacyFallbackDisabled ? this.legacyAdapter.has(key) : Promise.resolve(false)
		])

		if (this.migrationEnabled && !this.legacyFallbackDisabled && legacyExists) {
			await this.fileAdapter.set(this.tombstoneKey(key), true)
			if (!primaryDeleted) {
				this.migratedKeys++
				await this.writeMetadata({ migratedKeys: this.migratedKeys })
				if (this.totalLegacyKeys > 0 && this.migratedKeys >= this.totalLegacyKeys) {
					await this.completeMigration()
				}
			}
		}

		return primaryDeleted || legacyExists
	}

	async has(key: string): Promise<boolean> {
		if (await this.fileAdapter.has(this.tombstoneKey(key))) {
			return false
		}

		if (await this.fileAdapter.has(key)) {
			return true
		}

		if (!this.migrationEnabled || this.legacyFallbackDisabled) {
			return false
		}

		return this.legacyAdapter.has(key)
	}

	async clear(): Promise<void> {
		await this.fileAdapter.clear()
		if (this.migrationEnabled) {
			this.migrationEnabled = false
			this.legacyFallbackDisabled = true
			this.migratedKeys = this.totalLegacyKeys
			await this.fileAdapter.set(LEGACY_CLEAR_MARKER_KEY, true)
			await this.writeMetadata({
				mode: 'idle',
				legacyFallbackDisabled: true,
				migratedKeys: this.totalLegacyKeys
			})
			logger.info(`Legacy migration complete: ${this.migratedKeys}/${this.totalLegacyKeys} keys migrated`)
		}
	}

	async scan(prefix: string): Promise<string[]> {
		if (this.migrationEnabled && !this.legacyFallbackDisabled) {
			logger.warn('scan() during migration may return incomplete results -- legacy keys are not enumerable')
		}
		return this.fileAdapter.scan?.(prefix) ?? []
	}

	async setIfNotExists(key: string, value: unknown): Promise<boolean> {
		// If tombstoned, the key is logically absent — clear tombstone and create
		const tombstone = this.tombstoneKey(key)
		if (await this.fileAdapter.has(tombstone)) {
			await this.fileAdapter.delete(tombstone)
			try {
				return await this.fileAdapter.setIfNotExists(key, value)
			} catch (error) {
				// Restore tombstone to prevent resurrection of deleted legacy key
				await this.fileAdapter.set(tombstone, true).catch((restoreErr) => {
					logger.error(`Failed to restore tombstone for key "${key}" after setIfNotExists() failure. Legacy key may be resurrected on next read.`, restoreErr)
				})
				throw error
			}
		}

		// If key exists in legacy store, it's logically present
		if (this.migrationEnabled && !this.legacyFallbackDisabled) {
			if (await this.legacyAdapter.has(key)) {
				return false
			}
		}

		// Delegate to file adapter for atomic O_EXCL creation
		return this.fileAdapter.setIfNotExists(key, value)
	}

	async atomicBatch(ops: BatchOperation<string, unknown>[]): Promise<void> {
		if (ops.length === 0) return

		const expandedOps: BatchOperation<string, unknown>[] = []

		for (const op of ops) {
			if (op.type === 'set') {
				// Clear any tombstone for this key, then set
				expandedOps.push({ type: 'delete', key: this.tombstoneKey(op.key) })
				expandedOps.push(op)
			} else if (op.type === 'delete') {
				expandedOps.push(op)
				// Eagerly create tombstone during migration (no legacy check
				// to avoid breaking atomicity — extra tombstones are harmless)
				if (this.migrationEnabled && !this.legacyFallbackDisabled) {
					expandedOps.push({ type: 'set', key: this.tombstoneKey(op.key), value: true })
				}
			} else {
				// 'check' passes through unchanged
				expandedOps.push(op)
			}
		}

		await this.fileAdapter.atomicBatch(expandedOps)
	}

	capabilities(): AdapterCapabilitiesReport {
		return this.fileAdapter.capabilities()
	}

	private async writeMetadata(patch: Partial<RuntimeMigrationMetadata>): Promise<void> {
		await this.metadataLock.withLock(async () => {
			const current = await this.fileAdapter.get(MIGRATION_METADATA_KEY) as RuntimeMigrationMetadata | undefined
			const next: RuntimeMigrationMetadata = {
				...current,
				version: 1,
				mode: this.migrationEnabled ? 'lazy-read-through' : 'idle',
				legacyDataDir: this.legacyDataDir,
				fileBaseDir: this.fileBaseDir,
				legacyFallbackDisabled: this.legacyFallbackDisabled,
				totalLegacyKeys: this.totalLegacyKeys,
				migratedKeys: this.migratedKeys,
				...patch
			}

			this.legacyFallbackDisabled = Boolean(next.legacyFallbackDisabled)
			await this.fileAdapter.set(MIGRATION_METADATA_KEY, next)
		})
	}

	private tombstoneKey(key: string): string {
		return `${LEGACY_TOMBSTONE_PREFIX}${Buffer.from(key, 'utf-8').toString('base64url')}`
	}

	private async countDirectoryEntries(dir: string): Promise<number> {
		try {
			await access(dir)
			const entries = await readdir(dir)
			return entries.length
		} catch {
			return 0
		}
	}

	private async countLegacyFiles(): Promise<number> {
		try {
			await access(this.legacyDataDir)
			const entries = await readdir(this.legacyDataDir)
			return entries.filter((e) => /^[a-f0-9]{64}$/i.test(e)).length
		} catch {
			return 0
		}
	}

	private async completeMigration(): Promise<void> {
		this.migrationEnabled = false
		await this.writeMetadata({ mode: 'idle' })
		logger.info(`Legacy migration complete: ${this.migratedKeys}/${this.totalLegacyKeys} keys migrated`)
	}
}

/**
 * Built-in KV database for long-term storage.
 *
 * Root `robo.js` keeps the historical API surface, but is now backed by the
 * v1 Flashcore client and a persistent file-backed adapter by default.
 */
export const Flashcore = {
	$: new Proxy(V1Flashcore.$, {
		get(target, prop, receiver) {
			if (prop === 'init') {
				return (options?: InitFlashcoreOptions) => Flashcore.$init(options)
			}

			return Reflect.get(target, prop, receiver)
		}
	}),

	clear: () => V1Flashcore.clear(),

	delete: (key: string, options?: FlashcoreOptions) => {
		return V1Flashcore.delete(key, options as FlashcoreKVOptions | undefined)
	},

	get: <V>(key: string, options?: FlashcoreOptions & { default?: unknown }) => {
		return V1Flashcore.get<V>(key, options as FlashcoreGetOptions | undefined)
	},

	has: (key: string, options?: FlashcoreOptions) => {
		return V1Flashcore.has(key, options as FlashcoreKVOptions | undefined)
	},

	off: (key: string, callback?: WatcherCallback, options?: FlashcoreOptions) => {
		V1Flashcore.off(key, callback, options as FlashcoreKVOptions | undefined)
	},

	on: (key: string, callback: WatcherCallback, options?: FlashcoreOptions) => {
		V1Flashcore.on(key, callback, options as FlashcoreKVOptions | undefined)
	},

	set: <V>(key: string, value: V | ((oldValue: V | undefined) => V), options?: FlashcoreOptions) => {
		return V1Flashcore.set(key, value, options as FlashcoreKVOptions | undefined)
	},

	$init: async (options: InitFlashcoreOptions = {}) => {
		if (FlashcoreSystem.isInitialized) {
			logger.debug('Flashcore has already been initialized. Ignoring...')
			return
		}

		try {
			const adapter = await resolveAdapter(options)
			await FlashcoreSystem.init({
				adapter,
				namespaceSeparator: options.namespaceSeparator,
				kvReadPreference: 'legacy',
				kvWriteMode: options.keyvOptions ? 'legacy' : 'dual'
			})
		} catch (error) {
			logger.error('Failed to initialize Flashcore:', error)

			if (error instanceof DataCorruptionError) {
				throw error
			}

			throw new Error('Failed to initialize Flashcore', { cause: error })
		}
	}
}

async function resolveAdapter(options: InitFlashcoreOptions): Promise<FlashcoreAdapter> {
	if (options.adapter) {
		return options.adapter
	}

	if (options.keyvOptions) {
		return createKeyvAdapterFromOptions(options.keyvOptions)
	}

	return new RuntimeMigrationAdapter()
}
