/**
 * Comprehensive mock implementations for external dependencies
 * Used across all test files to simulate Flashcore, Discord.js, and other dependencies
 */

import { jest } from '@jest/globals'
import type { Client, User } from 'discord.js'

/**
 * Helper to create typed jest mocks
 * @jest/globals has strict typing that doesn't work well with our mock patterns
 */
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
	get: fn((key: string, options?: { namespace?: string | string[]; default?: any }) => {
		const namespace = Array.isArray(options?.namespace)
			? options.namespace
			: options?.namespace
				? [options.namespace]
				: []
		const fullKey = [...namespace, key].join(':')
		const value = flashcoreStorage.get(fullKey)
		return value !== undefined ? value : options?.default
	}) as any,
	set: fn((key: string, value: any, options?: { namespace?: string | string[] }) => {
		const namespace = Array.isArray(options?.namespace)
			? options.namespace
			: options?.namespace
				? [options.namespace]
				: []
		const fullKey = [...namespace, key].join(':')
		if (value === undefined) {
			flashcoreStorage.delete(fullKey)
		} else {
			flashcoreStorage.set(fullKey, value)
		}
		return value
	}) as any,
	delete: fn((key: string, options?: { namespace?: string | string[] }) => {
		const namespace = Array.isArray(options?.namespace)
			? options.namespace
			: options?.namespace
				? [options.namespace]
				: []
		const fullKey = [...namespace, key].join(':')
		flashcoreStorage.delete(fullKey)
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
 * DISCORD.JS MOCKS
 * ====================
 */

/**
 * Creates a mock User for testing user operations
 */
export function createMockUser(overrides: Partial<User> = {}): User {
	const user = {
		id: 'test-user-123',
		username: 'TestUser',
		discriminator: '0001',
		bot: false,
		createdTimestamp: Date.now() - 31536000000, // 1 year ago
		displayName: 'TestUser',
		tag: 'TestUser#0001',
		send: fn().mockResolvedValue({}),
		...overrides
	} as unknown as User

	return user
}

/**
 * Creates a mock Client for testing client operations
 */
export function createMockClient(overrides: Partial<Client> = {}): Client {
	const channelMap = new Map()
	const userMap = new Map()
	const guildMap = new Map()

	const client = {
		user: createMockUser({ id: 'bot-user-123', username: 'TestBot', bot: true } as any),
		channels: {
			fetch: fn().mockResolvedValue({}),
			cache: channelMap
		},
		users: {
			fetch: fn().mockImplementation(async (userId: string) => {
				if (userMap.has(userId)) return userMap.get(userId)
				const user = createMockUser({ id: userId } as any)
				userMap.set(userId, user)
				return user
			}),
			cache: userMap
		},
		guilds: {
			fetch: fn(),
			cache: guildMap
		},
		...overrides
	} as unknown as Client

	return client
}

/**
 * ====================
 * ROBO.JS MOCKS
 * ====================
 */

/**
 * Mock client that can be imported by tested modules
 */
export let mockClient: Client = createMockClient()

/**
 * Updates the mock client instance
 */
export function setMockClient(client: Client): void {
	mockClient = client
}

/**
 * ====================
 * RESET ALL MOCKS
 * ====================
 */

/**
 * Resets all mocks to their initial state
 * Call this in afterEach hooks
 */
export function resetAllMocks(): void {
	clearFlashcoreStorage()

	jest.clearAllMocks()

	mockFlashcore.get.mockImplementation(
		(key: string, options?: { namespace?: string | string[]; default?: any }) => {
			const namespace = Array.isArray(options?.namespace)
				? options.namespace
				: options?.namespace
					? [options.namespace]
					: []
			const fullKey = [...namespace, key].join(':')
			const value = flashcoreStorage.get(fullKey)
			return value !== undefined ? value : options?.default
		}
	)

	mockFlashcore.set.mockImplementation((key: string, value: any, options?: { namespace?: string | string[] }) => {
		const namespace = Array.isArray(options?.namespace)
			? options.namespace
			: options?.namespace
				? [options.namespace]
				: []
		const fullKey = [...namespace, key].join(':')
		if (value === undefined) {
			flashcoreStorage.delete(fullKey)
		} else {
			flashcoreStorage.set(fullKey, value)
		}
		return value
	})

	mockFlashcore.delete.mockImplementation((key: string, options?: { namespace?: string | string[] }) => {
		const namespace = Array.isArray(options?.namespace)
			? options.namespace
			: options?.namespace
				? [options.namespace]
				: []
		const fullKey = [...namespace, key].join(':')
		flashcoreStorage.delete(fullKey)
	})
}
