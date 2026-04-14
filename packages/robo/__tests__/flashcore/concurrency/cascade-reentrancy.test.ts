/**
 * Flashcore v1 (spec rev 4.3) - Cascade Re-entrancy Safety Tests
 *
 * Tests cascade depth limit enforcement (MAX_CASCADE_DEPTH = 50)
 * and concurrent cascade behavior.
 */

import {
	Flashcore,
	FlashcoreSystem,
	MemoryAdapter,
	FlashcoreError,
	MAX_CASCADE_DEPTH,
	f
} from '../helpers/flashcore-compat.js'

describe('Cascade Re-entrancy Safety', () => {
	beforeEach(async () => {
		await FlashcoreSystem._reset()
		await Flashcore.$.init({ adapter: new MemoryAdapter() })
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	it('throws FlashcoreError when cascade chain exceeds MAX_CASCADE_DEPTH', async () => {
		// Build a chain of 52 models (Level0 through Level51) so that deleting
		// Level0 triggers a cascade of depth 51, which exceeds MAX_CASCADE_DEPTH (50).
		const depth = MAX_CASCADE_DEPTH + 2 // 52 models, cascade depth reaches 50 (== MAX_CASCADE_DEPTH), triggering the >= check

		const models: any[] = []
		for (let i = 0; i < depth; i++) {
			const schema: Record<string, any> = {
				id: f.id(),
				name: f.string()
			}
			if (i > 0) {
				schema.parentId = f.string().indexed()
			}
			if (i < depth - 1) {
				schema.child = f.hasOne(`Level${i + 1}`, { foreignKey: 'parentId' }).onDelete('cascade')
			}
			models.push(FlashcoreSystem.registerModel(`Level${i}`, schema))
		}

		// Create a record at each level, chained by parentId
		const records: any[] = []
		for (let i = 0; i < depth; i++) {
			const data: Record<string, any> = { name: `record-${i}` }
			if (i > 0) {
				data.parentId = records[i - 1].id
			}
			records.push(await models[i].create(data))
		}

		// Deleting the root should trigger a cascade that exceeds MAX_CASCADE_DEPTH
		try {
			await models[0].delete({ where: { id: records[0].id } })
			throw new Error('Expected FlashcoreError to be thrown')
		} catch (error: any) {
			expect(error).toBeInstanceOf(FlashcoreError)
			expect(error.message).toContain(`Cascade depth limit (${MAX_CASCADE_DEPTH})`)
		}
	})

	it('completes cascade at depth well below MAX_CASCADE_DEPTH without error', async () => {
		// Build a chain of 6 models (Level0 through Level5), cascade depth = 5.
		// This is well below MAX_CASCADE_DEPTH and should complete without error.
		const depth = 6

		const models: any[] = []
		for (let i = 0; i < depth; i++) {
			const schema: Record<string, any> = {
				id: f.id(),
				name: f.string()
			}
			if (i > 0) {
				schema.parentId = f.string().indexed()
			}
			if (i < depth - 1) {
				schema.child = f.hasOne(`Chain${i + 1}`, { foreignKey: 'parentId' }).onDelete('cascade')
			}
			models.push(FlashcoreSystem.registerModel(`Chain${i}`, schema))
		}

		// Create chained records
		const records: any[] = []
		for (let i = 0; i < depth; i++) {
			const data: Record<string, any> = { name: `record-${i}` }
			if (i > 0) {
				data.parentId = records[i - 1].id
			}
			records.push(await models[i].create(data))
		}

		// Delete root - should cascade through all levels without error
		await models[0].delete({ where: { id: records[0].id } })

		// All records should be gone
		for (let i = 0; i < depth; i++) {
			const remaining = await models[i].findMany()
			expect(remaining).toHaveLength(0)
		}
	})

	it('handles concurrent deletes triggering overlapping cascades', async () => {
		const Parent = FlashcoreSystem.registerModel<{
			id: string
			name: string
		}>('Parent', {
			id: f.id(),
			name: f.string(),
			children: f.hasMany('Child', { foreignKey: 'parentId' }).onDelete('cascade')
		})

		const Child = FlashcoreSystem.registerModel<{
			id: string
			name: string
			parentId: string
		}>('Child', {
			id: f.id(),
			name: f.string(),
			parentId: f.string().indexed(),
			grandchildren: f.hasMany('Grandchild', { foreignKey: 'childId' }).onDelete('cascade')
		})

		const Grandchild = FlashcoreSystem.registerModel<{
			id: string
			name: string
			childId: string
		}>('Grandchild', {
			id: f.id(),
			name: f.string(),
			childId: f.string().indexed()
		})

		// Create parent with 2 children, each with 2 grandchildren
		const parent = await Parent.create({ name: 'Parent' })
		const child1 = await Child.create({ name: 'Child 1', parentId: parent.id })
		const child2 = await Child.create({ name: 'Child 2', parentId: parent.id })
		await Grandchild.create({ name: 'GC 1a', childId: child1.id })
		await Grandchild.create({ name: 'GC 1b', childId: child1.id })
		await Grandchild.create({ name: 'GC 2a', childId: child2.id })
		await Grandchild.create({ name: 'GC 2b', childId: child2.id })

		// Delete both children concurrently - each triggers cascade to its grandchildren.
		// Under concurrency the cascades overlap in time; no unhandled errors should occur.
		const results = await Promise.allSettled([
			Child.delete({ where: { id: child1.id } }),
			Child.delete({ where: { id: child2.id } })
		])

		// Both should complete successfully - the cascades are non-overlapping
		// (each child has its own grandchildren), so neither should fail.
		expect(results[0].status).toBe('fulfilled')
		expect(results[1].status).toBe('fulfilled')

		// All children should be gone
		const remainingChildren = await Child.findMany()
		expect(remainingChildren.length).toBe(0)

		// All grandchildren should be cleaned up
		const remainingGrandchildren = await Grandchild.findMany()
		expect(remainingGrandchildren.length).toBe(0)
	})
})
