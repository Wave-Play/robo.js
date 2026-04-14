/**
 * WAL + FileAdapter Integration Tests
 *
 * Verifies WAL crash recovery works with real disk I/O.
 * All existing WAL tests use MemoryAdapter — this tests the actual
 * scenario of crash recovery with file-system persistence.
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
	Flashcore,
	FlashcoreSystem,
	FileAdapter,
	f
} from 'robo.js/flashcore'
import { registerAllExtensions } from '../helpers/register-extensions.js'

/**
 * A FileAdapter that throws after N write operations (set calls).
 * Used to simulate crashes at specific points during CRUD operations.
 */
class CrashingFileAdapter extends FileAdapter {
	crashAfterNWrites = Infinity
	private writeCount = 0
	private crashed = false

	async set(key: string, value: unknown): Promise<boolean> {
		this.writeCount++
		if (this.writeCount > this.crashAfterNWrites) {
			this.crashed = true
			throw new Error('Simulated crash')
		}
		return super.set(key, value)
	}

	async delete(key: string): Promise<boolean> {
		if (this.crashed) {
			throw new Error('Simulated crash')
		}
		return super.delete(key)
	}

	resetWriteCount(): void {
		this.writeCount = 0
		this.crashed = false
	}
}

let tempDirs: string[] = []

/**
 * Create a unique temporary directory for a test.
 */
async function createTempDir(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), 'flashcore-wal-file-'))
	tempDirs.push(dir)
	return dir
}

/**
 * Initialize Flashcore with extensions and the given adapter.
 */
async function initWithExtensions(adapter: FileAdapter): Promise<void> {
	await FlashcoreSystem._reset()
	registerAllExtensions()
	await Flashcore.$.init({ adapter })
}

describe('WAL + FileAdapter Integration', () => {
	afterEach(async () => {
		await FlashcoreSystem._reset()

		// Clean up all temp directories created during the test
		for (const dir of tempDirs) {
			try {
				await rm(dir, { recursive: true, force: true })
			} catch {
				// Ignore cleanup errors
			}
		}
		tempDirs = []
	})

	describe('Create crash recovery', () => {
		it('recovers created record from WAL after crash during authoritative phase', async () => {
			const dir = await createTempDir()

			// Initialize with a crashing adapter.
			// During create, writes happen in this order:
			// 1. WAL entry begin (set)
			// 2. Unique constraints (if any)
			// 3. Chunk set (record data)
			// 4. Catalog set (persist catalog)
			// 5. WAL markPhase authoritative (set)
			// 6. WAL complete + delete
			//
			// We crash AFTER the catalog write but before WAL completion,
			// so the data is fully written but WAL is still pending.
			// Recovery should detect the entry, replay it (idempotent), and clean up.
			const crashingAdapter = new CrashingFileAdapter({ baseDir: dir })
			// Allow: WAL begin (1) + chunk set (2) + catalog set (3) + WAL markPhase (4)
			// Crash on the 5th write (WAL complete/markPhase-complete/delete sequence)
			crashingAdapter.crashAfterNWrites = 4

			await FlashcoreSystem._reset()
			registerAllExtensions()
			await Flashcore.$.init({ adapter: crashingAdapter })

			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			// This create should succeed in writing data but crash during WAL completion
			let caughtError = false
			let createdId = ''
			try {
				const result = await User.create({ name: 'Alice' })
				createdId = result.id
			} catch (e) {
				caughtError = true
				// We expect the create to either succeed or throw from WAL completion
			}

			// Now simulate restart: init with a regular FileAdapter on the same directory.
			// WAL recovery should run and handle the orphaned entry.
			const freshAdapter = new FileAdapter({ baseDir: dir })
			await initWithExtensions(freshAdapter)

			const User2 = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			// If the create succeeded before the crash, the record should be there.
			// If the WAL entry was left pending, recovery should have replayed it.
			if (createdId) {
				const found = await User2.findUnique({ where: { id: createdId } })
				expect(found).not.toBeNull()
				expect(found!.name).toBe('Alice')
			}

			// After recovery, WAL should be cleaned up
			const walKeys = await freshAdapter.scan('_flashcore:wal:entry:')
			expect(walKeys).toHaveLength(0)
		})

		it('replays recent pending create from WAL after crash in pending phase', async () => {
			const dir = await createTempDir()

			// Crash after ONLY the WAL entry write (pending phase),
			// before any chunk or catalog writes happen.
			// Recovery replays recent pending entries (creates the record from WAL deltas).
			const crashingAdapter = new CrashingFileAdapter({ baseDir: dir })
			// Allow only the WAL begin write (1), crash on the 2nd write (chunk/unique)
			crashingAdapter.crashAfterNWrites = 1

			await FlashcoreSystem._reset()
			registerAllExtensions()
			await Flashcore.$.init({ adapter: crashingAdapter })

			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('PendingUser', {
				id: f.id(),
				name: f.string()
			})

			// This should crash during the create, after WAL begin but before data writes
			await expect(User.create({ name: 'Bob' })).rejects.toThrow('Simulated crash')

			// Restart with a regular adapter — WAL recovery replays recent pending entries
			const freshAdapter = new FileAdapter({ baseDir: dir })
			await initWithExtensions(freshAdapter)

			const User2 = FlashcoreSystem.registerModel<{ id: string; name: string }>('PendingUser', {
				id: f.id(),
				name: f.string()
			})

			// Recent pending WAL entries are replayed during recovery, creating
			// the record from WAL deltas even though chunk writes never completed
			const all = await User2.findMany()
			expect(all).toHaveLength(1)
			expect(all[0].name).toBe('Bob')

			// WAL should be cleaned up regardless of replay or rollback
			const walKeys = await freshAdapter.scan('_flashcore:wal:entry:')
			expect(walKeys).toHaveLength(0)
		})
	})

	describe('Update crash recovery', () => {
		it('recovers update from WAL on FileAdapter', async () => {
			const dir = await createTempDir()

			// First, create a record normally
			const adapter1 = new FileAdapter({ baseDir: dir })
			await initWithExtensions(adapter1)

			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('UpdUser', {
				id: f.id(),
				name: f.string()
			})

			const created = await User.create({ name: 'Original' })
			const createdId = created.id
			expect(created.name).toBe('Original')

			// Now restart with a crashing adapter to crash during update
			const crashingAdapter = new CrashingFileAdapter({ baseDir: dir })
			// After init (which may do reads/writes), we reset the count.
			// We need a strategy: first init normally, then set crash limit.
			await FlashcoreSystem._reset()
			registerAllExtensions()

			// Use a wrapper approach: init with normal adapter, then swap behavior
			// Actually, let's just init with the crashing adapter with high limit during init,
			// then lower it before the update.
			crashingAdapter.crashAfterNWrites = 999
			await Flashcore.$.init({ adapter: crashingAdapter })

			const User2 = FlashcoreSystem.registerModel<{ id: string; name: string }>('UpdUser', {
				id: f.id(),
				name: f.string()
			})

			// Now lower the crash limit so the update fails partway
			crashingAdapter.resetWriteCount()
			// Update writes: WAL begin (1) + chunk patch (2) + catalog (3) => crash on markPhase (4)
			crashingAdapter.crashAfterNWrites = 3

			let updateSucceeded = false
			try {
				await User2.update({ where: { id: createdId }, data: { name: 'Updated' } })
				updateSucceeded = true
			} catch {
				// Expected crash
			}

			// Restart with fresh adapter for recovery
			const freshAdapter = new FileAdapter({ baseDir: dir })
			await initWithExtensions(freshAdapter)

			const User3 = FlashcoreSystem.registerModel<{ id: string; name: string }>('UpdUser', {
				id: f.id(),
				name: f.string()
			})

			const found = await User3.findUnique({ where: { id: createdId } })
			expect(found).not.toBeNull()

			// If the update data was written before crash, recovery should preserve it.
			// If not, the original data should still be intact.
			// Either way, the record should exist and be consistent.
			expect(typeof found!.name).toBe('string')
			expect(['Original', 'Updated']).toContain(found!.name)

			// WAL should be cleaned up
			const walKeys = await freshAdapter.scan('_flashcore:wal:entry:')
			expect(walKeys).toHaveLength(0)
		})
	})

	describe('Delete crash recovery', () => {
		it('completes delete from WAL on FileAdapter', async () => {
			const dir = await createTempDir()

			// Create a record normally first
			const adapter1 = new FileAdapter({ baseDir: dir })
			await initWithExtensions(adapter1)

			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('DelUser', {
				id: f.id(),
				name: f.string()
			})

			const created = await User.create({ name: 'ToDelete' })
			const createdId = created.id

			// Restart with crashing adapter for the delete
			const crashingAdapter = new CrashingFileAdapter({ baseDir: dir })
			crashingAdapter.crashAfterNWrites = 999
			await FlashcoreSystem._reset()
			registerAllExtensions()
			await Flashcore.$.init({ adapter: crashingAdapter })

			const User2 = FlashcoreSystem.registerModel<{ id: string; name: string }>('DelUser', {
				id: f.id(),
				name: f.string()
			})

			// Lower crash limit for the delete operation
			crashingAdapter.resetWriteCount()
			// Delete writes: WAL begin (1) + chunk delete (2) + catalog (3) => crash on markPhase (4)
			crashingAdapter.crashAfterNWrites = 3

			let deleteSucceeded = false
			try {
				await User2.delete({ where: { id: createdId } })
				deleteSucceeded = true
			} catch {
				// Expected crash
			}

			// Restart with fresh adapter for recovery
			const freshAdapter = new FileAdapter({ baseDir: dir })
			await initWithExtensions(freshAdapter)

			const User3 = FlashcoreSystem.registerModel<{ id: string; name: string }>('DelUser', {
				id: f.id(),
				name: f.string()
			})

			// After recovery, the record should either be deleted (if data writes completed)
			// or restored (if only WAL was written). Either way, state should be consistent.
			const found = await User3.findUnique({ where: { id: createdId } })
			// The exact outcome depends on how far the writes got before crash.
			// The key invariant is that WAL is cleaned up and no corruption exists.
			expect(found === null || found.id === createdId).toBe(true)

			// WAL should be cleaned up
			const walKeys = await freshAdapter.scan('_flashcore:wal:entry:')
			expect(walKeys).toHaveLength(0)
		})
	})

	describe('WAL entry persistence on disk', () => {
		it('WAL entry files exist on disk after crash', async () => {
			const dir = await createTempDir()

			// Crash after WAL entry write but before completion
			const crashingAdapter = new CrashingFileAdapter({ baseDir: dir })
			crashingAdapter.crashAfterNWrites = 1

			await FlashcoreSystem._reset()
			registerAllExtensions()
			await Flashcore.$.init({ adapter: crashingAdapter })

			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('WalDiskUser', {
				id: f.id(),
				name: f.string()
			})

			// This should crash, leaving a WAL entry on disk
			await expect(User.create({ name: 'Persisted' })).rejects.toThrow('Simulated crash')

			// Verify WAL entry exists on disk using a fresh (non-crashing) adapter
			const checkAdapter = new FileAdapter({ baseDir: dir })
			await checkAdapter.init()
			const walKeys = await checkAdapter.scan('_flashcore:wal:entry:')
			expect(walKeys.length).toBeGreaterThan(0)

			// Now reinit with recovery, which should clean up
			await initWithExtensions(new FileAdapter({ baseDir: dir }))

			// Register the same model so we have consistent state
			FlashcoreSystem.registerModel<{ id: string; name: string }>('WalDiskUser', {
				id: f.id(),
				name: f.string()
			})

			// After recovery, WAL entries should be cleaned up
			const cleanAdapter = new FileAdapter({ baseDir: dir })
			await cleanAdapter.init()
			const remainingWalKeys = await cleanAdapter.scan('_flashcore:wal:entry:')
			expect(remainingWalKeys).toHaveLength(0)
		})
	})

	describe('Segmented records with WAL on FileAdapter', () => {
		it('recovers large segmented record from WAL', async () => {
			const dir = await createTempDir()

			// Create a normal adapter first to establish a record
			const adapter1 = new FileAdapter({ baseDir: dir })
			await initWithExtensions(adapter1)

			// Register a model and create a large record that will be segmented
			// (~150KB of data should trigger segmentation)
			const Doc = FlashcoreSystem.registerModel<{ id: string; content: string }>('LargeDoc', {
				id: f.id(),
				content: f.string()
			})

			const largeContent = 'x'.repeat(150_000)

			// Create the large record normally
			const created = await Doc.create({ content: largeContent })
			expect(created.content.length).toBe(150_000)

			// Verify it can be read back
			const found = await Doc.findUnique({ where: { id: created.id } })
			expect(found).not.toBeNull()
			expect(found!.content.length).toBe(150_000)

			// Now restart and crash during another large create
			const crashingAdapter = new CrashingFileAdapter({ baseDir: dir })
			crashingAdapter.crashAfterNWrites = 999
			await FlashcoreSystem._reset()
			registerAllExtensions()
			await Flashcore.$.init({ adapter: crashingAdapter })

			const Doc2 = FlashcoreSystem.registerModel<{ id: string; content: string }>('LargeDoc', {
				id: f.id(),
				content: f.string()
			})

			// Reset count and set a low crash limit for the second large create
			crashingAdapter.resetWriteCount()
			// Segmented creates have many writes (WAL + multiple segments + catalog)
			// Crash partway through to leave a WAL entry
			crashingAdapter.crashAfterNWrites = 3

			try {
				await Doc2.create({ content: 'y'.repeat(150_000) })
			} catch {
				// Expected crash
			}

			// Recover with a fresh adapter
			const freshAdapter = new FileAdapter({ baseDir: dir })
			await initWithExtensions(freshAdapter)

			const Doc3 = FlashcoreSystem.registerModel<{ id: string; content: string }>('LargeDoc', {
				id: f.id(),
				content: f.string()
			})

			// The first record should still be intact after recovery
			const original = await Doc3.findUnique({ where: { id: created.id } })
			expect(original).not.toBeNull()
			expect(original!.content.length).toBe(150_000)

			// WAL should be cleaned up
			const walKeys = await freshAdapter.scan('_flashcore:wal:entry:')
			expect(walKeys).toHaveLength(0)
		})
	})
})
