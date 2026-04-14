/**
 * RuntimeMigrationAdapter unit tests
 *
 * Covers setIfNotExists (tombstone logic, legacy fallback, failure recovery),
 * atomicBatch (tombstone expansion, idle vs migration mode), and capabilities.
 */

import { RuntimeMigrationAdapter } from '../../../src/core/flashcore.js'
import { FileAdapter } from '../../../src/flashcore/adapter/builtins/file.js'
import { LegacyFileAdapter } from '../../../src/flashcore/adapter/builtins/legacy-file.js'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rm } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'

const DEFAULT_BACKUP_DIR = join(process.cwd(), '.robo', 'flashcore-backups')

let fileDir: string
let legacyDir: string
let adapter: RuntimeMigrationAdapter

function uniqueDir(label: string): string {
	return join(tmpdir(), `flashcore-rma-${label}-${Date.now()}-${randomBytes(4).toString('hex')}`)
}

function tombstoneKey(key: string): string {
	return `_flashcore:migration:tombstone:${Buffer.from(key, 'utf-8').toString('base64url')}`
}

async function seedLegacy(key: string, value: unknown): Promise<void> {
	const legacy = new LegacyFileAdapter({ dataDir: legacyDir })
	await legacy.init()
	await legacy.set(key, value)
}

async function cleanup(): Promise<void> {
	try {
		await adapter?.shutdown()
	} catch {
		// ignore
	}
	await rm(fileDir, { recursive: true, force: true }).catch(() => {})
	await rm(legacyDir, { recursive: true, force: true }).catch(() => {})
	await rm(DEFAULT_BACKUP_DIR, { recursive: true, force: true }).catch(() => {})
}

// ============================================================================
// setIfNotExists
// ============================================================================

describe('setIfNotExists', () => {
	beforeEach(() => {
		fileDir = uniqueDir('sine-file')
		legacyDir = uniqueDir('sine-legacy')
	})

	afterEach(cleanup)

	it('returns true and sets value when key does not exist (idle mode)', async () => {
		// No legacy dir — adapter runs in idle mode
		adapter = new RuntimeMigrationAdapter(fileDir, legacyDir)
		await adapter.init()

		const result = await adapter.setIfNotExists('foo', 42)
		expect(result).toBe(true)
		expect(await adapter.get('foo')).toBe(42)
	})

	it('returns false when key already exists in file adapter', async () => {
		adapter = new RuntimeMigrationAdapter(fileDir, legacyDir)
		await adapter.init()

		await adapter.set('foo', 'existing')
		const result = await adapter.setIfNotExists('foo', 'new')
		expect(result).toBe(false)
		expect(await adapter.get('foo')).toBe('existing')
	})

	it('returns false when key exists in legacy store (migration mode)', async () => {
		await seedLegacy('foo', 'legacy-val')

		adapter = new RuntimeMigrationAdapter(fileDir, legacyDir)
		await adapter.init()

		const result = await adapter.setIfNotExists('foo', 'new')
		expect(result).toBe(false)
	})

	it('clears tombstone and sets key when key was tombstoned', async () => {
		await seedLegacy('foo', 'old')

		adapter = new RuntimeMigrationAdapter(fileDir, legacyDir)
		await adapter.init()

		// Delete creates a tombstone
		await adapter.delete('foo')
		expect(await adapter.get('foo')).toBeUndefined()

		// setIfNotExists should clear tombstone and set
		const result = await adapter.setIfNotExists('foo', 'new')
		expect(result).toBe(true)
		expect(await adapter.get('foo')).toBe('new')
	})

	it('restores tombstone on failure to prevent resurrection (bug fix)', async () => {
		await seedLegacy('foo', 'old')

		adapter = new RuntimeMigrationAdapter(fileDir, legacyDir)
		await adapter.init()

		// Delete creates tombstone
		await adapter.delete('foo')

		// Make the underlying setIfNotExists throw after tombstone deletion
		const spy = jest.spyOn(FileAdapter.prototype, 'setIfNotExists').mockRejectedValueOnce(new Error('I/O'))

		await expect(adapter.setIfNotExists('foo', 'new')).rejects.toThrow('I/O')
		spy.mockRestore()

		// Tombstone should be restored — key must NOT be resurrected
		const verification = new FileAdapter({ baseDir: fileDir })
		await verification.init()
		expect(await verification.has(tombstoneKey('foo'))).toBe(true)
		await verification.shutdown()

		// get should return undefined, not the legacy value
		expect(await adapter.get('foo')).toBeUndefined()
	})

	it('does not consult legacy adapter when migration is disabled (idle mode)', async () => {
		// No legacy dir — idle mode
		adapter = new RuntimeMigrationAdapter(fileDir, legacyDir)
		await adapter.init()

		const spy = jest.spyOn(LegacyFileAdapter.prototype, 'has')
		const result = await adapter.setIfNotExists('bar', 99)
		expect(result).toBe(true)
		expect(spy).not.toHaveBeenCalled()
		spy.mockRestore()
	})
})

// ============================================================================
// set (tombstone protection)
// ============================================================================

describe('set', () => {
	beforeEach(() => {
		fileDir = uniqueDir('set-file')
		legacyDir = uniqueDir('set-legacy')
	})

	afterEach(cleanup)

	it('restores tombstone on failure to prevent resurrection (bug fix)', async () => {
		await seedLegacy('foo', 'old')

		adapter = new RuntimeMigrationAdapter(fileDir, legacyDir)
		await adapter.init()

		// Delete creates tombstone
		await adapter.delete('foo')

		// Make the underlying set throw after tombstone deletion
		const spy = jest.spyOn(FileAdapter.prototype, 'set')
		// First call is the tombstone has-check's internal path, so we need to
		// let the tombstone delete succeed, then fail on the actual set.
		// The set() method: has(tombstone) -> delete(tombstone) -> set(key, value)
		// We mock FileAdapter.prototype.set to fail on the call for the actual key
		spy.mockImplementationOnce(async function (this: FileAdapter, key: string, value: unknown) {
			// This is the tombstone restore call inside the catch — let it pass through
			// Actually, the set() flow is: has(tombstone)->delete(tombstone)->set(key,value)
			// The spy intercepts set(key, value) which is the fileAdapter.set call
			throw new Error('I/O')
		})

		await expect(adapter.set('foo', 'new')).rejects.toThrow('I/O')
		spy.mockRestore()

		// Tombstone should be restored — key must NOT be resurrected
		const verification = new FileAdapter({ baseDir: fileDir })
		await verification.init()
		expect(await verification.has(tombstoneKey('foo'))).toBe(true)
		await verification.shutdown()

		// get should return undefined, not the legacy value
		expect(await adapter.get('foo')).toBeUndefined()
	})

	it('does not attempt tombstone restore when no tombstone existed', async () => {
		adapter = new RuntimeMigrationAdapter(fileDir, legacyDir)
		await adapter.init()

		await adapter.set('bar', 'initial')

		// Mock set to throw
		const spy = jest.spyOn(FileAdapter.prototype, 'set').mockRejectedValueOnce(new Error('I/O'))

		await expect(adapter.set('bar', 'new')).rejects.toThrow('I/O')
		spy.mockRestore()

		// No tombstone should exist since there was never one
		const verification = new FileAdapter({ baseDir: fileDir })
		await verification.init()
		const keys = await verification.scan('_flashcore:migration:tombstone:')
		expect(keys).toHaveLength(0)
		await verification.shutdown()
	})
})

// ============================================================================
// atomicBatch
// ============================================================================

describe('atomicBatch', () => {
	beforeEach(() => {
		fileDir = uniqueDir('batch-file')
		legacyDir = uniqueDir('batch-legacy')
	})

	afterEach(cleanup)

	it('applies set and delete operations with correct final state', async () => {
		adapter = new RuntimeMigrationAdapter(fileDir, legacyDir)
		await adapter.init()

		await adapter.set('remove-me', 'gone')

		await adapter.atomicBatch([
			{ type: 'set', key: 'a', value: 1 },
			{ type: 'set', key: 'b', value: 2 },
			{ type: 'delete', key: 'remove-me' }
		])

		expect(await adapter.get('a')).toBe(1)
		expect(await adapter.get('b')).toBe(2)
		expect(await adapter.has('remove-me')).toBe(false)
	})

	it('set clears tombstone and delete creates tombstone during migration', async () => {
		await seedLegacy('revive', 'old-val')
		await seedLegacy('kill', 'kill-val')

		adapter = new RuntimeMigrationAdapter(fileDir, legacyDir)
		await adapter.init()

		// Delete 'revive' to create tombstone
		await adapter.delete('revive')

		// Batch: set 'revive' (should clear tombstone), delete 'kill' (should create tombstone)
		await adapter.atomicBatch([
			{ type: 'set', key: 'revive', value: 'new-val' },
			{ type: 'delete', key: 'kill' }
		])

		expect(await adapter.get('revive')).toBe('new-val')
		expect(await adapter.get('kill')).toBeUndefined()

		// Verify tombstone state via the underlying file adapter
		const verification = new FileAdapter({ baseDir: fileDir })
		await verification.init()
		expect(await verification.has(tombstoneKey('revive'))).toBe(false)
		expect(await verification.has(tombstoneKey('kill'))).toBe(true)
		await verification.shutdown()
	})

	it('delete ops do NOT create tombstones in idle mode', async () => {
		adapter = new RuntimeMigrationAdapter(fileDir, legacyDir)
		await adapter.init()

		await adapter.set('x', 1)
		await adapter.atomicBatch([{ type: 'delete', key: 'x' }])

		const verification = new FileAdapter({ baseDir: fileDir })
		await verification.init()

		const keys = await verification.scan('_flashcore:migration:tombstone:')
		expect(keys).toHaveLength(0)
		await verification.shutdown()
	})

	it('check ops pass through to file adapter', async () => {
		adapter = new RuntimeMigrationAdapter(fileDir, legacyDir)
		await adapter.init()

		await adapter.set('versioned', { _version: 3, data: 'val' })

		await adapter.atomicBatch([
			{ type: 'check', key: 'versioned', expectedVersion: 3 },
			{ type: 'set', key: 'versioned', value: { _version: 4, data: 'updated' } }
		])

		expect(await adapter.get('versioned')).toEqual({ _version: 4, data: 'updated' })
	})

	it('rejects batch when check op has version mismatch', async () => {
		adapter = new RuntimeMigrationAdapter(fileDir, legacyDir)
		await adapter.init()

		await adapter.set('versioned', { _version: 1, data: 'old' })

		await expect(
			adapter.atomicBatch([
				{ type: 'check', key: 'versioned', expectedVersion: 2 },
				{ type: 'set', key: 'should-not-exist', value: 'nope' }
			])
		).rejects.toThrow(/version check failed/i)

		// Mutations must not have been applied
		expect(await adapter.has('should-not-exist')).toBe(false)
		expect(await adapter.get('versioned')).toEqual({ _version: 1, data: 'old' })
	})

	it('empty batch is a no-op', async () => {
		adapter = new RuntimeMigrationAdapter(fileDir, legacyDir)
		await adapter.init()

		await expect(adapter.atomicBatch([])).resolves.toBeUndefined()
	})
})

// ============================================================================
// capabilities
// ============================================================================

describe('capabilities', () => {
	beforeEach(() => {
		fileDir = uniqueDir('cap-file')
		legacyDir = uniqueDir('cap-legacy')
	})

	afterEach(cleanup)

	it('returns { isolation: "none" }', async () => {
		adapter = new RuntimeMigrationAdapter(fileDir, legacyDir)
		await adapter.init()

		expect(adapter.capabilities()).toEqual({ isolation: 'none' })
	})
})
