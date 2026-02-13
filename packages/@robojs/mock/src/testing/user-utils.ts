/**
 * @robojs/mock - User Test Utilities
 *
 * Helper classes and functions for managing users in tests.
 * These utilities make it easy to manage multiple users and simulate multi-user interactions.
 */

import type { Session } from '../session/session.js'
import type { MockUser, Snowflake } from '../types/index.js'

/**
 * Cached reference to the session manager, resolved lazily on first use.
 * This avoids importing the session manager at module load time, which would
 * fail when the testing module is loaded in a separate process from the mock server.
 */
let _cachedSessionManager: { get: (id: string) => Session | undefined } | null = null

function getSessionManagerSync(): { get: (id: string) => Session | undefined } {
	if (!_cachedSessionManager) {
		// Dynamic require for synchronous resolution - works in Node.js/Jest environments
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const mod = require('../core/manager.js') as {
			sessionManager: { get: (id: string) => Session | undefined }
		}
		_cachedSessionManager = mod.sessionManager
	}
	return _cachedSessionManager
}

/**
 * Test helper for managing multiple users in a session
 */
export class TestUsers {
	constructor(private session: Session) {}

	/**
	 * Create a test user with sensible defaults
	 * @param name Username for the new user
	 * @param options Additional user options
	 * @returns The created user
	 */
	create(name: string, options?: Partial<{ bot: boolean; avatar: string | null; status: 'online' | 'offline' | 'idle' | 'dnd' }>): MockUser {
		return this.session.createUser({
			username: name,
			bot: options?.bot ?? false,
			avatar: options?.avatar ?? null,
			status: options?.status
		})
	}

	/**
	 * Create multiple test users at once
	 * @param names Array of usernames
	 * @returns Array of created users
	 */
	createMany(names: string[]): MockUser[] {
		return names.map((name) => this.create(name))
	}

	/**
	 * Get user by username (convenience method)
	 * @param username The username to search for
	 * @returns The user if found, undefined otherwise
	 */
	byName(username: string): MockUser | undefined {
		return this.session.getUsers().find((u) => u.username === username)
	}

	/**
	 * Get user by ID
	 * @param userId The user ID
	 * @returns The user if found, undefined otherwise
	 */
	byId(userId: string): MockUser | undefined {
		return this.session.getUser(userId)
	}

	/**
	 * Get the current acting user
	 * @returns The current user
	 */
	current(): MockUser {
		return this.session.getCurrentUser()
	}

	/**
	 * Switch to a different user as the current acting user
	 * @param user User object or username string
	 * @returns The switched user
	 */
	switchTo(user: MockUser | string): MockUser {
		const userId = typeof user === 'string' ? this.byName(user)?.id : user.id
		if (!userId) throw new Error(`User not found: ${user}`)
		const switched = this.session.setCurrentUser(userId)
		if (!switched) throw new Error(`Failed to switch to user: ${userId}`)
		return switched
	}

	/**
	 * Act as a specific user for a block of code
	 * Restores the original current user after the action completes
	 * @param user User object or username string
	 * @param action The action to perform as this user
	 * @returns The result of the action
	 */
	async as<T>(user: MockUser | string, action: () => T | Promise<T>): Promise<T> {
		const userId = typeof user === 'string' ? this.byName(user)?.id : user.id
		if (!userId) throw new Error(`User not found: ${user}`)
		return this.session.asUser(userId, action)
	}

	/**
	 * Get all non-bot users
	 * @returns Array of human users
	 */
	allHumans(): MockUser[] {
		return this.session.getUsers().filter((u) => !u.bot)
	}

	/**
	 * Get all bot users
	 * @returns Array of bot users
	 */
	allBots(): MockUser[] {
		return this.session.getUsers().filter((u) => u.bot)
	}
}

/**
 * Test helper for user interactions
 */
export class TestInteractions {
	constructor(private session: Session) {}

	/**
	 * Get a reference to the users helper
	 */
	private get users(): TestUsers {
		return new TestUsers(this.session)
	}

	/**
	 * Simulate a conversation between users
	 * @param channelId The channel to send messages to
	 * @param messages Array of {user, content} pairs
	 */
	async conversation(channelId: Snowflake, messages: Array<{ user: string; content: string }>): Promise<void> {
		for (const msg of messages) {
			const user = this.users.byName(msg.user)
			if (!user) throw new Error(`User not found: ${msg.user}`)
			await this.session.sendMessageAs(user.id, channelId, msg.content)
		}
	}

	/**
	 * Have a user send a message
	 * @param user User object or username
	 * @param channelId Channel to send to
	 * @param content Message content
	 */
	async sendMessage(user: MockUser | string, channelId: string, content: string): Promise<void> {
		const userId = typeof user === 'string' ? this.users.byName(user)?.id : user.id
		if (!userId) throw new Error(`User not found: ${user}`)
		await this.session.sendMessageAs(userId, channelId, content)
	}

	/**
	 * Have a user invoke a slash command
	 * @param user User object or username
	 * @param commandName Command name (without slash)
	 * @param options Optional command options
	 */
	async invokeCommand(user: MockUser | string, commandName: string, options?: Record<string, string | number | boolean>): Promise<void> {
		const userId = typeof user === 'string' ? this.users.byName(user)?.id : user.id
		if (!userId) throw new Error(`User not found: ${user}`)
		await this.session.invokeCommandAs(userId, commandName, options)
	}

	/**
	 * Have a user click a button
	 * @param user User object or username
	 * @param messageId Message containing the button
	 * @param customId Button's custom ID
	 */
	async clickButton(user: MockUser | string, messageId: string, customId: string): Promise<void> {
		const userId = typeof user === 'string' ? this.users.byName(user)?.id : user.id
		if (!userId) throw new Error(`User not found: ${user}`)
		await this.session.clickButtonAs(userId, messageId, customId)
	}
}

/**
 * Combined test utilities for a session
 */
export interface TestUtils {
	/** User management utilities */
	users: TestUsers
	/** Interaction simulation utilities */
	interactions: TestInteractions
}

/**
 * Create test utilities for a session.
 *
 * Accepts either the internal `Session` instance or a `sessionId` string.
 * When given a string, the session is resolved from the in-process session manager
 * (requires the mock server to be running in the same process).
 *
 * @param sessionOrId The session instance or session ID string
 * @returns Object with users and interactions helpers
 *
 * @example
 * ```typescript
 * import { startMockRobo, createTestUtils } from '@robojs/mock/testing'
 *
 * const bot = await startMockRobo({ name: 'test' })
 * const { users, interactions } = createTestUtils(bot.sessionId)
 *
 * // Create test users
 * const [alice, bob] = users.createMany(['Alice', 'Bob'])
 *
 * // Simulate a conversation
 * await interactions.conversation(channelId, [
 *   { user: 'Alice', content: 'Hello!' },
 *   { user: 'Bob', content: 'Hi there!' }
 * ])
 *
 * // Act as a specific user
 * await users.as(alice, async () => {
 *   // Do something as Alice
 * })
 * ```
 */
export function createTestUtils(sessionOrId: Session): TestUtils
export function createTestUtils(sessionOrId: string): TestUtils
export function createTestUtils(sessionOrId: Session | string): TestUtils {
	let session: Session

	if (typeof sessionOrId === 'string') {
		// Resolve session from the in-process session manager
		const manager = getSessionManagerSync()
		const resolved = manager.get(sessionOrId)
		if (!resolved) {
			throw new Error(
				`Session not found: ${sessionOrId}. ` +
				`createTestUtils(sessionId) requires the mock server to be running in the same process. ` +
				`If you are using HMR mode, pass the Session instance directly instead.`
			)
		}
		session = resolved
	} else {
		session = sessionOrId
	}

	return {
		users: new TestUsers(session),
		interactions: new TestInteractions(session)
	}
}
