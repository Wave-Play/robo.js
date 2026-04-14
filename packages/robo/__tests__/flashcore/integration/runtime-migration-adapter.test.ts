/**
 * RuntimeMigrationAdapter - Migration Progress Tracking Tests
 *
 * Verifies count-based progress tracking for lazy migration from
 * legacy .robo/data/ (SHA-256 hashed, gzip-compressed) to
 * .robo/flashcore/ (reversible filenames, plain JSON).
 *
 * Setup: seed legacy data via LegacyFileAdapter, read metadata via FileAdapter.
 */

import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'

import { RuntimeMigrationAdapter } from '../../../src/core/flashcore.js'
import { FileAdapter } from '../../../src/flashcore/adapter/builtins/file.js'
import { LegacyFileAdapter } from '../../../src/flashcore/adapter/builtins/legacy-file.js'

const MIGRATION_METADATA_KEY = '_flashcore:migration:metadata'

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

let testBaseDir: string
let legacyDir: string
let flashcoreDir: string

async function seedLegacyKeys(keys: string[], values?: unknown[]): Promise<void> {
	const legacy = new LegacyFileAdapter({ dataDir: legacyDir })
	await legacy.init?.()
	for (let i = 0; i < keys.length; i++) {
		await legacy.set(keys[i], values?.[i] ?? `value-${keys[i]}`)
	}
	await (legacy as unknown as { shutdown?: () => Promise<void> }).shutdown?.()
}

async function readMetadata(): Promise<RuntimeMigrationMetadata | undefined> {
	const reader = new FileAdapter({ baseDir: flashcoreDir })
	await reader.init?.()
	const result = await reader.get(MIGRATION_METADATA_KEY) as RuntimeMigrationMetadata | undefined
	await reader.shutdown?.()
	return result
}

beforeEach(async () => {
	testBaseDir = join(tmpdir(), `rma-test-${Date.now()}-${randomBytes(4).toString('hex')}`)
	legacyDir = join(testBaseDir, 'data')
	flashcoreDir = join(testBaseDir, 'flashcore')
	await mkdir(legacyDir, { recursive: true })
})

afterEach(async () => {
	try {
		await rm(testBaseDir, { recursive: true, force: true })
	} catch {
		// Ignore cleanup errors
	}
})

// ============================================================================
// Initialization Counting
// ============================================================================

describe('Initialization counting', () => {
	it('init() with empty legacy dir sets totalLegacyKeys: 0, mode idle', async () => {
		// Remove the legacy dir so it's empty (mkdir created it but no files)
		const adapter = new RuntimeMigrationAdapter(flashcoreDir, legacyDir)
		await adapter.init()

		const metadata = await readMetadata()
		expect(metadata).toBeDefined()
		expect(metadata!.mode).toBe('idle')
		expect(metadata!.totalLegacyKeys).toBe(0)
		expect(metadata!.migratedKeys).toBe(0)

		await adapter.shutdown()
	})

	it('init() with legacy keys sets totalLegacyKeys and mode lazy-read-through', async () => {
		await seedLegacyKeys(['alpha', 'beta', 'gamma', 'delta', 'epsilon'])

		const adapter = new RuntimeMigrationAdapter(flashcoreDir, legacyDir)
		await adapter.init()

		const metadata = await readMetadata()
		expect(metadata).toBeDefined()
		expect(metadata!.mode).toBe('lazy-read-through')
		expect(metadata!.totalLegacyKeys).toBe(5)
		expect(metadata!.migratedKeys).toBe(0)

		await adapter.shutdown()
	})

	it('init() ignores non-SHA256 files in legacy dir count', async () => {
		await seedLegacyKeys(['key1', 'key2'])

		// Add junk files that should not be counted
		await writeFile(join(legacyDir, '.DS_Store'), 'junk')
		await writeFile(join(legacyDir, 'tempfile.tmp'), 'junk')
		await writeFile(join(legacyDir, 'abc'), 'short name')

		const adapter = new RuntimeMigrationAdapter(flashcoreDir, legacyDir)
		await adapter.init()

		const metadata = await readMetadata()
		expect(metadata!.totalLegacyKeys).toBe(2)

		await adapter.shutdown()
	})

	it('init() resume restores counts from persisted metadata', async () => {
		await seedLegacyKeys(['a', 'b', 'c'])

		// First init
		const adapter1 = new RuntimeMigrationAdapter(flashcoreDir, legacyDir)
		await adapter1.init()
		// Migrate one key
		await adapter1.get('a')
		await adapter1.shutdown()

		// Resume
		const adapter2 = new RuntimeMigrationAdapter(flashcoreDir, legacyDir)
		await adapter2.init()

		const metadata = await readMetadata()
		expect(metadata!.totalLegacyKeys).toBe(3)
		expect(metadata!.migratedKeys).toBe(1)
		expect(metadata!.mode).toBe('lazy-read-through')

		await adapter2.shutdown()
	})

	it('init() resume auto-completes if migratedKeys >= totalLegacyKeys', async () => {
		await seedLegacyKeys(['x', 'y'])

		// First init — migrate all keys
		const adapter1 = new RuntimeMigrationAdapter(flashcoreDir, legacyDir)
		await adapter1.init()
		await adapter1.get('x')
		await adapter1.get('y')
		await adapter1.shutdown()

		// Resume — should auto-complete
		const adapter2 = new RuntimeMigrationAdapter(flashcoreDir, legacyDir)
		await adapter2.init()

		const metadata = await readMetadata()
		expect(metadata!.mode).toBe('idle')
		expect(metadata!.migratedKeys).toBe(2)
		expect(metadata!.totalLegacyKeys).toBe(2)

		await adapter2.shutdown()
	})
})

// ============================================================================
// Progress During get()
// ============================================================================

describe('Progress during get()', () => {
	it('get() increments migratedKeys after successful lazy migration', async () => {
		await seedLegacyKeys(['foo', 'bar'])

		const adapter = new RuntimeMigrationAdapter(flashcoreDir, legacyDir)
		await adapter.init()

		const result = await adapter.get('foo')
		expect(result).toBe('value-foo')

		const metadata = await readMetadata()
		expect(metadata!.migratedKeys).toBe(1)

		await adapter.shutdown()
	})

	it('get() does not double-count already-migrated keys', async () => {
		await seedLegacyKeys(['foo', 'bar'])

		const adapter = new RuntimeMigrationAdapter(flashcoreDir, legacyDir)
		await adapter.init()

		await adapter.get('foo')
		await adapter.get('foo') // Second read hits new store

		const metadata = await readMetadata()
		expect(metadata!.migratedKeys).toBe(1)

		await adapter.shutdown()
	})

	it('get() does not increment for nonexistent keys', async () => {
		await seedLegacyKeys(['foo'])

		const adapter = new RuntimeMigrationAdapter(flashcoreDir, legacyDir)
		await adapter.init()

		const val = await adapter.get('nonexistent')
		expect(val).toBeUndefined()

		const metadata = await readMetadata()
		expect(metadata!.migratedKeys).toBe(0)

		await adapter.shutdown()
	})

	it('all keys migrated via get() triggers auto-completion', async () => {
		await seedLegacyKeys(['a', 'b', 'c'])

		const adapter = new RuntimeMigrationAdapter(flashcoreDir, legacyDir)
		await adapter.init()

		await adapter.get('a')
		await adapter.get('b')
		await adapter.get('c')

		const metadata = await readMetadata()
		expect(metadata!.mode).toBe('idle')
		expect(metadata!.migratedKeys).toBe(3)
		expect(metadata!.totalLegacyKeys).toBe(3)

		await adapter.shutdown()
	})

	it('after completion, get() for un-accessed legacy keys returns undefined', async () => {
		await seedLegacyKeys(['accessed', 'never-accessed'])

		const adapter = new RuntimeMigrationAdapter(flashcoreDir, legacyDir)
		await adapter.init()

		// Migrate one key, then clear to force completion
		await adapter.get('accessed')
		await adapter.clear()

		// Migration is now disabled — un-accessed legacy key is unreachable
		const val = await adapter.get('never-accessed')
		expect(val).toBeUndefined()

		await adapter.shutdown()
	})
})

// ============================================================================
// Progress During delete()
// ============================================================================

describe('Progress during delete()', () => {
	it('delete() increments counter when tombstoning a legacy key', async () => {
		await seedLegacyKeys(['to-delete', 'to-keep'])

		const adapter = new RuntimeMigrationAdapter(flashcoreDir, legacyDir)
		await adapter.init()

		await adapter.delete('to-delete')

		const val = await adapter.get('to-delete')
		expect(val).toBeUndefined()

		const metadata = await readMetadata()
		expect(metadata!.migratedKeys).toBe(1)

		await adapter.shutdown()
	})

	it('delete() does not double-count a key already migrated via get()', async () => {
		await seedLegacyKeys(['a', 'b'])

		const adapter = new RuntimeMigrationAdapter(flashcoreDir, legacyDir)
		await adapter.init()

		await adapter.get('a')       // migrated: 1
		await adapter.delete('a')    // should NOT increment (key was already in new store)

		const metadata = await readMetadata()
		expect(metadata!.migratedKeys).toBe(1)  // still 1, not 2

		await adapter.shutdown()
	})

	it('delete() does not increment for keys without legacy presence', async () => {
		await seedLegacyKeys(['legacy-key'])

		const adapter = new RuntimeMigrationAdapter(flashcoreDir, legacyDir)
		await adapter.init()

		// Set a new key (not in legacy) and delete it
		await adapter.set('new-key', 'value')
		await adapter.delete('new-key')

		const metadata = await readMetadata()
		expect(metadata!.migratedKeys).toBe(0)

		await adapter.shutdown()
	})

	it('mix of get() + delete() reaches totalLegacyKeys and completes', async () => {
		await seedLegacyKeys(['a', 'b', 'c', 'd'])

		const adapter = new RuntimeMigrationAdapter(flashcoreDir, legacyDir)
		await adapter.init()

		await adapter.get('a')       // migrated: 1
		await adapter.delete('b')    // migrated: 2
		await adapter.get('c')       // migrated: 3
		await adapter.delete('d')    // migrated: 4 -> complete

		const metadata = await readMetadata()
		expect(metadata!.mode).toBe('idle')
		expect(metadata!.migratedKeys).toBe(4)
		expect(metadata!.totalLegacyKeys).toBe(4)

		await adapter.shutdown()
	})
})

// ============================================================================
// clear()
// ============================================================================

describe('clear()', () => {
	it('clear() sets migratedKeys = totalLegacyKeys and transitions to idle', async () => {
		await seedLegacyKeys(['a', 'b', 'c'])

		const adapter = new RuntimeMigrationAdapter(flashcoreDir, legacyDir)
		await adapter.init()

		// Migrate only one key before clearing
		await adapter.get('a')
		await adapter.clear()

		const metadata = await readMetadata()
		expect(metadata!.mode).toBe('idle')
		expect(metadata!.migratedKeys).toBe(3)
		expect(metadata!.totalLegacyKeys).toBe(3)

		await adapter.shutdown()
	})
})

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge cases', () => {
	it('concurrent get() calls on different keys count correctly', async () => {
		const keys = Array.from({ length: 10 }, (_, i) => `key-${i}`)
		await seedLegacyKeys(keys)

		const adapter = new RuntimeMigrationAdapter(flashcoreDir, legacyDir)
		await adapter.init()

		// Fire all get() calls concurrently
		await Promise.all(keys.map((k) => adapter.get(k)))

		const metadata = await readMetadata()
		expect(metadata!.migratedKeys).toBe(10)
		expect(metadata!.totalLegacyKeys).toBe(10)
		expect(metadata!.mode).toBe('idle')

		await adapter.shutdown()
	})

	it('has() does not affect migration counter', async () => {
		await seedLegacyKeys(['legacy-key'])

		const adapter = new RuntimeMigrationAdapter(flashcoreDir, legacyDir)
		await adapter.init()

		const exists = await adapter.has('legacy-key')
		expect(exists).toBe(true)

		const metadata = await readMetadata()
		expect(metadata!.migratedKeys).toBe(0)

		await adapter.shutdown()
	})

	it('set() of new keys does not affect migration counter', async () => {
		await seedLegacyKeys(['legacy-key'])

		const adapter = new RuntimeMigrationAdapter(flashcoreDir, legacyDir)
		await adapter.init()

		await adapter.set('brand-new-1', 'val1')
		await adapter.set('brand-new-2', 'val2')

		const metadata = await readMetadata()
		expect(metadata!.migratedKeys).toBe(0)
		expect(metadata!.totalLegacyKeys).toBe(1)

		await adapter.shutdown()
	})

	it('metadata without count fields treats both as 0, no crash', async () => {
		await seedLegacyKeys(['x'])

		// First init to create migration state
		const adapter1 = new RuntimeMigrationAdapter(flashcoreDir, legacyDir)
		await adapter1.init()
		await adapter1.shutdown()

		// Manually strip count fields from metadata to simulate pre-upgrade
		const fileAdapter = new FileAdapter({ baseDir: flashcoreDir })
		await fileAdapter.init?.()
		const raw = await fileAdapter.get(MIGRATION_METADATA_KEY) as Record<string, unknown>
		delete raw.totalLegacyKeys
		delete raw.migratedKeys
		await fileAdapter.set(MIGRATION_METADATA_KEY, raw)
		await fileAdapter.shutdown?.()

		// Resume with stripped metadata — should not crash
		const adapter2 = new RuntimeMigrationAdapter(flashcoreDir, legacyDir)
		await adapter2.init()

		// Should still function correctly
		const val = await adapter2.get('x')
		expect(val).toBe('value-x')

		await adapter2.shutdown()
	})
})
