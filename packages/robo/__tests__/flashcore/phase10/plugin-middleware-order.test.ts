/**
 * Phase 10: Plugin Middleware Order Tests
 *
 * Tests that plugins execute in config order (Express/Koa style - outermost first/last).
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

describe('Phase 10: Plugin Middleware Order', () => {
	let adapter: MemoryAdapter

	beforeEach(async () => {
		adapter = new MemoryAdapter()
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	test('middleware executes in plugin config order (outermost first/last)', async () => {
		const executionOrder: string[] = []

		const pluginA = () =>
			definePlugin({
				name: 'plugin-a',
				middleware: {
					async create(params, next) {
						executionOrder.push('A:before')
						const result = await next()
						executionOrder.push('A:after')
						return result
					}
				}
			})

		const pluginB = () =>
			definePlugin({
				name: 'plugin-b',
				middleware: {
					async create(params, next) {
						executionOrder.push('B:before')
						const result = await next()
						executionOrder.push('B:after')
						return result
					}
				}
			})

		const pluginC = () =>
			definePlugin({
				name: 'plugin-c',
				middleware: {
					async create(params, next) {
						executionOrder.push('C:before')
						const result = await next()
						executionOrder.push('C:after')
						return result
					}
				}
			})

		await FlashcoreSystem.init({
			adapter,
			plugins: [pluginA(), pluginB(), pluginC()]
		})

		const User = FlashcoreSystem.registerModel<User>('User', {
			id: f.id(),
			name: f.string()
		})

		await User.create({ name: 'Alice' })

		// Middleware should execute: A:before -> B:before -> C:before -> [create] -> C:after -> B:after -> A:after
		expect(executionOrder).toEqual([
			'A:before',
			'B:before',
			'C:before',
			'C:after',
			'B:after',
			'A:after'
		])
	})

	test('middleware order applies to all operation types', async () => {
		const executionOrder: string[] = []

		const plugin1 = () =>
			definePlugin({
				name: 'plugin-1',
				middleware: {
					async update(params, next) {
						executionOrder.push('1:before')
						const result = await next()
						executionOrder.push('1:after')
						return result
					},
					async delete(params, next) {
						executionOrder.push('1:delete:before')
						const result = await next()
						executionOrder.push('1:delete:after')
						return result
					}
				}
			})

		const plugin2 = () =>
			definePlugin({
				name: 'plugin-2',
				middleware: {
					async update(params, next) {
						executionOrder.push('2:before')
						const result = await next()
						executionOrder.push('2:after')
						return result
					},
					async delete(params, next) {
						executionOrder.push('2:delete:before')
						const result = await next()
						executionOrder.push('2:delete:after')
						return result
					}
				}
			})

		await FlashcoreSystem.init({
			adapter,
			plugins: [plugin1(), plugin2()]
		})

		const User = FlashcoreSystem.registerModel<User>('User', {
			id: f.id(),
			name: f.string()
		})

		const user = await User.create({ name: 'Alice' })

		// Test update
		await User.update({ where: { id: user.id }, data: { name: 'Bob' } })
		expect(executionOrder).toEqual(['1:before', '2:before', '2:after', '1:after'])

		executionOrder.length = 0

		// Test delete
		await User.delete({ where: { id: user.id } })
		expect(executionOrder).toEqual([
			'1:delete:before',
			'2:delete:before',
			'2:delete:after',
			'1:delete:after'
		])
	})

	test('plugins without middleware for specific operation are skipped', async () => {
		const executionOrder: string[] = []

		const pluginA = () =>
			definePlugin({
				name: 'plugin-a',
				middleware: {
					async create(params, next) {
						executionOrder.push('A:create')
						return next()
					}
				}
			})

		const pluginB = () =>
			definePlugin({
				name: 'plugin-b',
				middleware: {
					async update(params, next) {
						executionOrder.push('B:update')
						return next()
					}
				}
			})

		const pluginC = () =>
			definePlugin({
				name: 'plugin-c',
				middleware: {
					async create(params, next) {
						executionOrder.push('C:create')
						return next()
					}
				}
			})

		await FlashcoreSystem.init({
			adapter,
			plugins: [pluginA(), pluginB(), pluginC()]
		})

		const User = FlashcoreSystem.registerModel<User>('User', {
			id: f.id(),
			name: f.string()
		})

		await User.create({ name: 'Alice' })

		// Only A and C have create middleware, B is skipped
		expect(executionOrder).toEqual(['A:create', 'C:create'])
	})
})
