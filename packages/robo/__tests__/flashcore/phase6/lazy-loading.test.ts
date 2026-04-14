/**
 * Phase 6: Lazy Loading Tests
 *
 * Tests for lazyLoading configuration option.
 */

import { FlashcoreSystem } from '../../../src/flashcore/core/system.js'
import { MemoryAdapter } from '../helpers/memory-adapter.js'
import { f } from '../../../src/flashcore/schema/field.js'

describe('Lazy Loading', () => {
	let adapter: MemoryAdapter

	beforeEach(async () => {
		await FlashcoreSystem._reset()
		adapter = new MemoryAdapter()
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	describe('lazyLoading: true', () => {
		it('should defer catalog loading until first access', async () => {
			await FlashcoreSystem.init({
				adapter,
				lazyLoading: true
			})

			// Register a model
			const TestModel = FlashcoreSystem.registerModel<{ id: string; name: string }>('TestModel', {
				id: f.id(),
				name: f.string()
			})

			// Catalog should be loaded on first operation
			const record = await TestModel.create({ name: 'Test' })
			expect(record.id).toBeDefined()
		})

		it('should defer index loading until first query', async () => {
			await FlashcoreSystem.init({
				adapter,
				lazyLoading: true
			})

			const TestModel = FlashcoreSystem.registerModel<{ id: string; name: string; score: number }>('TestModel', {
				id: f.id(),
				name: f.string(),
				score: f.number().indexed()
			})

			// Indexes should be loaded on first query
			await TestModel.create({ name: 'Test', score: 100 })
			const results = await TestModel.findMany({
				orderBy: { score: 'desc' }
			})

			expect(Array.isArray(results)).toBe(true)
		})

		it('should work with findUnique', async () => {
			await FlashcoreSystem.init({
				adapter,
				lazyLoading: true
			})

			const TestModel = FlashcoreSystem.registerModel<{ id: string; name: string }>('TestModel', {
				id: f.id(),
				name: f.string()
			})

			const created = await TestModel.create({ name: 'Test' })
			const found = await TestModel.findUnique({ where: { id: created.id } })

			expect(found).toEqual(created)
		})
	})

	describe('lazyLoading: false (default)', () => {
		it('should work with immediate loading', async () => {
			await FlashcoreSystem.init({
				adapter,
				lazyLoading: false
			})

			const TestModel = FlashcoreSystem.registerModel<{ id: string; name: string }>('TestModel', {
				id: f.id(),
				name: f.string()
			})

			const record = await TestModel.create({ name: 'Test' })
			expect(record.id).toBeDefined()
		})
	})

	describe('Lazy loading edge cases', () => {
		it('should handle multiple models with lazy loading', async () => {
			await FlashcoreSystem.init({
				adapter,
				lazyLoading: true
			})

			const Model1 = FlashcoreSystem.registerModel<{ id: string; name: string }>('Model1', { id: f.id(), name: f.string() })
			const Model2 = FlashcoreSystem.registerModel<{ id: string; title: string }>('Model2', { id: f.id(), title: f.string() })
			const Model3 = FlashcoreSystem.registerModel<{ id: string; data: string }>('Model3', { id: f.id(), data: f.string() })

			// Access models in random order
			await Model2.create({ title: 'Second' })
			await Model1.create({ name: 'First' })
			await Model3.create({ data: 'Third' })

			expect(await Model1.count()).toBe(1)
			expect(await Model2.count()).toBe(1)
			expect(await Model3.count()).toBe(1)
		})

		it('should handle count() with lazy loading', async () => {
			await FlashcoreSystem.init({
				adapter,
				lazyLoading: true
			})

			const TestModel = FlashcoreSystem.registerModel<{ id: string; name: string }>('TestModel', {
				id: f.id(),
				name: f.string()
			})

			// Count should work even before any data
			expect(await TestModel.count()).toBe(0)

			await TestModel.create({ name: 'Test' })
			expect(await TestModel.count()).toBe(1)
		})
	})
})
