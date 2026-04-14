/**
 * Phase 6: TransactionContext Edge Cases
 *
 * Tests staging reads/writes, single-mode enforcement, rollback, commit paths,
 * version tracking, state transitions, and post-completion guards.
 */

import { MemoryAdapter, FeatureNotSupportedError } from 'robo.js/flashcore'
import type { FlashcoreAdapter, BatchOperation, AdapterTransaction } from 'robo.js/flashcore'
import { TransactionContext } from '../../src/transactions/context.js'
import { buildTransactionOptions } from '../../src/transactions/modes.js'

/**
 * Build default required transaction options for a given mode.
 */
function defaultOpts(mode: 'batch' | 'single' | 'optimistic' | 'native' | 'serial' = 'batch') {
	return buildTransactionOptions({ mode })
}

/**
 * Create an adapter with atomicBatch support.
 */
function createBatchAdapter(): { adapter: FlashcoreAdapter; store: Map<string, unknown> } {
	const store = new Map<string, unknown>()
	const adapter: FlashcoreAdapter = {
		get: async (key: string) => store.get(key),
		set: async (key: string, value: unknown) => {
			store.set(key, value)
			return true
		},
		delete: async (key: string) => store.delete(key),
		has: async (key: string) => store.has(key),
		clear: async () => { store.clear() },
		atomicBatch: async (ops: BatchOperation<string, unknown>[]) => {
			for (const op of ops) {
				if (op.type === 'set') store.set(op.key, op.value)
				else if (op.type === 'delete') store.delete(op.key)
			}
		}
	}
	return { adapter, store }
}

/**
 * Create an adapter with native transaction support.
 */
function createNativeAdapter(): { adapter: FlashcoreAdapter; store: Map<string, unknown> } {
	const store = new Map<string, unknown>()
	const adapter: FlashcoreAdapter = {
		get: async (key: string) => store.get(key),
		set: async (key: string, value: unknown) => {
			store.set(key, value)
			return true
		},
		delete: async (key: string) => store.delete(key),
		has: async (key: string) => store.has(key),
		clear: async () => { store.clear() },
		transaction: async (fn: (tx: AdapterTransaction<string, unknown>) => void | Promise<void>) => {
			const ops: BatchOperation<string, unknown>[] = []
			const tx: AdapterTransaction<string, unknown> = {
				get: async (key) => store.get(key),
				set: (key, value) => { ops.push({ type: 'set', key, value }) },
				delete: (key) => { ops.push({ type: 'delete', key }) }
			}
			await fn(tx)
			for (const op of ops) {
				if (op.type === 'set') store.set(op.key, op.value)
				else if (op.type === 'delete') store.delete(op.key)
			}
		}
	}
	return { adapter, store }
}

describe('TransactionContext', () => {

	// ── Staging: reads return staged writes ────────────────────────

	it('should return staged value when reading a key that was written in the transaction', async () => {
		const { adapter } = createBatchAdapter()
		const tx = new TransactionContext(adapter, 'batch', defaultOpts('batch'))

		tx.set('foo', 'staged-value')

		const result = await tx.read('foo')
		expect(result).toBe('staged-value')
	})

	// ── Reads fall through to adapter for unstaged keys ───────────

	it('should read from the underlying adapter for keys not in staged writes', async () => {
		const { adapter, store } = createBatchAdapter()
		store.set('existing', 'adapter-value')

		const tx = new TransactionContext(adapter, 'batch', defaultOpts('batch'))
		const result = await tx.read('existing')
		expect(result).toBe('adapter-value')
	})

	// ── Deleted keys return undefined ─────────────────────────────

	it('should return undefined for keys staged for deletion', async () => {
		const { adapter, store } = createBatchAdapter()
		store.set('to-delete', 'some-value')

		const tx = new TransactionContext(adapter, 'batch', defaultOpts('batch'))
		tx.delete('to-delete')

		const result = await tx.read('to-delete')
		expect(result).toBeUndefined()
	})

	// ── Single mode: second mutation throws ───────────────────────

	it('should throw on second mutation in single mode', () => {
		const adapter = new MemoryAdapter() as FlashcoreAdapter
		const tx = new TransactionContext(adapter, 'single', defaultOpts('single'))

		tx.set('first', 'ok')

		expect(() => tx.set('second', 'fail')).toThrow(FeatureNotSupportedError)
	})

	it('should throw on delete after set in single mode', () => {
		const adapter = new MemoryAdapter() as FlashcoreAdapter
		const tx = new TransactionContext(adapter, 'single', defaultOpts('single'))

		tx.set('key', 'value')

		expect(() => tx.delete('another')).toThrow(FeatureNotSupportedError)
	})

	// ── Rollback clears all staged state ──────────────────────────

	it('should clear staged writes, deletes, and read versions on rollback', async () => {
		const { adapter, store } = createBatchAdapter()
		store.set('versioned', { _version: 5, data: 'v' })

		const tx = new TransactionContext(adapter, 'batch', defaultOpts('batch'))

		tx.set('a', 1)
		tx.delete('b')
		await tx.read('versioned') // tracks version

		tx.rollback()

		expect(tx.getStagedWrites().size).toBe(0)
		expect(tx.getStagedDeletes().size).toBe(0)
		expect(tx.getReadVersions().size).toBe(0)
		expect(tx.mutationCount).toBe(0)
	})

	// ── Commit applies staged operations (batch mode) ─────────────

	it('should apply all staged sets and deletes to the adapter on commit', async () => {
		const { adapter, store } = createBatchAdapter()
		store.set('old', 'value')

		const tx = new TransactionContext(adapter, 'batch', defaultOpts('batch'))
		tx.set('new-key', 'new-value')
		tx.delete('old')

		await tx.commit()

		expect(store.get('new-key')).toBe('new-value')
		expect(store.has('old')).toBe(false)
	})

	// ── Version tracking for optimistic mode ──────────────────────

	it('should track version stamps from read records', async () => {
		const { adapter, store } = createBatchAdapter()
		store.set('rec', { _version: 7, name: 'test' })

		const tx = new TransactionContext(adapter, 'optimistic', defaultOpts('optimistic'))
		await tx.read('rec')

		const versions = tx.getReadVersions()
		expect(versions.get('rec')).toBe(7)
	})

	it('should support explicit version tracking via trackReadVersion', () => {
		const adapter = new MemoryAdapter() as FlashcoreAdapter
		const tx = new TransactionContext(adapter, 'optimistic', defaultOpts('optimistic'))

		tx.trackReadVersion('custom-key', 42)
		expect(tx.getReadVersions().get('custom-key')).toBe(42)
	})

	// ── State transitions ─────────────────────────────────────────

	it('should prevent reads after commit', async () => {
		const { adapter } = createBatchAdapter()
		const tx = new TransactionContext(adapter, 'batch', defaultOpts('batch'))

		await tx.commit()

		await expect(tx.read('anything')).rejects.toThrow('Transaction has already been completed')
	})

	it('should prevent writes after rollback', () => {
		const adapter = new MemoryAdapter() as FlashcoreAdapter
		const tx = new TransactionContext(adapter, 'batch', defaultOpts('batch'))

		tx.rollback()

		expect(() => tx.set('key', 'value')).toThrow('Transaction has already been completed')
	})

	it('should prevent deletes after commit', async () => {
		const { adapter } = createBatchAdapter()
		const tx = new TransactionContext(adapter, 'batch', defaultOpts('batch'))

		await tx.commit()

		expect(() => tx.delete('key')).toThrow('Transaction has already been completed')
	})

	// ── Cannot commit twice ───────────────────────────────────────

	it('should throw when committing an already-committed transaction', async () => {
		const { adapter } = createBatchAdapter()
		const tx = new TransactionContext(adapter, 'batch', defaultOpts('batch'))

		tx.set('key', 'value')
		await tx.commit()

		await expect(tx.commit()).rejects.toThrow('Transaction has already been completed')
	})

	// ── Nested reads don't duplicate in read set ──────────────────

	it('should not duplicate version entries for repeated reads of the same key', async () => {
		const { adapter, store } = createBatchAdapter()
		store.set('dup', { _version: 3, val: 'x' })

		const tx = new TransactionContext(adapter, 'optimistic', defaultOpts('optimistic'))

		await tx.read('dup')
		await tx.read('dup')

		const versions = tx.getReadVersions()
		// Map naturally deduplicates, but version should still be 3
		expect(versions.size).toBe(1)
		expect(versions.get('dup')).toBe(3)
	})

	// ── hasPendingOperations ──────────────────────────────────────

	it('should report no pending operations on a fresh context', () => {
		const adapter = new MemoryAdapter() as FlashcoreAdapter
		const tx = new TransactionContext(adapter, 'batch', defaultOpts('batch'))
		expect(tx.hasPendingOperations()).toBe(false)
	})

	it('should report pending operations after staging writes', () => {
		const adapter = new MemoryAdapter() as FlashcoreAdapter
		const tx = new TransactionContext(adapter, 'batch', defaultOpts('batch'))

		tx.set('key', 'value')
		expect(tx.hasPendingOperations()).toBe(true)
	})

	// ── Commit with native mode ───────────────────────────────────

	it('should commit using native transaction when in native mode', async () => {
		const { adapter, store } = createNativeAdapter()

		const tx = new TransactionContext(adapter, 'native', defaultOpts('native'))
		tx.set('native-key', 'native-value')
		tx.delete('old-key')

		await tx.commit()

		expect(store.get('native-key')).toBe('native-value')
		expect(store.has('old-key')).toBe(false)
	})

	// ── Single mode commit ────────────────────────────────────────

	it('should commit a single set operation in single mode', async () => {
		const { adapter, store } = createBatchAdapter()

		const tx = new TransactionContext(adapter, 'single', defaultOpts('single'))
		tx.set('only', 'one')

		await tx.commit()

		expect(store.get('only')).toBe('one')
	})

	// ── Empty commit is a no-op ───────────────────────────────────

	it('should succeed when committing with no pending operations', async () => {
		const { adapter } = createBatchAdapter()
		const tx = new TransactionContext(adapter, 'batch', defaultOpts('batch'))

		// Should not throw
		await tx.commit()
	})
})
