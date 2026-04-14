/**
 * Flashcore - Upsert Segmentation Tests
 *
 * Tests that upsert correctly handles segmented (oversized) records
 * in both the update path and create path. Regression tests for Bugs 5, 6.
 */

import {
	Flashcore,
	FlashcoreSystem,
	MemoryAdapter,
	f
} from '../helpers/flashcore-compat.js'

interface BigItem {
	id: string
	name: string
	bigField: string
	value: number
}

describe('Upsert with Segmented Records', () => {
	beforeEach(async () => {
		await FlashcoreSystem._reset()
		await Flashcore.$.init({ adapter: new MemoryAdapter() })
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	describe('update path (Bug 5)', () => {
		it('upsert correctly modifies existing segmented record', async () => {
			const BigItem = FlashcoreSystem.registerModel<BigItem>('BigItem', {
				id: f.id(),
				name: f.string(),
				bigField: f.string(),
				value: f.number()
			})

			const bigValue = 'x'.repeat(150_000)
			const created = await BigItem.create({
				name: 'big',
				bigField: bigValue,
				value: 1
			})

			await BigItem.upsert({
				where: { id: created.id },
				create: { name: 'big', bigField: bigValue, value: 1 },
				update: { value: 42 }
			})

			const found = await BigItem.findUnique({ where: { id: created.id } })
			expect(found).not.toBeNull()
			expect(found!.value).toBe(42)
			expect(found!.bigField).toBe(bigValue)
		})

		it('upsert handles segments->chunk transition (record shrinks)', async () => {
			const BigItem = FlashcoreSystem.registerModel<BigItem>('BigItem', {
				id: f.id(),
				name: f.string(),
				bigField: f.string(),
				value: f.number()
			})

			const bigValue = 'x'.repeat(150_000)
			const created = await BigItem.create({
				name: 'big',
				bigField: bigValue,
				value: 1
			})

			await BigItem.upsert({
				where: { id: created.id },
				create: { name: 'big', bigField: bigValue, value: 1 },
				update: { bigField: 'small now' }
			})

			const found = await BigItem.findUnique({ where: { id: created.id } })
			expect(found).not.toBeNull()
			expect(found!.bigField).toBe('small now')
		})

		it('upsert handles chunk->segments transition (record grows)', async () => {
			const BigItem = FlashcoreSystem.registerModel<BigItem>('BigItem', {
				id: f.id(),
				name: f.string(),
				bigField: f.string(),
				value: f.number()
			})

			const created = await BigItem.create({
				name: 'small',
				bigField: 'tiny',
				value: 1
			})

			const bigValue = 'x'.repeat(150_000)
			await BigItem.upsert({
				where: { id: created.id },
				create: { name: 'small', bigField: 'tiny', value: 1 },
				update: { bigField: bigValue }
			})

			const found = await BigItem.findUnique({ where: { id: created.id } })
			expect(found).not.toBeNull()
			expect(found!.bigField).toBe(bigValue)
		})

		it('upsert does not write segmented records to chunk 0', async () => {
			const BigItem = FlashcoreSystem.registerModel<BigItem>('BigItem', {
				id: f.id(),
				name: f.string(),
				bigField: f.string(),
				value: f.number()
			})

			const bigValue = 'x'.repeat(150_000)
			const created = await BigItem.create({
				name: 'big',
				bigField: bigValue,
				value: 1
			})

			await BigItem.upsert({
				where: { id: created.id },
				create: { name: 'big', bigField: bigValue, value: 1 },
				update: { value: 999 }
			})

			const all = await BigItem.findMany()
			expect(all.length).toBe(1)
			expect(all[0].value).toBe(999)
			expect(all[0].bigField).toBe(bigValue)
		})
	})

	describe('create path (Bug 6)', () => {
		it('upsert creates oversized records as segments', async () => {
			const BigItem = FlashcoreSystem.registerModel<BigItem>('BigItem', {
				id: f.id(),
				name: f.string(),
				bigField: f.string(),
				value: f.number()
			})

			const bigValue = 'x'.repeat(150_000)
			const result = await BigItem.upsert({
				where: { id: 'new-id' },
				create: { name: 'big', bigField: bigValue, value: 1 },
				update: { value: 2 }
			})

			expect(result).toBeDefined()

			const found = await BigItem.findUnique({ where: { id: result.id } })
			expect(found).not.toBeNull()
			expect(found!.bigField).toBe(bigValue)
		})

		it('upsert-created segmented records findable via findUnique and findMany', async () => {
			const BigItem = FlashcoreSystem.registerModel<BigItem>('BigItem', {
				id: f.id(),
				name: f.string(),
				bigField: f.string(),
				value: f.number()
			})

			const bigValue = 'x'.repeat(150_000)

			// Create one large via upsert
			await BigItem.upsert({
				where: { id: 'large-1' },
				create: { name: 'large', bigField: bigValue, value: 10 },
				update: { value: 10 }
			})

			// Create one small via upsert
			await BigItem.upsert({
				where: { id: 'small-1' },
				create: { name: 'small', bigField: 'tiny', value: 20 },
				update: { value: 20 }
			})

			const all = await BigItem.findMany()
			expect(all.length).toBe(2)

			const large = await BigItem.findUnique({ where: { id: 'large-1' } })
			expect(large).not.toBeNull()
			expect(large!.bigField).toBe(bigValue)

			const small = await BigItem.findUnique({ where: { id: 'small-1' } })
			expect(small).not.toBeNull()
			expect(small!.bigField).toBe('tiny')
		})
	})

	describe('round-trip', () => {
		it('create large -> upsert update (still large) -> verify data intact', async () => {
			const BigItem = FlashcoreSystem.registerModel<BigItem>('BigItem', {
				id: f.id(),
				name: f.string(),
				bigField: f.string(),
				value: f.number()
			})

			const bigValue = 'x'.repeat(150_000)
			const created = await BigItem.create({
				name: 'big',
				bigField: bigValue,
				value: 1
			})

			await BigItem.upsert({
				where: { id: created.id },
				create: { name: 'big', bigField: bigValue, value: 1 },
				update: { value: 42 }
			})

			const found = await BigItem.findUnique({ where: { id: created.id } })
			expect(found).not.toBeNull()
			expect(found!.bigField).toBe(bigValue)
			expect(found!.value).toBe(42)
		})

		it('create small -> upsert update to large -> verify segmented', async () => {
			const BigItem = FlashcoreSystem.registerModel<BigItem>('BigItem', {
				id: f.id(),
				name: f.string(),
				bigField: f.string(),
				value: f.number()
			})

			const created = await BigItem.create({
				name: 'small',
				bigField: 'tiny',
				value: 1
			})

			const bigValue = 'y'.repeat(150_000)
			await BigItem.upsert({
				where: { id: created.id },
				create: { name: 'small', bigField: 'tiny', value: 1 },
				update: { bigField: bigValue }
			})

			const found = await BigItem.findUnique({ where: { id: created.id } })
			expect(found).not.toBeNull()
			expect(found!.bigField).toBe(bigValue)
		})

		it('upsert create segmented -> upsert update to shrink -> verify chunk', async () => {
			const BigItem = FlashcoreSystem.registerModel<BigItem>('BigItem', {
				id: f.id(),
				name: f.string(),
				bigField: f.string(),
				value: f.number()
			})

			const bigValue = 'x'.repeat(150_000)

			// Create via upsert (segmented)
			await BigItem.upsert({
				where: { id: 'shrink-test' },
				create: { name: 'big', bigField: bigValue, value: 1 },
				update: { value: 1 }
			})

			// Update via upsert (shrink to chunk)
			await BigItem.upsert({
				where: { id: 'shrink-test' },
				create: { name: 'big', bigField: bigValue, value: 1 },
				update: { bigField: 'shrunk' }
			})

			const found = await BigItem.findUnique({ where: { id: 'shrink-test' } })
			expect(found).not.toBeNull()
			expect(found!.bigField).toBe('shrunk')

			const all = await BigItem.findMany()
			expect(all.length).toBe(1)
			expect(all[0].bigField).toBe('shrunk')
		})
	})
})
