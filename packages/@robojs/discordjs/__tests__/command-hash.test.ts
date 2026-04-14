/**
 * Tests for command hash computation.
 *
 * Verifies that the hash function:
 * - Is deterministic (same input = same output)
 * - Changes when commands, context menus, defaults, or credentials change
 * - Is stable when entry order differs (sorted keys)
 */

import { describe, it, expect, beforeEach } from '@jest/globals'
import { createMockCommandEntry, createMockContextEntry, resetAllMocks } from './helpers/mocks.js'
import { computeCommandHash } from '../src/robo/build/complete.js'
import type { ProcessedEntry } from 'robo.js'

describe('computeCommandHash', () => {
	beforeEach(() => {
		resetAllMocks()
	})

	describe('determinism', () => {
		it('should produce the same hash for identical inputs', () => {
			const commands = [createMockCommandEntry({ key: 'ping' })]
			const context: ProcessedEntry[] = []
			const defaults = undefined
			const clientId = 'client-123'
			const token = 'token-abc'
			const guildId = undefined

			const hash1 = computeCommandHash(commands, context, defaults, clientId, token, guildId)
			const hash2 = computeCommandHash(commands, context, defaults, clientId, token, guildId)

			expect(hash1).toBe(hash2)
		})

		it('should produce a 16-character hex string', () => {
			const commands = [createMockCommandEntry()]
			const hash = computeCommandHash(commands, [], undefined, 'client', 'token', undefined)

			expect(hash).toMatch(/^[a-f0-9]{16}$/)
		})
	})

	describe('command changes', () => {
		it('should change when command description changes', () => {
			const commands1 = [createMockCommandEntry({ key: 'ping', metadata: { description: 'Pong!' } })]
			const commands2 = [createMockCommandEntry({ key: 'ping', metadata: { description: 'Reply with pong' } })]

			const hash1 = computeCommandHash(commands1, [], undefined, 'client', 'token', undefined)
			const hash2 = computeCommandHash(commands2, [], undefined, 'client', 'token', undefined)

			expect(hash1).not.toBe(hash2)
		})

		it('should change when command options change', () => {
			const commands1 = [createMockCommandEntry({ key: 'greet', metadata: { options: [] } })]
			const commands2 = [
				createMockCommandEntry({
					key: 'greet',
					metadata: { options: [{ name: 'user', type: 'user', required: true }] }
				})
			]

			const hash1 = computeCommandHash(commands1, [], undefined, 'client', 'token', undefined)
			const hash2 = computeCommandHash(commands2, [], undefined, 'client', 'token', undefined)

			expect(hash1).not.toBe(hash2)
		})

		it('should change when a new command is added', () => {
			const commands1 = [createMockCommandEntry({ key: 'ping' })]
			const commands2 = [createMockCommandEntry({ key: 'ping' }), createMockCommandEntry({ key: 'pong' })]

			const hash1 = computeCommandHash(commands1, [], undefined, 'client', 'token', undefined)
			const hash2 = computeCommandHash(commands2, [], undefined, 'client', 'token', undefined)

			expect(hash1).not.toBe(hash2)
		})

		it('should change when a command is removed', () => {
			const commands1 = [createMockCommandEntry({ key: 'ping' }), createMockCommandEntry({ key: 'pong' })]
			const commands2 = [createMockCommandEntry({ key: 'ping' })]

			const hash1 = computeCommandHash(commands1, [], undefined, 'client', 'token', undefined)
			const hash2 = computeCommandHash(commands2, [], undefined, 'client', 'token', undefined)

			expect(hash1).not.toBe(hash2)
		})

		it('should change when command name changes', () => {
			const commands1 = [createMockCommandEntry({ key: 'ping' })]
			const commands2 = [createMockCommandEntry({ key: 'pong' })]

			const hash1 = computeCommandHash(commands1, [], undefined, 'client', 'token', undefined)
			const hash2 = computeCommandHash(commands2, [], undefined, 'client', 'token', undefined)

			expect(hash1).not.toBe(hash2)
		})
	})

	describe('context menu changes', () => {
		it('should change when context menu is added', () => {
			const context1: ProcessedEntry[] = []
			const context2 = [createMockContextEntry('user', { key: 'Get User Info' })]

			const hash1 = computeCommandHash([], context1, undefined, 'client', 'token', undefined)
			const hash2 = computeCommandHash([], context2, undefined, 'client', 'token', undefined)

			expect(hash1).not.toBe(hash2)
		})

		it('should change when context menu type changes', () => {
			const context1 = [createMockContextEntry('user', { key: 'Test' })]
			const context2 = [createMockContextEntry('message', { key: 'Test' })]

			const hash1 = computeCommandHash([], context1, undefined, 'client', 'token', undefined)
			const hash2 = computeCommandHash([], context2, undefined, 'client', 'token', undefined)

			expect(hash1).not.toBe(hash2)
		})
	})

	describe('credential changes', () => {
		it('should change when clientId changes', () => {
			const commands = [createMockCommandEntry()]

			const hash1 = computeCommandHash(commands, [], undefined, 'client-123', 'token', undefined)
			const hash2 = computeCommandHash(commands, [], undefined, 'client-456', 'token', undefined)

			expect(hash1).not.toBe(hash2)
		})

		it('should change when token changes', () => {
			const commands = [createMockCommandEntry()]

			const hash1 = computeCommandHash(commands, [], undefined, 'client', 'token-abc', undefined)
			const hash2 = computeCommandHash(commands, [], undefined, 'client', 'token-xyz', undefined)

			expect(hash1).not.toBe(hash2)
		})

		it('should change when guildId changes', () => {
			const commands = [createMockCommandEntry()]

			const hash1 = computeCommandHash(commands, [], undefined, 'client', 'token', undefined)
			const hash2 = computeCommandHash(commands, [], undefined, 'client', 'token', 'guild-123')

			expect(hash1).not.toBe(hash2)
		})

		it('should change when switching from one guild to another', () => {
			const commands = [createMockCommandEntry()]

			const hash1 = computeCommandHash(commands, [], undefined, 'client', 'token', 'guild-123')
			const hash2 = computeCommandHash(commands, [], undefined, 'client', 'token', 'guild-456')

			expect(hash1).not.toBe(hash2)
		})
	})

	describe('defaults changes', () => {
		it('should change when defaults contexts change', () => {
			const commands = [createMockCommandEntry()]
			const defaults1 = { contexts: ['Guild'] }
			const defaults2 = { contexts: ['Guild', 'BotDM'] }

			const hash1 = computeCommandHash(commands, [], defaults1 as any, 'client', 'token', undefined)
			const hash2 = computeCommandHash(commands, [], defaults2 as any, 'client', 'token', undefined)

			expect(hash1).not.toBe(hash2)
		})

		it('should change when defaults integrationTypes change', () => {
			const commands = [createMockCommandEntry()]
			const defaults1 = { integrationTypes: ['GuildInstall'] }
			const defaults2 = { integrationTypes: ['GuildInstall', 'UserInstall'] }

			const hash1 = computeCommandHash(commands, [], defaults1 as any, 'client', 'token', undefined)
			const hash2 = computeCommandHash(commands, [], defaults2 as any, 'client', 'token', undefined)

			expect(hash1).not.toBe(hash2)
		})

		it('should change when defaults defaultMemberPermissions change', () => {
			const commands = [createMockCommandEntry()]
			const defaults1 = { defaultMemberPermissions: 'Administrator' }
			const defaults2 = { defaultMemberPermissions: 'ManageGuild' }

			const hash1 = computeCommandHash(commands, [], defaults1 as any, 'client', 'token', undefined)
			const hash2 = computeCommandHash(commands, [], defaults2 as any, 'client', 'token', undefined)

			expect(hash1).not.toBe(hash2)
		})
	})

	describe('stability', () => {
		it('should not change when command array order changes', () => {
			// Entries are sorted by key before hashing so scanner order does not churn the cache
			const commandA = createMockCommandEntry({ key: 'alpha' })
			const commandB = createMockCommandEntry({ key: 'beta' })

			const hash1 = computeCommandHash([commandA, commandB], [], undefined, 'client', 'token', undefined)
			const hash2 = computeCommandHash([commandB, commandA], [], undefined, 'client', 'token', undefined)

			expect(hash1).toBe(hash2)
		})

		it('should not change when metadata has same values in different order', () => {
			// JSON.stringify with Object.keys ensures key order is consistent
			const commands1 = [
				createMockCommandEntry({
					key: 'test',
					metadata: { description: 'Test', options: [], dmPermission: true }
				})
			]
			const commands2 = [
				createMockCommandEntry({
					key: 'test',
					metadata: { dmPermission: true, options: [], description: 'Test' }
				})
			]

			const hash1 = computeCommandHash(commands1, [], undefined, 'client', 'token', undefined)
			const hash2 = computeCommandHash(commands2, [], undefined, 'client', 'token', undefined)

			expect(hash1).toBe(hash2)
		})
	})

	describe('empty inputs', () => {
		it('should handle empty commands and context', () => {
			const hash = computeCommandHash([], [], undefined, 'client', 'token', undefined)
			expect(hash).toMatch(/^[a-f0-9]{16}$/)
		})

		it('should produce different hashes for different credentials even with no commands', () => {
			const hash1 = computeCommandHash([], [], undefined, 'client-1', 'token-1', undefined)
			const hash2 = computeCommandHash([], [], undefined, 'client-2', 'token-2', undefined)

			expect(hash1).not.toBe(hash2)
		})
	})
})
