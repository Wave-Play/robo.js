/**
 * Flashcore v1 (spec rev 4.3) - Data Type Round-Trip Tests
 *
 * Verifies end-to-end type fidelity through model CRUD operations.
 * Date uses __date__: marker, BigInt uses __bigint__: marker.
 */

import {
	Flashcore,
	FlashcoreSystem,
	MemoryAdapter,
	f
} from '../helpers/flashcore-compat.js'

describe('Data Type Round-Trips (end-to-end)', () => {
	beforeEach(async () => {
		await FlashcoreSystem._reset()
		await Flashcore.$.init({ adapter: new MemoryAdapter() })
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	describe('Date round-trips', () => {
		it('preserves Date through create -> findUnique (instanceof Date, matching getTime)', async () => {
			const Event = FlashcoreSystem.registerModel<{ id: string; name: string; occurredAt: Date }>('Event', {
				id: f.id(),
				name: f.string(),
				occurredAt: f.date()
			})

			const now = new Date()
			const created = await Event.create({ id: 'evt-1', name: 'test', occurredAt: now })

			expect(created.occurredAt).toBeInstanceOf(Date)
			expect(created.occurredAt.getTime()).toBe(now.getTime())

			const found = await Event.findUnique({ where: { id: 'evt-1' } })
			expect(found).not.toBeNull()
			expect(found!.occurredAt).toBeInstanceOf(Date)
			expect(found!.occurredAt.getTime()).toBe(now.getTime())
		})

		it('handles Date at epoch (new Date(0))', async () => {
			const Event = FlashcoreSystem.registerModel<{ id: string; occurredAt: Date }>('Event', {
				id: f.id(),
				occurredAt: f.date()
			})

			const epoch = new Date(0)
			await Event.create({ id: 'epoch', occurredAt: epoch })

			const found = await Event.findUnique({ where: { id: 'epoch' } })
			expect(found).not.toBeNull()
			expect(found!.occurredAt).toBeInstanceOf(Date)
			expect(found!.occurredAt.getTime()).toBe(0)
		})

		it('handles far-future Date with exact millisecond preservation', async () => {
			const Event = FlashcoreSystem.registerModel<{ id: string; occurredAt: Date }>('Event', {
				id: f.id(),
				occurredAt: f.date()
			})

			// Year 9999 date with specific milliseconds
			const future = new Date('9999-12-31T23:59:59.123Z')
			await Event.create({ id: 'future', occurredAt: future })

			const found = await Event.findUnique({ where: { id: 'future' } })
			expect(found).not.toBeNull()
			expect(found!.occurredAt).toBeInstanceOf(Date)
			expect(found!.occurredAt.getTime()).toBe(future.getTime())
		})
	})

	describe('BigInt round-trips', () => {
		it('rejects BigInt in number fields via validation (typeof bigint !== "number")', async () => {
			const Counter = FlashcoreSystem.registerModel<{ id: string; value: number }>('Counter', {
				id: f.id(),
				value: f.number()
			})

			// BigInt is rejected because validateNumber checks typeof value === 'number',
			// and typeof BigInt(...) === 'bigint', not 'number'.
			// The serializer supports BigInt, but validation runs first.
			const bigValue = BigInt('9007199254740991')
			await expect(Counter.create({ id: 'big-1', value: bigValue as unknown as number }))
				.rejects.toThrow(/must be a number|Validation failed/i)
		})

		it('rejects negative BigInt in number fields via validation', async () => {
			const Counter = FlashcoreSystem.registerModel<{ id: string; value: number }>('Counter', {
				id: f.id(),
				value: f.number()
			})

			const negativeBig = BigInt('-12345678901234567890')
			await expect(Counter.create({ id: 'neg-big', value: negativeBig as unknown as number }))
				.rejects.toThrow(/must be a number|Validation failed/i)
		})
	})

	describe('JSON field round-trips', () => {
		it('preserves deeply nested objects', async () => {
			const Config = FlashcoreSystem.registerModel<{ id: string; data: unknown }>('Config', {
				id: f.id(),
				data: f.json()
			})

			const deepObj = {
				level1: {
					level2: {
						level3: {
							level4: {
								value: 'deep',
								count: 42
							}
						}
					}
				}
			}

			await Config.create({ id: 'deep', data: deepObj })

			const found = await Config.findUnique({ where: { id: 'deep' } })
			expect(found).not.toBeNull()
			expect(found!.data).toEqual(deepObj)
		})

		it('preserves arrays, null values, and empty objects', async () => {
			const Config = FlashcoreSystem.registerModel<{ id: string; data: unknown }>('Config', {
				id: f.id(),
				data: f.json()
			})

			const complexJson: Record<string, unknown> = {
				arr: [1, 'two', null, true],
				nullVal: null,
				emptyObj: {},
				emptyArr: [] as unknown[],
				nested: { a: [{ b: null as unknown }] }
			}

			await Config.create({ id: 'complex', data: complexJson })

			const found = await Config.findUnique({ where: { id: 'complex' } })
			expect(found).not.toBeNull()
			expect(found!.data).toEqual(complexJson)
		})
	})

	describe('Special number values', () => {
		it('documents behavior of NaN (rejected by validation)', async () => {
			const Item = FlashcoreSystem.registerModel<{ id: string; value: number }>('Item', {
				id: f.id(),
				value: f.number()
			})

			// NaN is rejected by validateNumber (typeof value === 'number' && !Number.isNaN(value))
			await expect(Item.create({ id: 'nan-test', value: NaN }))
				.rejects.toThrow(/Validation failed|must be a number/i)
		})

		it('documents behavior of Infinity', async () => {
			const Item = FlashcoreSystem.registerModel<{ id: string; value: number }>('Item', {
				id: f.id(),
				value: f.number()
			})

			// Infinity passes typeof === 'number' and !isNaN checks,
			// so it should survive in the MemoryAdapter
			const created = await Item.create({ id: 'inf-test', value: Infinity })
			expect(created.value).toBe(Infinity)

			const found = await Item.findUnique({ where: { id: 'inf-test' } })
			expect(found).not.toBeNull()
			expect(found!.value).toBe(Infinity)
		})

		it('documents behavior of -0', async () => {
			const Item = FlashcoreSystem.registerModel<{ id: string; value: number }>('Item', {
				id: f.id(),
				value: f.number()
			})

			await Item.create({ id: 'neg-zero', value: -0 })

			const found = await Item.findUnique({ where: { id: 'neg-zero' } })
			expect(found).not.toBeNull()
			// -0 may be stored as 0 by the adapter; document actual behavior
			expect(typeof found!.value).toBe('number')
			// MemoryAdapter stores in-memory, so -0 should be preserved
			expect(Object.is(found!.value, -0)).toBe(true)
		})
	})

	describe('String edge cases', () => {
		it('preserves empty string in string fields', async () => {
			const Item = FlashcoreSystem.registerModel<{ id: string; label: string }>('Item', {
				id: f.id(),
				label: f.string()
			})

			await Item.create({ id: 'empty-str', label: '' })

			const found = await Item.findUnique({ where: { id: 'empty-str' } })
			expect(found).not.toBeNull()
			expect(found!.label).toBe('')
			expect(typeof found!.label).toBe('string')
		})

		it('preserves unicode characters', async () => {
			const Item = FlashcoreSystem.registerModel<{ id: string; label: string }>('Item', {
				id: f.id(),
				label: f.string()
			})

			const unicode = '\u{1F600}\u{1F4A9}\u4E16\u754C \u00FC\u00F6\u00E4\u00DF \u0410\u0411\u0412'
			await Item.create({ id: 'unicode-test', label: unicode })

			const found = await Item.findUnique({ where: { id: 'unicode-test' } })
			expect(found).not.toBeNull()
			expect(found!.label).toBe(unicode)
		})

		it('does not misinterpret strings matching serialization markers (__date__:fake)', async () => {
			const Item = FlashcoreSystem.registerModel<{ id: string; label: string }>('Item', {
				id: f.id(),
				label: f.string()
			})

			// Store a string that looks like a serialized date marker
			const tricky = '__date__:fake-date-value'
			await Item.create({ id: 'marker-test', label: tricky })

			const found = await Item.findUnique({ where: { id: 'marker-test' } })
			expect(found).not.toBeNull()
			// The field is typed as string, so the serializer should NOT try to deserialize it
			expect(found!.label).toBe(tricky)
			expect(typeof found!.label).toBe('string')
		})
	})
})
