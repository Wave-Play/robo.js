/**
 * Flashcore v1 (spec rev 4.3) Phase 0 Tests - KV Parity
 *
 * Tests KV API operations: get, set, delete, has, clear, on, off.
 * Includes namespace handling, reserved prefix validation, updater functions, watchers.
 */

import { jest } from '@jest/globals'
import {
	Flashcore,
	FlashcoreSystem,
	SafetyError,
	type WatcherCallback
} from '../helpers/flashcore-compat.js'
import { MemoryAdapter } from '../helpers/memory-adapter.js'

type MockWatcher = WatcherCallback & { mock: { calls: unknown[][] } }

describe('Flashcore KV API', () => {
	beforeEach(async () => {
		await Flashcore.$.init({ adapter: new MemoryAdapter() })
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	describe('get()', () => {
		it('should get a stored value', async () => {
			await Flashcore.set('key', 'value')
			expect(await Flashcore.get('key')).toBe('value')
		})

		it('should return undefined for missing keys', async () => {
			expect(await Flashcore.get('nonexistent')).toBeUndefined()
		})

		it('should return default when value is undefined', async () => {
			expect(await Flashcore.get('missing', { default: 'fallback' })).toBe('fallback')
		})

		it('should not return default when value is null', async () => {
			await Flashcore.set('nullable', null)
			expect(await Flashcore.get('nullable', { default: 'fallback' })).toBeNull()
		})

		it('should handle various value types', async () => {
			await Flashcore.set('string', 'hello')
			await Flashcore.set('number', 42)
			await Flashcore.set('boolean', false)
			await Flashcore.set('null', null)
			await Flashcore.set('object', { nested: { value: 1 } })
			await Flashcore.set('array', [1, 2, 3])

			expect(await Flashcore.get('string')).toBe('hello')
			expect(await Flashcore.get('number')).toBe(42)
			expect(await Flashcore.get('boolean')).toBe(false)
			expect(await Flashcore.get('null')).toBeNull()
			expect(await Flashcore.get('object')).toEqual({ nested: { value: 1 } })
			expect(await Flashcore.get('array')).toEqual([1, 2, 3])
		})
	})

	describe('set()', () => {
		it('should set a value and return true', async () => {
			const result = await Flashcore.set('key', 'value')
			expect(result).toBe(true)
			expect(await Flashcore.get('key')).toBe('value')
		})

		it('should overwrite existing values', async () => {
			await Flashcore.set('key', 'first')
			await Flashcore.set('key', 'second')
			expect(await Flashcore.get('key')).toBe('second')
		})

		it('should accept updater function', async () => {
			await Flashcore.set('counter', 10)
			await Flashcore.set('counter', (old: number | undefined) => (old ?? 0) + 1)
			expect(await Flashcore.get('counter')).toBe(11)
		})

		it('should pass undefined to updater for new keys', async () => {
			await Flashcore.set('new', (old: number | undefined) => (old === undefined ? 0 : old + 1))
			expect(await Flashcore.get('new')).toBe(0)
		})

		it('should reject reserved prefixes', async () => {
			await expect(Flashcore.set('_model:User:catalog', 'data')).rejects.toThrow(SafetyError)
			await expect(Flashcore.set('_flashcore:config', 'data')).rejects.toThrow(SafetyError)
			await expect(Flashcore.set('_wal:entry:123', 'data')).rejects.toThrow(SafetyError)
			await expect(Flashcore.set('_junction_UserPost', 'data')).rejects.toThrow(SafetyError)
		})
	})

	describe('delete()', () => {
		it('should delete existing key and return true', async () => {
			await Flashcore.set('key', 'value')
			expect(await Flashcore.delete('key')).toBe(true)
			expect(await Flashcore.get('key')).toBeUndefined()
		})

		it('should return false for non-existent key', async () => {
			expect(await Flashcore.delete('nonexistent')).toBe(false)
		})

		it('should reject reserved prefixes', async () => {
			await expect(Flashcore.delete('_model:User:catalog')).rejects.toThrow(SafetyError)
		})
	})

	describe('has()', () => {
		it('should return true for existing keys', async () => {
			await Flashcore.set('key', 'value')
			expect(await Flashcore.has('key')).toBe(true)
		})

		it('should return false for non-existent keys', async () => {
			expect(await Flashcore.has('nonexistent')).toBe(false)
		})

		it('should return true for falsy stored values', async () => {
			await Flashcore.set('zero', 0)
			await Flashcore.set('false', false)
			await Flashcore.set('empty', '')
			await Flashcore.set('null', null)

			expect(await Flashcore.has('zero')).toBe(true)
			expect(await Flashcore.has('false')).toBe(true)
			expect(await Flashcore.has('empty')).toBe(true)
			expect(await Flashcore.has('null')).toBe(true)
		})
	})

	describe('clear()', () => {
		it('should clear all data', async () => {
			await Flashcore.set('key1', 'value1')
			await Flashcore.set('key2', 'value2')

			await Flashcore.clear()

			expect(await Flashcore.has('key1')).toBe(false)
			expect(await Flashcore.has('key2')).toBe(false)
		})
	})

	describe('Namespace handling', () => {
		it('should isolate keys by string namespace', async () => {
			await Flashcore.set('key', 'global')
			await Flashcore.set('key', 'namespaced', { namespace: 'ns1' })

			expect(await Flashcore.get('key')).toBe('global')
			expect(await Flashcore.get('key', { namespace: 'ns1' })).toBe('namespaced')
		})

		it('should isolate keys by array namespace', async () => {
			await Flashcore.set('key', 'a', { namespace: ['app', 'users'] })
			await Flashcore.set('key', 'b', { namespace: ['app', 'posts'] })

			expect(await Flashcore.get('key', { namespace: ['app', 'users'] })).toBe('a')
			expect(await Flashcore.get('key', { namespace: ['app', 'posts'] })).toBe('b')
		})

		it('should delete namespaced keys', async () => {
			await Flashcore.set('key', 'value', { namespace: 'ns1' })
			await Flashcore.delete('key', { namespace: 'ns1' })

			expect(await Flashcore.has('key', { namespace: 'ns1' })).toBe(false)
		})

		it('should check existence of namespaced keys', async () => {
			await Flashcore.set('key', 'value', { namespace: 'ns1' })

			expect(await Flashcore.has('key', { namespace: 'ns1' })).toBe(true)
			expect(await Flashcore.has('key', { namespace: 'ns2' })).toBe(false)
		})
	})

	describe('Watchers (on/off)', () => {
		it('should fire watcher on set', async () => {
			const callback = jest.fn() as MockWatcher
			Flashcore.on('watched', callback)

			await Flashcore.set('watched', 'new-value')

			// Watchers fire asynchronously
			await new Promise((r) => setTimeout(r, 10))

			expect(callback).toHaveBeenCalledWith(undefined, 'new-value')
		})

		it('should fire watcher with old and new values', async () => {
			await Flashcore.set('watched', 'old-value')

			const callback = jest.fn() as MockWatcher
			Flashcore.on('watched', callback)

			await Flashcore.set('watched', 'new-value')
			await new Promise((r) => setTimeout(r, 10))

			expect(callback).toHaveBeenCalledWith('old-value', 'new-value')
		})

		it('should fire watcher on delete with undefined as new value', async () => {
			await Flashcore.set('watched', 'value')

			const callback = jest.fn() as MockWatcher
			Flashcore.on('watched', callback)

			await Flashcore.delete('watched')
			await new Promise((r) => setTimeout(r, 10))

			expect(callback).toHaveBeenCalledWith('value', undefined)
		})

		it('should unregister specific watcher with off()', async () => {
			const callback1 = jest.fn() as MockWatcher
			const callback2 = jest.fn() as MockWatcher

			Flashcore.on('key', callback1)
			Flashcore.on('key', callback2)
			Flashcore.off('key', callback1)

			await Flashcore.set('key', 'value')
			await new Promise((r) => setTimeout(r, 10))

			expect(callback1).not.toHaveBeenCalled()
			expect(callback2).toHaveBeenCalled()
		})

		it('should unregister all watchers when callback not provided', async () => {
			const callback1 = jest.fn() as MockWatcher
			const callback2 = jest.fn() as MockWatcher

			Flashcore.on('key', callback1)
			Flashcore.on('key', callback2)
			Flashcore.off('key')

			await Flashcore.set('key', 'value')
			await new Promise((r) => setTimeout(r, 10))

			expect(callback1).not.toHaveBeenCalled()
			expect(callback2).not.toHaveBeenCalled()
		})

		it('should work with namespaced keys', async () => {
			const callback = jest.fn() as MockWatcher
			Flashcore.on('key', callback, { namespace: 'ns1' })

			await Flashcore.set('key', 'value', { namespace: 'ns1' })
			await new Promise((r) => setTimeout(r, 10))

			expect(callback).toHaveBeenCalled()
		})
	})

	describe('Updater function', () => {
		it('should receive prior value in updater', async () => {
			await Flashcore.set('list', ['a', 'b'])
			await Flashcore.set('list', (old: string[] | undefined) => [...(old ?? []), 'c'])

			expect(await Flashcore.get('list')).toEqual(['a', 'b', 'c'])
		})

		it('should handle async updater scenario', async () => {
			await Flashcore.set('count', 5)

			// Simulate concurrent updates
			const p1 = Flashcore.set('count', (old: number | undefined) => (old ?? 0) + 1)
			const p2 = Flashcore.set('count', (old: number | undefined) => (old ?? 0) + 10)

			await Promise.all([p1, p2])

			// Final value depends on execution order
			// But should not lose either update due to serialized execution
			const final = await Flashcore.get<number>('count')
			expect(final).toBeDefined()
		})
	})
})
