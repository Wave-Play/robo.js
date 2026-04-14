/**
 * Flashcore v1 (spec rev 4.3) Phase 1 Tests - Catalog and Chunk
 *
 * Tests catalog-chunk consistency, chunk assignment, catalog serialization.
 */

import {
	Flashcore,
	FlashcoreSystem,
	MemoryAdapter,
	f
} from '../helpers/flashcore-compat.js'
import { Catalog } from '../../../src/flashcore/model/catalog.js'

describe('Catalog and Chunk', () => {
	beforeEach(async () => {
		await FlashcoreSystem._reset()
		await Flashcore.$.init({ adapter: new MemoryAdapter() })
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	describe('Catalog', () => {
		describe('Basic Operations', () => {
			it('should start empty', () => {
				const catalog = Catalog.empty()
				expect(catalog.getCount()).toBe(0)
				expect(catalog.getChunkIds()).toEqual([])
			})

			it('should add entries correctly', () => {
				const catalog = Catalog.empty()

				catalog.addEntry('id-1', 0)
				catalog.addEntry('id-2', 0)
				catalog.addEntry('id-3', 1)

				expect(catalog.getCount()).toBe(3)
				expect(catalog.has('id-1')).toBe(true)
				expect(catalog.has('id-2')).toBe(true)
				expect(catalog.has('id-3')).toBe(true)
				expect(catalog.has('id-4')).toBe(false)
			})

			it('should track chunk for each entry', () => {
				const catalog = Catalog.empty()

				catalog.addEntry('id-1', 0)
				catalog.addEntry('id-2', 1)
				catalog.addEntry('id-3', 0)

				expect(catalog.getChunkFor('id-1')).toBe(0)
				expect(catalog.getChunkFor('id-2')).toBe(1)
				expect(catalog.getChunkFor('id-3')).toBe(0)
				expect(catalog.getChunkFor('id-4')).toBeNull()
			})

			it('should remove entries correctly', () => {
				const catalog = Catalog.empty()

				catalog.addEntry('id-1', 0)
				catalog.addEntry('id-2', 0)
				catalog.addEntry('id-3', 1)

				catalog.removeEntry('id-2')

				expect(catalog.getCount()).toBe(2)
				expect(catalog.has('id-1')).toBe(true)
				expect(catalog.has('id-2')).toBe(false)
				expect(catalog.has('id-3')).toBe(true)
			})

			it('should track chunk IDs', () => {
				const catalog = Catalog.empty()

				catalog.addEntry('id-1', 0)
				catalog.addEntry('id-2', 1)
				catalog.addEntry('id-3', 2)
				catalog.addEntry('id-4', 0)

				const chunkIds = catalog.getChunkIds().sort((a, b) => a - b)
				expect(chunkIds).toEqual([0, 1, 2])
			})

			it('should track chunk counts', () => {
				const catalog = Catalog.empty()

				catalog.addEntry('id-1', 0)
				catalog.addEntry('id-2', 0)
				catalog.addEntry('id-3', 0)
				catalog.addEntry('id-4', 1)

				expect(catalog.getChunkCount(0)).toBe(3)
				expect(catalog.getChunkCount(1)).toBe(1)
				expect(catalog.getChunkCount(2)).toBe(0)
			})

			it('should decrement chunk count on remove', () => {
				const catalog = Catalog.empty()

				catalog.addEntry('id-1', 0)
				catalog.addEntry('id-2', 0)

				expect(catalog.getChunkCount(0)).toBe(2)

				catalog.removeEntry('id-1')

				expect(catalog.getChunkCount(0)).toBe(1)
			})
		})

		describe('Serialization', () => {
			it('should serialize and deserialize correctly', () => {
				const catalog = Catalog.empty()

				catalog.addEntry('id-1', 0)
				catalog.addEntry('id-2', 0)
				catalog.addEntry('id-3', 1)

				const serialized = catalog.serialize()
				const restored = Catalog.deserialize(serialized)

				expect(restored.getCount()).toBe(3)
				expect(restored.has('id-1')).toBe(true)
				expect(restored.has('id-2')).toBe(true)
				expect(restored.has('id-3')).toBe(true)
				expect(restored.getChunkFor('id-1')).toBe(0)
				expect(restored.getChunkFor('id-3')).toBe(1)
			})

			it('should preserve chunk stats after deserialization', () => {
				const catalog = Catalog.empty()

				catalog.addEntry('id-1', 0)
				catalog.addEntry('id-2', 0)
				catalog.addEntry('id-3', 1)

				const serialized = catalog.serialize()
				const restored = Catalog.deserialize(serialized)

				expect(restored.getChunkCount(0)).toBe(2)
				expect(restored.getChunkCount(1)).toBe(1)
			})

			it('should handle empty catalog serialization', () => {
				const catalog = Catalog.empty()
				const serialized = catalog.serialize()
				const restored = Catalog.deserialize(serialized)

				expect(restored.getCount()).toBe(0)
				expect(restored.getChunkIds()).toEqual([])
			})
		})

		describe('Sample IDs', () => {
			it('should return sample of IDs', () => {
				const catalog = Catalog.empty()

				for (let i = 0; i < 100; i++) {
					catalog.addEntry(`id-${i}`, Math.floor(i / 50))
				}

				const sample = catalog.getSampleIds(10)

				expect(sample).toHaveLength(10)
				sample.forEach(id => {
					expect(catalog.has(id)).toBe(true)
				})
			})

			it('should return all IDs if requested more than available', () => {
				const catalog = Catalog.empty()

				catalog.addEntry('id-1', 0)
				catalog.addEntry('id-2', 0)
				catalog.addEntry('id-3', 0)

				const sample = catalog.getSampleIds(10)

				expect(sample).toHaveLength(3)
			})
		})
	})

	describe('Catalog-Chunk Consistency', () => {
		it('should maintain catalog-chunk consistency after creates', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			// Create multiple records
			const created = await Promise.all(
				Array.from({ length: 10 }, (_, i) =>
					User.create({ name: `User ${i}` })
				)
			)

			// Each created record should be findable
			for (const record of created) {
				const found = await User.findUnique({ where: { id: record.id } })
				expect(found).not.toBeNull()
				expect(found?.id).toBe(record.id)
			}
		})

		it('should maintain consistency after deletes', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			// Create records
			await Promise.all(
				Array.from({ length: 10 }, (_, i) =>
					User.create({ id: `user-${i}`, name: `User ${i}` })
				)
			)

			// Delete half
			for (let i = 0; i < 5; i++) {
				await User.delete({ where: { id: `user-${i}` } })
			}

			// Deleted records should not be found
			for (let i = 0; i < 5; i++) {
				const found = await User.findUnique({ where: { id: `user-${i}` } })
				expect(found).toBeNull()
			}

			// Remaining records should be found
			for (let i = 5; i < 10; i++) {
				const found = await User.findUnique({ where: { id: `user-${i}` } })
				expect(found).not.toBeNull()
			}

			// Count should match
			expect(await User.count()).toBe(5)
		})

		it('should persist catalog correctly', async () => {
			const adapter = new MemoryAdapter()
			await FlashcoreSystem._reset()
			await Flashcore.$.init({ adapter })

			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			// Create records
			await User.create({ id: 'user-1', name: 'Alice' })
			await User.create({ id: 'user-2', name: 'Bob' })

			// Force catalog reload
			await (User as unknown as { _reloadCatalog: () => Promise<void> })._reloadCatalog()

			// Records should still be findable
			const found1 = await User.findUnique({ where: { id: 'user-1' } })
			const found2 = await User.findUnique({ where: { id: 'user-2' } })

			expect(found1?.name).toBe('Alice')
			expect(found2?.name).toBe('Bob')
		})
	})

	describe('Chunk Assignment', () => {
		it('should assign records to chunks within capacity', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			// Create 100 records (default chunk size is 50)
			await Promise.all(
				Array.from({ length: 100 }, (_, i) =>
					User.create({ name: `User ${i}` })
				)
			)

			// All should be accessible
			expect(await User.count()).toBe(100)
		})

		it('should create new chunks when needed', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			// Create more than one chunk's worth
			await Promise.all(
				Array.from({ length: 60 }, (_, i) =>
					User.create({ name: `User ${i}` })
				)
			)

			const catalog = (User as unknown as { _getCatalog: () => Catalog })._getCatalog()
			const chunkIds = catalog.getChunkIds()

			// Should have more than one chunk
			expect(chunkIds.length).toBeGreaterThan(1)
		})

		it('should not overwrite existing records in chunk', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			// Create records with specific IDs
			await User.create({ id: 'first', name: 'First' })
			await User.create({ id: 'second', name: 'Second' })
			await User.create({ id: 'third', name: 'Third' })

			// All should be distinct
			const first = await User.findUnique({ where: { id: 'first' } })
			const second = await User.findUnique({ where: { id: 'second' } })
			const third = await User.findUnique({ where: { id: 'third' } })

			expect(first?.name).toBe('First')
			expect(second?.name).toBe('Second')
			expect(third?.name).toBe('Third')
		})
	})

	describe('Chunk Storage Keys', () => {
		it('should use correct storage key format', async () => {
			const adapter = new MemoryAdapter()
			await FlashcoreSystem._reset()
			await Flashcore.$.init({ adapter })

			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			await User.create({ name: 'Alice' })

			// Should have catalog key and at least one chunk key
			const keys = adapter.keys()
			const catalogKey = keys.find(k => k.includes('catalog'))
			const chunkKey = keys.find(k => k.includes('chunk'))

			expect(catalogKey).toBeDefined()
			expect(chunkKey).toBeDefined()
		})

		it('should use namespace in storage keys', async () => {
			const adapter = new MemoryAdapter()
			await FlashcoreSystem._reset()
			await Flashcore.$.init({ adapter })

			const schema = FlashcoreSystem.schema('myapp')
			const User = schema.model<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			await User.create({ name: 'Alice' })

			const keys = adapter.keys()
			const namespacedKey = keys.find(k => k.includes('myapp'))

			expect(namespacedKey).toBeDefined()
		})
	})
})
