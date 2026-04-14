/**
 * Phase 6: Flush Indexes Tests
 *
 * Tests for $.flushIndexes() and index persistence.
 */

import { FlashcoreSystem } from '../../../src/flashcore/core/system.js'
import { MemoryAdapter } from '../helpers/memory-adapter.js'
import { f } from '../../../src/flashcore/schema/field.js'

describe('FlashcoreSystem.flushIndexes()', () => {
	let adapter: MemoryAdapter

	beforeEach(async () => {
		await FlashcoreSystem._reset()
		adapter = new MemoryAdapter()
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	it('should not throw when called with no dirty indexes', async () => {
		await FlashcoreSystem.init({ adapter })

		await expect(FlashcoreSystem.flushIndexes()).resolves.not.toThrow()
	})

	it('should flush indexes after registering a model', async () => {
		await FlashcoreSystem.init({
			adapter,
			indexPersistence: {
				strategy: 'batched'
			}
		})

		// Register a model with an indexed field
		const TestModel = FlashcoreSystem.registerModel<{ id: string; name: string; createdAt: number }>('TestModel', {
			id: f.id(),
			name: f.string(),
			createdAt: f.number().indexed()
		})

		// Create a record (this updates indexes)
		await TestModel.create({
			name: 'Test Record',
			createdAt: Date.now()
		})

		// Flush should complete without error
		await expect(FlashcoreSystem.flushIndexes()).resolves.not.toThrow()
	})

	it('should be callable multiple times', async () => {
		await FlashcoreSystem.init({ adapter })

		// Multiple flush calls should all succeed
		await FlashcoreSystem.flushIndexes()
		await FlashcoreSystem.flushIndexes()
		await FlashcoreSystem.flushIndexes()
	})

	it('should throw if not initialized', async () => {
		await expect(FlashcoreSystem.flushIndexes()).rejects.toThrow(/not initialized/i)
	})
})

describe('Index persistence strategies', () => {
	let adapter: MemoryAdapter

	beforeEach(async () => {
		await FlashcoreSystem._reset()
		adapter = new MemoryAdapter()
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	it('should support immediate strategy', async () => {
		await FlashcoreSystem.init({
			adapter,
			indexPersistence: {
				strategy: 'immediate'
			}
		})

		const TestModel = FlashcoreSystem.registerModel<{ id: string; name: string }>('TestModel', {
			id: f.id(),
			name: f.string()
		})

		await TestModel.create({ name: 'Test' })
		// With immediate strategy, indexes should be flushed immediately

		await FlashcoreSystem.flushIndexes()
	})

	it('should support batched strategy', async () => {
		await FlashcoreSystem.init({
			adapter,
			indexPersistence: {
				strategy: 'batched'
			}
		})

		const TestModel = FlashcoreSystem.registerModel<{ id: string; name: string }>('TestModel', {
			id: f.id(),
			name: f.string()
		})

		await TestModel.create({ name: 'Test' })

		await FlashcoreSystem.flushIndexes()
	})

	it('should support periodic strategy', async () => {
		await FlashcoreSystem.init({
			adapter,
			indexPersistence: {
				strategy: 'periodic',
				intervalMs: 60000 // Long interval to prevent interference
			}
		})

		const TestModel = FlashcoreSystem.registerModel<{ id: string; name: string }>('TestModel', {
			id: f.id(),
			name: f.string()
		})

		await TestModel.create({ name: 'Test' })

		// Manual flush should still work
		await FlashcoreSystem.flushIndexes()
	})
})
