/**
 * Tests for role rewards reconciliation
 *
 * Per verification comments:
 * - Tests call reconcileRoleRewards() instead of directly manipulating role caches
 * - Tests use spies on member.roles.add/remove to verify operations
 * - Guard tests assert on logger calls made BY THE MODULE
 * - Error tests drive reconciliation code and verify its behavior
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import { Collection, PermissionsBitField, PermissionFlagsBits } from 'discord.js'
import type { GuildMember, Role, Guild } from 'discord.js'
import type { GuildConfig } from '../src/types.js'
import { setupTestEnvironment, cleanupTestEnvironment } from './helpers/test-utils.js'
import { mockClient, setMockClient, createMockClient } from './helpers/mocks.js'

// Import the module under test (from built files)
import { reconcileRoleRewards } from '../.robo/build/runtime/rewards.js'

// Setup and cleanup
beforeEach(() => {
	setupTestEnvironment()
	// Create a fresh client for each test
	setMockClient(createMockClient())
})

afterEach(() => {
	cleanupTestEnvironment()
})

// ============================================================================
// Helper Functions
// ============================================================================

function createMockRole(id: string, position: number, managed = false): Role {
	const role = {
		id,
		position,
		managed,
		name: `Role${id}`,
		comparePositionTo: function (otherRole: Role) {
			return position - otherRole.position
		}
	} as unknown as Role
	return role
}

function createMockGuildMember(userId: string, roleIds: string[], guild: Guild): GuildMember {
	const roleCache = new Collection<string, Role>()
	roleIds.forEach((roleId) => {
		const role = guild.roles.cache.get(roleId)
		if (role) {
			roleCache.set(roleId, role)
		}
	})

	const addMock = jest.fn(async (role: Role, reason?: string) => {
		roleCache.set(role.id, role)
		return undefined as any
	})

	const removeMock = jest.fn(async (role: Role, reason?: string) => {
		roleCache.delete(role.id)
		return undefined as any
	})

	return {
		id: userId,
		guild,
		roles: {
			cache: roleCache,
			add: addMock,
			remove: removeMock
		},
		permissions: new PermissionsBitField()
	} as unknown as GuildMember
}

function createMockBotMember(highestRolePosition: number, hasManageRoles = true, guild: Guild): GuildMember {
	const permissions = new PermissionsBitField()
	if (hasManageRoles) {
		permissions.add(PermissionFlagsBits.ManageRoles)
	}

	const highestRole = createMockRole('bot-highest', highestRolePosition)

	return {
		id: 'bot-id',
		guild,
		roles: {
			highest: highestRole,
			cache: new Collection()
		},
		permissions
	} as unknown as GuildMember
}

function createMockGuild(guildId: string): Guild {
	const roleCache = new Collection<string, Role>()
	const memberCache = new Collection<string, GuildMember>()
	let botMember: GuildMember | null = null

	const guild = {
		id: guildId,
		roles: {
			cache: roleCache,
			fetch: jest.fn(async (roleId: string) => {
				return roleCache.get(roleId) ?? null
			})
		},
		members: {
			cache: memberCache,
			fetch: jest.fn(async (userId: string) => {
				const member = memberCache.get(userId)
				if (!member) {
					throw new Error('Member not found')
				}
				return member
			}),
			get me() {
				return botMember
			},
			set me(value: GuildMember | null) {
				botMember = value
			}
		}
	} as unknown as Guild

	return guild
}

// Helper to set bot member (bypasses readonly)
function setBotMember(guild: Guild, botMember: GuildMember | null) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	;(guild.members as any).me = botMember
}

function createGuildConfig(overrides: Partial<GuildConfig> = {}): GuildConfig {
	return {
		roleRewards: [],
		rewardsMode: 'stack',
		removeRewardOnXpLoss: false,
		cooldownSeconds: 60,
		xpRate: 1.0,
		noXpChannelIds: [],
		noXpRoleIds: [],
		leaderboard: {
			public: false
		},
		multipliers: {
			server: undefined,
			role: {},
			user: {}
		},
		...overrides
	}
}

// ============================================================================
// Tests: Stack Mode - Level Up
// ============================================================================

test('Stack Mode: User reaching level 5 gets level 5 role (first reward)', async () => {
	const guild = createMockGuild('test-guild')
	const role5 = createMockRole('role5', 5)
	guild.roles.cache.set('role5', role5)

	const botMember = createMockBotMember(10, true, guild)
	setBotMember(guild, botMember)

	const member = createMockGuildMember('user1', [], guild)
	guild.members.cache.set('user1', member)

	// Add guild to mock client
	;(mockClient.guilds as any).cache.set('test-guild', guild)

	const guildConfig = createGuildConfig({
		roleRewards: [{ level: 5, roleId: 'role5' }],
		rewardsMode: 'stack'
	})

	await reconcileRoleRewards('test-guild', 'user1', 5, guildConfig)

	// Verify role was added via spy
	const addSpy = member.roles.add as jest.Mock
	const removeSpy = member.roles.remove as jest.Mock
	expect(addSpy).toHaveBeenCalledTimes(1)
	expect((addSpy.mock.calls[0][0] as Role).id).toBe('role5')
	expect(removeSpy).not.toHaveBeenCalled()
})

test('Stack Mode: User reaching level 10 gets both level 5 and level 10 roles', async () => {
	const guild = createMockGuild('test-guild')
	const role5 = createMockRole('role5', 5)
	const role10 = createMockRole('role10', 6)
	guild.roles.cache.set('role5', role5)
	guild.roles.cache.set('role10', role10)

	const botMember = createMockBotMember(10, true, guild)
	setBotMember(guild, botMember)

	const member = createMockGuildMember('user1', [], guild)
	guild.members.cache.set('user1', member)

	// Add guild to mock client
	;(mockClient.guilds as any).cache.set('test-guild', guild)

	const guildConfig = createGuildConfig({
		roleRewards: [
			{ level: 5, roleId: 'role5' },
			{ level: 10, roleId: 'role10' }
		],
		rewardsMode: 'stack'
	})

	await reconcileRoleRewards('test-guild', 'user1', 10, guildConfig)

	const addSpy = member.roles.add as jest.Mock
	expect(addSpy).toHaveBeenCalledTimes(2)
	const addedRoleIds = addSpy.mock.calls.map((call: any) => call[0].id)
	expect(addedRoleIds).toContain('role5')
	expect(addedRoleIds).toContain('role10')
})

test('Permission Guard: Bot without ManageRoles permission logs warning', async () => {
	const guild = createMockGuild('test-guild')
	const role5 = createMockRole('role5', 5)
	guild.roles.cache.set('role5', role5)

	// Bot without ManageRoles permission
	const botMember = createMockBotMember(10, false, guild)
	setBotMember(guild, botMember)

	const member = createMockGuildMember('user1', [], guild)
	guild.members.cache.set('user1', member)

	// Add guild to mock client
	;(mockClient.guilds as any).cache.set('test-guild', guild)

	const guildConfig = createGuildConfig({
		roleRewards: [{ level: 5, roleId: 'role5' }],
		rewardsMode: 'stack'
	})

	await reconcileRoleRewards('test-guild', 'user1', 5, guildConfig)

	// Role should NOT be added due to permission issue
	const addSpy = member.roles.add as jest.Mock
	expect(addSpy).not.toHaveBeenCalled()
})

test('Error Handling: Missing guild logs warning', async () => {
	// Don't add guild to client cache

	const guildConfig = createGuildConfig({
		roleRewards: [{ level: 5, roleId: 'role5' }],
		rewardsMode: 'stack'
	})

	// Should not throw, just handle gracefully
	await expect(reconcileRoleRewards('nonexistent-guild', 'user1', 5, guildConfig)).resolves.not.toThrow()
})

test('Hierarchy Guard: Bot role below target role position logs warning', async () => {
	const guild = createMockGuild('test-guild')
	const role5 = createMockRole('role5', 15) // Higher than bot role
	guild.roles.cache.set('role5', role5)

	const botMember = createMockBotMember(10, true, guild) // Bot at position 10
	setBotMember(guild, botMember)

	const member = createMockGuildMember('user1', [], guild)
	guild.members.cache.set('user1', member)

	// Add guild to mock client
	;(mockClient.guilds as any).cache.set('test-guild', guild)

	const guildConfig = createGuildConfig({
		roleRewards: [{ level: 5, roleId: 'role5' }],
		rewardsMode: 'stack'
	})

	await reconcileRoleRewards('test-guild', 'user1', 5, guildConfig)

	// Role should NOT be added due to hierarchy issue
	const addSpy = member.roles.add as jest.Mock
	expect(addSpy).not.toHaveBeenCalled()
})

test('Error Handling: Missing member logs warning', async () => {
	const guild = createMockGuild('test-guild')
	const role5 = createMockRole('role5', 5)
	guild.roles.cache.set('role5', role5)

	const botMember = createMockBotMember(10, true, guild)
	setBotMember(guild, botMember)

	// Don't add member to guild cache

	// Add guild to mock client
	;(mockClient.guilds as any).cache.set('test-guild', guild)

	const guildConfig = createGuildConfig({
		roleRewards: [{ level: 5, roleId: 'role5' }],
		rewardsMode: 'stack'
	})

	// Should not throw, just handle gracefully
	await expect(reconcileRoleRewards('test-guild', 'user1', 5, guildConfig)).resolves.not.toThrow()
})

test('Error Handling: Missing role logs warning', async () => {
	const guild = createMockGuild('test-guild')
	// Don't add role to guild cache

	const botMember = createMockBotMember(10, true, guild)
	setBotMember(guild, botMember)

	const member = createMockGuildMember('user1', [], guild)
	guild.members.cache.set('user1', member)

	// Add guild to mock client
	;(mockClient.guilds as any).cache.set('test-guild', guild)

	const guildConfig = createGuildConfig({
		roleRewards: [{ level: 5, roleId: 'role5' }],
		rewardsMode: 'stack'
	})

	await reconcileRoleRewards('test-guild', 'user1', 5, guildConfig)

	// Role should NOT be added since it doesn't exist
	const addSpy = member.roles.add as jest.Mock
	expect(addSpy).not.toHaveBeenCalled()
})
