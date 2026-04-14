/**
 * Phase 6: Background Index Rebuild Tests
 *
 * Tests for $.rebuildIndexesDedicated() functionality.
 */

import { FlashcoreSystem, MemoryAdapter, f } from 'robo.js/flashcore'
import { registerAllExtensions } from '../helpers/register-extensions.js'

describe('FlashcoreSystem.rebuildIndexesDedicated()', () => {
	let adapter: MemoryAdapter

	beforeEach(async () => {
		await FlashcoreSystem._reset()
		registerAllExtensions()
		adapter = new MemoryAdapter()
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	it('should rebuild indexes for a model', async () => {
		await FlashcoreSystem.init({ adapter })

		const TestModel = FlashcoreSystem.registerModel<{ id: string; name: string; score: number }>('TestModel', {
			id: f.id(),
			name: f.string(),
			score: f.number().indexed()
		})

		// Create some records
		await TestModel.create({ name: 'Alice', score: 100 })
		await TestModel.create({ name: 'Bob', score: 200 })
		await TestModel.create({ name: 'Carol', score: 150 })

		// Rebuild indexes in background
		await FlashcoreSystem.rebuildIndexesDedicated('TestModel')

		// Verify queries still work after rebuild
		const results = await TestModel.findMany({
			orderBy: { score: 'desc' }
		})

		expect(results).toHaveLength(3)
		expect(results[0]?.name).toBe('Bob') // Highest score
	})

	it('should throw for non-existent model', async () => {
		await FlashcoreSystem.init({ adapter })

		await expect(FlashcoreSystem.rebuildIndexesDedicated('NonExistent')).rejects.toThrow(
			/not found/i
		)
	})

	it('should throw if not initialized', async () => {
		await expect(FlashcoreSystem.rebuildIndexesDedicated('TestModel')).rejects.toThrow(
			/not initialized/i
		)
	})

	it('should increment indexRebuilds metric', async () => {
		await FlashcoreSystem.init({ adapter })

		const TestModel = FlashcoreSystem.registerModel<{ id: string; name: string }>('TestModel', {
			id: f.id(),
			name: f.string()
		})

		await TestModel.create({ name: 'Test' })

		const metricsBefore = FlashcoreSystem.metrics()
		await FlashcoreSystem.rebuildIndexesDedicated('TestModel')
		const metricsAfter = FlashcoreSystem.metrics()

		expect(metricsAfter.indexRebuilds).toBe(metricsBefore.indexRebuilds + 1)
	})

	it('should work with indexed fields', async () => {
		await FlashcoreSystem.init({ adapter })

		const TestModel = FlashcoreSystem.registerModel<{ id: string; name: string; priority: number; createdAt: number }>('TestModel', {
			id: f.id(),
			name: f.string(),
			priority: f.number().indexed(),
			createdAt: f.number().indexed()
		})

		const now = Date.now()
		await TestModel.create({ name: 'A', priority: 1, createdAt: now })
		await TestModel.create({ name: 'B', priority: 3, createdAt: now + 1000 })
		await TestModel.create({ name: 'C', priority: 2, createdAt: now + 2000 })

		await FlashcoreSystem.rebuildIndexesDedicated('TestModel')

		// Query using rebuilt indexes
		const byPriority = await TestModel.findMany({
			orderBy: { priority: 'asc' }
		})
		expect(byPriority.map((r) => r.name)).toEqual(['A', 'C', 'B'])

		const byDate = await TestModel.findMany({
			orderBy: { createdAt: 'desc' }
		})
		expect(byDate.map((r) => r.name)).toEqual(['C', 'B', 'A'])
	})

	it('should work with namespaced models', async () => {
		await FlashcoreSystem.init({ adapter })

		const schema = FlashcoreSystem.schema('plugin')
		const PluginModel = schema.model<{ id: string; data: string }>('PluginModel', {
			id: f.id(),
			data: f.string()
		})

		await PluginModel.create({ data: 'test' })

		await FlashcoreSystem.rebuildIndexesDedicated('plugin::PluginModel')
	})
})

describe('FlashcoreSystem.rebuildIndexes()', () => {
	let adapter: MemoryAdapter

	beforeEach(async () => {
		await FlashcoreSystem._reset()
		registerAllExtensions()
		adapter = new MemoryAdapter()
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	it('should rebuild indexes for a specific model', async () => {
		await FlashcoreSystem.init({ adapter })

		const TestModel = FlashcoreSystem.registerModel<{ id: string; name: string }>('TestModel', {
			id: f.id(),
			name: f.string()
		})

		await TestModel.create({ name: 'Test' })
		await FlashcoreSystem.rebuildIndexes('TestModel')
	})

	it('should rebuild indexes for all models when no name provided', async () => {
		await FlashcoreSystem.init({ adapter })

		const Model1 = FlashcoreSystem.registerModel<{ id: string; name: string }>('Model1', { id: f.id(), name: f.string() })
		const Model2 = FlashcoreSystem.registerModel<{ id: string; name: string }>('Model2', { id: f.id(), name: f.string() })

		await Model1.create({ name: 'Test1' })
		await Model2.create({ name: 'Test2' })

		// Rebuild all
		await FlashcoreSystem.rebuildIndexes()
	})

	it('should throw for non-existent model', async () => {
		await FlashcoreSystem.init({ adapter })

		await expect(FlashcoreSystem.rebuildIndexes('NonExistent')).rejects.toThrow(/not found/i)
	})
})
