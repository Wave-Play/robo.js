/**
 * Flashcore v1 (spec rev 4.3) - Plugin System Under Load Tests
 *
 * Tests plugin registration validation, middleware chains,
 * and lifecycle behavior under stress.
 */

import { FlashcoreSystem, MemoryAdapter, f, definePlugin } from '../helpers/flashcore-compat.js'

interface User {
	id: string
	name: string
}

describe('Plugin System Under Load', () => {
	let adapter: MemoryAdapter

	beforeEach(async () => {
		adapter = new MemoryAdapter()
		await FlashcoreSystem._reset()
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	describe('Registration validation', () => {
		it('rejects duplicate plugin names', async () => {
			const pluginA = definePlugin({ name: 'duplicate' })
			const pluginB = definePlugin({ name: 'duplicate' })

			await expect(
				FlashcoreSystem.init({
					adapter,
					plugins: [pluginA, pluginB]
				})
			).rejects.toThrow(/already registered/)
		})

		it('rejects duplicate index type names across plugins', async () => {
			const pluginA = definePlugin({
				name: 'plugin-a',
				indexProviders: {
					trie: {
						create: () => ({
							insert: () => {},
							update: () => {},
							remove: () => {},
							clear: () => {},
							query: () => [],
							serialize: () => null,
							deserialize: () => {}
						}),
						operators: ['prefixMatch']
					}
				}
			})

			const pluginB = definePlugin({
				name: 'plugin-b',
				indexProviders: {
					trie: {
						create: () => ({
							insert: () => {},
							update: () => {},
							remove: () => {},
							clear: () => {},
							query: () => [],
							serialize: () => null,
							deserialize: () => {}
						}),
						operators: ['prefixMatch']
					}
				}
			})

			await expect(
				FlashcoreSystem.init({
					adapter,
					plugins: [pluginA, pluginB]
				})
			).rejects.toThrow(/already registered/)
		})

		it('rejects duplicate query operator names across plugins', async () => {
			const pluginA = definePlugin({
				name: 'plugin-a',
				queryOperators: {
					fuzzy: () => []
				}
			})

			const pluginB = definePlugin({
				name: 'plugin-b',
				queryOperators: {
					fuzzy: () => []
				}
			})

			await expect(
				FlashcoreSystem.init({
					adapter,
					plugins: [pluginA, pluginB]
				})
			).rejects.toThrow(/already registered/)
		})

		it('handles 50 uniquely-named plugins during init', async () => {
			const plugins = Array.from({ length: 50 }, (_, i) =>
				definePlugin({ name: `plugin-${i}` })
			)

			await FlashcoreSystem.init({
				adapter,
				plugins
			})

			const introspection = await FlashcoreSystem.introspect()
			expect(introspection.plugins).toHaveLength(50)
		})
	})

	describe('Middleware chain', () => {
		it('10-deep middleware chain executes in registration order', async () => {
			const executionOrder: number[] = []

			const plugins = Array.from({ length: 10 }, (_, i) =>
				definePlugin({
					name: `plugin-${i}`,
					middleware: {
						async create(params, next) {
							executionOrder.push(i)
							return next()
						}
					}
				})
			)

			await FlashcoreSystem.init({ adapter, plugins })

			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string()
			})

			await User.create({ name: 'Alice' })

			expect(executionOrder).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
		})

		it('middleware that never calls next() short-circuits the operation', async () => {
			let actualOperationRan = false

			const shortCircuitPlugin = definePlugin({
				name: 'short-circuit',
				middleware: {
					async create(_params, _next) {
						// Never call next() — return a fake result instead
						return { id: 'fake-id', name: 'intercepted' } as { id: string }
					}
				}
			})

			const trackerPlugin = definePlugin({
				name: 'tracker',
				middleware: {
					async create(params, next) {
						actualOperationRan = true
						return next()
					}
				}
			})

			await FlashcoreSystem.init({
				adapter,
				plugins: [shortCircuitPlugin, trackerPlugin]
			})

			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string()
			})

			const result = await User.create({ name: 'Alice' })

			// The short-circuit plugin returned a fake result
			expect(result.id).toBe('fake-id')
			expect((result as User).name).toBe('intercepted')

			// The second plugin and actual operation should NOT have run
			expect(actualOperationRan).toBe(false)
		})

		it('error in middleware propagates correctly, skips downstream middleware', async () => {
			const executionOrder: string[] = []

			const plugins = [
				definePlugin({
					name: 'plugin-0',
					middleware: {
						async create(_params, _next) {
							executionOrder.push('plugin-0')
							throw new Error('Plugin-0 error')
						}
					}
				}),
				definePlugin({
					name: 'plugin-1',
					middleware: {
						async create(params, next) {
							executionOrder.push('plugin-1')
							return next()
						}
					}
				}),
				definePlugin({
					name: 'plugin-2',
					middleware: {
						async create(params, next) {
							executionOrder.push('plugin-2')
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

			await expect(User.create({ name: 'Alice' })).rejects.toThrow('Plugin-0 error')

			// Only the first plugin should have executed
			expect(executionOrder).toEqual(['plugin-0'])
		})

		it('1000 CRUD operations with middleware: no errors or accumulation issues', async () => {
			let invocationCount = 0

			const counterPlugin = definePlugin({
				name: 'counter',
				middleware: {
					async create(params, next) {
						invocationCount++
						return next()
					}
				}
			})

			await FlashcoreSystem.init({ adapter, plugins: [counterPlugin] })

			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string()
			})

			for (let i = 0; i < 1000; i++) {
				await User.create({ name: `User-${i}` })
			}

			expect(invocationCount).toBe(1000)
		})
	})

	describe('Plugin lifecycle', () => {
		it('shutdown called in reverse registration order', async () => {
			const shutdownOrder: number[] = []

			const plugins = Array.from({ length: 3 }, (_, i) =>
				definePlugin({
					name: `plugin-${i}`,
					shutdown() {
						shutdownOrder.push(i)
					}
				})
			)

			await FlashcoreSystem.init({ adapter, plugins })

			// _reset() triggers shutdown internally
			await FlashcoreSystem._reset()

			expect(shutdownOrder).toEqual([2, 1, 0])
		})

		it('plugin setup failure causes init to reject; system can be reset and retried', async () => {
			const badPlugin = definePlugin({
				name: 'bad-plugin',
				setup() {
					throw new Error('Setup explosion')
				}
			})

			await expect(
				FlashcoreSystem.init({ adapter, plugins: [badPlugin] })
			).rejects.toThrow('Setup explosion')

			// After failure, reset the system
			await FlashcoreSystem._reset()

			// Init again without the bad plugin should succeed
			const goodPlugin = definePlugin({ name: 'good-plugin' })
			await FlashcoreSystem.init({ adapter: new MemoryAdapter(), plugins: [goodPlugin] })

			expect(FlashcoreSystem.isInitialized).toBe(true)
		})

		it('plugin state is isolated between plugins', async () => {
			const states: Array<Record<string, unknown>> = []

			const plugins = [
				definePlugin({
					name: 'plugin-a',
					setup(ctx) {
						ctx.state.counter = 100
						states.push(ctx.state)
					},
					middleware: {
						async create(params, next) {
							const state = (this as { state: Record<string, unknown> }).state
							state.counter = (state.counter as number) + 1
							return next()
						}
					}
				}),
				definePlugin({
					name: 'plugin-b',
					setup(ctx) {
						ctx.state.counter = 200
						states.push(ctx.state)
					},
					middleware: {
						async create(params, next) {
							const state = (this as { state: Record<string, unknown> }).state
							state.counter = (state.counter as number) + 1
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

			await User.create({ name: 'Alice' })

			// Each plugin should have its own state
			expect(states[0].counter).toBe(101) // 100 + 1 from create
			expect(states[1].counter).toBe(201) // 200 + 1 from create

			// They should be different object references
			expect(states[0]).not.toBe(states[1])
		})
	})
})
