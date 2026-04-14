/**
 * Flashcore v1 (spec rev 4.3) Phase 5 Tests - Chunk Write CAS
 *
 * Tests CAS (compare-and-swap) retry path for chunk writes.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { FlashcoreSystem, MemoryAdapter } from '../helpers/flashcore-compat.js'
import { ChunkManager } from '../../../src/flashcore/model/chunk.js'
import { TransactionConflictError } from '../../../src/flashcore/core/errors.js'

describe('Chunk Write CAS', () => {
	let adapter: MemoryAdapter

	beforeEach(async () => {
		await FlashcoreSystem._reset()
		adapter = new MemoryAdapter()
		await adapter.init?.()
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	// Helper to create a CAS adapter by extending the base MemoryAdapter
	function createCasAdapter(casImpl: (key: string, expected: unknown, value: unknown) => Promise<boolean>) {
		return {
			name: adapter.name,
			get: adapter.get.bind(adapter),
			set: adapter.set.bind(adapter),
			delete: adapter.delete.bind(adapter),
			has: adapter.has.bind(adapter),
			clear: adapter.clear.bind(adapter),
			compareAndSwap: casImpl
		}
	}

	describe('CAS-Capable Adapter', () => {
		it('should use CAS when adapter supports compareAndSwap', async () => {
			let casCallCount = 0
			const casAdapter = createCasAdapter(async (key, _expected, value) => {
				casCallCount++
				// Simulate successful CAS
				await adapter.set(key, value)
				return true
			})

			const chunkManager = new ChunkManager({
				adapter: casAdapter,
				modelName: 'Test'
			})

			const chunkData = { 'id-1': { id: 'id-1', name: 'Test' } }
			await chunkManager.saveChunkWithCAS(0, chunkData, {})

			expect(casCallCount).toBe(1)
		})

		it('should throw TransactionConflictError on CAS failure', async () => {
			const casAdapter = createCasAdapter(async () => {
				// Simulate CAS failure (concurrent modification)
				return false
			})

			const chunkManager = new ChunkManager({
				adapter: casAdapter,
				modelName: 'Test'
			})

			const chunkData = { 'id-1': { id: 'id-1' } }
			await expect(
				chunkManager.saveChunkWithCAS(0, chunkData, {})
			).rejects.toThrow(TransactionConflictError)
		})

		it('should invalidate cache on CAS failure', async () => {
			const casAdapter = createCasAdapter(async () => false)

			const chunkManager = new ChunkManager({
				adapter: casAdapter,
				modelName: 'Test'
			})

			// Pre-populate cache
			await chunkManager.setRecord(0, 'id-1', { id: 'id-1' })

			// Get cache stats before CAS failure
			const statsBefore = chunkManager.getCacheStats()
			expect(statsBefore.entries).toContain(0)

			// CAS should fail and invalidate cache
			try {
				await chunkManager.saveChunkWithCAS(0, { 'id-2': { id: 'id-2' } }, {})
			} catch {
				// Expected to throw
			}

			// Cache should be invalidated for this chunk
			const statsAfter = chunkManager.getCacheStats()
			expect(statsAfter.entries).not.toContain(0)
		})

		it('should include model info in TransactionConflictError', async () => {
			const casAdapter = createCasAdapter(async () => false)

			const chunkManager = new ChunkManager({
				adapter: casAdapter,
				modelName: 'UserProfile'
			})

			try {
				await chunkManager.saveChunkWithCAS(5, { 'id-1': { id: 'id-1' } }, {})
				throw new Error('Should have thrown')
			} catch (error) {
				if (error instanceof Error && error.message === 'Should have thrown') {
					throw error
				}
				expect(error).toBeInstanceOf(TransactionConflictError)
				const conflictError = error as TransactionConflictError
				expect(conflictError.model).toBe('UserProfile')
				expect(conflictError.id).toBe('chunk:5')
			}
		})
	})

	describe('Non-CAS Adapter Fallback', () => {
		it('should fall back to regular set when CAS not available', async () => {
			// Create an adapter WITHOUT compareAndSwap
			const noCasAdapter = {
				name: adapter.name,
				get: adapter.get.bind(adapter),
				set: adapter.set.bind(adapter),
				delete: adapter.delete.bind(adapter),
				has: adapter.has.bind(adapter),
				clear: adapter.clear.bind(adapter)
				// Note: no compareAndSwap method
			}

			const chunkManager = new ChunkManager({
				adapter: noCasAdapter,
				modelName: 'Test'
			})

			const chunkData = { 'id-1': { id: 'id-1' } }
			// This should fall back to regular set since adapter has no CAS
			await chunkManager.saveChunkWithCAS(0, chunkData, {})

			const loaded = await chunkManager.getRecord(0, 'id-1')
			expect(loaded).toEqual({ id: 'id-1' })
		})

		it('should fall back to regular set when expectedData is undefined', async () => {
			const casAdapter = createCasAdapter(async () => {
				throw new Error('Should not be called')
			})

			const chunkManager = new ChunkManager({
				adapter: casAdapter,
				modelName: 'Test'
			})

			// No expected data = fall back to regular set
			const chunkData = { 'id-1': { id: 'id-1' } }
			await chunkManager.saveChunkWithCAS(0, chunkData, undefined)

			const loaded = await chunkManager.getRecord(0, 'id-1')
			expect(loaded).toEqual({ id: 'id-1' })
		})
	})

	describe('CAS with Cache', () => {
		it('should update cache on successful CAS', async () => {
			const casAdapter = createCasAdapter(async (key, _expected, value) => {
				await adapter.set(key, value)
				return true
			})

			const chunkManager = new ChunkManager({
				adapter: casAdapter,
				modelName: 'Test'
			})

			const chunkData = { 'id-1': { id: 'id-1', version: 2 } }
			await chunkManager.saveChunkWithCAS(0, chunkData, {})

			// Cache should be updated
			const stats = chunkManager.getCacheStats()
			expect(stats.entries).toContain(0)

			// Should get cached data
			const record = await chunkManager.getRecord(0, 'id-1')
			expect(record).toEqual({ id: 'id-1', version: 2 })
		})
	})

	describe('Concurrent Modification Scenario', () => {
		it('should detect concurrent modification', async () => {
			let callCount = 0
			const casAdapter = createCasAdapter(async (key, _expected, value) => {
				callCount++
				// First call fails (simulating concurrent modification)
				// Second call succeeds
				if (callCount === 1) {
					return false
				}
				await adapter.set(key, value)
				return true
			})

			const chunkManager = new ChunkManager({
				adapter: casAdapter,
				modelName: 'Test'
			})

			// First attempt should fail
			await expect(
				chunkManager.saveChunkWithCAS(0, { 'id-1': { id: 'id-1' } }, {})
			).rejects.toThrow(TransactionConflictError)

			// Second attempt should succeed (simulating retry after reload)
			await chunkManager.saveChunkWithCAS(0, { 'id-1': { id: 'id-1' } }, {})

			expect(callCount).toBe(2)
		})
	})
})
