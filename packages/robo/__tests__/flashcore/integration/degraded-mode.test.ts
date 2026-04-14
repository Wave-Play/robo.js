/**
 * Phase 7: Degraded Mode Integration Tests
 *
 * Tests the core Flashcore system WITHOUT extras (no extension registration).
 * Verifies that basic CRUD works, WAL context is absent, and extension-only
 * features throw FeatureNotSupportedError.
 */

import {
	Flashcore,
	FlashcoreSystem,
	MemoryAdapter,
	f,
	FeatureNotSupportedError
} from '../helpers/flashcore-compat.js'
import { getWalContext } from '../../../src/flashcore/wal/context.js'
import { _resetExtensions } from '../../../src/flashcore/core/extensions.js'

describe('Degraded Mode (no extras)', () => {
	beforeEach(async () => {
		_resetExtensions()
		await FlashcoreSystem._reset()
		await Flashcore.$.init({ adapter: new MemoryAdapter() })
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	it('should perform CRUD operations without WAL', async () => {
		const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
			id: f.id(),
			name: f.string()
		})

		const created = await User.create({ name: 'Alice' })
		expect(created.id).toBeDefined()
		expect(created.name).toBe('Alice')

		const found = await User.findUnique({ where: { id: created.id } })
		expect(found).not.toBeNull()
		expect(found!.name).toBe('Alice')
	})

	it('should return undefined from getWalContext() without extensions', () => {
		const ctx = getWalContext()
		expect(ctx).toBeUndefined()
	})

	it('should throw FeatureNotSupportedError for Flashcore.$.transaction()', async () => {
		await expect(
			Flashcore.$.transaction(async () => {
				// no-op
			})
		).rejects.toThrow(FeatureNotSupportedError)
	})

	it('should throw FeatureNotSupportedError for Flashcore.$.checkIntegrity()', async () => {
		const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('IntUser', {
			id: f.id(),
			name: f.string()
		})

		await User.create({ name: 'Test' })

		await expect(Flashcore.$.checkIntegrity()).rejects.toThrow(FeatureNotSupportedError)
	})

	it('should support findMany without extensions', async () => {
		const Item = FlashcoreSystem.registerModel<{ id: string; value: number }>('Item', {
			id: f.id(),
			value: f.number()
		})

		await Item.create({ value: 1 })
		await Item.create({ value: 2 })
		await Item.create({ value: 3 })

		const all = await Item.findMany()
		expect(all).toHaveLength(3)

		const values = all.map((item) => item.value).sort()
		expect(values).toEqual([1, 2, 3])
	})
})
