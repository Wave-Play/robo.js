/**
 * Phase 10: Plugin Client Extensions Tests
 *
 * Tests that client extensions are accessible via:
 * - Flashcore.$.getClientExtensions()['pluginName'].method()
 * - Flashcore.$.pluginName.method() (via Proxy)
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals'
import { FlashcoreSystem } from '../../../src/flashcore/core/system.js'
import { MemoryAdapter } from '../helpers/memory-adapter.js'
import { definePlugin } from '../../../src/flashcore/plugin/define.js'

describe('Phase 10: Plugin Client Extensions', () => {
	let adapter: MemoryAdapter

	beforeEach(async () => {
		adapter = new MemoryAdapter()
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	test('client extensions accessible via getClientExtensions()', async () => {
		interface TestClientExtensions {
			getValue(): number
			getMessage(): string
		}

		const testPlugin = definePlugin<TestClientExtensions>({
			name: 'test',
			clientExtensions: {
				getValue: () => 42,
				getMessage: () => 'hello'
			}
		})

		await FlashcoreSystem.init({ adapter, plugins: [testPlugin] })

		const extensions = FlashcoreSystem.getClientExtensions()
		expect(extensions['test']).toBeDefined()
		expect((extensions['test'] as unknown as TestClientExtensions).getValue()).toBe(42)
		expect((extensions['test'] as unknown as TestClientExtensions).getMessage()).toBe('hello')
	})

	test('client extensions accessible via Flashcore.$.pluginName (Proxy)', async () => {
		interface TestClientExtensions {
			getValue(): number
			multiply(a: number, b: number): number
		}

		const testPlugin = definePlugin<TestClientExtensions>({
			name: 'math',
			clientExtensions: {
				getValue: () => 42,
				multiply: (a: number, b: number) => a * b
			}
		})

		await FlashcoreSystem.init({ adapter, plugins: [testPlugin] })

		// Access via Proxy - cast to unknown first, then to the expected type
		const system = FlashcoreSystem as unknown as Record<string, TestClientExtensions>
		expect(system.math).toBeDefined()
		expect(system.math.getValue()).toBe(42)
		expect(system.math.multiply(6, 7)).toBe(42)
	})

	test('Proxy returns undefined for unknown plugin names', async () => {
		await FlashcoreSystem.init({ adapter })

		const system = FlashcoreSystem as unknown as Record<string, unknown>
		expect(system.nonexistent).toBeUndefined()
	})

	test('Proxy does not interfere with existing properties', async () => {
		await FlashcoreSystem.init({ adapter })

		// These should still work normally
		expect(FlashcoreSystem.isInitialized).toBe(true)
		expect(typeof FlashcoreSystem.getClientExtensions).toBe('function')
		expect(typeof FlashcoreSystem.registerModel).toBe('function')
	})

	test('multiple plugins have separate client extensions', async () => {
		interface PluginAExtensions {
			getA(): string
		}
		interface PluginBExtensions {
			getB(): string
		}

		const pluginA = definePlugin<PluginAExtensions>({
			name: 'pluginA',
			clientExtensions: {
				getA: () => 'from A'
			}
		})

		const pluginB = definePlugin<PluginBExtensions>({
			name: 'pluginB',
			clientExtensions: {
				getB: () => 'from B'
			}
		})

		await FlashcoreSystem.init({ adapter, plugins: [pluginA, pluginB] })

		const system = FlashcoreSystem as unknown as Record<string, PluginAExtensions | PluginBExtensions>
		expect((system.pluginA as PluginAExtensions).getA()).toBe('from A')
		expect((system.pluginB as PluginBExtensions).getB()).toBe('from B')
	})

	test('client extension can access plugin state via closure', async () => {
		interface CounterExtensions {
			increment(): void
			getCount(): number
		}

		let count = 0

		const counterPlugin = definePlugin<CounterExtensions>({
			name: 'counter',
			clientExtensions: {
				increment: () => {
					count++
				},
				getCount: () => count
			}
		})

		await FlashcoreSystem.init({ adapter, plugins: [counterPlugin] })

		const system = FlashcoreSystem as unknown as Record<string, CounterExtensions>
		expect(system.counter.getCount()).toBe(0)
		system.counter.increment()
		system.counter.increment()
		expect(system.counter.getCount()).toBe(2)
	})
})
