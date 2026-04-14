/**
 * Flashcore v1 (spec rev 4.3) - Boundary and Limit Enforcement Tests
 *
 * Verifies that all safety limits are correctly enforced at exact boundaries.
 */

import {
	Flashcore,
	FlashcoreSystem,
	MemoryAdapter,
	f,
	MAX_LENGTHS,
	DEFAULT_SAFETY_LIMITS,
	MAX_VERSION_VALUE
} from '../helpers/flashcore-compat.js'

describe('Boundary and Limit Enforcement', () => {
	beforeEach(async () => {
		await FlashcoreSystem._reset()
		await Flashcore.$.init({ adapter: new MemoryAdapter() })
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	describe('ID length limits (MAX_LENGTHS.recordId = 200)', () => {
		it('accepts ID at exactly 200 characters', async () => {
			const Item = FlashcoreSystem.registerModel<{ id: string; name: string }>('Item', {
				id: f.id(),
				name: f.string()
			})

			const longId = 'a'.repeat(200)
			const created = await Item.create({ id: longId, name: 'test' })

			expect(created.id).toBe(longId)
			expect(created.id.length).toBe(MAX_LENGTHS.recordId)

			const found = await Item.findUnique({ where: { id: longId } })
			expect(found).not.toBeNull()
			expect(found?.name).toBe('test')
		})

		it('rejects ID at 201 characters', async () => {
			const Item = FlashcoreSystem.registerModel<{ id: string; name: string }>('Item', {
				id: f.id(),
				name: f.string()
			})

			const tooLongId = 'a'.repeat(201)

			await expect(Item.create({ id: tooLongId, name: 'test' }))
				.rejects.toThrow(/exceeds maximum length|ID too long|Validation failed/i)
		})
	})

	describe('Unique field value length (MAX_LENGTHS.uniqueFieldValue = 500)', () => {
		it('accepts unique value at exactly 500 characters', async () => {
			const Item = FlashcoreSystem.registerModel<{ id: string; code: string }>('Item', {
				id: f.id(),
				code: f.string().unique()
			})

			// Use only safe key chars (alphanumeric) so encoding doesn't add length
			const exactValue = 'a'.repeat(500)
			const created = await Item.create({ code: exactValue })

			expect(created.code).toBe(exactValue)
			expect(created.code.length).toBe(MAX_LENGTHS.uniqueFieldValue)
		})

		it('rejects unique value at 501 characters', async () => {
			const Item = FlashcoreSystem.registerModel<{ id: string; code: string }>('Item', {
				id: f.id(),
				code: f.string().unique()
			})

			const tooLongValue = 'a'.repeat(501)

			await expect(Item.create({ code: tooLongValue }))
				.rejects.toThrow(/exceeds maximum length|Validation failed/i)
		})
	})

	describe('Version overflow (MAX_VERSION_VALUE = Number.MAX_SAFE_INTEGER)', () => {
		it('resets version to 1 when reaching MAX_VERSION_VALUE', async () => {
			const Doc = FlashcoreSystem.registerModel<{ id: string; title: string; _version?: number }>('Doc', {
				id: f.id(),
				title: f.string(),
				_version: f.number().version()
			})

			// Create with version at MAX_VERSION_VALUE - 1 so next increment hits the limit
			await Doc.create({
				id: 'overflow-test',
				title: 'Test',
				_version: MAX_VERSION_VALUE - 1
			})

			// Update should trigger overflow and reset to 1
			const updated = await Doc.update({
				where: { id: 'overflow-test' },
				data: { title: 'Updated' }
			})

			expect(updated?._version).toBe(1)
		})

		it('continues incrementing below overflow threshold', async () => {
			const Doc = FlashcoreSystem.registerModel<{ id: string; title: string; _version?: number }>('Doc', {
				id: f.id(),
				title: f.string(),
				_version: f.number().version()
			})

			await Doc.create({ id: 'inc-test', title: 'v0' })

			let doc = await Doc.update({ where: { id: 'inc-test' }, data: { title: 'v1' } })
			expect(doc?._version).toBe(1)

			doc = await Doc.update({ where: { id: 'inc-test' }, data: { title: 'v2' } })
			expect(doc?._version).toBe(2)

			doc = await Doc.update({ where: { id: 'inc-test' }, data: { title: 'v3' } })
			expect(doc?._version).toBe(3)
		})
	})

	describe('Safety limits', () => {
		it('findMany returns at most maxDefaultResults (1000) without explicit take', async () => {
			const Item = FlashcoreSystem.registerModel<{ id: string; value: number }>('Item', {
				id: f.id(),
				value: f.number()
			})

			const totalRecords = 1050
			const batchSize = 100
			for (let batch = 0; batch < Math.ceil(totalRecords / batchSize); batch++) {
				const data = []
				for (let i = 0; i < batchSize && batch * batchSize + i < totalRecords; i++) {
					data.push({ value: batch * batchSize + i })
				}
				await Item.createMany({ data })
			}

			const count = await Item.count()
			expect(count).toBe(totalRecords)

			// Without explicit take, should be capped at maxDefaultResults
			const items = await Item.findMany()
			expect(items.length).toBe(DEFAULT_SAFETY_LIMITS.maxDefaultResults)
		}, 30_000)

		it('explicit take overrides maxDefaultResults', async () => {
			const Item = FlashcoreSystem.registerModel<{ id: string; value: number }>('Item', {
				id: f.id(),
				value: f.number()
			})

			const data = []
			for (let i = 0; i < 50; i++) {
				data.push({ value: i })
			}
			await Item.createMany({ data })

			const items = await Item.findMany({ take: 25 })
			expect(items).toHaveLength(25)
		})
	})

	describe('Include depth limit (MAX_INCLUDE_DEPTH = 10)', () => {
		it('enforces depth limit for nested includes', async () => {
			// Register 13 chained models: Level0 -> Level1 -> ... -> Level12
			const Level0 = FlashcoreSystem.registerModel<{ id: string; name: string }>('Level0', {
				id: f.id(),
				name: f.string(),
				child: f.hasOne('Level1', { foreignKey: 'parentId' })
			})

			const models: Array<{ create: (data: Record<string, unknown>) => Promise<{ id: string }> }> = []

			for (let i = 1; i <= 12; i++) {
				const model = FlashcoreSystem.registerModel<{ id: string; name: string; parentId: string }>(
					`Level${i}`,
					{
						id: f.id(),
						name: f.string(),
						parentId: f.string().indexed(),
						...(i < 12 ? { child: f.hasOne(`Level${i + 1}`, { foreignKey: 'parentId' }) } : {})
					}
				)
				models.push(model as unknown as typeof models[0])
			}

			// Create a record at every level so the include chain actually recurses
			const l0 = await Level0.create({ name: 'L0' })
			let parentId = l0.id
			for (const model of models) {
				const record = await model.create({ name: 'child', parentId })
				parentId = record.id
			}

			// Build a deeply nested include (11 levels), exceeding MAX_INCLUDE_DEPTH of 10
			const deepInclude = {
				child: {
					include: {
						child: {
							include: {
								child: {
									include: {
										child: {
											include: {
												child: {
													include: {
														child: {
															include: {
																child: {
																	include: {
																		child: {
																			include: {
																				child: {
																					include: {
																						child: {
																							include: {
																								child: true
																							}
																						}
																					}
																				}
																			}
																		}
																	}
																}
															}
														}
													}
												}
											}
										}
									}
								}
							}
						}
					}
				}
			}

			await expect(
				Level0.findUnique({
					where: { id: l0.id },
					include: deepInclude
				})
			).rejects.toThrow(/include depth/i)
		})
	})

	describe('Cascade depth limit (MAX_CASCADE_DEPTH = 50)', () => {
		it('small cascade chain succeeds', async () => {
			const Parent = FlashcoreSystem.registerModel<{ id: string; name: string }>('Parent', {
				id: f.id(),
				name: f.string(),
				children: f.hasMany('Child', { foreignKey: 'parentId' }).onDelete('cascade')
			})

			const Child = FlashcoreSystem.registerModel<{ id: string; name: string; parentId: string }>('Child', {
				id: f.id(),
				name: f.string(),
				parentId: f.string().indexed(),
				grandchildren: f.hasMany('Grandchild', { foreignKey: 'childId' }).onDelete('cascade')
			})

			const Grandchild = FlashcoreSystem.registerModel<{ id: string; name: string; childId: string }>('Grandchild', {
				id: f.id(),
				name: f.string(),
				childId: f.string().indexed()
			})

			const parent = await Parent.create({ name: 'P' })
			const child = await Child.create({ name: 'C', parentId: parent.id })
			await Grandchild.create({ name: 'GC', childId: child.id })

			// Delete parent should cascade through children and grandchildren
			await Parent.delete({ where: { id: parent.id } })

			expect(await Parent.count()).toBe(0)
			expect(await Child.count()).toBe(0)
			expect(await Grandchild.count()).toBe(0)
		})
	})
})
