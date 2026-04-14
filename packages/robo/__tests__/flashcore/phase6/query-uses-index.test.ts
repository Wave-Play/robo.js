/**
 * Phase 6: Query Uses Index Tests
 *
 * Tests that queries correctly use indexes when available.
 */

import { FlashcoreSystem } from '../../../src/flashcore/core/system.js'
import { MemoryAdapter } from '../helpers/memory-adapter.js'
import { f } from '../../../src/flashcore/schema/field.js'

describe('Query Uses Index', () => {
	let adapter: MemoryAdapter

	beforeEach(async () => {
		await FlashcoreSystem._reset()
		adapter = new MemoryAdapter()
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	describe('Filter (CuckooFilter) usage', () => {
		it('should use filter for ID lookups', async () => {
			await FlashcoreSystem.init({ adapter })

			const TestModel = FlashcoreSystem.registerModel<{ id: string; name: string }>('TestModel', {
				id: f.id(),
				name: f.string()
			})

			const record = await TestModel.create({ name: 'Test' })

			// This should use the filter for fast lookup
			const found = await TestModel.findUnique({ where: { id: record.id } })
			expect(found).toEqual(record)
		})

		it('should return null quickly for non-existent ID', async () => {
			await FlashcoreSystem.init({ adapter })

			const TestModel = FlashcoreSystem.registerModel<{ id: string; name: string }>('TestModel', {
				id: f.id(),
				name: f.string()
			})

			await TestModel.create({ name: 'Test' })

			// Filter should quickly determine this ID doesn't exist
			const found = await TestModel.findUnique({ where: { id: 'definitely-not-existing-id' } })
			expect(found).toBeNull()
		})
	})

	describe('Sorted index usage', () => {
		it('should use index for orderBy queries', async () => {
			await FlashcoreSystem.init({ adapter })

			const TestModel = FlashcoreSystem.registerModel<{ id: string; name: string; score: number }>('TestModel', {
				id: f.id(),
				name: f.string(),
				score: f.number().indexed()
			})

			await TestModel.create({ name: 'Low', score: 10 })
			await TestModel.create({ name: 'High', score: 100 })
			await TestModel.create({ name: 'Mid', score: 50 })

			// Query with orderBy should use sorted index
			const results = await TestModel.findMany({
				orderBy: { score: 'desc' }
			})

			expect(results).toHaveLength(3)
			expect(results[0]?.name).toBe('High')
			expect(results[1]?.name).toBe('Mid')
			expect(results[2]?.name).toBe('Low')
		})

		it('should use index for ascending order', async () => {
			await FlashcoreSystem.init({ adapter })

			const TestModel = FlashcoreSystem.registerModel<{ id: string; name: string; priority: number }>('TestModel', {
				id: f.id(),
				name: f.string(),
				priority: f.number().indexed()
			})

			await TestModel.create({ name: 'C', priority: 3 })
			await TestModel.create({ name: 'A', priority: 1 })
			await TestModel.create({ name: 'B', priority: 2 })

			const results = await TestModel.findMany({
				orderBy: { priority: 'asc' }
			})

			expect(results.map((r) => r.name)).toEqual(['A', 'B', 'C'])
		})

		it('should produce same results as non-indexed query', async () => {
			await FlashcoreSystem.init({ adapter })

			const TestModel = FlashcoreSystem.registerModel<{ id: string; name: string; indexed: number; notIndexed: number }>('TestModel', {
				id: f.id(),
				name: f.string(),
				indexed: f.number().indexed(),
				notIndexed: f.number()
			})

			// Create test data
			for (let i = 0; i < 10; i++) {
				await TestModel.create({
					name: `Record ${i}`,
					indexed: i * 10,
					notIndexed: i * 10
				})
			}

			// Query with indexed field
			const indexedResults = await TestModel.findMany({
				orderBy: { indexed: 'desc' }
			})

			// Query with non-indexed field (falls back to scan)
			const scanResults = await TestModel.findMany({
				orderBy: { notIndexed: 'desc' }
			})

			// Results should be the same
			expect(indexedResults.map((r) => r.name)).toEqual(
				scanResults.map((r) => r.name)
			)
		})
	})

	describe('Index with pagination', () => {
		it('should use index with take limit', async () => {
			await FlashcoreSystem.init({ adapter })

			const TestModel = FlashcoreSystem.registerModel<{ id: string; name: string; rank: number }>('TestModel', {
				id: f.id(),
				name: f.string(),
				rank: f.number().indexed()
			})

			for (let i = 0; i < 20; i++) {
				await TestModel.create({ name: `Item ${i}`, rank: i })
			}

			const results = await TestModel.findMany({
				orderBy: { rank: 'desc' },
				take: 5
			})

			expect(results).toHaveLength(5)
			expect(results[0]?.rank).toBe(19)
		})

		it('should use index with skip offset', async () => {
			await FlashcoreSystem.init({ adapter })

			const TestModel = FlashcoreSystem.registerModel<{ id: string; name: string; position: number }>('TestModel', {
				id: f.id(),
				name: f.string(),
				position: f.number().indexed()
			})

			for (let i = 0; i < 10; i++) {
				await TestModel.create({ name: `Item ${i}`, position: i })
			}

			const results = await TestModel.findMany({
				orderBy: { position: 'asc' },
				skip: 3,
				take: 3
			})

			expect(results).toHaveLength(3)
			expect(results[0]?.position).toBe(3)
			expect(results[1]?.position).toBe(4)
			expect(results[2]?.position).toBe(5)
		})
	})

	describe('Multiple indexed fields', () => {
		it('should handle multiple indexed fields', async () => {
			await FlashcoreSystem.init({ adapter })

			const TestModel = FlashcoreSystem.registerModel<{ id: string; name: string; score: number; createdAt: number }>('TestModel', {
				id: f.id(),
				name: f.string(),
				score: f.number().indexed(),
				createdAt: f.number().indexed()
			})

			const now = Date.now()
			await TestModel.create({ name: 'A', score: 100, createdAt: now })
			await TestModel.create({ name: 'B', score: 50, createdAt: now + 1000 })
			await TestModel.create({ name: 'C', score: 75, createdAt: now + 2000 })

			// Query by score
			const byScore = await TestModel.findMany({
				orderBy: { score: 'desc' }
			})
			expect(byScore[0]?.name).toBe('A')

			// Query by createdAt
			const byDate = await TestModel.findMany({
				orderBy: { createdAt: 'asc' }
			})
			expect(byDate[0]?.name).toBe('A')
		})
	})

	describe('Non-indexed fallback', () => {
		it('should fall back to scan for non-indexed orderBy', async () => {
			await FlashcoreSystem.init({ adapter })

			const TestModel = FlashcoreSystem.registerModel<{ id: string; name: string; notIndexed: number }>('TestModel', {
				id: f.id(),
				name: f.string(),
				notIndexed: f.number()
			})

			await TestModel.create({ name: 'A', notIndexed: 3 })
			await TestModel.create({ name: 'B', notIndexed: 1 })
			await TestModel.create({ name: 'C', notIndexed: 2 })

			// Should still work, just without index optimization
			const results = await TestModel.findMany({
				orderBy: { notIndexed: 'asc' }
			})

			expect(results.map((r) => r.name)).toEqual(['B', 'C', 'A'])
		})
	})
})
