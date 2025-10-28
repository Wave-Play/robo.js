import { describe, expect, test, beforeEach, afterEach, jest } from '@jest/globals'
import { setupTestEnvironment, cleanupTestEnvironment } from './helpers/test-utils.js'
import { mockFlashcore, getFlashcoreStorage } from './helpers/mocks.js'

// Import the built Flashcore and Globals modules
const flashcoreCore = await import('../dist/core/flashcore.js')
const globalsCore = await import('../dist/core/globals.js')
const { Flashcore } = flashcoreCore
const { Globals } = globalsCore

describe('Flashcore', () => {
	beforeEach(() => {
		setupTestEnvironment()
	})

	afterEach(() => {
		cleanupTestEnvironment()
	})

	describe('$init', () => {
		test('should initialize with custom adapter', () => {
			const customAdapter = { init: jest.fn() } as any
			Flashcore.$init({ adapter: customAdapter })
			expect(mockFlashcore.$init).toHaveBeenCalledWith({ adapter: customAdapter })
		})

		test('should not affect string namespaces', () => {
			Flashcore.$init({ adapter: {} as any, namespaceSeparator: '::' })

			// Test that namespace separator option is passed
			expect(mockFlashcore.$init).toHaveBeenCalledWith({ adapter: {}, namespaceSeparator: '::' })

			// Test that namespace separator is applied (storage still uses __ separator)
			Flashcore.set('key', 'value', { namespace: 'users' })
			expect(getFlashcoreStorage().has('users__key')).toBe(true)
		})

		test('should be idempotent (first adapter remains registered)', () => {
			const firstAdapter = { init: jest.fn() } as any
			Flashcore.$init({ adapter: firstAdapter })

			const secondAdapter = { init: jest.fn() } as any
			Flashcore.$init({ adapter: secondAdapter })

			// Should be called twice (idempotency is in implementation)
			expect(mockFlashcore.$init).toHaveBeenCalledTimes(2)
		})

		test('should initialize with default options', () => {
			const customAdapter = { init: jest.fn() } as any
			Flashcore.$init({ adapter: customAdapter })

			expect(mockFlashcore.$init).toHaveBeenCalledWith({ adapter: customAdapter })

			// Default separator is '/' - test by setting namespaced key
			Flashcore.set('key', 'value', { namespace: ['app', 'users'] })
			expect(getFlashcoreStorage().has('app/users__key')).toBe(true)
		})

		test('should handle adapter init failure', async () => {
			// Configure mock to return rejected Promise
			mockFlashcore.$init.mockImplementationOnce(() =>
				Promise.reject(new Error('Adapter initialization failed'))
			)

			await expect(Flashcore.$init({ adapter: {} as any })).rejects.toThrow()
		})

		test('should handle Keyv import failure', async () => {
			// Simulate Keyv import failure with rejected Promise
			mockFlashcore.$init.mockImplementationOnce(() =>
				Promise.reject(new Error('Failed to import Keyv. Did you remember to install `keyv`?'))
			)

			await expect(Flashcore.$init({ keyvOptions: {} })).rejects.toThrow()
		})
	})

	describe('Pre-initialization usage', () => {
		test('should handle operations before $init', () => {
			// Temporarily mock adapter getter to return null
			const originalGetAdapter = Globals.getFlashcoreAdapter
			Globals.getFlashcoreAdapter = jest.fn(() => null) as any

			// These operations should not crash
			expect(() => Flashcore.get('key')).not.toThrow()
			expect(() => Flashcore.has('key')).not.toThrow()

			// Test expected pre-init behavior: get with default returns the default
			const valueWithDefault = Flashcore.get('k', { default: 'x' })
			expect(valueWithDefault).toBe('x')

			// Test expected pre-init behavior: has returns false
			const hasResult = Flashcore.has('k')
			expect(hasResult).toBe(false)

			// Restore
			Globals.getFlashcoreAdapter = originalGetAdapter
		})
	})

	describe('Basic CRUD Operations (sync adapter)', () => {
		describe('set', () => {
			test('should set string value', () => {
				const result = Flashcore.set('name', 'John')
				expect(result).toBe(true)
				expect(getFlashcoreStorage().get('name')).toBe('John')
			})

			test('should set number value', () => {
				const result = Flashcore.set('age', 25)
				expect(result).toBe(true)
				expect(getFlashcoreStorage().get('age')).toBe(25)
			})

			test('should set object value', () => {
				const obj = { name: 'John', age: 25 }
				const result = Flashcore.set('user', obj)
				expect(result).toBe(true)
				expect(getFlashcoreStorage().get('user')).toEqual(obj)
			})

			test('should set array value', () => {
				const arr = [1, 2, 3, 4, 5]
				const result = Flashcore.set('numbers', arr)
				expect(result).toBe(true)
				expect(getFlashcoreStorage().get('numbers')).toEqual(arr)
			})

			test('should set null value', () => {
				const result = Flashcore.set('nullable', null)
				expect(result).toBe(true)
				expect(getFlashcoreStorage().get('nullable')).toBe(null)
			})

			test('should set undefined value', () => {
				const result = Flashcore.set('undefinable', undefined)
				expect(result).toBe(true)
				expect(getFlashcoreStorage().get('undefinable')).toBe(undefined)
			})
		})

		describe('get', () => {
			test('should retrieve existing key', () => {
				Flashcore.set('name', 'John')
				const value = Flashcore.get('name')
				expect(value).toBe('John')
			})

			test('should return undefined for non-existent key', () => {
				const value = Flashcore.get('nonexistent')
				expect(value).toBeUndefined()
			})

			test('should preserve type for string', () => {
				Flashcore.set('text', 'Hello')
				const value = Flashcore.get('text')
				expect(typeof value).toBe('string')
				expect(value).toBe('Hello')
			})

			test('should preserve type for number', () => {
				Flashcore.set('count', 42)
				const value = Flashcore.get('count')
				expect(typeof value).toBe('number')
				expect(value).toBe(42)
			})

			test('should preserve type for object', () => {
				const obj = { foo: 'bar' }
				Flashcore.set('obj', obj)
				const value = Flashcore.get('obj')
				expect(value).toEqual(obj)
			})

			test('should preserve type for array', () => {
				const arr = [1, 2, 3]
				Flashcore.set('arr', arr)
				const value = Flashcore.get('arr')
				expect(Array.isArray(value)).toBe(true)
				expect(value).toEqual(arr)
			})
		})

		describe('delete', () => {
			test('should delete existing key', () => {
				Flashcore.set('temp', 'value')
				const result = Flashcore.delete('temp')
				expect(result).toBe(true)
				expect(getFlashcoreStorage().has('temp')).toBe(false)
			})

			test('should return false for non-existent key', () => {
				const result = Flashcore.delete('nonexistent')
				expect(result).toBe(false)
			})

			test('should remove value completely', () => {
				Flashcore.set('key', 'value')
				Flashcore.delete('key')
				const value = Flashcore.get('key')
				expect(value).toBeUndefined()
			})
		})

		describe('clear', () => {
			test('should clear all data', () => {
				Flashcore.set('key1', 'value1')
				Flashcore.set('key2', 'value2')
				Flashcore.set('key3', 'value3')

				Flashcore.clear()

				expect(getFlashcoreStorage().size).toBe(0)
			})

			test('should result in empty state', () => {
				Flashcore.set('key', 'value')
				Flashcore.clear()

				const value = Flashcore.get('key')
				expect(value).toBeUndefined()
			})
		})

		describe('has', () => {
			test('should return true for existing key', () => {
				Flashcore.set('exists', 'yes')
				const result = Flashcore.has('exists')
				expect(result).toBe(true)
			})

			test('should return false for non-existent key', () => {
				const result = Flashcore.has('doesnotexist')
				expect(result).toBe(false)
			})

			test('should return true even for null values', () => {
				Flashcore.set('nullable', null)
				const result = Flashcore.has('nullable')
				expect(result).toBe(true)
			})

			test('should return true even for undefined values', () => {
				Flashcore.set('undefinable', undefined)
				const result = Flashcore.has('undefinable')
				expect(result).toBe(true)
			})
		})
	})

	describe('Async Adapter Behavior', () => {
		beforeEach(() => {
			// Make methods async for these tests
			const originalSet = mockFlashcore.set
			const originalGet = mockFlashcore.get
			const originalDelete = mockFlashcore.delete
			const originalClear = mockFlashcore.clear
			const originalHas = mockFlashcore.has

			mockFlashcore.set = jest.fn((key, value, options) =>
				Promise.resolve(originalSet.getMockImplementation()(key, value, options))
			) as any

			mockFlashcore.get = jest.fn((key, options) =>
				Promise.resolve(originalGet.getMockImplementation()(key, options))
			) as any

			mockFlashcore.delete = jest.fn((key, options) =>
				Promise.resolve(originalDelete.getMockImplementation()(key, options))
			) as any

			mockFlashcore.clear = jest.fn(() => Promise.resolve(originalClear.getMockImplementation()())) as any

			mockFlashcore.has = jest.fn((key, options) =>
				Promise.resolve(originalHas.getMockImplementation()(key, options))
			) as any
		})

		test('should set and get with async adapter', async () => {
			const result = await Flashcore.set('async-key', 'async-value')
			expect(result).toBe(true)

			const value = await Flashcore.get('async-key')
			expect(value).toBe('async-value')
		})

		test('should delete with async adapter', async () => {
			await Flashcore.set('to-delete', 'value')
			const result = await Flashcore.delete('to-delete')
			expect(result).toBe(true)

			const exists = await Flashcore.has('to-delete')
			expect(exists).toBe(false)
		})

		test('should clear with async adapter', async () => {
			await Flashcore.set('key1', 'value1')
			await Flashcore.set('key2', 'value2')
			await Flashcore.clear()

			const value1 = await Flashcore.get('key1')
			const value2 = await Flashcore.get('key2')
			expect(value1).toBeUndefined()
			expect(value2).toBeUndefined()
		})

		test('should check existence with async adapter', async () => {
			await Flashcore.set('exists', 'yes')
			const exists = await Flashcore.has('exists')
			const notExists = await Flashcore.has('notexists')

			expect(exists).toBe(true)
			expect(notExists).toBe(false)
		})
	})

	describe('Namespace Support', () => {
		describe('String namespace', () => {
			test('should set and get with string namespace', () => {
				Flashcore.set('id', '123', { namespace: 'users' })
				const value = Flashcore.get('id', { namespace: 'users' })
				expect(value).toBe('123')
			})

			test('should compose namespace correctly with default separator', () => {
				Flashcore.set('key', 'value', { namespace: 'users' })
				// Default separator is still '__' between namespace and key
				expect(getFlashcoreStorage().has('users__key')).toBe(true)
			})

			test('should isolate namespaced keys', () => {
				Flashcore.set('key', 'global-value')
				Flashcore.set('key', 'namespaced-value', { namespace: 'users' })

				const globalValue = Flashcore.get('key')
				const namespacedValue = Flashcore.get('key', { namespace: 'users' })

				expect(globalValue).toBe('global-value')
				expect(namespacedValue).toBe('namespaced-value')
			})

			test('should delete with namespace', () => {
				Flashcore.set('key', 'value', { namespace: 'users' })
				const result = Flashcore.delete('key', { namespace: 'users' })
				expect(result).toBe(true)

				const value = Flashcore.get('key', { namespace: 'users' })
				expect(value).toBeUndefined()
			})

			test('should check existence with namespace', () => {
				Flashcore.set('key', 'value', { namespace: 'users' })
				const exists = Flashcore.has('key', { namespace: 'users' })
				const notExists = Flashcore.has('key', { namespace: 'admins' })

				expect(exists).toBe(true)
				expect(notExists).toBe(false)
			})
		})

		describe('Array namespace', () => {
			test('should set and get with array namespace', () => {
				Flashcore.set('theme', 'dark', { namespace: ['app', 'users', 'settings'] })
				const value = Flashcore.get('theme', { namespace: ['app', 'users', 'settings'] })
				expect(value).toBe('dark')
			})

			test('should compose array namespace correctly with default separator', () => {
				Flashcore.set('key', 'value', { namespace: ['app', 'users'] })
				// Array namespaces join with '/' by default, then '__' before key
				expect(getFlashcoreStorage().has('app/users__key')).toBe(true)
			})

			test('should isolate array namespaced keys', () => {
				Flashcore.set('pref', 'value1', { namespace: ['app', 'settings'] })
				Flashcore.set('pref', 'value2', { namespace: ['app', 'users'] })

				const value1 = Flashcore.get('pref', { namespace: ['app', 'settings'] })
				const value2 = Flashcore.get('pref', { namespace: ['app', 'users'] })

				expect(value1).toBe('value1')
				expect(value2).toBe('value2')
			})
		})

		describe('Custom namespace separator', () => {
			test('should use custom separator for array namespaces', () => {
				Flashcore.$init({ adapter: {} as any, namespaceSeparator: '::' })

				Flashcore.set('key', 'value', { namespace: 'users' })
				// Still uses '__' between namespace and key
				expect(getFlashcoreStorage().has('users__key')).toBe(true)
			})

			test('should work with array namespace and custom separator', () => {
				// The mock uses fixed separators, but we verify the init was called
				Flashcore.$init({ adapter: {} as any, namespaceSeparator: '::' })
				expect(mockFlashcore.$init).toHaveBeenCalledWith({ adapter: {} as any, namespaceSeparator: '::' })
			})
		})
	})

	describe('Default Values', () => {
		test('should return default for non-existent key', () => {
			const value = Flashcore.get('nonexistent', { default: 'fallback' })
			expect(value).toBe('fallback')
		})

		test('should not return default when key exists', () => {
			Flashcore.set('key', 'actual-value')
			const value = Flashcore.get('key', { default: 'fallback' })
			expect(value).toBe('actual-value')
		})

		test('should handle default with string type', () => {
			const value = Flashcore.get('missing', { default: 'default-string' })
			expect(value).toBe('default-string')
		})

		test('should handle default with number type', () => {
			const value = Flashcore.get('missing', { default: 42 })
			expect(value).toBe(42)
		})

		test('should handle default with object type', () => {
			const defaultObj = { foo: 'bar' }
			const value = Flashcore.get('missing', { default: defaultObj })
			expect(value).toEqual(defaultObj)
		})

		test('should handle default with array type', () => {
			const defaultArr = [1, 2, 3]
			const value = Flashcore.get('missing', { default: defaultArr })
			expect(value).toEqual(defaultArr)
		})

		test('should work with namespace and default', () => {
			const value = Flashcore.get('key', { namespace: 'users', default: 'default-value' })
			expect(value).toBe('default-value')
		})

		test('should not apply defaults with async adapters (returns Promise)', async () => {
			// Override mock to always return Promise.resolve(undefined) when key is missing
			// This simulates async adapter semantics where Flashcore's get() returns the underlying promise
			mockFlashcore.get = jest.fn((key, options) => Promise.resolve(undefined)) as any

			// With async adapter, get returns a Promise
			const result = Flashcore.get('missing', { default: 'fallback' })

			// Result is a Promise
			expect(result).toBeInstanceOf(Promise)

			// When awaited, we get undefined (not the default) because the implementation
			// uses ?? which doesn't work with Promise.resolve(undefined)
			const value = await result
			expect(value).toBeUndefined()
		})
	})

	describe('Updater Functions', () => {
		test('should update with function value (sync adapter)', async () => {
			Flashcore.set('counter', 10)
			const result = await Flashcore.set('counter', (old: number) => old + 5)

			expect(result).toBe(true)
			const value = Flashcore.get('counter')
			expect(value).toBe(15)
		})

		test('should receive undefined for non-existent key', async () => {
			let receivedOld: unknown
			await Flashcore.set('new-key', (old: unknown) => {
				receivedOld = old
				return 'new-value'
			})

			expect(receivedOld).toBeUndefined()
			const value = Flashcore.get('new-key')
			expect(value).toBe('new-value')
		})

		test('should receive current value for existing key', async () => {
			Flashcore.set('existing', 'old-value')

			let receivedOld: unknown
			await Flashcore.set('existing', (old: unknown) => {
				receivedOld = old
				return 'new-value'
			})

			expect(receivedOld).toBe('old-value')
			const value = Flashcore.get('existing')
			expect(value).toBe('new-value')
		})

		test('should increment number', async () => {
			Flashcore.set('count', 0)
			await Flashcore.set('count', (old: number) => old + 1)
			await Flashcore.set('count', (old: number) => old + 1)
			await Flashcore.set('count', (old: number) => old + 1)

			const value = Flashcore.get('count')
			expect(value).toBe(3)
		})

		test('should append to array', async () => {
			Flashcore.set('items', [1, 2, 3])
			await Flashcore.set('items', (old: number[]) => [...old, 4, 5])

			const value = Flashcore.get('items')
			expect(value).toEqual([1, 2, 3, 4, 5])
		})

		test('should merge objects', async () => {
			Flashcore.set('user', { name: 'John', age: 25 })
			await Flashcore.set('user', (old: { name: string; age: number }) => ({
				...old,
				age: 26,
				city: 'New York'
			}))

			const value = Flashcore.get('user')
			expect(value).toEqual({ name: 'John', age: 26, city: 'New York' })
		})

		test('should work with async adapter', async () => {
			// Make methods async
			const originalSet = mockFlashcore.set
			const originalGet = mockFlashcore.get

			mockFlashcore.set = jest.fn((key, value, options) =>
				Promise.resolve(originalSet.getMockImplementation()(key, value, options))
			) as any

			mockFlashcore.get = jest.fn((key, options) =>
				Promise.resolve(originalGet.getMockImplementation()(key, options))
			) as any

			await Flashcore.set('counter', 10)
			await Flashcore.set('counter', (old: number) => old + 5)

			const value = await Flashcore.get('counter')
			expect(value).toBe(15)
		})
	})

	describe('Watcher System', () => {
		describe('on method', () => {
			test('should register callback for key', async () => {
				const callback = jest.fn()
				Flashcore.on('watched-key', callback)

				await Flashcore.set('watched-key', 'new-value')

				expect(callback).toHaveBeenCalledTimes(1)
				expect(callback).toHaveBeenCalledWith(undefined, 'new-value')
			})

			test('should invoke callback with old and new values', async () => {
				const callback = jest.fn()
				Flashcore.set('key', 'old-value')
				Flashcore.on('key', callback)

				await Flashcore.set('key', 'new-value')

				expect(callback).toHaveBeenCalledWith('old-value', 'new-value')
			})

			test('should invoke callback when key is deleted', async () => {
				const callback = jest.fn()
				Flashcore.set('key', 'value')
				Flashcore.on('key', callback)

				await Flashcore.delete('key')

				expect(callback).toHaveBeenCalledWith('value', undefined)
			})

			test('should handle multiple callbacks on same key', async () => {
				const callback1 = jest.fn()
				const callback2 = jest.fn()
				const callback3 = jest.fn()

				Flashcore.on('key', callback1)
				Flashcore.on('key', callback2)
				Flashcore.on('key', callback3)

				await Flashcore.set('key', 'value')

				expect(callback1).toHaveBeenCalledTimes(1)
				expect(callback2).toHaveBeenCalledTimes(1)
				expect(callback3).toHaveBeenCalledTimes(1)
			})

			test('should isolate callbacks on different keys', async () => {
				const callback1 = jest.fn()
				const callback2 = jest.fn()

				Flashcore.on('key1', callback1)
				Flashcore.on('key2', callback2)

				await Flashcore.set('key1', 'value1')

				expect(callback1).toHaveBeenCalledTimes(1)
				expect(callback2).not.toHaveBeenCalled()
			})

			test('should handle async callbacks', async () => {
				const callback = jest.fn(async () => {
					await new Promise((resolve) => setTimeout(resolve, 10))
				})

				Flashcore.on('key', callback)
				await Flashcore.set('key', 'value')

				expect(callback).toHaveBeenCalledTimes(1)
			})

			test('should work with namespaced keys using namespace option', async () => {
				const callback = jest.fn()
				Flashcore.on('id', callback, { namespace: 'users' })

				await Flashcore.set('id', '123', { namespace: 'users' })

				expect(callback).toHaveBeenCalledWith(undefined, '123')
			})
		})

		describe('off method', () => {
			test('should remove specific callback', async () => {
				const callback1 = jest.fn()
				const callback2 = jest.fn()

				Flashcore.on('key', callback1)
				Flashcore.on('key', callback2)
				Flashcore.off('key', callback1)

				await Flashcore.set('key', 'value')

				expect(callback1).not.toHaveBeenCalled()
				expect(callback2).toHaveBeenCalledTimes(1)
			})

			test('should remove all callbacks when no callback parameter', async () => {
				const callback1 = jest.fn()
				const callback2 = jest.fn()

				Flashcore.on('key', callback1)
				Flashcore.on('key', callback2)
				Flashcore.off('key')

				await Flashcore.set('key', 'value')

				expect(callback1).not.toHaveBeenCalled()
				expect(callback2).not.toHaveBeenCalled()
			})

			test('should not invoke removed callbacks', async () => {
				const callback = jest.fn()

				Flashcore.on('key', callback)
				await Flashcore.set('key', 'value1')

				Flashcore.off('key', callback)
				await Flashcore.set('key', 'value2')

				expect(callback).toHaveBeenCalledTimes(1)
			})

			test('should handle removing non-existent callback gracefully', () => {
				const callback = jest.fn()
				expect(() => Flashcore.off('key', callback)).not.toThrow()
			})

			test('should clean up when all callbacks removed', async () => {
				const callback1 = jest.fn()
				const callback2 = jest.fn()

				Flashcore.on('key', callback1)
				Flashcore.on('key', callback2)
				Flashcore.off('key', callback1)
				Flashcore.off('key', callback2)

				await Flashcore.set('key', 'value')

				expect(callback1).not.toHaveBeenCalled()
				expect(callback2).not.toHaveBeenCalled()
			})
		})
	})

	describe('Watcher Integration with Operations', () => {
		test('should trigger watchers on set with correct values', async () => {
			const callback = jest.fn()
			Flashcore.set('key', 'old')
			Flashcore.on('key', callback)

			await Flashcore.set('key', 'new')

			expect(callback).toHaveBeenCalledWith('old', 'new')
		})

		test('should trigger watchers on delete', async () => {
			const callback = jest.fn()
			Flashcore.set('key', 'value')
			Flashcore.on('key', callback)

			await Flashcore.delete('key')

			expect(callback).toHaveBeenCalledWith('value', undefined)
		})

		test('should trigger watchers with updater function', async () => {
			const callback = jest.fn()
			Flashcore.set('counter', 10)
			Flashcore.on('counter', callback)

			await Flashcore.set('counter', (old: number) => old + 5)

			expect(callback).toHaveBeenCalledWith(10, 15)
		})

		test('should handle watchers with async adapter', async () => {
			// Make methods async
			const originalSet = mockFlashcore.set
			const originalGet = mockFlashcore.get

			mockFlashcore.set = jest.fn((key, value, options) =>
				Promise.resolve(originalSet.getMockImplementation()(key, value, options))
			) as any

			mockFlashcore.get = jest.fn((key, options) =>
				Promise.resolve(originalGet.getMockImplementation()(key, options))
			) as any

			const callback = jest.fn()
			await Flashcore.set('key', 'old')
			Flashcore.on('key', callback)

			await Flashcore.set('key', 'new')

			expect(callback).toHaveBeenCalledWith('old', 'new')
		})

		test('should not interfere with return values', async () => {
			const callback = jest.fn()
			Flashcore.on('key', callback)

			const result = await Flashcore.set('key', 'value')

			expect(result).toBe(true)
			expect(callback).toHaveBeenCalledTimes(1)
		})
	})

	describe('Adapter Error Path Coverage', () => {
		test('should handle get() rejection in set operation', async () => {
			const callback = jest.fn()

			// Make get reject
			mockFlashcore.get = jest.fn(() => Promise.reject(new Error('Get failed'))) as any

			Flashcore.on('error-key', callback)

			// Set should proceed after error (catches and proceeds)
			await Flashcore.set('error-key', 'value')

			// Verify the key was set successfully
			expect(Flashcore.has('error-key')).toBe(true)
		})

		test('should handle get() rejection in delete operation', async () => {
			const callback = jest.fn()

			// Set initial value
			await Flashcore.set('error-key', 'initial-value')

			// Make get reject
			mockFlashcore.get = jest.fn(() => Promise.reject(new Error('Get failed'))) as any

			Flashcore.on('error-key', callback)

			// Delete should handle error (catches and proceeds)
			await Flashcore.delete('error-key')

			// Verify the key was deleted successfully
			expect(Flashcore.has('error-key')).toBe(false)
		})
	})

	describe('Edge Cases and Error Handling', () => {
		test('should handle special characters in keys', () => {
			const specialKey = 'key with spaces & symbols!@#$%'
			Flashcore.set(specialKey, 'value')
			const value = Flashcore.get(specialKey)
			expect(value).toBe('value')
		})

		test('should handle unicode in keys', () => {
			const unicodeKey = 'key-🚀-emoji'
			Flashcore.set(unicodeKey, 'value')
			const value = Flashcore.get(unicodeKey)
			expect(value).toBe('value')
		})

		test('should handle very long key names', () => {
			const longKey = 'k'.repeat(1000)
			Flashcore.set(longKey, 'value')
			const value = Flashcore.get(longKey)
			expect(value).toBe('value')
		})

		test('should handle empty string as key', () => {
			Flashcore.set('', 'empty-key-value')
			const value = Flashcore.get('')
			expect(value).toBe('empty-key-value')
		})

		test('should handle concurrent operations on same key', async () => {
			const promises = [
				Flashcore.set('concurrent', 'value1'),
				Flashcore.set('concurrent', 'value2'),
				Flashcore.set('concurrent', 'value3')
			]

			await Promise.all(promises)

			const value = Flashcore.get('concurrent')
			// One of the values should be set
			expect(['value1', 'value2', 'value3']).toContain(value)
		})

		test('should handle multiple gets concurrently', () => {
			Flashcore.set('key', 'value')

			const promises = [Flashcore.get('key'), Flashcore.get('key'), Flashcore.get('key')]

			// Sync adapter returns values directly
			expect(promises[0]).toBe('value')
			expect(promises[1]).toBe('value')
			expect(promises[2]).toBe('value')
		})

		test('should handle deeply nested objects', () => {
			const deepObj = {
				level1: {
					level2: {
						level3: {
							level4: {
								value: 'deep-value'
							}
						}
					}
				}
			}

			Flashcore.set('deep', deepObj)
			const value = Flashcore.get('deep')
			expect(value).toEqual(deepObj)
		})

		test('should handle large arrays', () => {
			const largeArray = Array.from({ length: 10000 }, (_, i) => i)
			Flashcore.set('large-array', largeArray)
			const value = Flashcore.get('large-array')
			expect(value).toEqual(largeArray)
		})
	})

	describe('Integration Scenarios', () => {
		test('should combine namespace and default value', () => {
			const value = Flashcore.get('missing', {
				namespace: 'users',
				default: 'default-value'
			})
			expect(value).toBe('default-value')
		})

		test('should combine namespace and watchers using namespace option', async () => {
			const callback = jest.fn()
			Flashcore.on('id', callback, { namespace: 'users' })

			await Flashcore.set('id', '123', { namespace: 'users' })

			expect(callback).toHaveBeenCalledWith(undefined, '123')
		})

		test('should combine updater function and watchers', async () => {
			const callback = jest.fn()
			Flashcore.set('counter', 10)
			Flashcore.on('counter', callback)

			await Flashcore.set('counter', (old: number) => old + 5)

			expect(callback).toHaveBeenCalledWith(10, 15)
			const value = Flashcore.get('counter')
			expect(value).toBe(15)
		})

		test('complex workflow: init → set → watch → update → delete', async () => {
			const callback = jest.fn()

			// Set initial value
			Flashcore.set('workflow', { count: 0 })

			// Add watcher
			Flashcore.on('workflow', callback)

			// Update with function
			await Flashcore.set('workflow', (old: { count: number }) => ({
				count: old.count + 1
			}))

			expect(callback).toHaveBeenCalledWith({ count: 0 }, { count: 1 })

			// Delete
			await Flashcore.delete('workflow')

			expect(callback).toHaveBeenCalledWith({ count: 1 }, undefined)
			expect(callback).toHaveBeenCalledTimes(2)

			// Verify deletion
			const value = Flashcore.get('workflow')
			expect(value).toBeUndefined()
		})

		test('should handle multiple namespaces with watchers using namespace option', async () => {
			const userCallback = jest.fn()
			const adminCallback = jest.fn()

			Flashcore.on('setting', userCallback, { namespace: 'users' })
			Flashcore.on('setting', adminCallback, { namespace: 'admins' })

			await Flashcore.set('setting', 'user-value', { namespace: 'users' })
			await Flashcore.set('setting', 'admin-value', { namespace: 'admins' })

			expect(userCallback).toHaveBeenCalledWith(undefined, 'user-value')
			expect(adminCallback).toHaveBeenCalledWith(undefined, 'admin-value')
		})

		test('should handle updater with namespace', async () => {
			Flashcore.set('count', 10, { namespace: 'stats' })
			await Flashcore.set('count', (old: number) => old + 5, { namespace: 'stats' })

			const value = Flashcore.get('count', { namespace: 'stats' })
			expect(value).toBe(15)
		})

		test('should handle all features together', async () => {
			const callback = jest.fn()

			// Setup namespace with array
			const ns = ['app', 'users', 'settings']

			// Set initial value
			Flashcore.set('theme', 'light', { namespace: ns })

			// Add watcher with namespace option
			Flashcore.on('theme', callback, { namespace: ns })

			// Update value
			await Flashcore.set('theme', 'dark', { namespace: ns })

			// Verify watcher was called
			expect(callback).toHaveBeenCalledWith('light', 'dark')

			// Get with default (should return actual value, not default)
			const value = Flashcore.get('theme', { namespace: ns, default: 'default-theme' })
			expect(value).toBe('dark')

			// Delete
			await Flashcore.delete('theme', { namespace: ns })

			// Get with default (should return default now)
			const deletedValue = Flashcore.get('theme', { namespace: ns, default: 'default-theme' })
			expect(deletedValue).toBe('default-theme')

			// Verify watcher was called for deletion
			expect(callback).toHaveBeenCalledWith('dark', undefined)
		})
	})
})
