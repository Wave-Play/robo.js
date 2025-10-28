import { describe, expect, test, beforeEach, afterEach, jest } from '@jest/globals'

// Mock logger to suppress console output during tests
jest.mock('../src/core/logger.js', () => ({
	logger: {
		debug: jest.fn(),
		error: jest.fn(),
		warn: jest.fn()
	}
}))

// Mock Flashcore module
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFlashcore: any = {
	get: jest.fn(),
	set: jest.fn(),
	delete: jest.fn(),
	clear: jest.fn(),
	has: jest.fn()
}

jest.mock('../src/core/flashcore.js', () => ({
	Flashcore: mockFlashcore
}))

// Inline constant to avoid import issues
const FLASHCORE_KEYS = {
	state: '__robo_state'
}

// Mock process.send for saveState tests
Object.defineProperty(process, 'send', { value: jest.fn(), writable: true })
const mockProcessSend = process.send as jest.Mock

describe('State API', () => {
	let State: typeof import('../src/core/state.js').State
	let getState: typeof import('../src/core/state.js').getState
	let setState: typeof import('../src/core/state.js').setState
	let clearState: typeof import('../src/core/state.js').clearState
	let loadState: typeof import('../src/core/state.js').loadState
	let saveState: typeof import('../src/core/state.js').saveState
	let removeInstances: typeof import('../src/core/state.js').removeInstances
	let state: Record<string, unknown>
	let logger: any

	beforeEach(async () => {
	// Reset all mocks
	jest.clearAllMocks()
	mockFlashcore.get.mockResolvedValue(undefined)
	mockFlashcore.set.mockResolvedValue(true)
	mockFlashcore.delete.mockResolvedValue(true)
	mockFlashcore.clear.mockResolvedValue(undefined)
	mockFlashcore.has.mockResolvedValue(false)

	// Ensure Globals uses the mocked Flashcore adapter
	const globalsModule = await import('../src/core/globals.js')
	globalsModule.Globals.registerFlashcore(mockFlashcore)

	// Re-import modules
	const stateModule = await import('../src/core/state.js')
	State = stateModule.State
	getState = stateModule.getState
	setState = stateModule.setState
	clearState = stateModule.clearState
	loadState = stateModule.loadState
	saveState = stateModule.saveState
	removeInstances = stateModule.removeInstances
	state = stateModule.state
	State.__resetForTests()

	const loggerModule = await import('../src/core/logger.js')
	logger = loggerModule.logger
	jest.spyOn(logger, 'warn')
	jest.spyOn(logger, 'error')
	jest.spyOn(logger, 'debug')

	// Clear the in-memory state object (including namespaced forks)
	clearState(true)
	})

	afterEach(() => {
		// Ensure state is clean between tests
		if (clearState) {
			clearState()
		}
		mockProcessSend.mockClear()
	})

	describe('Helper Functions', () => {
		describe('getState helper function', () => {
			test('should retrieve existing string value from state object', () => {
				state['key'] = 'value'
				const result = getState('key')
				expect(result).toBe('value')
			})

			test('should retrieve existing number value', () => {
				state['count'] = 42
				const result = getState('count')
				expect(result).toBe(42)
			})

			test('should retrieve existing object value', () => {
				const obj = { name: 'John', age: 25 }
				state['user'] = obj
				const result = getState('user')
				expect(result).toEqual(obj)
			})

			test('should retrieve existing array value', () => {
				const arr = [1, 2, 3, 4, 5]
				state['items'] = arr
				const result = getState('items')
				expect(result).toEqual(arr)
			})

			test('should retrieve null value', () => {
				state['nullable'] = null
				const result = getState('nullable')
				expect(result).toBe(null)
			})

			test('should return null for non-existent key', () => {
				const result = getState('nonexistent')
				expect(result).toBe(null)
			})

			test('should return custom default value when key does not exist', () => {
				const result = getState('missing', { default: 'fallback' })
				expect(result).toBe('fallback')
			})

			test('should NOT return default when key exists with falsy value', () => {
				state['zero'] = 0
				state['false'] = false
				state['empty'] = ''

				expect(getState('zero', { default: 99 })).toBe(0)
				expect(getState('false', { default: true })).toBe(false)
				expect(getState('empty', { default: 'fallback' })).toBe('')
			})

			test('should support namespace with __ separator', () => {
				state['ns__key'] = 'namespaced-value'
				const result = getState('key', { namespace: 'ns' })
				expect(result).toBe('namespaced-value')
			})

			test('should isolate namespaced keys from non-namespaced keys', () => {
				state['key'] = 'global'
				state['ns__key'] = 'namespaced'

				expect(getState('key')).toBe('global')
				expect(getState('key', { namespace: 'ns' })).toBe('namespaced')
			})

			test('should return undefined for undefined value in state', () => {
				state['undef'] = undefined
				const result = getState('undef')
				expect(result).toBe(undefined)
			})

			test('should return default when key exists with undefined value', () => {
				state['undef'] = undefined
				const result = getState('undef', { default: 'fallback' })
				expect(result).toBe('fallback')
			})
		})

		describe('setState helper function', () => {
			test('should set string value', () => {
				const result = setState('name', 'John')
				expect(result).toBe('John')
				expect(state['name']).toBe('John')
			})

			test('should set number value', () => {
				const result = setState('age', 25)
				expect(result).toBe(25)
				expect(state['age']).toBe(25)
			})

			test('should set object value', () => {
				const obj = { foo: 'bar' }
				const result = setState('obj', obj)
				expect(result).toEqual(obj)
				expect(state['obj']).toEqual(obj)
			})

			test('should set array value', () => {
				const arr = [1, 2, 3]
				const result = setState('arr', arr)
				expect(result).toEqual(arr)
				expect(state['arr']).toEqual(arr)
			})

			test('should set null value', () => {
				const result = setState('nullable', null)
				expect(result).toBe(null)
				expect(state['nullable']).toBe(null)
			})

			test('should set undefined value', () => {
				const result = setState('undef', undefined)
				expect(result).toBe(undefined)
				expect(state['undef']).toBe(undefined)
			})

			test('should return the new value', () => {
				const result = setState('key', 'value')
				expect(result).toBe('value')
			})

			test('should support namespace with __ separator', () => {
				setState('key', 'value', { namespace: 'ns' })
				expect(state['ns__key']).toBe('value')
			})

			test('should use updater function with existing value', () => {
				state['count'] = 10
				const result = setState('count', (old) => (old as number) + 5)
				expect(result).toBe(15)
				expect(state['count']).toBe(15)
			})

			test('should use updater function with non-existent key (undefined old value)', () => {
				const result = setState('new', (old) => old ?? 'default')
				expect(result).toBe('default')
				expect(state['new']).toBe('default')
			})

			test('should use updater to append to array', () => {
				state['items'] = [1, 2, 3]
				const result = setState('items', (old) => [...(old as number[]), 4, 5])
				expect(result).toEqual([1, 2, 3, 4, 5])
				expect(state['items']).toEqual([1, 2, 3, 4, 5])
			})

			test('should use updater to merge objects', () => {
				state['user'] = { name: 'John', age: 25 }
				const result = setState('user', (old) => ({ ...(old as object), city: 'NYC' }))
				expect(result).toEqual({ name: 'John', age: 25, city: 'NYC' })
			})

			test('should persist to Flashcore when persist option is true', async () => {
				setState('key', 'value', { persist: true })

				// Wait for async persistence
				await new Promise((resolve) => setTimeout(resolve, 10))

				expect(mockFlashcore.get).toHaveBeenCalledWith(FLASHCORE_KEYS.state)
				expect(mockFlashcore.set).toHaveBeenCalledWith(FLASHCORE_KEYS.state, { key: 'value' })
			})

			test('should persist with namespace prefix', async () => {
				setState('key', 'value', { namespace: 'ns', persist: true })

				await new Promise((resolve) => setTimeout(resolve, 10))

				expect(mockFlashcore.set).toHaveBeenCalledWith(FLASHCORE_KEYS.state, { 'ns__key': 'value' })
			})

			test('should merge with existing persisted state', async () => {
				mockFlashcore.get.mockResolvedValue({ existing: 'value' })

				setState('newKey', 'newValue', { persist: true })

				await new Promise((resolve) => setTimeout(resolve, 10))

				expect(mockFlashcore.set).toHaveBeenCalledWith(FLASHCORE_KEYS.state, {
					existing: 'value',
					newKey: 'newValue'
				})
			})

			test('should NOT call Flashcore when persist is false', async () => {
				setState('key', 'value', { persist: false })

				await new Promise((resolve) => setTimeout(resolve, 10))

				expect(mockFlashcore.set).not.toHaveBeenCalled()
			})

			test('should NOT call Flashcore when persist is undefined', async () => {
				setState('key', 'value')

				await new Promise((resolve) => setTimeout(resolve, 10))

				expect(mockFlashcore.set).not.toHaveBeenCalled()
			})

			test('should combine namespace and persist options', async () => {
				setState('key', 'value', { namespace: 'app', persist: true })

				await new Promise((resolve) => setTimeout(resolve, 10))

				expect(mockFlashcore.set).toHaveBeenCalledWith(FLASHCORE_KEYS.state, { 'app__key': 'value' })
			})
		})

		describe('clearState helper function', () => {
			test('should clear empty state without error', () => {
				expect(() => clearState()).not.toThrow()
			})

			test('should clear state with multiple keys', () => {
				state['key1'] = 'value1'
				state['key2'] = 'value2'
				state['key3'] = 'value3'

				clearState()

				expect(Object.keys(state).length).toBe(0)
			})

			test('should remove all keys from state object', () => {
				state['a'] = 1
				state['b'] = 2
				state['c'] = 3

				clearState()

				expect(state['a']).toBeUndefined()
				expect(state['b']).toBeUndefined()
				expect(state['c']).toBeUndefined()
			})

			test('should NOT call Flashcore methods', async () => {
				state['key'] = 'value'
				clearState()

				await new Promise((resolve) => setTimeout(resolve, 10))

				expect(mockFlashcore.clear).not.toHaveBeenCalled()
				expect(mockFlashcore.delete).not.toHaveBeenCalled()
			})

			test('should allow state to be usable after clear', () => {
				setState('key', 'value1')
				clearState()
				setState('key', 'value2')

				expect(getState('key')).toBe('value2')
			})
		})

		describe('loadState helper function', () => {
			test('should load empty object without error', () => {
				expect(() => loadState({})).not.toThrow()
			})

			test('should load object with multiple keys', () => {
				loadState({ key1: 'value1', key2: 'value2' })

				expect(state['key1']).toBe('value1')
				expect(state['key2']).toBe('value2')
			})

			test('should merge with existing state', () => {
				state['existing'] = 'exists'
				loadState({ newKey: 'newValue' })

				expect(state['existing']).toBe('exists')
				expect(state['newKey']).toBe('newValue')
			})

			test('should overwrite existing keys', () => {
				state['key'] = 'old'
				loadState({ key: 'new' })

				expect(state['key']).toBe('new')
			})

			test('should load various value types', () => {
				loadState({
					str: 'string',
					num: 42,
					obj: { nested: 'object' },
					arr: [1, 2, 3],
					nul: null
				})

				expect(state['str']).toBe('string')
				expect(state['num']).toBe(42)
				expect(state['obj']).toEqual({ nested: 'object' })
				expect(state['arr']).toEqual([1, 2, 3])
				expect(state['nul']).toBe(null)
			})

			test('should call logger.debug with state object', () => {
				const savedState = { key: 'value' }
				loadState(savedState)

				expect(logger.debug).toHaveBeenCalledWith('Loading state...', savedState)
			})
		})

		describe('saveState helper function', () => {
			test('should call process.send with correct message structure', () => {
				state['key'] = 'value'
				saveState()

				expect(mockProcessSend).toHaveBeenCalledWith({
					type: 'state-save',
					state: { key: 'value' }
				})
			})

			test('should include all current state keys in message', () => {
				state['key1'] = 'value1'
				state['key2'] = 'value2'
				state['key3'] = 'value3'

				saveState()

				expect(mockProcessSend).toHaveBeenCalledWith({
					type: 'state-save',
					state: {
						key1: 'value1',
						key2: 'value2',
						key3: 'value3'
					}
				})
			})

			test('should call logger.debug with state object', () => {
				state['key'] = 'value'
				saveState()

				expect(logger.debug).toHaveBeenCalledWith('Saving state...', state)
			})

			test('should send message with empty state', () => {
				saveState()

				expect(mockProcessSend).toHaveBeenCalledWith({
					type: 'state-save',
					state: {}
				})
			})

			test('should NOT modify the state object', () => {
				state['key'] = 'value'
				const before = { ...state }

				saveState()

				expect(state).toEqual(before)
			})
		})

		describe('removeInstances helper function', () => {
			describe('primitives and built-ins', () => {
				test('should return string value as-is', () => {
					expect(removeInstances('hello')).toBe('hello')
				})

				test('should return number value as-is', () => {
					expect(removeInstances(42)).toBe(42)
				})

				test('should return boolean value as-is', () => {
					expect(removeInstances(true)).toBe(true)
					expect(removeInstances(false)).toBe(false)
				})

				test('should return null value as-is', () => {
					expect(removeInstances(null)).toBe(null)
				})

				test('should return undefined value as-is', () => {
					expect(removeInstances(undefined)).toBe(undefined)
				})

				test('should return plain object as-is', () => {
					const obj = { a: 1, b: 'two' }
					expect(removeInstances(obj)).toEqual(obj)
				})

				test('should return plain array as-is', () => {
					const arr = [1, 2, 3]
					expect(removeInstances(arr)).toEqual(arr)
				})

				test('should return nested plain object as-is', () => {
					const obj = { a: { b: { c: 1 } } }
					expect(removeInstances(obj)).toEqual(obj)
				})

				test('should return nested plain array as-is', () => {
					const arr = [[1, 2], [3, 4]]
					expect(removeInstances(arr)).toEqual(arr)
				})

				test('should return mixed object and array as-is', () => {
					const mixed = { arr: [1, 2], obj: { x: 3 } }
					expect(removeInstances(mixed)).toEqual(mixed)
				})
			})

			describe('non-serializable values', () => {
				test('should return undefined for function value', () => {
					const fn = () => 'hello'
					expect(removeInstances(fn)).toBe(undefined)
				})

				test('should return undefined for class instance', () => {
					class CustomClass {
						value = 42
					}
					const instance = new CustomClass()
					expect(removeInstances(instance)).toBe(undefined)
				})

				test('should return undefined for Date instance and log warning', () => {
					const date = new Date()
					expect(removeInstances(date)).toBe(undefined)
					expect(logger.warn).toHaveBeenCalledWith('Removed state value as it is not serializable:', date)
				})

				test('should return undefined for RegExp instance', () => {
					const regex = /test/
					expect(removeInstances(regex)).toBe(undefined)
					expect(logger.warn).toHaveBeenCalledWith('Removed state value as it is not serializable:', regex)
				})

				test('should return undefined for Map instance', () => {
					const map = new Map([['key', 'value']])
					expect(removeInstances(map)).toBe(undefined)
					expect(logger.warn).toHaveBeenCalledWith('Removed state value as it is not serializable:', map)
				})

				test('should return undefined for Set instance', () => {
					const set = new Set([1, 2, 3])
					expect(removeInstances(set)).toBe(undefined)
					expect(logger.warn).toHaveBeenCalledWith('Removed state value as it is not serializable:', set)
				})

				test('should return undefined for Error instance', () => {
					const error = new Error('test error')
					expect(removeInstances(error)).toBe(undefined)
					expect(logger.warn).toHaveBeenCalledWith('Removed state value as it is not serializable:', error)
				})

				test('should only log warning once for multiple instances', () => {
					class CustomClass {}
					const instance1 = new CustomClass()
					const instance2 = new CustomClass()
					const warned = { value: false }

					removeInstances(instance1, warned)
					removeInstances(instance2, warned)

					expect(logger.warn).toHaveBeenCalledTimes(1)
				})
			})

			describe('complex structures', () => {
				test('should remove class instance property from object', () => {
					class CustomClass {}
					const obj = { valid: 'ok', invalid: new CustomClass() }
					const result = removeInstances(obj)

					expect(result).toEqual({ valid: 'ok' })
				})

				test('should filter out class instances from array', () => {
					class CustomClass {}
					const arr = [1, new CustomClass(), 2]
					const result = removeInstances(arr)

					expect(result).toEqual([1, 2])
				})

				test('should recursively remove instances from deeply nested structure', () => {
					class CustomClass {}
					const obj = {
						level1: {
							valid: 'ok',
							level2: {
								invalid: new CustomClass(),
								arr: [1, new CustomClass(), 2]
							}
						}
					}
					const result = removeInstances(obj)

					expect(result).toEqual({
						level1: {
							valid: 'ok',
							level2: {
								arr: [1, 2]
							}
						}
					})
				})

				test('should return empty object when all properties are instances', () => {
					class CustomClass {}
					const obj = { a: new CustomClass(), b: new CustomClass() }
					const result = removeInstances(obj)

					expect(result).toEqual({})
				})

				test('should return empty array when all elements are instances', () => {
					class CustomClass {}
					const arr = [new CustomClass(), new CustomClass()]
					const result = removeInstances(arr)

					expect(result).toEqual([])
				})

				test('should preserve valid values and remove invalid in mixed structure', () => {
					class CustomClass {}
					const obj = {
						str: 'string',
						num: 42,
						instance: new CustomClass(),
						arr: [1, new CustomClass(), 'valid', new CustomClass(), 3],
						nested: {
							ok: true,
							bad: new CustomClass()
						}
					}
					const result = removeInstances(obj)

					expect(result).toEqual({
						str: 'string',
						num: 42,
						arr: [1, 'valid', 3],
						nested: {
							ok: true
						}
					})
				})

				test('should NOT mutate original value', () => {
					class CustomClass {}
					const original = { valid: 'ok', invalid: new CustomClass() }
					const copy = { ...original }

					removeInstances(original)

					expect(original).toEqual(copy)
				})
			})

			describe('edge cases', () => {
				test('should handle empty object', () => {
					expect(removeInstances({})).toEqual({})
				})

				test('should handle empty array', () => {
					expect(removeInstances([])).toEqual([])
				})

				test('should handle object with undefined properties', () => {
					const obj: Record<string, unknown> = { a: undefined, b: 'value' }
					expect(removeInstances(obj)).toEqual({ a: undefined, b: 'value' })
				})

				test('should filter out undefined elements from array', () => {
					const arr = [undefined, 1, undefined, 2]
					const result = removeInstances(arr)
					// undefined is filtered out by .filter((item) => item !== undefined)
					expect(result).toEqual([1, 2])
				})

				test('should handle very deeply nested structure', () => {
					let obj: any = { value: 'deep' }
					let current = obj
					for (let i = 0; i < 100; i++) {
						current.nested = { value: i }
						current = current.nested
					}

					expect(() => removeInstances(obj)).not.toThrow()
				})

				test('should handle circular reference without recursion error', () => {
					const obj: any = { a: 1 }
					obj.self = obj

					expect(() => removeInstances(obj)).not.toThrow()
					const result = removeInstances(obj)
					// Result should be non-cyclical (exact shape may vary based on implementation)
					expect(result).toHaveProperty('a', 1)
				})
			})
		})
	})

	describe('Static Methods', () => {
		describe('State.get static method', () => {
			test('should retrieve existing value', () => {
				state['key'] = 'value'
				expect(State.get('key')).toBe('value')
			})

			test('should return null for non-existent key', () => {
				expect(State.get('nonexistent')).toBe(null)
			})

			test('should support default value option', () => {
				expect(State.get('missing', { default: 'fallback' })).toBe('fallback')
			})

			test('should support namespace option', () => {
				state['ns__key'] = 'namespaced'
				expect(State.get('key', { namespace: 'ns' })).toBe('namespaced')
			})

			test('should behave same as getState helper', () => {
				state['test'] = 'value'
				expect(State.get('test')).toBe(getState('test'))
			})
		})

		describe('State.set static method', () => {
			test('should set various value types', () => {
				State.set('str', 'string')
				State.set('num', 42)
				State.set('obj', { key: 'value' })

				expect(state['str']).toBe('string')
				expect(state['num']).toBe(42)
				expect(state['obj']).toEqual({ key: 'value' })
			})

			test('should support namespace option', () => {
				State.set('key', 'value', { namespace: 'ns' })
				expect(state['ns__key']).toBe('value')
			})

			test('should support persist option', async () => {
				State.set('key', 'value', { persist: true })

				await new Promise((resolve) => setTimeout(resolve, 10))

				expect(mockFlashcore.set).toHaveBeenCalled()
			})

			test('should support updater function', () => {
				state['count'] = 10
				State.set('count', (old: unknown) => (old as number) + 5)

				expect(state['count']).toBe(15)
			})

			test('should combine namespace and persist options', async () => {
				State.set('key', 'value', { namespace: 'app', persist: true })

				await new Promise((resolve) => setTimeout(resolve, 10))

				expect(mockFlashcore.set).toHaveBeenCalledWith(FLASHCORE_KEYS.state, { 'app__key': 'value' })
			})
		})

		describe('State.fork static method', () => {
			test('should create a fork and return State instance', () => {
				const fork = State.fork('test')
				expect(fork).toBeInstanceOf(State)
			})

			test('should register fork prefix', () => {
				State.fork('users')
				expect(State.listForks()).toContain('users')
			})

			test('should create multiple forks with different prefixes', () => {
				State.fork('users')
				State.fork('sessions')
				State.fork('cache')

				const forks = State.listForks()
				expect(forks).toContain('users')
				expect(forks).toContain('sessions')
				expect(forks).toContain('cache')
			})

			test('should allow creating fork with same prefix twice', () => {
				const fork1 = State.fork('test')
				const fork2 = State.fork('test')

				expect(fork1).not.toBe(fork2)
				expect(State.listForks()).toContain('test')
			})

			test('should store fork options', () => {
				const fork = State.fork('test', { persist: true })
				expect(fork).toBeInstanceOf(State)
			})
		})

		describe('State.listForks static method', () => {
			test('should return empty array initially', () => {
				expect(State.listForks()).toEqual([])
			})

			test('should return array with single fork prefix', () => {
				State.fork('users')
				expect(State.listForks()).toEqual(['users'])
			})

			test('should return array with multiple fork prefixes', () => {
				State.fork('users')
				State.fork('sessions')
				State.fork('cache')

				const forks = State.listForks()
				expect(forks.length).toBe(3)
				expect(forks).toContain('users')
				expect(forks).toContain('sessions')
				expect(forks).toContain('cache')
			})

			test('should return a copy of prefixes array', () => {
				State.fork('test')
				const forks1 = State.listForks()
				forks1.push('modified')

				const forks2 = State.listForks()
				expect(forks2).not.toContain('modified')
			})

			test('should show duplicate fork prefixes only once', () => {
				State.fork('test')
				State.fork('test')
				State.fork('test')

				const forks = State.listForks()
				expect(forks.filter((f) => f === 'test').length).toBe(1)
			})
		})
	})

	describe('Instance Methods', () => {
		describe('State instance - constructor', () => {
			test('should create instance with prefix', () => {
				const instance = new State('test')
				expect(instance).toBeInstanceOf(State)
			})

			test('should create instance with options', () => {
				const instance = new State('test', { persist: true })
				expect(instance).toBeInstanceOf(State)
			})

			test('should bind methods to instance', () => {
				const instance = new State('test')
				const { getState: boundGet, setState: boundSet } = instance

				boundSet('key', 'value')
				expect(boundGet('key')).toBe('value')
			})
		})

		describe('State instance - getState method', () => {
			test('should prepend prefix to key with __ separator', () => {
				const instance = new State('prefix')
				state['prefix__key'] = 'value'

				expect(instance.getState('key')).toBe('value')
			})

			test('should retrieve existing value from forked state', () => {
				const instance = new State('fork')
				instance.setState('key', 'value')

				expect(instance.getState('key')).toBe('value')
			})

			test('should return null for non-existent key in fork', () => {
				const instance = new State('fork')
				expect(instance.getState('nonexistent')).toBe(null)
			})

			test('should isolate fork state from global state', () => {
				const instance = new State('fork')
				state['key'] = 'global'

				expect(instance.getState('key')).toBe(null)
			})

			test('should isolate different forks from each other', () => {
				const fork1 = new State('fork1')
				const fork2 = new State('fork2')

				fork1.setState('key', 'value1')
				fork2.setState('key', 'value2')

				expect(fork1.getState('key')).toBe('value1')
				expect(fork2.getState('key')).toBe('value2')
			})
		})

		describe('State instance - setState method', () => {
			test('should prepend prefix to key with __ separator', () => {
				const instance = new State('prefix')
				instance.setState('key', 'value')

				expect(state['prefix__key']).toBe('value')
			})

			test('should set various value types in forked state', () => {
				const instance = new State('fork')
				instance.setState('str', 'string')
				instance.setState('num', 42)
				instance.setState('obj', { key: 'value' })

				expect(state['fork__str']).toBe('string')
				expect(state['fork__num']).toBe(42)
				expect(state['fork__obj']).toEqual({ key: 'value' })
			})

			test('should use updater function in forked state', () => {
				const instance = new State('fork')
				instance.setState('count', 10)
				instance.setState('count', (old: unknown) => (old as number) + 5)

				expect(state['fork__count']).toBe(15)
			})

			test('should persist with prefixed key when persist option is true', async () => {
				const instance = new State('fork')
				instance.setState('key', 'value', { persist: true })

				await new Promise((resolve) => setTimeout(resolve, 10))

				expect(mockFlashcore.set).toHaveBeenCalledWith(FLASHCORE_KEYS.state, { 'fork__key': 'value' })
			})

			test('should inherit persist option from constructor', async () => {
				const instance = new State('fork', { persist: true })
				instance.setState('key', 'value')

				await new Promise((resolve) => setTimeout(resolve, 10))

				expect(mockFlashcore.set).toHaveBeenCalled()
			})

			test('should override instance persist option with explicit option', async () => {
				const instance = new State('fork', { persist: true })
				instance.setState('key', 'value', { persist: false })

				await new Promise((resolve) => setTimeout(resolve, 10))

				expect(mockFlashcore.set).not.toHaveBeenCalled()
			})

			test('should combine fork prefix and namespace option', () => {
				const instance = new State('fork')
				instance.setState('key', 'value', { namespace: 'ns' })

				// Note: namespace is prepended to the key before fork prefix
				// So it becomes: fork__ns__key
				expect(state['fork__ns__key']).toBe('value')
			})
		})

		describe('State instance - fork method', () => {
			test('should create nested fork with chained prefix', () => {
				const parent = new State('parent')
				const child = parent.fork('child')

				child.setState('key', 'value')

				expect(state['parent__child__key']).toBe('value')
			})

			test('should isolate nested fork from parent fork', () => {
				const parent = new State('parent')
				const child = parent.fork('child')

				parent.setState('key', 'parent-value')
				child.setState('key', 'child-value')

				expect(parent.getState('key')).toBe('parent-value')
				expect(child.getState('key')).toBe('child-value')
			})

			test('should support deeply nested forks', () => {
				const fork1 = new State('a')
				const fork2 = fork1.fork('b')
				const fork3 = fork2.fork('c')

				fork3.setState('key', 'deep-value')

				expect(state['a__b__c__key']).toBe('deep-value')
			})

			test('should inherit options from parent fork', async () => {
				const parent = new State('parent', { persist: true })
				const child = parent.fork('child')

				child.setState('key', 'value')

				await new Promise((resolve) => setTimeout(resolve, 10))

				expect(mockFlashcore.set).toHaveBeenCalled()
			})

			test('should override parent options with child options', async () => {
				const parent = new State('parent', { persist: true })
				const child = parent.fork('child', { persist: false })

				child.setState('key', 'value')

				await new Promise((resolve) => setTimeout(resolve, 10))

				expect(mockFlashcore.set).not.toHaveBeenCalled()
			})
		})
	})

	describe('State Forks - Integration', () => {
		describe('flat isolation', () => {
			test('should isolate two forks with different prefixes', () => {
				const fork1 = State.fork('fork1')
				const fork2 = State.fork('fork2')

				fork1.setState('key', 'value1')
				fork2.setState('key', 'value2')

				expect(fork1.getState('key')).toBe('value1')
				expect(fork2.getState('key')).toBe('value2')
			})

			test('should isolate global state from forked state', () => {
				const fork = State.fork('fork')

				setState('key', 'global')
				fork.setState('key', 'forked')

				expect(getState('key')).toBe('global')
				expect(fork.getState('key')).toBe('forked')
			})

			test('should NOT affect forks when clearing global state', () => {
				const fork = State.fork('fork')

				setState('key', 'global')
				fork.setState('key', 'forked')

				clearState()
				loadState({})

				expect(getState('key')).toBe(null)
				expect(fork.getState('key')).toBe('forked')
			})
		})

		describe('nested hierarchy', () => {
			test('should isolate child fork from parent fork', () => {
				const parent = State.fork('parent')
				const child = parent.fork('child')

				parent.setState('key', 'parent')

				expect(child.getState('key')).toBe(null)
			})

			test('should isolate parent fork from child fork', () => {
				const parent = State.fork('parent')
				const child = parent.fork('child')

				child.setState('key', 'child')

				expect(parent.getState('key')).toBe(null)
			})

			test('should isolate sibling forks', () => {
				const parent = State.fork('parent')
				const child1 = parent.fork('child1')
				const child2 = parent.fork('child2')

				child1.setState('key', 'value1')
				child2.setState('key', 'value2')

				expect(child1.getState('key')).toBe('value1')
				expect(child2.getState('key')).toBe('value2')
			})

			test('should isolate three-level nesting', () => {
				const grandparent = State.fork('gp')
				const parent = grandparent.fork('p')
				const child = parent.fork('c')

				grandparent.setState('key', 'gp-value')
				parent.setState('key', 'p-value')
				child.setState('key', 'c-value')

				expect(grandparent.getState('key')).toBe('gp-value')
				expect(parent.getState('key')).toBe('p-value')
				expect(child.getState('key')).toBe('c-value')
			})

			test('should have correct prefix chain for nested forks', () => {
				const parent = State.fork('parent')
				const child = parent.fork('child')

				child.setState('key', 'value')

				expect(state['parent__child__key']).toBe('value')
			})
		})

		describe('persistence', () => {
			test('should persist fork with persist option', async () => {
				const fork = State.fork('fork', { persist: true })
				fork.setState('key', 'value')

				await new Promise((resolve) => setTimeout(resolve, 10))

				expect(mockFlashcore.set).toHaveBeenCalledWith(FLASHCORE_KEYS.state, { 'fork__key': 'value' })
			})

			test('should persist nested fork with full prefix chain', async () => {
				const parent = State.fork('parent', { persist: true })
				const child = parent.fork('child')

				child.setState('key', 'value')

				await new Promise((resolve) => setTimeout(resolve, 10))

				expect(mockFlashcore.set).toHaveBeenCalledWith(FLASHCORE_KEYS.state, { 'parent__child__key': 'value' })
			})

			test('should load persisted fork state', () => {
				const fork = State.fork('fork')

				loadState({ 'fork__key': 'persisted-value' })

				expect(fork.getState('key')).toBe('persisted-value')
			})
		})
	})

	describe('Namespace Support', () => {
		describe('in helper functions', () => {
			test('should compose namespace with __ separator in getState', () => {
				state['ns__key'] = 'value'
				expect(getState('key', { namespace: 'ns' })).toBe('value')
			})

			test('should compose namespace with __ separator in setState', () => {
				setState('key', 'value', { namespace: 'ns' })
				expect(state['ns__key']).toBe('value')
			})

			test('should isolate namespaced keys', () => {
				setState('key', 'global')
				setState('key', 'namespaced', { namespace: 'ns' })

				expect(getState('key')).toBe('global')
				expect(getState('key', { namespace: 'ns' })).toBe('namespaced')
			})
		})

		describe('edge cases', () => {
			test('should handle empty string namespace', () => {
				setState('key', 'value', { namespace: '' })
				expect(state['__key']).toBe('value')
			})

			test('should handle namespace with special characters', () => {
				setState('key', 'value', { namespace: 'ns with spaces!@#' })
				expect(state['ns with spaces!@#__key']).toBe('value')
			})

			test('should handle very long namespace', () => {
				const longNs = 'n'.repeat(1000)
				setState('key', 'value', { namespace: longNs })
				expect(state[`${longNs}__key`]).toBe('value')
			})

			test('should handle namespace collision', () => {
				setState('c', 'value1', { namespace: 'a__b' })
				setState('b__c', 'value2', { namespace: 'a' })

				// Both should create the same key: a__b__c
				expect(state['a__b__c']).toBe('value2') // Last write wins
			})
		})
	})

	describe('Updater Functions', () => {
		describe('in helper setState', () => {
			test('should increment number', () => {
				setState('count', 0)
				setState('count', (old) => (old as number) + 1)

				expect(getState('count')).toBe(1)
			})

			test('should append to array', () => {
				setState('list', [1])
				setState('list', (old) => [...(old as number[]), 2])

				expect(getState('list')).toEqual([1, 2])
			})

			test('should merge objects', () => {
				setState('obj', { a: 1 })
				setState('obj', (old) => ({ ...(old as object), b: 2 }))

				expect(getState('obj')).toEqual({ a: 1, b: 2 })
			})

			test('should handle updater with non-existent key', () => {
				setState('new', (old) => old ?? 'default')

				expect(getState('new')).toBe('default')
			})

			test('should return computed new value', () => {
				setState('count', 10)
				const result = setState('count', (old) => (old as number) + 5)

				expect(result).toBe(15)
			})

			test('should use updater with namespace', () => {
				setState('count', 10, { namespace: 'stats' })
				setState('count', (old) => (old as number) + 5, { namespace: 'stats' })

				expect(getState('count', { namespace: 'stats' })).toBe(15)
			})
		})

		describe('in instance setState', () => {
			test('should use updater in forked state', () => {
				const fork = State.fork('fork')
				fork.setState('count', 10)
				fork.setState('count', (old: unknown) => (old as number) + 5)

				expect(fork.getState('count')).toBe(15)
			})

			test('should use updater in nested fork', () => {
				const parent = State.fork('parent')
				const child = parent.fork('child')

				child.setState('count', 10)
				child.setState('count', (old: unknown) => (old as number) + 5)

				expect(child.getState('count')).toBe(15)
			})

			test('should persist computed value with persist option', async () => {
				const fork = State.fork('fork')
				fork.setState('count', 10)
				fork.setState('count', (old: unknown) => (old as number) + 5, { persist: true })

				await new Promise((resolve) => setTimeout(resolve, 10))

				expect(mockFlashcore.set).toHaveBeenCalledWith(FLASHCORE_KEYS.state, { 'fork__count': 15 })
			})
		})
	})

	describe('Default Values', () => {
		describe('in getState', () => {
			test('should return default when key does not exist', () => {
				expect(getState('missing', { default: 'fallback' })).toBe('fallback')
			})

			test('should NOT return default when key exists', () => {
				setState('key', 'value')
				expect(getState('key', { default: 'fallback' })).toBe('value')
			})

			test('should NOT return default for falsy existing values', () => {
				setState('zero', 0)
				setState('false', false)
				setState('empty', '')

				expect(getState('zero', { default: 99 })).toBe(0)
				expect(getState('false', { default: true })).toBe(false)
				expect(getState('empty', { default: 'fallback' })).toBe('')
			})

			test('should NOT return default for null value', () => {
				setState('nullable', null)
				expect(getState('nullable', { default: 'fallback' })).toBe(null)
			})

			test('should return default for undefined value', () => {
				setState('undef', undefined)
				expect(getState('undef', { default: 'fallback' })).toBe('fallback')
			})

			test('should support various default types', () => {
				expect(getState('missing1', { default: 'string' })).toBe('string')
				expect(getState('missing2', { default: 42 })).toBe(42)
				expect(getState('missing3', { default: { key: 'value' } })).toEqual({ key: 'value' })
				expect(getState('missing4', { default: [1, 2, 3] })).toEqual([1, 2, 3])
			})

			test('should return default with namespace when namespaced key does not exist', () => {
				expect(getState('missing', { namespace: 'ns', default: 'fallback' })).toBe('fallback')
			})
		})

		describe('in State.get', () => {
			test('should support default option', () => {
				expect(State.get('missing', { default: 'fallback' })).toBe('fallback')
			})

			test('should behave same as getState helper', () => {
				setState('key', 'value')

				expect(State.get('key', { default: 'fallback' })).toBe(getState('key', { default: 'fallback' }))
				expect(State.get('missing', { default: 'fallback' })).toBe(getState('missing', { default: 'fallback' }))
			})
		})
	})

	describe('Edge Cases and Error Handling', () => {
		describe('Error handling', () => {
			test('should handle Flashcore.get failure without crashing', async () => {
				mockFlashcore.get.mockRejectedValueOnce(new Error('get failed'))

				// This should not throw even if Flashcore.get fails
				expect(() => setState('key', 'value', { persist: true })).not.toThrow()

				// Wait for async persistence
				await new Promise((resolve) => setTimeout(resolve, 10))

				// The test harness should continue running
				expect(state['key']).toBe('value')
			})

			test('should handle Flashcore.set failure without crashing', async () => {
				mockFlashcore.set.mockRejectedValueOnce(new Error('set failed'))

				// This should not throw even if Flashcore.set fails
				expect(() => setState('key', 'value', { persist: true })).not.toThrow()

				// Wait for async persistence
				await new Promise((resolve) => setTimeout(resolve, 10))

				// The state should still be set in memory
				expect(state['key']).toBe('value')
			})

			test('should handle process.send failure without crashing', () => {
				;(process.send as jest.Mock).mockImplementationOnce(() => {
					throw new Error('ipc failed')
				})

				// This should throw since saveState calls process.send synchronously
				expect(() => saveState()).toThrow('ipc failed')
			})
		})

		describe('edge cases', () => {
			test('should handle empty string key', () => {
				setState('', 'value')
				expect(getState('')).toBe('value')
			})

			test('should handle key with spaces', () => {
				setState('my key', 'value')
				expect(getState('my key')).toBe('value')
			})

			test('should handle key with special characters', () => {
				setState('key!@#$%', 'value')
				expect(getState('key!@#$%')).toBe('value')
			})

			test('should handle key with unicode', () => {
				setState('键', 'value')
				expect(getState('键')).toBe('value')
			})

			test('should handle very long key', () => {
				const longKey = 'k'.repeat(1000)
				setState(longKey, 'value')
				expect(getState(longKey)).toBe('value')
			})

			test('should store undefined value explicitly', () => {
				setState('undef', undefined)
				expect('undef' in state).toBe(true)
				expect(state['undef']).toBe(undefined)
			})

			test('should store null value', () => {
				setState('nullable', null)
				expect(state['nullable']).toBe(null)
			})

			test('should return null for non-existent key (not undefined)', () => {
				expect(getState('nonexistent')).toBe(null)
			})

			test('should handle concurrent setState calls (last write wins)', () => {
				setState('concurrent', 'value1')
				setState('concurrent', 'value2')
				setState('concurrent', 'value3')

				expect(getState('concurrent')).toBe('value3')
			})

			test('should handle rapid setState/getState cycles', () => {
				for (let i = 0; i < 100; i++) {
					setState('rapid', i)
					expect(getState('rapid')).toBe(i)
				}
			})
		})
	})

	describe('Integration Scenarios', () => {
		describe('full workflow scenarios', () => {
			test('should handle complete lifecycle', async () => {
				// Set initial value
				setState('key', 'initial')
				expect(getState('key')).toBe('initial')

				// Update with updater
				setState('key', (old) => `${old}-updated`)
				expect(getState('key')).toBe('initial-updated')

				// Persist
				setState('key', 'persisted', { persist: true })
				await new Promise((resolve) => setTimeout(resolve, 10))
				expect(mockFlashcore.set).toHaveBeenCalled()

				// Clear
				clearState()
				expect(getState('key')).toBe(null)

				// Load
				loadState({ key: 'loaded' })
				expect(getState('key')).toBe('loaded')
			})

			test('should handle fork workflow', () => {
				const fork = State.fork('fork')
				fork.setState('key', 'fork-value')
				expect(fork.getState('key')).toBe('fork-value')

				const nested = fork.fork('nested')
				nested.setState('key', 'nested-value')
				expect(nested.getState('key')).toBe('nested-value')

				// Verify isolation
				expect(fork.getState('key')).toBe('fork-value')
			})

			test('should handle persistence workflow', async () => {
				setState('key', 'value', { persist: true })

				await new Promise((resolve) => setTimeout(resolve, 10))

				// Simulate loading persisted state
				mockFlashcore.get.mockResolvedValue({ key: 'persisted-value' })
				const persisted = await mockFlashcore.get(FLASHCORE_KEYS.state)
				loadState(persisted as Record<string, unknown>)

				expect(getState('key')).toBe('persisted-value')
			})

			test('should handle namespace workflow', () => {
				setState('key', 'value', { namespace: 'ns' })
				expect(getState('key', { namespace: 'ns' })).toBe('value')

				// Update with namespace
				setState('key', 'updated', { namespace: 'ns' })
				expect(getState('key', { namespace: 'ns' })).toBe('updated')

				// Verify isolation
				expect(getState('key')).toBe(null)
			})

			test('should handle mixed workflow', async () => {
				const fork = State.fork('fork', { persist: true })
				fork.setState('key', 'value', { namespace: 'ns' })

				expect(state['fork__ns__key']).toBe('value')

				fork.setState('key', (old: unknown) => `${old}-updated`, { namespace: 'ns' })

				expect(state['fork__ns__key']).toBe('value-updated')

				await new Promise((resolve) => setTimeout(resolve, 10))

				expect(mockFlashcore.set).toHaveBeenCalled()
			})
		})

		describe('state management patterns', () => {
			test('should handle counter pattern', () => {
				setState('counter', 0)
				setState('counter', (old) => (old as number) + 1)
				setState('counter', (old) => (old as number) + 1)
				setState('counter', (old) => (old as number) + 1)

				expect(getState('counter')).toBe(3)
			})

			test('should handle list management', () => {
				setState('list', [1, 2, 3])

				// Append
				setState('list', (old) => [...(old as number[]), 4])

				// Remove (filter)
				setState('list', (old) => (old as number[]).filter((n) => n !== 2))

				expect(getState('list')).toEqual([1, 3, 4])
			})

			test('should handle object merging', () => {
				setState('config', { theme: 'light' })
				setState('config', (old) => ({ ...(old as object), lang: 'en' }))
				setState('config', (old) => ({ ...(old as object), notifications: true }))

				expect(getState('config')).toEqual({
					theme: 'light',
					lang: 'en',
					notifications: true
				})
			})

			test('should handle cache pattern', () => {
				// Cache miss - use default
				expect(getState('cache', { default: 'miss' })).toBe('miss')

				// Set cache
				setState('cache', 'hit')

				// Cache hit
				expect(getState('cache', { default: 'miss' })).toBe('hit')
			})
		})

		describe('multi-fork scenarios', () => {
			test('should handle multiple independent forks', () => {
				const fork1 = State.fork('fork1')
				const fork2 = State.fork('fork2')
				const fork3 = State.fork('fork3')

				fork1.setState('key', 'value1')
				fork2.setState('key', 'value2')
				fork3.setState('key', 'value3')

				expect(fork1.getState('key')).toBe('value1')
				expect(fork2.getState('key')).toBe('value2')
				expect(fork3.getState('key')).toBe('value3')
			})

			test('should handle fork hierarchy', () => {
				const parent = State.fork('parent')
				const child1 = parent.fork('child1')
				const child2 = parent.fork('child2')
				const grandchild1 = child1.fork('gc1')
				const grandchild2 = child1.fork('gc2')
				const grandchild3 = child2.fork('gc3')
				const grandchild4 = child2.fork('gc4')

				grandchild1.setState('key', 'gc1-value')
				grandchild2.setState('key', 'gc2-value')
				grandchild3.setState('key', 'gc3-value')
				grandchild4.setState('key', 'gc4-value')

				expect(grandchild1.getState('key')).toBe('gc1-value')
				expect(grandchild2.getState('key')).toBe('gc2-value')
				expect(grandchild3.getState('key')).toBe('gc3-value')
				expect(grandchild4.getState('key')).toBe('gc4-value')
			})

			test('should handle forks with same prefix independently', () => {
				const fork1 = State.fork('test')
				const fork2 = State.fork('test')

				fork1.setState('key', 'value1')
				fork2.setState('key', 'value2')

				// Both use same prefix, last write wins
				expect(state['test__key']).toBe('value2')
			})

			test('should list all fork prefixes', () => {
				State.fork('users')
				State.fork('sessions')
				State.fork('cache')

				const forks = State.listForks()
				expect(forks).toContain('users')
				expect(forks).toContain('sessions')
				expect(forks).toContain('cache')
			})
		})
	})
})
