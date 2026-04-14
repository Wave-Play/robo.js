/**
 * Phase 10: Plugin Middleware Behavior Tests
 *
 * Tests middleware capabilities:
 * - Before/after hooks
 * - Argument modification
 * - Result modification
 * - Error handling
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals'
import { FlashcoreSystem } from '../../../src/flashcore/core/system.js'
import { MemoryAdapter } from '../helpers/memory-adapter.js'
import { definePlugin } from '../../../src/flashcore/plugin/define.js'
import { f } from '../../../src/flashcore/schema/field.js'

interface User {
	id: string
	name: string
}

describe('Phase 10: Plugin Middleware Behavior', () => {
	let adapter: MemoryAdapter

	beforeEach(async () => {
		adapter = new MemoryAdapter()
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	test('middleware can modify operation args before execution', async () => {
		const modifyPlugin = () =>
			definePlugin({
				name: 'modify-args',
				middleware: {
					async create(params, next) {
						// Modify the data before creating
						const args = params.args as { data: { name: string } }
						args.data.name = args.data.name.toUpperCase()
						return next()
					}
				}
			})

		await FlashcoreSystem.init({
			adapter,
			plugins: [modifyPlugin()]
		})

		const User = FlashcoreSystem.registerModel<User>('User', {
			id: f.id(),
			name: f.string()
		})

		const user = await User.create({ name: 'alice' })

		// Name should be uppercased by middleware
		expect(user.name).toBe('ALICE')
	})

	test('middleware can modify operation result after execution', async () => {
		const modifyPlugin = () =>
			definePlugin({
				name: 'modify-result',
				middleware: {
					async findUnique(params, next) {
						const result = (await next()) as { id: string; name: string } | null
						if (result) {
							// Add a computed field
							;(result as { id: string; name: string; upperName?: string }).upperName =
								result.name.toUpperCase()
						}
						return result
					}
				}
			})

		await FlashcoreSystem.init({
			adapter,
			plugins: [modifyPlugin()]
		})

		const User = FlashcoreSystem.registerModel<User>('User', {
			id: f.id(),
			name: f.string()
		})

		const created = await User.create({ name: 'alice' })
		const found = (await User.findUnique({ where: { id: created.id } })) as {
			id: string
			name: string
			upperName?: string
		} | null

		expect(found).not.toBeNull()
		expect(found?.upperName).toBe('ALICE')
	})

	test('middleware can short-circuit and return early', async () => {
		const cachePlugin = () =>
			definePlugin<Record<string, unknown>, Record<string, unknown>, { cache: Map<string, unknown> }>({
				name: 'cache',
				setup(ctx) {
					ctx.state.cache = new Map()
				},
				middleware: {
					async create(params, next) {
						const result = await next()
						// Cache the result
						const state = (this as { state: { cache: Map<string, unknown> } }).state
						state.cache.set((result as { id: string }).id, result)
						return result
					},
					async findUnique(params, next) {
						const args = params.args as { where: { id: string } }
						const state = (this as { state: { cache: Map<string, unknown> } }).state
						const cached = state.cache.get(args.where.id)
						if (cached) {
							// Return cached result without calling next()
							return cached as { id: string }
						}
						return next()
					}
				}
			})

		await FlashcoreSystem.init({
			adapter,
			plugins: [cachePlugin()]
		})

		const User = FlashcoreSystem.registerModel<User>('User', {
			id: f.id(),
			name: f.string()
		})

		const created = await User.create({ name: 'alice' })

		// First find - should hit cache (was cached on create)
		const found1 = await User.findUnique({ where: { id: created.id } })
		expect(found1).toEqual(created)
	})

	test('middleware errors propagate through the chain', async () => {
		const errorPlugin = () =>
			definePlugin({
				name: 'error',
				middleware: {
					async create(params, next) {
						throw new Error('Validation failed')
					}
				}
			})

		await FlashcoreSystem.init({
			adapter,
			plugins: [errorPlugin()]
		})

		const User = FlashcoreSystem.registerModel<User>('User', {
			id: f.id(),
			name: f.string()
		})

		await expect(User.create({ name: 'alice' })).rejects.toThrow('Validation failed')
	})

	test('middleware can catch and handle errors from next()', async () => {
		const errorHandlerPlugin = () =>
			definePlugin({
				name: 'error-handler',
				middleware: {
					async create(params, next) {
						try {
							return await next()
						} catch (error) {
							// Handle the error - return a default value
							return { id: 'fallback', name: 'fallback' } as { id: string }
						}
					}
				}
			})

		const throwingPlugin = () =>
			definePlugin({
				name: 'thrower',
				middleware: {
					async create(params, next) {
						throw new Error('Inner error')
					}
				}
			})

		await FlashcoreSystem.init({
			adapter,
			// Error handler is first, so it wraps the throwing plugin
			plugins: [errorHandlerPlugin(), throwingPlugin()]
		})

		const User = FlashcoreSystem.registerModel<User>('User', {
			id: f.id(),
			name: f.string()
		})

		// Should not throw - error handler catches it
		const result = await User.create({ name: 'alice' })
		expect(result.id).toBe('fallback')
	})

	test('middleware has access to model information', async () => {
		let capturedModelName: string | undefined
		let capturedOperation: string | undefined

		const inspectPlugin = () =>
			definePlugin({
				name: 'inspect',
				middleware: {
					async create(params, next) {
						capturedModelName = params.model.name
						capturedOperation = params.operation
						return next()
					}
				}
			})

		await FlashcoreSystem.init({
			adapter,
			plugins: [inspectPlugin()]
		})

		const User = FlashcoreSystem.registerModel<User>('User', {
			id: f.id(),
			name: f.string()
		})

		await User.create({ name: 'alice' })

		expect(capturedModelName).toBe('User')
		expect(capturedOperation).toBe('create')
	})
})
