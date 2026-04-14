/**
 * Phase 9: Include Depth Limit Tests
 *
 * Tests for MAX_INCLUDE_DEPTH enforcement to prevent infinite recursion.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { f, FlashcoreSystem, MemoryAdapter, MAX_INCLUDE_DEPTH } from '../helpers/flashcore-compat.js'

describe('Phase 9: Include Depth Limit', () => {
	beforeEach(async () => {
		await FlashcoreSystem.init({ adapter: new MemoryAdapter() })
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	it('should allow includes up to MAX_INCLUDE_DEPTH', async () => {
		// Create a chain of models: Level0 -> Level1 -> Level2 -> ... -> Level9
		// MAX_INCLUDE_DEPTH is 10, so depth 9 (0-indexed) should work

		const Level0 = FlashcoreSystem.registerModel<{
			id: string
			name: string
		}>('Level0', {
			id: f.id(),
			name: f.string(),
			child: f.hasOne('Level1', { foreignKey: 'parentId' })
		})

		const Level1 = FlashcoreSystem.registerModel<{
			id: string
			name: string
			parentId: string
		}>('Level1', {
			id: f.id(),
			name: f.string(),
			parentId: f.string().indexed(),
			child: f.hasOne('Level2', { foreignKey: 'parentId' })
		})

		const Level2 = FlashcoreSystem.registerModel<{
			id: string
			name: string
			parentId: string
		}>('Level2', {
			id: f.id(),
			name: f.string(),
			parentId: f.string().indexed(),
			child: f.hasOne('Level3', { foreignKey: 'parentId' })
		})

		const Level3 = FlashcoreSystem.registerModel<{
			id: string
			name: string
			parentId: string
		}>('Level3', {
			id: f.id(),
			name: f.string(),
			parentId: f.string().indexed(),
			child: f.hasOne('Level4', { foreignKey: 'parentId' })
		})

		const Level4 = FlashcoreSystem.registerModel<{
			id: string
			name: string
			parentId: string
		}>('Level4', {
			id: f.id(),
			name: f.string(),
			parentId: f.string().indexed(),
			child: f.hasOne('Level5', { foreignKey: 'parentId' })
		})

		const Level5 = FlashcoreSystem.registerModel<{
			id: string
			name: string
			parentId: string
		}>('Level5', {
			id: f.id(),
			name: f.string(),
			parentId: f.string().indexed(),
			child: f.hasOne('Level6', { foreignKey: 'parentId' })
		})

		const Level6 = FlashcoreSystem.registerModel<{
			id: string
			name: string
			parentId: string
		}>('Level6', {
			id: f.id(),
			name: f.string(),
			parentId: f.string().indexed(),
			child: f.hasOne('Level7', { foreignKey: 'parentId' })
		})

		const Level7 = FlashcoreSystem.registerModel<{
			id: string
			name: string
			parentId: string
		}>('Level7', {
			id: f.id(),
			name: f.string(),
			parentId: f.string().indexed(),
			child: f.hasOne('Level8', { foreignKey: 'parentId' })
		})

		const Level8 = FlashcoreSystem.registerModel<{
			id: string
			name: string
			parentId: string
		}>('Level8', {
			id: f.id(),
			name: f.string(),
			parentId: f.string().indexed(),
			child: f.hasOne('Level9', { foreignKey: 'parentId' })
		})

		FlashcoreSystem.registerModel<{
			id: string
			name: string
			parentId: string
		}>('Level9', {
			id: f.id(),
			name: f.string(),
			parentId: f.string().indexed()
		})

		// Create chain of records
		const l0 = await Level0.create({ name: 'L0' })
		const l1 = await Level1.create({ name: 'L1', parentId: l0.id })
		const l2 = await Level2.create({ name: 'L2', parentId: l1.id })
		const l3 = await Level3.create({ name: 'L3', parentId: l2.id })
		const l4 = await Level4.create({ name: 'L4', parentId: l3.id })
		const l5 = await Level5.create({ name: 'L5', parentId: l4.id })
		const l6 = await Level6.create({ name: 'L6', parentId: l5.id })
		const l7 = await Level7.create({ name: 'L7', parentId: l6.id })
		const l8 = await Level8.create({ name: 'L8', parentId: l7.id })
		await Level8.create({ name: 'L9', parentId: l8.id })

		// Query with deep nesting (9 levels deep, should work within MAX_INCLUDE_DEPTH of 10)
		const result = await Level0.findUnique({
			where: { id: l0.id },
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
		})

		expect(result).toBeDefined()
		expect(result?.name).toBe('L0')
	})

	it('should throw error when include depth exceeds MAX_INCLUDE_DEPTH', async () => {
		// Create 13 levels to exceed MAX_INCLUDE_DEPTH of 10
		// We need 12 levels of nested includes to trigger depth 10+
		const Level0 = FlashcoreSystem.registerModel<{
			id: string
			name: string
		}>('Level0', {
			id: f.id(),
			name: f.string(),
			child: f.hasOne('Level1', { foreignKey: 'parentId' })
		})

		const Level1 = FlashcoreSystem.registerModel<{
			id: string
			name: string
			parentId: string
		}>('Level1', {
			id: f.id(),
			name: f.string(),
			parentId: f.string().indexed(),
			child: f.hasOne('Level2', { foreignKey: 'parentId' })
		})

		const Level2 = FlashcoreSystem.registerModel<{
			id: string
			name: string
			parentId: string
		}>('Level2', {
			id: f.id(),
			name: f.string(),
			parentId: f.string().indexed(),
			child: f.hasOne('Level3', { foreignKey: 'parentId' })
		})

		const Level3 = FlashcoreSystem.registerModel<{
			id: string
			name: string
			parentId: string
		}>('Level3', {
			id: f.id(),
			name: f.string(),
			parentId: f.string().indexed(),
			child: f.hasOne('Level4', { foreignKey: 'parentId' })
		})

		const Level4 = FlashcoreSystem.registerModel<{
			id: string
			name: string
			parentId: string
		}>('Level4', {
			id: f.id(),
			name: f.string(),
			parentId: f.string().indexed(),
			child: f.hasOne('Level5', { foreignKey: 'parentId' })
		})

		const Level5 = FlashcoreSystem.registerModel<{
			id: string
			name: string
			parentId: string
		}>('Level5', {
			id: f.id(),
			name: f.string(),
			parentId: f.string().indexed(),
			child: f.hasOne('Level6', { foreignKey: 'parentId' })
		})

		const Level6 = FlashcoreSystem.registerModel<{
			id: string
			name: string
			parentId: string
		}>('Level6', {
			id: f.id(),
			name: f.string(),
			parentId: f.string().indexed(),
			child: f.hasOne('Level7', { foreignKey: 'parentId' })
		})

		const Level7 = FlashcoreSystem.registerModel<{
			id: string
			name: string
			parentId: string
		}>('Level7', {
			id: f.id(),
			name: f.string(),
			parentId: f.string().indexed(),
			child: f.hasOne('Level8', { foreignKey: 'parentId' })
		})

		const Level8 = FlashcoreSystem.registerModel<{
			id: string
			name: string
			parentId: string
		}>('Level8', {
			id: f.id(),
			name: f.string(),
			parentId: f.string().indexed(),
			child: f.hasOne('Level9', { foreignKey: 'parentId' })
		})

		const Level9 = FlashcoreSystem.registerModel<{
			id: string
			name: string
			parentId: string
		}>('Level9', {
			id: f.id(),
			name: f.string(),
			parentId: f.string().indexed(),
			child: f.hasOne('Level10', { foreignKey: 'parentId' })
		})

		const Level10 = FlashcoreSystem.registerModel<{
			id: string
			name: string
			parentId: string
		}>('Level10', {
			id: f.id(),
			name: f.string(),
			parentId: f.string().indexed(),
			child: f.hasOne('Level11', { foreignKey: 'parentId' })
		})

		const Level11 = FlashcoreSystem.registerModel<{
			id: string
			name: string
			parentId: string
		}>('Level11', {
			id: f.id(),
			name: f.string(),
			parentId: f.string().indexed(),
			child: f.hasOne('Level12', { foreignKey: 'parentId' })
		})

		FlashcoreSystem.registerModel<{
			id: string
			name: string
			parentId: string
		}>('Level12', {
			id: f.id(),
			name: f.string(),
			parentId: f.string().indexed()
		})

		// Create chain of records
		const l0 = await Level0.create({ name: 'L0' })
		const l1 = await Level1.create({ name: 'L1', parentId: l0.id })
		const l2 = await Level2.create({ name: 'L2', parentId: l1.id })
		const l3 = await Level3.create({ name: 'L3', parentId: l2.id })
		const l4 = await Level4.create({ name: 'L4', parentId: l3.id })
		const l5 = await Level5.create({ name: 'L5', parentId: l4.id })
		const l6 = await Level6.create({ name: 'L6', parentId: l5.id })
		const l7 = await Level7.create({ name: 'L7', parentId: l6.id })
		const l8 = await Level8.create({ name: 'L8', parentId: l7.id })
		const l9 = await Level9.create({ name: 'L9', parentId: l8.id })
		const l10 = await Level10.create({ name: 'L10', parentId: l9.id })
		const l11 = await Level11.create({ name: 'L11', parentId: l10.id })
		await Level11.create({ name: 'L12', parentId: l11.id })

		// Query with 12 levels of nested includes (exceeds MAX_INCLUDE_DEPTH of 10)
		// Each include: { child: { include: ... } } adds one depth level
		await expect(
			Level0.findUnique({
				where: { id: l0.id },
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
			})
		).rejects.toThrow(/include depth/i)
	})

	it('should verify MAX_INCLUDE_DEPTH constant is 10', () => {
		expect(MAX_INCLUDE_DEPTH).toBe(10)
	})
})
