/**
 * Tests for command registration caching behavior.
 *
 * Verifies that:
 * - Registration is skipped when hash matches (cache hit)
 * - Registration occurs when hash differs (cache miss)
 * - Hash is stored after successful registration
 * - Hash is NOT stored after failed registration
 * - Separate hashes for global vs guild-scoped registrations
 */

import { describe, it, expect, beforeEach } from '@jest/globals'
import {
	createMockCommandEntry,
	createMockBuildContext,
	resetAllMocks,
	mockFlashcore,
	getFlashcoreStorage
} from './helpers/mocks.js'
import { setEnvData } from '../__mocks__/robo.js.js'
import { getRestMock, resetRestMock } from '../__mocks__/discord.js.js'
import { FLASHCORE_KEY_COMMAND_HASH_PREFIX } from '../src/core/commands.js'

// Get the singleton REST mock - all code using `new REST()` shares this instance
const restMock = getRestMock()

// Import after mock setup (moduleNameMapper handles the discord.js mock)
const { default: buildCompleteHook, computeCommandHash } = await import('../src/robo/build/complete.js')

describe('Command Registration Caching', () => {
	const clientId = 'test-client-123'
	const token = 'test-token-abc'
	const guildId = 'test-guild-456'

	beforeEach(() => {
		resetAllMocks()
		resetRestMock()

		// Set environment data
		setEnvData({
			DISCORD_CLIENT_ID: clientId,
			DISCORD_TOKEN: token
		})
	})

	describe('cache behavior', () => {
		it('should skip registration when cached hash matches (cache hit)', async () => {
			const commands = [createMockCommandEntry({ key: 'ping' })]
			const context = createMockBuildContext({ commandEntries: commands })

			// Pre-compute and store the expected hash
			const expectedHash = computeCommandHash(commands, [], undefined, clientId, token, undefined)
			const hashKey = `${FLASHCORE_KEY_COMMAND_HASH_PREFIX}global`
			mockFlashcore.set(hashKey, expectedHash)

			await buildCompleteHook(context as any)

			// Should NOT call Discord API
			expect(restMock.put).not.toHaveBeenCalled()
		})

		it('should register when cached hash differs (cache miss)', async () => {
			const commands = [createMockCommandEntry({ key: 'ping' })]
			const context = createMockBuildContext({ commandEntries: commands })

			// Store a different hash
			const hashKey = `${FLASHCORE_KEY_COMMAND_HASH_PREFIX}global`
			mockFlashcore.set(hashKey, 'old-hash-different')

			await buildCompleteHook(context as any)

			// Should call Discord API
			expect(restMock.put).toHaveBeenCalled()
		})

		it('should register when no cached hash exists (first build)', async () => {
			const commands = [createMockCommandEntry({ key: 'ping' })]
			const context = createMockBuildContext({ commandEntries: commands })

			// No hash in storage

			await buildCompleteHook(context as any)

			// Should call Discord API
			expect(restMock.put).toHaveBeenCalled()
		})

		it('should store hash after successful registration', async () => {
			const commands = [createMockCommandEntry({ key: 'ping' })]
			const context = createMockBuildContext({ commandEntries: commands })

			await buildCompleteHook(context as any)

			// Check hash was stored
			const hashKey = `${FLASHCORE_KEY_COMMAND_HASH_PREFIX}global`
			const storedHash = getFlashcoreStorage().get(hashKey)
			expect(storedHash).toBeDefined()
			expect(typeof storedHash).toBe('string')
			expect(storedHash).toHaveLength(16)
		})

		it('should NOT store hash after failed registration', async () => {
			const commands = [createMockCommandEntry({ key: 'ping' })]
			const context = createMockBuildContext({ commandEntries: commands })

			// Make registration fail
			restMock.put.mockRejectedValueOnce(new Error('Discord API error'))

			await buildCompleteHook(context as any)

			// Hash should NOT be stored
			const hashKey = `${FLASHCORE_KEY_COMMAND_HASH_PREFIX}global`
			const storedHash = getFlashcoreStorage().get(hashKey)
			expect(storedHash).toBeUndefined()
		})
	})

	describe('scope separation', () => {
		it('should use different hash keys for global vs guild-scoped', async () => {
			const commands = [createMockCommandEntry({ key: 'ping' })]

			// Test global registration
			setEnvData({ DISCORD_CLIENT_ID: clientId, DISCORD_TOKEN: token })
			const globalContext = createMockBuildContext({ commandEntries: commands })
			await buildCompleteHook(globalContext as any)

			const globalHashKey = `${FLASHCORE_KEY_COMMAND_HASH_PREFIX}global`
			const globalHash = getFlashcoreStorage().get(globalHashKey)

			// Test guild registration
			setEnvData({ DISCORD_CLIENT_ID: clientId, DISCORD_TOKEN: token, DISCORD_GUILD_ID: guildId })
			resetAllMocks()
			restMock.put.mockResolvedValue([])

			const guildContext = createMockBuildContext({ commandEntries: commands })
			await buildCompleteHook(guildContext as any)

			const guildHashKey = `${FLASHCORE_KEY_COMMAND_HASH_PREFIX}guild:${guildId}`
			const guildHash = getFlashcoreStorage().get(guildHashKey)

			// Both should have hashes stored
			expect(globalHash).toBeDefined()
			expect(guildHash).toBeDefined()

			// Hashes should be different (different scope in hash input)
			expect(globalHash).not.toBe(guildHash)
		})
	})

	describe('config options', () => {
		it('should skip registration when autoRegisterCommands is false', async () => {
			const commands = [createMockCommandEntry({ key: 'ping' })]
			const context = createMockBuildContext({
				commandEntries: commands,
				config: { autoRegisterCommands: false }
			})

			await buildCompleteHook(context as any)

			expect(restMock.put).not.toHaveBeenCalled()
		})

		it('should skip registration when mode not in autoRegisterCommands array', async () => {
			const commands = [createMockCommandEntry({ key: 'ping' })]
			const context = createMockBuildContext({
				commandEntries: commands,
				mode: 'development',
				config: { autoRegisterCommands: ['production'] }
			})

			await buildCompleteHook(context as any)

			expect(restMock.put).not.toHaveBeenCalled()
		})

		it('should register when mode is in autoRegisterCommands array', async () => {
			const commands = [createMockCommandEntry({ key: 'ping' })]
			const context = createMockBuildContext({
				commandEntries: commands,
				mode: 'production',
				config: { autoRegisterCommands: ['production'] }
			})

			await buildCompleteHook(context as any)

			expect(restMock.put).toHaveBeenCalled()
		})
	})

	describe('credential handling', () => {
		it('should skip registration when missing token', async () => {
			const commands = [createMockCommandEntry({ key: 'ping' })]
			const context = createMockBuildContext({
				commandEntries: commands,
				hasToken: false
			})

			await buildCompleteHook(context as any)

			expect(restMock.put).not.toHaveBeenCalled()
		})

		it('should skip registration when missing clientId', async () => {
			const commands = [createMockCommandEntry({ key: 'ping' })]
			const context = createMockBuildContext({
				commandEntries: commands,
				hasClientId: false
			})

			await buildCompleteHook(context as any)

			expect(restMock.put).not.toHaveBeenCalled()
		})
	})

	describe('empty commands', () => {
		it('should send empty registration when no commands remain', async () => {
			const context = createMockBuildContext({ commandEntries: [] })

			await buildCompleteHook(context as any)

			// Empty registration clears stale commands from Discord
			expect(restMock.put).toHaveBeenCalled()
		})

		it('should store hash even with no commands for cache consistency', async () => {
			const context = createMockBuildContext({ commandEntries: [] })

			// First build - should store hash
			await buildCompleteHook(context as any)

			// Verify hash was stored
			const hashKey = `${FLASHCORE_KEY_COMMAND_HASH_PREFIX}global`
			expect(getFlashcoreStorage().has(hashKey)).toBe(true)

			// Reset mock call counts
			restMock.put.mockClear()

			// Second build with same empty commands - should hit cache
			await buildCompleteHook(context as any)

			// API shouldn't be called on cache hit
			expect(restMock.put).not.toHaveBeenCalled()
		})
	})

	describe('force registration', () => {
		it('should register when DISCORD_FORCE_REGISTER env is true even if hash matches', async () => {
			const commands = [createMockCommandEntry({ key: 'ping' })]
			const context = createMockBuildContext({ commandEntries: commands })

			// First build - registers and stores hash
			await buildCompleteHook(context as any)
			expect(restMock.put).toHaveBeenCalledTimes(1)
			restMock.put.mockClear()

			// Second build without force - should skip (cache hit)
			await buildCompleteHook(context as any)
			expect(restMock.put).not.toHaveBeenCalled()

			// Third build with DISCORD_FORCE_REGISTER env - should register
			const originalEnv = process.env.DISCORD_FORCE_REGISTER
			process.env.DISCORD_FORCE_REGISTER = 'true'

			try {
				await buildCompleteHook(context as any)
				expect(restMock.put).toHaveBeenCalledTimes(1)
			} finally {
				process.env.DISCORD_FORCE_REGISTER = originalEnv
			}
		})
	})

	describe('mock mode', () => {
		it('should skip registration in mock mode', async () => {
			const originalEnv = process.env.ROBO_MOCK_MODE
			process.env.ROBO_MOCK_MODE = 'true'

			try {
				const commands = [createMockCommandEntry({ key: 'ping' })]
				const context = createMockBuildContext({ commandEntries: commands })

				await buildCompleteHook(context as any)

				expect(restMock.put).not.toHaveBeenCalled()
			} finally {
				process.env.ROBO_MOCK_MODE = originalEnv
			}
		})
	})
})
