import { jest } from '@jest/globals'

// Helper for typed mock functions
const fn = jest.fn as any

// In-memory storage for Flashcore mock
const flashcoreStorage = new Map<string, any>()
const watcherCallbacks = new Map<string, Set<Function>>()

/**
 * Composes a full key from namespace and key parts.
 * Aligns with core implementation in src/core/flashcore.ts
 */
function composeKey(key: string, namespace?: string | string[]): string {
	if (!namespace) {
		return key
	}

	const ns = Array.isArray(namespace) ? namespace.join('/') : namespace
	return `${ns}__${key}`
}

/**
 * Mock implementation of Flashcore with in-memory storage
 */
export const mockFlashcore = {
	get: fn((key: string, options?: { namespace?: string | string[]; default?: any }) => {
		const fullKey = composeKey(key, options?.namespace)
		const value = flashcoreStorage.get(fullKey)
		return value !== undefined ? value : options?.default
	}),

	set: fn((key: string, value: any, options?: { namespace?: string | string[] }) => {
		const fullKey = composeKey(key, options?.namespace)
		const oldValue = flashcoreStorage.get(fullKey)

		// Handle updater functions
		let newValue = value
		if (typeof value === 'function') {
			newValue = value(oldValue)
		}

		if (newValue === undefined) {
			flashcoreStorage.delete(fullKey)
		} else {
			flashcoreStorage.set(fullKey, newValue)
		}

		// Invoke watchers if any are registered for this key
		if (watcherCallbacks.has(fullKey)) {
			const callbacks = watcherCallbacks.get(fullKey)!
			callbacks.forEach((callback) => {
				try {
					callback(oldValue, newValue)
				} catch (error) {
					// Ignore errors in callbacks to match real behavior
				}
			})
		}

		return true
	}),

	delete: fn((key: string, options?: { namespace?: string | string[] }) => {
		const fullKey = composeKey(key, options?.namespace)
		const oldValue = flashcoreStorage.get(fullKey)
		const result = flashcoreStorage.delete(fullKey)

		// Invoke watchers if any are registered for this key
		if (watcherCallbacks.has(fullKey)) {
			const callbacks = watcherCallbacks.get(fullKey)!
			callbacks.forEach((callback) => {
				try {
					callback(oldValue, undefined)
				} catch (error) {
					// Ignore errors in callbacks to match real behavior
				}
			})
		}

		return result
	}),

	clear: fn(() => {
		flashcoreStorage.clear()
	}),

	has: fn((key: string, options?: { namespace?: string | string[] }) => {
		const fullKey = composeKey(key, options?.namespace)
		return flashcoreStorage.has(fullKey)
	}),

	on: fn((key: string, callback: Function, options?: { namespace?: string | string[] }) => {
		const fullKey = composeKey(key, options?.namespace)
		if (!watcherCallbacks.has(fullKey)) {
			watcherCallbacks.set(fullKey, new Set())
		}
		watcherCallbacks.get(fullKey)!.add(callback)
	}),

	off: fn((key: string, callback?: Function, options?: { namespace?: string | string[] }) => {
		const fullKey = composeKey(key, options?.namespace)
		if (!callback) {
			watcherCallbacks.delete(fullKey)
		} else {
			const callbacks = watcherCallbacks.get(fullKey)
			if (callbacks) {
				callbacks.delete(callback)
				if (callbacks.size === 0) {
					watcherCallbacks.delete(fullKey)
				}
			}
		}
	}),

	$init: fn()
}

/**
 * Mock implementation of logger
 */
const createLoggerMock = () => ({
	debug: fn(),
	info: fn(),
	warn: fn(),
	error: fn(),
	trace: fn(),
	wait: fn(),
	log: fn(),
	event: fn(),
	ready: fn(),
	custom: fn(),
	flush: fn(async () => {}),
	fork: fn(() => createLoggerMock())
})

export const mockLogger = createLoggerMock()

/**
 * Mock implementation of process.send for State tests
 */
export const mockProcessSend = fn()

/**
 * Clear all Flashcore storage
 */
export function clearFlashcoreStorage() {
	flashcoreStorage.clear()
	watcherCallbacks.clear()
}

/**
 * Get the Flashcore storage for test inspection
 */
export function getFlashcoreStorage() {
	return flashcoreStorage
}

/**
 * Mock Globals object to restore after jest.clearAllMocks()
 */
export const mockGlobals = {
	getFlashcoreAdapter: fn(() => mockFlashcore),
	setFlashcoreAdapter: fn(),
	registerFlashcore: fn((adapter: any) => {
		// Store the adapter in mockFlashcore for consistency
		// This simulates what the real Globals.registerFlashcore does
	})
}

/**
 * Reset all mocks to initial state
 */
export function resetAllMocks() {
	clearFlashcoreStorage()
	jest.clearAllMocks()

	// Re-implement mock functions
	mockFlashcore.get = fn((key: string, options?: { namespace?: string | string[]; default?: any }) => {
		const fullKey = composeKey(key, options?.namespace)
		const value = flashcoreStorage.get(fullKey)
		return value !== undefined ? value : options?.default
	})

	mockFlashcore.set = fn((key: string, value: any, options?: { namespace?: string | string[] }) => {
		const fullKey = composeKey(key, options?.namespace)
		const oldValue = flashcoreStorage.get(fullKey)

		// Handle updater functions
		let newValue = value
		if (typeof value === 'function') {
			newValue = value(oldValue)
		}

		if (newValue === undefined) {
			flashcoreStorage.delete(fullKey)
		} else {
			flashcoreStorage.set(fullKey, newValue)
		}

		// Invoke watchers if any are registered for this key
		if (watcherCallbacks.has(fullKey)) {
			const callbacks = watcherCallbacks.get(fullKey)!
			callbacks.forEach((callback) => {
				try {
					callback(oldValue, newValue)
				} catch (error) {
					// Ignore errors in callbacks to match real behavior
				}
			})
		}

		return true
	})

	mockFlashcore.delete = fn((key: string, options?: { namespace?: string | string[] }) => {
		const fullKey = composeKey(key, options?.namespace)
		const oldValue = flashcoreStorage.get(fullKey)
		const result = flashcoreStorage.delete(fullKey)

		// Invoke watchers if any are registered for this key
		if (watcherCallbacks.has(fullKey)) {
			const callbacks = watcherCallbacks.get(fullKey)!
			callbacks.forEach((callback) => {
				try {
					callback(oldValue, undefined)
				} catch (error) {
					// Ignore errors in callbacks to match real behavior
				}
			})
		}

		return result
	})

	mockFlashcore.clear = fn(() => {
		flashcoreStorage.clear()
	})

	mockFlashcore.has = fn((key: string, options?: { namespace?: string | string[] }) => {
		const fullKey = composeKey(key, options?.namespace)
		return flashcoreStorage.has(fullKey)
	})

	mockFlashcore.on = fn((key: string, callback: Function, options?: { namespace?: string | string[] }) => {
		const fullKey = composeKey(key, options?.namespace)
		if (!watcherCallbacks.has(fullKey)) {
			watcherCallbacks.set(fullKey, new Set())
		}
		watcherCallbacks.get(fullKey)!.add(callback)
	})

	mockFlashcore.off = fn((key: string, callback?: Function, options?: { namespace?: string | string[] }) => {
		const fullKey = composeKey(key, options?.namespace)
		if (!callback) {
			watcherCallbacks.delete(fullKey)
		} else {
			const callbacks = watcherCallbacks.get(fullKey)
			if (callbacks) {
				callbacks.delete(callback)
				if (callbacks.size === 0) {
					watcherCallbacks.delete(fullKey)
				}
			}
		}
	})

	mockFlashcore.$init = fn()

	// Re-implement Globals mocks
	mockGlobals.getFlashcoreAdapter = fn(() => mockFlashcore)
	mockGlobals.setFlashcoreAdapter = fn()
	mockGlobals.registerFlashcore = fn((adapter: any) => {
		// Store the adapter for consistency
	})

	// Re-implement logger mocks
	Object.assign(mockLogger, createLoggerMock())
}
