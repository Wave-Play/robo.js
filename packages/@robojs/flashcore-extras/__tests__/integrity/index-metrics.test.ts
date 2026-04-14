/**
 * Phase 6: Index Metrics Tests
 *
 * Tests for index-related metrics tracking.
 */

import { FlashcoreSystem, MemoryAdapter, f } from 'robo.js/flashcore'
import { registerAllExtensions } from '../helpers/register-extensions.js'

describe('Index Metrics', () => {
	let adapter: MemoryAdapter

	beforeEach(async () => {
		await FlashcoreSystem._reset()
		registerAllExtensions()
		adapter = new MemoryAdapter()
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	describe('indexRebuilds counter', () => {
		it('should start at zero', async () => {
			await FlashcoreSystem.init({ adapter })

			const metrics = FlashcoreSystem.metrics()
			expect(metrics.indexRebuilds).toBe(0)
		})

		it('should increment on rebuildIndexes()', async () => {
			await FlashcoreSystem.init({ adapter })

			const TestModel = FlashcoreSystem.registerModel<{ id: string; name: string }>('TestModel', {
				id: f.id(),
				name: f.string()
			})

			await TestModel.create({ name: 'Test' })

			const before = FlashcoreSystem.metrics().indexRebuilds
			await FlashcoreSystem.rebuildIndexes('TestModel')
			const after = FlashcoreSystem.metrics().indexRebuilds

			expect(after).toBe(before + 1)
		})

		it('should increment on rebuildIndexesDedicated()', async () => {
			await FlashcoreSystem.init({ adapter })

			const TestModel = FlashcoreSystem.registerModel<{ id: string; name: string }>('TestModel', {
				id: f.id(),
				name: f.string()
			})

			await TestModel.create({ name: 'Test' })

			const before = FlashcoreSystem.metrics().indexRebuilds
			await FlashcoreSystem.rebuildIndexesDedicated('TestModel')
			const after = FlashcoreSystem.metrics().indexRebuilds

			expect(after).toBe(before + 1)
		})

		it('should increment for each model when rebuilding all', async () => {
			await FlashcoreSystem.init({ adapter })

			const Model1 = FlashcoreSystem.registerModel<{ id: string; name: string }>('Model1', { id: f.id(), name: f.string() })
			const Model2 = FlashcoreSystem.registerModel<{ id: string; name: string }>('Model2', { id: f.id(), name: f.string() })
			const Model3 = FlashcoreSystem.registerModel<{ id: string; name: string }>('Model3', { id: f.id(), name: f.string() })

			await Model1.create({ name: '1' })
			await Model2.create({ name: '2' })
			await Model3.create({ name: '3' })

			const before = FlashcoreSystem.metrics().indexRebuilds
			await FlashcoreSystem.rebuildIndexes() // Rebuild all
			const after = FlashcoreSystem.metrics().indexRebuilds

			expect(after).toBe(before + 3)
		})

		it('should increment on repair()', async () => {
			await FlashcoreSystem.init({ adapter })

			const TestModel = FlashcoreSystem.registerModel<{ id: string; name: string }>('TestModel', {
				id: f.id(),
				name: f.string()
			})

			await TestModel.create({ name: 'Test' })

			const before = FlashcoreSystem.metrics().indexRebuilds
			await FlashcoreSystem.repair('TestModel')
			const after = FlashcoreSystem.metrics().indexRebuilds

			expect(after).toBe(before + 1)
		})
	})

	describe('Metrics reset', () => {
		it('should reset indexRebuilds on resetMetrics()', async () => {
			await FlashcoreSystem.init({ adapter })

			const TestModel = FlashcoreSystem.registerModel<{ id: string; name: string }>('TestModel', {
				id: f.id(),
				name: f.string()
			})

			await TestModel.create({ name: 'Test' })
			await FlashcoreSystem.rebuildIndexes('TestModel')

			expect(FlashcoreSystem.metrics().indexRebuilds).toBeGreaterThan(0)

			FlashcoreSystem.resetMetrics()

			expect(FlashcoreSystem.metrics().indexRebuilds).toBe(0)
		})
	})

	describe('Metrics persistence across operations', () => {
		it('should maintain counts across multiple operations', async () => {
			await FlashcoreSystem.init({ adapter })

			const TestModel = FlashcoreSystem.registerModel<{ id: string; name: string }>('TestModel', {
				id: f.id(),
				name: f.string()
			})

			await TestModel.create({ name: 'Test1' })
			await TestModel.create({ name: 'Test2' })
			await TestModel.create({ name: 'Test3' })

			// Perform multiple rebuilds
			await FlashcoreSystem.rebuildIndexes('TestModel')
			await FlashcoreSystem.rebuildIndexes('TestModel')
			await FlashcoreSystem.rebuildIndexes('TestModel')

			expect(FlashcoreSystem.metrics().indexRebuilds).toBe(3)
		})
	})
})
