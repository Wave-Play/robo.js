/**
 * Phase 10: Plugin Model Extensions Tests
 *
 * Tests that model extensions from plugins are callable on models.
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals'
import { FlashcoreSystem } from '../../../src/flashcore/core/system.js'
import { MemoryAdapter } from '../helpers/memory-adapter.js'
import { definePlugin } from '../../../src/flashcore/plugin/define.js'
import { f } from '../../../src/flashcore/schema/field.js'

describe('Phase 10: Plugin Model Extensions', () => {
	let adapter: MemoryAdapter

	beforeEach(async () => {
		adapter = new MemoryAdapter()
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	test('model can access plugin context via pluginContext()', async () => {
		const testPlugin = () =>
			definePlugin<Record<string, unknown>, Record<string, unknown>, { value: string }>({
				name: 'test-plugin',
				setup(ctx) {
					ctx.state.value = 'hello from plugin'
				}
			})

		await FlashcoreSystem.init({
			adapter,
			plugins: [testPlugin()]
		})

		const User = FlashcoreSystem.registerModel('User', {
			id: f.id(),
			name: f.string()
		})

		const ctx = User.pluginContext('test-plugin')
		expect(ctx).toBeDefined()
		expect(ctx.name).toBe('test-plugin')
		expect(ctx.state.value).toBe('hello from plugin')
	})

	test('pluginContext throws for unknown plugin', async () => {
		await FlashcoreSystem.init({ adapter })

		const User = FlashcoreSystem.registerModel('User', {
			id: f.id(),
			name: f.string()
		})

		expect(() => User.pluginContext('nonexistent')).toThrow("Plugin 'nonexistent' not found")
	})

	test('plugin context methods are available', async () => {
		const helperPlugin = () =>
			definePlugin<
				Record<string, unknown>,
				Record<string, unknown>,
				{ counter: number }
			>({
				name: 'helper',
				setup(ctx) {
					ctx.state.counter = 0
				},
				methods: {
					increment() {
						;(this as unknown as { state: { counter: number } }).state.counter++
					},
					getCount() {
						return (this as unknown as { state: { counter: number } }).state.counter
					}
				}
			})

		await FlashcoreSystem.init({
			adapter,
			plugins: [helperPlugin()]
		})

		const User = FlashcoreSystem.registerModel('User', {
			id: f.id(),
			name: f.string()
		})

		const ctx = User.pluginContext('helper')

		// Methods should be available
		expect(ctx.methods.increment).toBeDefined()
		expect(ctx.methods.getCount).toBeDefined()
	})
})
