/**
 * Flashcore v1 (spec rev 4.3) - Plugin Middleware Composition Tests
 *
 * Tests composeMiddleware, forModels, forOperations helpers
 * and concurrent operations through middleware pipelines.
 */

import {
	FlashcoreSystem,
	MemoryAdapter,
	f,
	definePlugin,
	composeMiddleware,
	forModels,
	forOperations
} from '../helpers/flashcore-compat.js'
import type { MiddlewareFn, OperationType } from '../../../src/flashcore/plugin/types.js'

interface User {
	id: string
	name: string
}

interface Post {
	id: string
	title: string
}

describe('Plugin Middleware Composition', () => {
	let adapter: MemoryAdapter

	beforeEach(async () => {
		adapter = new MemoryAdapter()
		await FlashcoreSystem._reset()
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	describe('Composition helpers', () => {
		it('composeMiddleware combines multiple functions, executes in order', async () => {
			const executionOrder: string[] = []

			const mw1: MiddlewareFn<OperationType> = async (params, next) => {
				executionOrder.push('mw1')
				return next()
			}
			const mw2: MiddlewareFn<OperationType> = async (params, next) => {
				executionOrder.push('mw2')
				return next()
			}
			const mw3: MiddlewareFn<OperationType> = async (params, next) => {
				executionOrder.push('mw3')
				return next()
			}

			const composed = composeMiddleware(mw1, mw2, mw3)

			const plugin = definePlugin({
				name: 'composed-plugin',
				middleware: {
					create: composed
				}
			})

			await FlashcoreSystem.init({ adapter, plugins: [plugin] })

			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string()
			})

			await User.create({ name: 'Alice' })

			expect(executionOrder).toEqual(['mw1', 'mw2', 'mw3'])
		})

		it('forModels() filters middleware to specific models only', async () => {
			const interceptedModels: string[] = []

			const mw: MiddlewareFn<OperationType> = async (params, next) => {
				interceptedModels.push(params.model.name)
				return next()
			}

			const filtered = forModels(['User'], mw)

			const plugin = definePlugin({
				name: 'model-filter',
				middleware: {
					create: filtered
				}
			})

			await FlashcoreSystem.init({ adapter, plugins: [plugin] })

			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string()
			})

			const Post = FlashcoreSystem.registerModel<Post>('Post', {
				id: f.id(),
				title: f.string()
			})

			await User.create({ name: 'Alice' })
			await Post.create({ title: 'Hello' })

			// Middleware should only have been called for User
			expect(interceptedModels).toEqual(['User'])
		})

		it('forOperations() filters middleware to specific operation types only', async () => {
			const interceptedOps: string[] = []

			const mw: MiddlewareFn<OperationType> = async (params, next) => {
				interceptedOps.push(params.operation)
				return next()
			}

			const createOnly = forOperations(['create'], mw)

			const plugin = definePlugin({
				name: 'op-filter',
				middleware: {
					create: createOnly,
					findMany: createOnly
				}
			})

			await FlashcoreSystem.init({ adapter, plugins: [plugin] })

			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string()
			})

			await User.create({ name: 'Alice' })
			await User.findMany({})

			// Middleware should only have intercepted the create operation
			expect(interceptedOps).toEqual(['create'])
		})
	})

	describe('Concurrent operations through middleware', () => {
		it('50 concurrent creates through 3-plugin middleware chain', async () => {
			const counts = { p1: 0, p2: 0, p3: 0 }

			const plugins = [
				definePlugin({
					name: 'plugin-1',
					middleware: {
						async create(params, next) {
							counts.p1++
							return next()
						}
					}
				}),
				definePlugin({
					name: 'plugin-2',
					middleware: {
						async create(params, next) {
							counts.p2++
							return next()
						}
					}
				}),
				definePlugin({
					name: 'plugin-3',
					middleware: {
						async create(params, next) {
							counts.p3++
							return next()
						}
					}
				})
			]

			await FlashcoreSystem.init({ adapter, plugins })

			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string()
			})

			// Fire 50 concurrent creates
			const promises = Array.from({ length: 50 }, (_, i) =>
				User.create({ name: `User-${i}` })
			)

			const results = await Promise.all(promises)

			expect(results).toHaveLength(50)
			expect(counts.p1).toBe(50)
			expect(counts.p2).toBe(50)
			expect(counts.p3).toBe(50)
		})

		it('interleaved reads and writes with middleware: no errors', async () => {
			let createCount = 0
			let findCount = 0

			const plugin = definePlugin({
				name: 'tracker',
				middleware: {
					async create(params, next) {
						createCount++
						return next()
					},
					async findUnique(params, next) {
						findCount++
						return next()
					}
				}
			})

			await FlashcoreSystem.init({ adapter, plugins: [plugin] })

			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string()
			})

			// Seed some records first
			const seeded = await Promise.all(
				Array.from({ length: 10 }, (_, i) => User.create({ name: `Seed-${i}` }))
			)
			const seedCreateCount = createCount

			// Mix of concurrent creates and findUniques
			const mixed: Array<Promise<unknown>> = []
			for (let i = 0; i < 20; i++) {
				if (i % 2 === 0) {
					mixed.push(User.create({ name: `Mixed-${i}` }))
				} else {
					const target = seeded[i % seeded.length]
					mixed.push(User.findUnique({ where: { id: target.id } }))
				}
			}

			const results = await Promise.all(mixed)

			expect(results).toHaveLength(20)
			// 10 creates from seeding + 10 creates from mixed (even indices 0,2,4,6,8,10,12,14,16,18)
			expect(createCount).toBe(seedCreateCount + 10)
			expect(findCount).toBe(10)
		})
	})
})
