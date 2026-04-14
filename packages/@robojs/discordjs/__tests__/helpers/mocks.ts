/**
 * Mock implementations for @robojs/discordjs tests.
 * Provides in-memory Flashcore, mock Discord REST client, and test utilities.
 */

import { jest } from '@jest/globals'
import type { ProcessedEntry } from 'robo.js'

// Helper to create typed jest mocks
const fn = jest.fn as any

/**
 * ====================
 * FLASHCORE MOCKS
 * ====================
 */

// In-memory storage for Flashcore mock
const flashcoreStorage = new Map<string, any>()

/**
 * Mock Flashcore implementation with in-memory storage
 */
export const mockFlashcore = {
	get: fn((key: string) => {
		return flashcoreStorage.get(key)
	}) as any,
	set: fn((key: string, value: any) => {
		if (value === undefined) {
			flashcoreStorage.delete(key)
		} else {
			flashcoreStorage.set(key, value)
		}
		return value
	}) as any,
	delete: fn((key: string) => {
		flashcoreStorage.delete(key)
	}) as any
}

/**
 * Clears all stored data in Flashcore mock
 */
export function clearFlashcoreStorage(): void {
	flashcoreStorage.clear()
}

/**
 * Gets the internal storage map for inspection in tests
 */
export function getFlashcoreStorage(): Map<string, any> {
	return flashcoreStorage
}

/**
 * ====================
 * DISCORD REST MOCKS
 * ====================
 */

/**
 * Mock REST client for Discord API calls
 */
export const mockRest = {
	get: fn().mockResolvedValue([]),
	put: fn().mockResolvedValue([]),
	post: fn().mockResolvedValue({}),
	delete: fn().mockResolvedValue({}),
	setToken: fn().mockReturnThis()
}

/**
 * Mock REST class constructor
 */
export const MockREST = fn().mockImplementation(() => mockRest)

/**
 * ====================
 * TEST DATA FACTORIES
 * ====================
 */

/**
 * Creates a mock ProcessedEntry for command testing
 */
export function createMockCommandEntry(overrides: Partial<ProcessedEntry> = {}): ProcessedEntry {
	return {
		key: 'test-command',
		path: 'commands/test-command.js',
		exports: { default: true, config: true, named: [] },
		metadata: {
			description: 'A test command',
			options: [],
			dmPermission: true,
			nsfw: false
		},
		...overrides
	}
}

/**
 * Creates a mock ProcessedEntry for context menu testing
 */
export function createMockContextEntry(
	type: 'user' | 'message',
	overrides: Partial<ProcessedEntry> = {}
): ProcessedEntry {
	return {
		key: 'Test Context',
		path: 'context/test-context.js',
		exports: { default: true, config: true, named: [] },
		metadata: {
			contextType: type === 'user' ? 2 : 3,
			dmPermission: true
		},
		...overrides
	}
}

/**
 * Creates a mock BuildCompleteContext for testing the build hook
 */
export function createMockBuildContext(overrides: {
	commandEntries?: ProcessedEntry[]
	contextEntries?: ProcessedEntry[]
	eventEntries?: ProcessedEntry[]
	mode?: string
	config?: any
	hasToken?: boolean
	hasClientId?: boolean
} = {}) {
	const {
		commandEntries = [],
		contextEntries = [],
		eventEntries = [],
		mode = 'development',
		config = {},
		hasToken = true,
		hasClientId = true
	} = overrides

	const entriesMap = new Map<string, Map<string, ProcessedEntry[]>>()
	const discordjsEntries = new Map<string, ProcessedEntry[]>()
	discordjsEntries.set('commands', commandEntries)
	discordjsEntries.set('context', contextEntries)
	discordjsEntries.set('events', eventEntries)
	entriesMap.set('discordjs', discordjsEntries)

	const store = new Map<string, any>()
	store.set('discord:hasToken', hasToken)
	store.set('discord:hasClientId', hasClientId)
	const projectConfig = config?.plugins ? config : { plugins: [['@robojs/discordjs', config]] }

	return {
		entries: {
			get: (namespace: string, route: string) => {
				return entriesMap.get(namespace)?.get(route) ?? []
			}
		},
		mode,
		store: {
			get: <T>(key: string) => store.get(key) as T | undefined,
			set: <T>(key: string, value: T) => store.set(key, value),
			has: (key: string) => store.has(key),
			delete: (key: string) => store.delete(key),
			clear: () => store.clear()
		},
		config: projectConfig,
		registerMetadataAggregator: fn()
	}
}

/**
 * ====================
 * RESET ALL MOCKS
 * ====================
 */

/**
 * Resets all mocks to their initial state.
 * Call this in afterEach hooks.
 */
export function resetAllMocks(): void {
	clearFlashcoreStorage()
	jest.clearAllMocks()

	// Reset Flashcore mock implementations
	mockFlashcore.get.mockImplementation((key: string) => {
		return flashcoreStorage.get(key)
	})
	mockFlashcore.set.mockImplementation((key: string, value: any) => {
		if (value === undefined) {
			flashcoreStorage.delete(key)
		} else {
			flashcoreStorage.set(key, value)
		}
		return value
	})
	mockFlashcore.delete.mockImplementation((key: string) => {
		flashcoreStorage.delete(key)
	})

	// Reset REST mock
	mockRest.get.mockResolvedValue([])
	mockRest.put.mockResolvedValue([])
	mockRest.post.mockResolvedValue({})
	mockRest.delete.mockResolvedValue({})
}
