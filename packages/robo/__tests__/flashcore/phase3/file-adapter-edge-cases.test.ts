/**
 * Flashcore v1 (spec rev 4.3) Phase 3 - FileAdapter Edge Cases
 *
 * Tests the FileAdapter under adversarial conditions that basic tests don't cover:
 * corrupted data on disk, large payloads, operations after shutdown,
 * capability hardening, scan correctness, init idempotency, and edge values.
 *
 * All tests use direct FileAdapter instantiation with temp dirs and real disk I/O.
 */

import { FileAdapter } from '../../../src/flashcore/adapter/builtins/file.js'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readdir, rm, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'

let testDir: string
let adapter: FileAdapter

beforeEach(async () => {
	testDir = join(tmpdir(), `flashcore-edge-${Date.now()}-${randomBytes(4).toString('hex')}`)
	adapter = new FileAdapter({ baseDir: testDir })
	await adapter.init()
})

afterEach(async () => {
	await adapter.shutdown()
	try {
		await rm(testDir, { recursive: true, force: true })
	} catch {
		// Ignore cleanup errors
	}
})

/**
 * Helper: build the on-disk file path for a simple (safe-character) key.
 * Safe keys are stored as-is; the FileAdapter appends `.json` extension.
 */
function filePathForKey(key: string): string {
	return join(testDir, key + '.json')
}

// ============================================================================
// Corrupted Data on Disk
// ============================================================================

describe('Corrupted data on disk', () => {
	it('get() throws for malformed JSON', async () => {
		// Write valid data first via adapter to create the file
		await adapter.set('corrupt-key', 'valid')

		// Overwrite the file with invalid JSON directly on disk
		await writeFile(filePathForKey('corrupt-key'), 'not json {{{', 'utf-8')

		// get() should throw a SyntaxError from JSON.parse
		await expect(adapter.get('corrupt-key')).rejects.toThrow()
	})

	it('get() throws for empty file', async () => {
		await adapter.set('empty-key', 'valid')

		// Overwrite with empty content
		await writeFile(filePathForKey('empty-key'), '', 'utf-8')

		// JSON.parse('') throws SyntaxError
		await expect(adapter.get('empty-key')).rejects.toThrow()
	})

	it('get() throws for truncated JSON', async () => {
		await adapter.set('truncated-key', { name: 'test value here' })

		// Overwrite with truncated JSON
		await writeFile(filePathForKey('truncated-key'), '{"name": "tes', 'utf-8')

		await expect(adapter.get('truncated-key')).rejects.toThrow()
	})
})

// ============================================================================
// Capability Hardening
// ============================================================================

describe('Capability hardening', () => {
	it('does not expose compareAndSwap', () => {
		expect('compareAndSwap' in adapter).toBe(false)
	})

	it('exposes atomicBatch', () => {
		expect(typeof adapter.atomicBatch).toBe('function')
	})

	it('capabilities() returns { isolation: "none" }', () => {
		expect(adapter.capabilities()).toEqual({ isolation: 'none' })
	})
})

// ============================================================================
// Large Values
// ============================================================================

describe('Large values', () => {
	it('writes and reads back a 1MB JSON payload', async () => {
		// Build an object roughly 1MB in serialized size
		const largeStr = 'x'.repeat(1_000_000)
		const payload = { data: largeStr, meta: { size: '1MB' } }

		await adapter.set('large-1mb', payload)

		const result = await adapter.get('large-1mb')
		expect(result).toEqual(payload)
	})

	it('writes and reads back a 5MB JSON payload', async () => {
		const largeStr = 'y'.repeat(5_000_000)
		const payload = { data: largeStr }

		await adapter.set('large-5mb', payload)

		const result = await adapter.get('large-5mb')
		expect(result).toEqual(payload)
	}, 15_000) // Extended timeout for large I/O
})

// ============================================================================
// Operations After Shutdown
// ============================================================================

describe('Operations after shutdown', () => {
	it('get() returns value for keys written before shutdown', async () => {
		await adapter.set('persist-key', 'persist-value')
		await adapter.shutdown()

		// FileAdapter.get reads from disk — shutdown only sets initialized=false
		const value = await adapter.get('persist-key')
		expect(value).toBe('persist-value')
	})

	it('set() works after shutdown (re-creates dir if needed)', async () => {
		await adapter.shutdown()

		// set() calls ensureDir internally, so it should work even after shutdown
		await adapter.set('post-shutdown', 'new-value')

		const value = await adapter.get('post-shutdown')
		expect(value).toBe('new-value')
	})
})

// ============================================================================
// Scan Correctness
// ============================================================================

describe('Scan correctness', () => {
	it('scan excludes deleted keys', async () => {
		await adapter.set('item-a', 1)
		await adapter.set('item-b', 2)
		await adapter.set('item-c', 3)

		await adapter.delete('item-b')

		const keys = await adapter.scan('item-')
		expect(keys.sort()).toEqual(['item-a', 'item-c'])
	})

	it('scan with encoded keys finds entries by prefix', async () => {
		// Keys with special chars get base64url encoded
		await adapter.set('path/to/item1', 'val1')
		await adapter.set('path/to/item2', 'val2')
		await adapter.set('other/thing', 'val3')

		const keys = await adapter.scan('path/to/')
		expect(keys.sort()).toEqual(['path/to/item1', 'path/to/item2'])
	})

	it('scan returns empty array for non-existent directory', async () => {
		const missingDirAdapter = new FileAdapter({
			baseDir: join(tmpdir(), `flashcore-nonexistent-${Date.now()}`)
		})
		// Don't call init() — directory doesn't exist

		const keys = await missingDirAdapter.scan('')
		expect(keys).toEqual([])
	})
})

// ============================================================================
// Init Idempotency
// ============================================================================

describe('Init idempotency', () => {
	it('calling init() twice is safe', async () => {
		// adapter.init() was already called in beforeEach
		await expect(adapter.init()).resolves.not.toThrow()

		// Adapter should still work normally
		await adapter.set('after-double-init', 'ok')
		expect(await adapter.get('after-double-init')).toBe('ok')
	})

	it('init after shutdown re-initializes correctly', async () => {
		await adapter.set('before-restart', 'value')
		await adapter.shutdown()
		await adapter.init()

		const value = await adapter.get('before-restart')
		expect(value).toBe('value')

		await adapter.set('after-restart', 'new-value')
		expect(await adapter.get('after-restart')).toBe('new-value')
	})
})

// ============================================================================
// Edge Values
// ============================================================================

describe('Edge values', () => {
	it('round-trips null correctly', async () => {
		await adapter.set('null-key', null as unknown)

		const value = await adapter.get('null-key')
		expect(value).toBeNull()

		const exists = await adapter.has('null-key')
		expect(exists).toBe(true)
	})

	it('round-trips 0 correctly', async () => {
		await adapter.set('zero-key', 0)

		const value = await adapter.get('zero-key')
		expect(value).toBe(0)
	})

	it('round-trips false correctly', async () => {
		await adapter.set('false-key', false)

		const value = await adapter.get('false-key')
		expect(value).toBe(false)
	})

	it('round-trips empty string correctly', async () => {
		await adapter.set('empty-string-key', '')

		const value = await adapter.get('empty-string-key')
		expect(value).toBe('')
	})

	it('round-trips deeply nested object correctly', async () => {
		// Build a 10-level deep object
		let obj: Record<string, unknown> = { leaf: 'value' }
		for (let i = 0; i < 10; i++) {
			obj = { [`level${i}`]: obj }
		}

		await adapter.set('deep-nested', obj)

		const result = await adapter.get('deep-nested')
		expect(result).toEqual(obj)

		// Verify the leaf is accessible
		let current: any = result
		for (let i = 9; i >= 0; i--) {
			current = current[`level${i}`]
		}
		expect(current).toEqual({ leaf: 'value' })
	})

	it('round-trips array correctly', async () => {
		const arr = [1, 'two', null, { four: true }, [5, 6]]
		await adapter.set('array-key', arr)

		const value = await adapter.get('array-key')
		expect(value).toEqual(arr)
	})

	it('round-trips large number correctly', async () => {
		await adapter.set('large-num', Number.MAX_SAFE_INTEGER)

		const value = await adapter.get('large-num')
		expect(value).toBe(Number.MAX_SAFE_INTEGER)
	})

	it('round-trips negative number correctly', async () => {
		await adapter.set('neg-num', -42.5)

		const value = await adapter.get('neg-num')
		expect(value).toBe(-42.5)
	})
})

// ============================================================================
// atomicBatch
// ============================================================================

describe('atomicBatch', () => {
	it('applies set and delete operations in a single batch', async () => {
		await adapter.set('keep', 'yes')
		await adapter.set('remove-me', 'gone')

		await adapter.atomicBatch!([
			{ type: 'set', key: 'a', value: 1 },
			{ type: 'set', key: 'b', value: 2 },
			{ type: 'set', key: 'c', value: 3 },
			{ type: 'delete', key: 'remove-me' }
		])

		expect(await adapter.get('a')).toBe(1)
		expect(await adapter.get('b')).toBe(2)
		expect(await adapter.get('c')).toBe(3)
		expect(await adapter.has('remove-me')).toBe(false)
		expect(await adapter.get('keep')).toBe('yes')
	})

	it('rejects batch when check op has version mismatch', async () => {
		await adapter.set('versioned', { _version: 1, data: 'old' })

		await expect(
			adapter.atomicBatch!([
				{ type: 'check', key: 'versioned', expectedVersion: 2 },
				{ type: 'set', key: 'should-not-exist', value: 'nope' }
			])
		).rejects.toThrow(/version check failed/)

		// Mutations must not have been applied
		expect(await adapter.has('should-not-exist')).toBe(false)
		expect(await adapter.get('versioned')).toEqual({ _version: 1, data: 'old' })
	})

	it('applies batch when check op version matches', async () => {
		await adapter.set('versioned', { _version: 3, data: 'current' })

		await adapter.atomicBatch!([
			{ type: 'check', key: 'versioned', expectedVersion: 3 },
			{ type: 'set', key: 'versioned', value: { _version: 4, data: 'next' } }
		])

		expect(await adapter.get('versioned')).toEqual({ _version: 4, data: 'next' })
	})

	it('empty batch is a no-op', async () => {
		await expect(adapter.atomicBatch!([])).resolves.toBeUndefined()
	})

	it('cleans up journal files after successful batch', async () => {
		await adapter.atomicBatch!([
			{ type: 'set', key: 'j1', value: 'val' }
		])

		const files = await readdir(adapter.getBaseDir())
		const journals = files.filter(f => f.endsWith('.journal') || f.endsWith('.journal.tmp'))
		expect(journals).toHaveLength(0)
	})

	it('recovers incomplete journal on init', async () => {
		// Manually write a journal file that sets two keys
		const journalContent = JSON.stringify({
			v: 1,
			ops: [
				{ t: 's', k: 'recovered-a', d: 'val-a' },
				{ t: 's', k: 'recovered-b', d: 'val-b' }
			]
		})
		await writeFile(join(testDir, '_batch_test123.journal'), journalContent, 'utf-8')

		// Create a new adapter pointing at the same directory
		const freshAdapter = new FileAdapter({ baseDir: testDir })
		await freshAdapter.init()

		expect(await freshAdapter.get('recovered-a')).toBe('val-a')
		expect(await freshAdapter.get('recovered-b')).toBe('val-b')

		// Journal should be cleaned up
		const files = await readdir(testDir)
		const journals = files.filter(f => f.endsWith('.journal'))
		expect(journals).toHaveLength(0)

		await freshAdapter.shutdown()
	})

	it('discards corrupt journal on init without crashing', async () => {
		await writeFile(join(testDir, '_batch_corrupt.journal'), 'not valid json!!!', 'utf-8')

		const freshAdapter = new FileAdapter({ baseDir: testDir })
		await expect(freshAdapter.init()).resolves.not.toThrow()

		// Corrupt journal should be cleaned up
		const files = await readdir(testDir)
		const journals = files.filter(f => f.endsWith('.journal'))
		expect(journals).toHaveLength(0)

		await freshAdapter.shutdown()
	})

	it('batch with only delete operations', async () => {
		await adapter.set('del-a', 'a')
		await adapter.set('del-b', 'b')
		await adapter.set('keep', 'yes')

		await adapter.atomicBatch!([
			{ type: 'delete', key: 'del-a' },
			{ type: 'delete', key: 'del-b' }
		])

		expect(await adapter.has('del-a')).toBe(false)
		expect(await adapter.has('del-b')).toBe(false)
		expect(await adapter.get('keep')).toBe('yes')

		// No leftover journals
		const files = await readdir(testDir)
		const journals = files.filter(f => f.endsWith('.journal') || f.endsWith('.journal.tmp'))
		expect(journals).toHaveLength(0)
	})

	it('batch with only passing checks (no mutations) is a no-op', async () => {
		await adapter.set('checked', { _version: 5, data: 'ok' })

		await adapter.atomicBatch!([
			{ type: 'check', key: 'checked', expectedVersion: 5 }
		])

		// Data unchanged
		expect(await adapter.get('checked')).toEqual({ _version: 5, data: 'ok' })

		// No journal created for check-only batches
		const files = await readdir(testDir)
		const journals = files.filter(f => f.endsWith('.journal') || f.endsWith('.journal.tmp'))
		expect(journals).toHaveLength(0)
	})

	it('orphaned .journal.tmp cleaned up on init', async () => {
		await writeFile(join(testDir, '_batch_orphan.journal.tmp'), '{"partial": true}', 'utf-8')

		const freshAdapter = new FileAdapter({ baseDir: testDir })
		await freshAdapter.init()

		const files = await readdir(testDir)
		const temps = files.filter(f => f.endsWith('.journal.tmp'))
		expect(temps).toHaveLength(0)

		await freshAdapter.shutdown()
	})

	it('partial replay: valid ops before unknown op are committed, journal discarded', async () => {
		// This documents the known limitation: ops before the unknown type
		// are applied before replayJournal throws, and the journal is then discarded.
		const partialJournal = JSON.stringify({
			v: 1,
			ops: [
				{ t: 's', k: 'partial-set', d: 'was-written' },
				{ t: 'x', k: 'bomb' },
				{ t: 's', k: 'never-reached', d: 'skipped' }
			]
		})
		await writeFile(join(testDir, '_batch_partial.journal'), partialJournal, 'utf-8')

		const freshAdapter = new FileAdapter({ baseDir: testDir })
		await freshAdapter.init()

		// Journal discarded
		const files = await readdir(testDir)
		const journals = files.filter(f => f.endsWith('.journal'))
		expect(journals).toHaveLength(0)

		// First op was applied before the throw
		expect(await freshAdapter.get('partial-set')).toBe('was-written')
		// Third op was never reached
		expect(await freshAdapter.has('never-reached')).toBe(false)

		await freshAdapter.shutdown()
	})

	it('unknown journal op type treated as corrupt and discarded', async () => {
		await adapter.set('innocent', 'safe-value')

		// Write a journal with an unknown op type
		const badJournal = JSON.stringify({
			v: 1,
			ops: [{ t: 'x', k: 'innocent' }]
		})
		await writeFile(join(testDir, '_batch_bad_op.journal'), badJournal, 'utf-8')

		// Fresh adapter init should recover journals — corrupt one gets discarded
		const freshAdapter = new FileAdapter({ baseDir: testDir })
		await freshAdapter.init()

		// Journal should be discarded
		const files = await readdir(testDir)
		const journals = files.filter(f => f.endsWith('.journal'))
		expect(journals).toHaveLength(0)

		// Innocent key must still have its value
		expect(await freshAdapter.get('innocent')).toBe('safe-value')

		await freshAdapter.shutdown()
	})
})
