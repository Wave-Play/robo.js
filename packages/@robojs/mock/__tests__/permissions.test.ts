/**
 * Permission Calculation Tests
 * Tests for Discord permission calculation and enforcement
 */
import { createSessionState, createDefaultGuildWithChannel, MockServerState, createMockGuildMember } from '../src/session/state.js'
import {
	computePermissions,
	computeBasePermissions,
	hasPermission,
	hasAnyPermission,
	hasAllPermissions,
	getPermissionNames,
	parsePermissions,
	checkEndpointPermission,
	PermissionFlagsBits
} from '../src/core/permissions.js'
import { OverwriteType } from '../src/types/index.js'

describe('Permissions', () => {
	describe('Permission bitfield operations', () => {
		it('should check if permission is set', () => {
			const permissions = PermissionFlagsBits.SendMessages | PermissionFlagsBits.ViewChannel

			expect(hasPermission(permissions, PermissionFlagsBits.SendMessages)).toBe(true)
			expect(hasPermission(permissions, PermissionFlagsBits.ViewChannel)).toBe(true)
			expect(hasPermission(permissions, PermissionFlagsBits.Administrator)).toBe(false)
		})

		it('should check if any permission is set', () => {
			const permissions = PermissionFlagsBits.SendMessages

			expect(hasAnyPermission(permissions, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ViewChannel)).toBe(true)
			expect(hasAnyPermission(permissions, PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageGuild)).toBe(false)
		})

		it('should check if all permissions are set', () => {
			const permissions = PermissionFlagsBits.SendMessages | PermissionFlagsBits.ViewChannel

			expect(hasAllPermissions(permissions, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ViewChannel)).toBe(true)
			expect(hasAllPermissions(permissions, PermissionFlagsBits.SendMessages, PermissionFlagsBits.Administrator)).toBe(false)
		})

		it('should get permission names from bitfield', () => {
			const permissions = PermissionFlagsBits.SendMessages | PermissionFlagsBits.ViewChannel | PermissionFlagsBits.AddReactions

			const names = getPermissionNames(permissions)

			expect(names).toContain('SendMessages')
			expect(names).toContain('ViewChannel')
			expect(names).toContain('AddReactions')
			expect(names).not.toContain('Administrator')
		})

		it('should parse permission string to bigint', () => {
			const permissions = parsePermissions('8') // Administrator

			expect(permissions).toBe(8n)
		})

		it('should return 0 for invalid permission string', () => {
			const permissions = parsePermissions('invalid')

			expect(permissions).toBe(0n)
		})
	})

	describe('Base permission calculation', () => {
		let sessionState: MockServerState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should compute permissions from @everyone role', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const member = sessionState.getGuildMember(guild.id, sessionState.botUser.id)!
			const roles = sessionState.getGuildRoles(guild.id)

			// Update @everyone role permissions
			sessionState.updateGuildRole(guild.id, guild.id, {
				permissions: (PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages).toString()
			})

			const permissions = computeBasePermissions(member, guild, roles)

			expect(hasPermission(permissions, PermissionFlagsBits.ViewChannel)).toBe(true)
			expect(hasPermission(permissions, PermissionFlagsBits.SendMessages)).toBe(true)
		})

		it('should combine permissions from multiple roles', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const member = sessionState.getGuildMember(guild.id, sessionState.botUser.id)!

			// Create role with ManageMessages
			const moderatorRole = sessionState.createGuildRole(guild.id, {
				name: 'Moderator',
				permissions: PermissionFlagsBits.ManageMessages.toString()
			})

			// Add role to member
			sessionState.addMemberRole(guild.id, sessionState.botUser.id, moderatorRole!.id)

			const roles = sessionState.getGuildRoles(guild.id)
			const permissions = computeBasePermissions(member, guild, roles)

			expect(hasPermission(permissions, PermissionFlagsBits.ManageMessages)).toBe(true)
		})

		it('should grant all permissions to guild owner', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			// Create a member that is the guild owner
			const ownerMember = createMockGuildMember(guild.id, guild.ownerId)
			sessionState.guildMembers.set(`${guild.id}:${guild.ownerId}`, ownerMember)

			const roles = sessionState.getGuildRoles(guild.id)
			const permissions = computeBasePermissions(ownerMember, guild, roles)

			// Owner should have Administrator and all other permissions
			expect(hasPermission(permissions, PermissionFlagsBits.Administrator)).toBe(true)
			expect(hasPermission(permissions, PermissionFlagsBits.ManageGuild)).toBe(true)
			expect(hasPermission(permissions, PermissionFlagsBits.BanMembers)).toBe(true)
		})

		it('should grant all permissions when Administrator is set', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const member = sessionState.getGuildMember(guild.id, sessionState.botUser.id)!

			// Create admin role
			const adminRole = sessionState.createGuildRole(guild.id, {
				name: 'Admin',
				permissions: PermissionFlagsBits.Administrator.toString()
			})

			sessionState.addMemberRole(guild.id, sessionState.botUser.id, adminRole!.id)

			const roles = sessionState.getGuildRoles(guild.id)
			const permissions = computeBasePermissions(member, guild, roles)

			// Should have all permissions when Administrator is set
			expect(hasPermission(permissions, PermissionFlagsBits.ManageGuild)).toBe(true)
			expect(hasPermission(permissions, PermissionFlagsBits.BanMembers)).toBe(true)
			expect(hasPermission(permissions, PermissionFlagsBits.ManageChannels)).toBe(true)
		})
	})

	describe('Channel permission overwrites', () => {
		let sessionState: MockServerState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should apply @everyone channel overwrite', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channel = Array.from(sessionState.channels.values())[0]

			// Create a test user who is NOT the guild owner
			const testUserId = 'test-user-123'
			sessionState.createGuildMember(guild.id, testUserId)
			const member = sessionState.getGuildMember(guild.id, testUserId)!

			// Set @everyone role to allow ViewChannel but channel denies it
			sessionState.updateGuildRole(guild.id, guild.id, {
				permissions: PermissionFlagsBits.ViewChannel.toString()
			})

			// Add channel overwrite to deny ViewChannel
			sessionState.setChannelOverwrite(channel.id, {
				id: guild.id, // @everyone role ID = guild ID
				type: OverwriteType.Role,
				allow: '0',
				deny: PermissionFlagsBits.ViewChannel.toString()
			})

			const roles = sessionState.getGuildRoles(guild.id)
			const permissions = computePermissions(member, channel, guild, roles)

			expect(hasPermission(permissions, PermissionFlagsBits.ViewChannel)).toBe(false)
		})

		it('should apply role overwrites after @everyone', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channel = Array.from(sessionState.channels.values())[0]
			const member = sessionState.getGuildMember(guild.id, sessionState.botUser.id)!

			// Create a special role
			const specialRole = sessionState.createGuildRole(guild.id, {
				name: 'Special',
				permissions: '0'
			})
			sessionState.addMemberRole(guild.id, sessionState.botUser.id, specialRole!.id)

			// @everyone denies SendMessages
			sessionState.setChannelOverwrite(channel.id, {
				id: guild.id,
				type: OverwriteType.Role,
				allow: '0',
				deny: PermissionFlagsBits.SendMessages.toString()
			})

			// Special role allows SendMessages
			sessionState.setChannelOverwrite(channel.id, {
				id: specialRole!.id,
				type: OverwriteType.Role,
				allow: PermissionFlagsBits.SendMessages.toString(),
				deny: '0'
			})

			const roles = sessionState.getGuildRoles(guild.id)
			const permissions = computePermissions(member, channel, guild, roles)

			// Role overwrite should override @everyone deny
			expect(hasPermission(permissions, PermissionFlagsBits.SendMessages)).toBe(true)
		})

		it('should apply member overwrites last', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channel = Array.from(sessionState.channels.values())[0]
			const member = sessionState.getGuildMember(guild.id, sessionState.botUser.id)!

			// Create a role that denies ManageMessages
			const moderatorRole = sessionState.createGuildRole(guild.id, {
				name: 'Moderator',
				permissions: PermissionFlagsBits.ManageMessages.toString()
			})
			sessionState.addMemberRole(guild.id, sessionState.botUser.id, moderatorRole!.id)

			// Role overwrite denies ManageMessages
			sessionState.setChannelOverwrite(channel.id, {
				id: moderatorRole!.id,
				type: OverwriteType.Role,
				allow: '0',
				deny: PermissionFlagsBits.ManageMessages.toString()
			})

			// Member overwrite allows ManageMessages
			sessionState.setChannelOverwrite(channel.id, {
				id: sessionState.botUser.id,
				type: OverwriteType.Member,
				allow: PermissionFlagsBits.ManageMessages.toString(),
				deny: '0'
			})

			const roles = sessionState.getGuildRoles(guild.id)
			const permissions = computePermissions(member, channel, guild, roles)

			// Member overwrite should override role deny
			expect(hasPermission(permissions, PermissionFlagsBits.ManageMessages)).toBe(true)
		})

		it('should bypass overwrites with Administrator', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channel = Array.from(sessionState.channels.values())[0]
			const member = sessionState.getGuildMember(guild.id, sessionState.botUser.id)!

			// Create admin role
			const adminRole = sessionState.createGuildRole(guild.id, {
				name: 'Admin',
				permissions: PermissionFlagsBits.Administrator.toString()
			})
			sessionState.addMemberRole(guild.id, sessionState.botUser.id, adminRole!.id)

			// Add overwrite that denies everything
			sessionState.setChannelOverwrite(channel.id, {
				id: sessionState.botUser.id,
				type: OverwriteType.Member,
				allow: '0',
				deny: (PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages).toString()
			})

			const roles = sessionState.getGuildRoles(guild.id)
			const permissions = computePermissions(member, channel, guild, roles)

			// Administrator bypasses all denies
			expect(hasPermission(permissions, PermissionFlagsBits.ViewChannel)).toBe(true)
			expect(hasPermission(permissions, PermissionFlagsBits.SendMessages)).toBe(true)
		})
	})

	describe('Channel overwrite CRUD', () => {
		let sessionState: MockServerState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should set channel overwrite', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channel = Array.from(sessionState.channels.values())[0]

			sessionState.setChannelOverwrite(channel.id, {
				id: guild.id,
				type: OverwriteType.Role,
				allow: '123',
				deny: '456'
			})

			const overwrites = sessionState.getChannelOverwrites(channel.id)
			expect(overwrites).toHaveLength(1)
			expect(overwrites[0].id).toBe(guild.id)
			expect(overwrites[0].allow).toBe('123')
			expect(overwrites[0].deny).toBe('456')
		})

		it('should update existing overwrite', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channel = Array.from(sessionState.channels.values())[0]

			sessionState.setChannelOverwrite(channel.id, {
				id: guild.id,
				type: OverwriteType.Role,
				allow: '100',
				deny: '0'
			})

			sessionState.setChannelOverwrite(channel.id, {
				id: guild.id,
				type: OverwriteType.Role,
				allow: '200',
				deny: '50'
			})

			const overwrites = sessionState.getChannelOverwrites(channel.id)
			expect(overwrites).toHaveLength(1)
			expect(overwrites[0].allow).toBe('200')
			expect(overwrites[0].deny).toBe('50')
		})

		it('should delete channel overwrite', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channel = Array.from(sessionState.channels.values())[0]

			sessionState.setChannelOverwrite(channel.id, {
				id: guild.id,
				type: OverwriteType.Role,
				allow: '123',
				deny: '0'
			})

			expect(sessionState.getChannelOverwrites(channel.id)).toHaveLength(1)

			const deleted = sessionState.deleteChannelOverwrite(channel.id, guild.id)

			expect(deleted).toBe(true)
			expect(sessionState.getChannelOverwrites(channel.id)).toHaveLength(0)
		})

		it('should return false when deleting nonexistent overwrite', () => {
			createDefaultGuildWithChannel(sessionState)
			const channel = Array.from(sessionState.channels.values())[0]

			const deleted = sessionState.deleteChannelOverwrite(channel.id, 'nonexistent')

			expect(deleted).toBe(false)
		})

		it('should return empty array for channel without overwrites', () => {
			createDefaultGuildWithChannel(sessionState)
			const channel = Array.from(sessionState.channels.values())[0]

			const overwrites = sessionState.getChannelOverwrites(channel.id)

			expect(overwrites).toEqual([])
		})
	})

	describe('Endpoint permission checking', () => {
		let sessionState: MockServerState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should allow endpoint when user has required permissions', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channel = Array.from(sessionState.channels.values())[0]
			const member = sessionState.getGuildMember(guild.id, sessionState.botUser.id)!

			// Grant SendMessages and ViewChannel
			sessionState.updateGuildRole(guild.id, guild.id, {
				permissions: (PermissionFlagsBits.SendMessages | PermissionFlagsBits.ViewChannel).toString()
			})

			const roles = sessionState.getGuildRoles(guild.id)

			const result = checkEndpointPermission(
				{
					guildId: guild.id,
					channelId: channel.id,
					member,
					channel,
					guild,
					roles,
					botUserId: sessionState.botUser.id
				},
				'POST',
				'/channels/123/messages'
			)

			expect(result.allowed).toBe(true)
		})

		it('should deny endpoint when user lacks required permissions', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channel = Array.from(sessionState.channels.values())[0]

			// Create a test user who is NOT the guild owner
			const testUserId = 'test-user-456'
			sessionState.createGuildMember(guild.id, testUserId)
			const member = sessionState.getGuildMember(guild.id, testUserId)!

			// Grant only ViewChannel (not SendMessages)
			sessionState.updateGuildRole(guild.id, guild.id, {
				permissions: PermissionFlagsBits.ViewChannel.toString()
			})

			const roles = sessionState.getGuildRoles(guild.id)

			const result = checkEndpointPermission(
				{
					guildId: guild.id,
					channelId: channel.id,
					member,
					channel,
					guild,
					roles,
					botUserId: testUserId
				},
				'POST',
				'/channels/123/messages'
			)

			expect(result.allowed).toBe(false)
			expect(result.code).toBe(50013) // MISSING_PERMISSIONS
		})

		it('should allow Administrator to bypass permission checks', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channel = Array.from(sessionState.channels.values())[0]
			const member = sessionState.getGuildMember(guild.id, sessionState.botUser.id)!

			// Grant only Administrator
			const adminRole = sessionState.createGuildRole(guild.id, {
				name: 'Admin',
				permissions: PermissionFlagsBits.Administrator.toString()
			})
			sessionState.addMemberRole(guild.id, sessionState.botUser.id, adminRole!.id)

			const roles = sessionState.getGuildRoles(guild.id)

			const result = checkEndpointPermission(
				{
					guildId: guild.id,
					channelId: channel.id,
					member,
					channel,
					guild,
					roles,
					botUserId: sessionState.botUser.id
				},
				'POST',
				'/guilds/123/roles'
			)

			expect(result.allowed).toBe(true)
		})

		it('should allow endpoints without required permissions', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const member = sessionState.getGuildMember(guild.id, sessionState.botUser.id)!

			// No special permissions
			sessionState.updateGuildRole(guild.id, guild.id, {
				permissions: '0'
			})

			const roles = sessionState.getGuildRoles(guild.id)

			const result = checkEndpointPermission(
				{
					guildId: guild.id,
					member,
					guild,
					roles,
					botUserId: sessionState.botUser.id
				},
				'GET',
				'/guilds/123/roles'
			)

			// GET /guilds/:id/roles has no permission requirements
			expect(result.allowed).toBe(true)
		})

		it('should allow unknown endpoints', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const member = sessionState.getGuildMember(guild.id, sessionState.botUser.id)!

			const roles = sessionState.getGuildRoles(guild.id)

			const result = checkEndpointPermission(
				{
					guildId: guild.id,
					member,
					guild,
					roles,
					botUserId: sessionState.botUser.id
				},
				'POST',
				'/unknown/endpoint'
			)

			expect(result.allowed).toBe(true)
		})
	})

	describe('createMockGuildMember factory function', () => {
		it('should create member with defaults', () => {
			const member = createMockGuildMember('guild123', 'user456')

			expect(member.guildId).toBe('guild123')
			expect(member.userId).toBe('user456')
			expect(member.roles).toEqual([])
			expect(member.deaf).toBe(false)
			expect(member.mute).toBe(false)
			expect(member.pending).toBe(false)
		})

		it('should create member with custom config', () => {
			const member = createMockGuildMember('guild123', 'user456', {
				nick: 'TestNick',
				roles: ['role1', 'role2'],
				deaf: true
			})

			expect(member.nick).toBe('TestNick')
			expect(member.roles).toEqual(['role1', 'role2'])
			expect(member.deaf).toBe(true)
		})
	})
})

// ============================================================================
// Permission Enforcement Tests
// ============================================================================
import {
	isServerOwner,
	getHighestRolePosition,
	canActOnMember,
	canManageRole,
	checkEndpointPermissionWithEnforcement
} from '../src/core/permissions.js'

describe('Permission Enforcement', () => {
	describe('Role hierarchy helpers', () => {
		let sessionState: MockServerState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should identify server owner', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			expect(isServerOwner(guild.ownerId, guild)).toBe(true)
			expect(isServerOwner('random-user', guild)).toBe(false)
		})

		it('should get highest role position for member', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			// Create roles with different positions
			const lowRole = sessionState.createGuildRole(guild.id, { name: 'Low', position: 1 })!
			const midRole = sessionState.createGuildRole(guild.id, { name: 'Mid', position: 5 })!
			const highRole = sessionState.createGuildRole(guild.id, { name: 'High', position: 10 })!

			// Create member with roles
			const testUserId = 'test-user-123'
			sessionState.createGuildMember(guild.id, testUserId)
			sessionState.addMemberRole(guild.id, testUserId, lowRole.id)
			sessionState.addMemberRole(guild.id, testUserId, midRole.id)
			sessionState.addMemberRole(guild.id, testUserId, highRole.id)

			const member = sessionState.getGuildMember(guild.id, testUserId)!
			const roles = sessionState.getGuildRoles(guild.id)

			expect(getHighestRolePosition(member, roles)).toBe(10)
		})

		it('should return 0 for member with no roles', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			const testUserId = 'test-user-123'
			sessionState.createGuildMember(guild.id, testUserId)

			const member = sessionState.getGuildMember(guild.id, testUserId)!
			const roles = sessionState.getGuildRoles(guild.id)

			expect(getHighestRolePosition(member, roles)).toBe(0)
		})

		it('should allow higher role to act on lower role member', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			// Create roles
			const modRole = sessionState.createGuildRole(guild.id, { name: 'Moderator', position: 10 })!
			const memberRole = sessionState.createGuildRole(guild.id, { name: 'Member', position: 1 })!

			// Create moderator
			const modUserId = 'mod-user'
			sessionState.createGuildMember(guild.id, modUserId)
			sessionState.addMemberRole(guild.id, modUserId, modRole.id)

			// Create regular member
			const regularUserId = 'regular-user'
			sessionState.createGuildMember(guild.id, regularUserId)
			sessionState.addMemberRole(guild.id, regularUserId, memberRole.id)

			const modMember = sessionState.getGuildMember(guild.id, modUserId)!
			const regularMember = sessionState.getGuildMember(guild.id, regularUserId)!
			const roles = sessionState.getGuildRoles(guild.id)

			expect(canActOnMember(modMember, regularMember, guild, roles)).toBe(true)
			expect(canActOnMember(regularMember, modMember, guild, roles)).toBe(false)
		})

		it('should not allow anyone to act on server owner', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			// Create admin role
			const adminRole = sessionState.createGuildRole(guild.id, {
				name: 'Admin',
				position: 100
			})!

			// Create admin user
			const adminUserId = 'admin-user'
			sessionState.createGuildMember(guild.id, adminUserId)
			sessionState.addMemberRole(guild.id, adminUserId, adminRole.id)

			// Create owner member
			const ownerMember = sessionState.getGuildMember(guild.id, guild.ownerId)!
			const adminMember = sessionState.getGuildMember(guild.id, adminUserId)!
			const roles = sessionState.getGuildRoles(guild.id)

			expect(canActOnMember(adminMember, ownerMember, guild, roles)).toBe(false)
		})

		it('should allow owner to act on anyone', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			// Create admin role
			const adminRole = sessionState.createGuildRole(guild.id, {
				name: 'Admin',
				position: 100
			})!

			// Create admin user
			const adminUserId = 'admin-user'
			sessionState.createGuildMember(guild.id, adminUserId)
			sessionState.addMemberRole(guild.id, adminUserId, adminRole.id)

			const ownerMember = sessionState.getGuildMember(guild.id, guild.ownerId)!
			const adminMember = sessionState.getGuildMember(guild.id, adminUserId)!
			const roles = sessionState.getGuildRoles(guild.id)

			expect(canActOnMember(ownerMember, adminMember, guild, roles)).toBe(true)
		})

		it('should allow member to manage roles below their highest role', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			// Create roles
			const adminRole = sessionState.createGuildRole(guild.id, { name: 'Admin', position: 10 })!
			const modRole = sessionState.createGuildRole(guild.id, { name: 'Mod', position: 5 })!
			const memberRole = sessionState.createGuildRole(guild.id, { name: 'Member', position: 1 })!

			// Create admin user
			const adminUserId = 'admin-user'
			sessionState.createGuildMember(guild.id, adminUserId)
			sessionState.addMemberRole(guild.id, adminUserId, adminRole.id)

			const adminMember = sessionState.getGuildMember(guild.id, adminUserId)!
			const roles = sessionState.getGuildRoles(guild.id)

			expect(canManageRole(adminMember, modRole, guild, roles)).toBe(true)
			expect(canManageRole(adminMember, memberRole, guild, roles)).toBe(true)
			expect(canManageRole(adminMember, adminRole, guild, roles)).toBe(false) // Can't manage own highest role
		})

		it('should allow owner to manage all roles', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			// Create a role at position 100
			const superRole = sessionState.createGuildRole(guild.id, {
				name: 'Super',
				position: 100
			})!

			const ownerMember = sessionState.getGuildMember(guild.id, guild.ownerId)!
			const roles = sessionState.getGuildRoles(guild.id)

			expect(canManageRole(ownerMember, superRole, guild, roles)).toBe(true)
		})
	})

	describe('Enforcement with levels', () => {
		let sessionState: MockServerState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should allow all actions with "none" enforcement level', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channel = Array.from(sessionState.channels.values())[0]

			// User with NO permissions
			const testUserId = 'test-user-123'
			sessionState.createGuildMember(guild.id, testUserId)
			sessionState.updateGuildRole(guild.id, guild.id, { permissions: '0' })

			const member = sessionState.getGuildMember(guild.id, testUserId)!
			const roles = sessionState.getGuildRoles(guild.id)

			const result = checkEndpointPermissionWithEnforcement(
				{
					guildId: guild.id,
					channelId: channel.id,
					member,
					channel,
					guild,
					roles,
					botUserId: testUserId
				},
				'POST',
				'/channels/123/messages',
				{ level: 'none' }
			)

			expect(result.allowed).toBe(true)
		})

		it('should check basic permissions with "basic" enforcement level', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channel = Array.from(sessionState.channels.values())[0]

			// User with NO permissions
			const testUserId = 'test-user-123'
			sessionState.createGuildMember(guild.id, testUserId)
			sessionState.updateGuildRole(guild.id, guild.id, { permissions: '0' })

			const member = sessionState.getGuildMember(guild.id, testUserId)!
			const roles = sessionState.getGuildRoles(guild.id)

			const result = checkEndpointPermissionWithEnforcement(
				{
					guildId: guild.id,
					channelId: channel.id,
					member,
					channel,
					guild,
					roles,
					botUserId: testUserId
				},
				'POST',
				'/channels/123/messages',
				{ level: 'basic' }
			)

			expect(result.allowed).toBe(false)
			expect(result.code).toBe(50013) // MISSING_PERMISSIONS
		})

		it('should allow owner to bypass all checks', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channel = Array.from(sessionState.channels.values())[0]

			// Owner with no explicit permissions
			sessionState.updateGuildRole(guild.id, guild.id, { permissions: '0' })

			const member = sessionState.getGuildMember(guild.id, guild.ownerId)!
			const roles = sessionState.getGuildRoles(guild.id)

			const result = checkEndpointPermissionWithEnforcement(
				{
					guildId: guild.id,
					channelId: channel.id,
					member,
					channel,
					guild,
					roles,
					botUserId: guild.ownerId
				},
				'POST',
				'/guilds/123/roles',
				{ level: 'strict' }
			)

			expect(result.allowed).toBe(true)
		})

		it('should check contextual permissions for message edit with "strict" level', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channel = Array.from(sessionState.channels.values())[0]

			// User with ViewChannel but not the message author
			const testUserId = 'test-user-123'
			sessionState.createGuildMember(guild.id, testUserId)
			sessionState.updateGuildRole(guild.id, guild.id, {
				permissions: PermissionFlagsBits.ViewChannel.toString()
			})

			const member = sessionState.getGuildMember(guild.id, testUserId)!
			const roles = sessionState.getGuildRoles(guild.id)

			// Trying to edit someone else's message
			const result = checkEndpointPermissionWithEnforcement(
				{
					guildId: guild.id,
					channelId: channel.id,
					member,
					channel,
					guild,
					roles,
					botUserId: testUserId
				},
				'PATCH',
				'/channels/123/messages/456',
				{
					level: 'strict',
					messageAuthorId: 'other-user-789' // Different author
				}
			)

			expect(result.allowed).toBe(false)
			expect(result.code).toBe(50005) // CANNOT_EDIT_OTHER_USER_MESSAGE
		})

		it('should allow editing own message with "strict" level', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channel = Array.from(sessionState.channels.values())[0]

			// User with ViewChannel
			const testUserId = 'test-user-123'
			sessionState.createGuildMember(guild.id, testUserId)
			sessionState.updateGuildRole(guild.id, guild.id, {
				permissions: PermissionFlagsBits.ViewChannel.toString()
			})

			const member = sessionState.getGuildMember(guild.id, testUserId)!
			const roles = sessionState.getGuildRoles(guild.id)

			// Trying to edit own message
			const result = checkEndpointPermissionWithEnforcement(
				{
					guildId: guild.id,
					channelId: channel.id,
					member,
					channel,
					guild,
					roles,
					botUserId: testUserId
				},
				'PATCH',
				'/channels/123/messages/456',
				{
					level: 'strict',
					messageAuthorId: testUserId // Same as bot user
				}
			)

			expect(result.allowed).toBe(true)
		})

		it('should require ManageMessages to delete others messages with "strict" level', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channel = Array.from(sessionState.channels.values())[0]

			// User with only ViewChannel
			const testUserId = 'test-user-123'
			sessionState.createGuildMember(guild.id, testUserId)
			sessionState.updateGuildRole(guild.id, guild.id, {
				permissions: PermissionFlagsBits.ViewChannel.toString()
			})

			const member = sessionState.getGuildMember(guild.id, testUserId)!
			const roles = sessionState.getGuildRoles(guild.id)

			// Trying to delete someone else's message
			const result = checkEndpointPermissionWithEnforcement(
				{
					guildId: guild.id,
					channelId: channel.id,
					member,
					channel,
					guild,
					roles,
					botUserId: testUserId
				},
				'DELETE',
				'/channels/123/messages/456',
				{
					level: 'strict',
					messageAuthorId: 'other-user-789'
				}
			)

			expect(result.allowed).toBe(false)
			expect(result.code).toBe(50013) // MISSING_PERMISSIONS
		})

		it('should allow deleting others messages with ManageMessages', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channel = Array.from(sessionState.channels.values())[0]

			// User with ViewChannel and ManageMessages
			const testUserId = 'test-user-123'
			sessionState.createGuildMember(guild.id, testUserId)
			sessionState.updateGuildRole(guild.id, guild.id, {
				permissions: (PermissionFlagsBits.ViewChannel | PermissionFlagsBits.ManageMessages).toString()
			})

			const member = sessionState.getGuildMember(guild.id, testUserId)!
			const roles = sessionState.getGuildRoles(guild.id)

			const result = checkEndpointPermissionWithEnforcement(
				{
					guildId: guild.id,
					channelId: channel.id,
					member,
					channel,
					guild,
					roles,
					botUserId: testUserId
				},
				'DELETE',
				'/channels/123/messages/456',
				{
					level: 'strict',
					messageAuthorId: 'other-user-789'
				}
			)

			expect(result.allowed).toBe(true)
		})

		it('should require ManageThreads to delete thread channels with "strict" level', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			// Create a thread channel (type 11 = public thread)
			const threadChannel = {
				id: 'thread-123',
				guildId: guild.id,
				parentId: Array.from(sessionState.channels.values())[0].id,
				name: 'Test Thread',
				type: 11 // PUBLIC_THREAD
			}
			sessionState.channels.set(threadChannel.id, threadChannel as any)

			// User with ManageChannels but NOT ManageThreads
			const testUserId = 'test-user-123'
			sessionState.createGuildMember(guild.id, testUserId)
			sessionState.updateGuildRole(guild.id, guild.id, {
				permissions: PermissionFlagsBits.ManageChannels.toString()
			})

			const member = sessionState.getGuildMember(guild.id, testUserId)!
			const roles = sessionState.getGuildRoles(guild.id)

			const result = checkEndpointPermissionWithEnforcement(
				{
					guildId: guild.id,
					channelId: threadChannel.id,
					member,
					channel: threadChannel as any,
					guild,
					roles,
					botUserId: testUserId
				},
				'DELETE',
				`/channels/${threadChannel.id}`,
				{ level: 'strict' }
			)

			expect(result.allowed).toBe(false)
			expect(result.code).toBe(50013)
		})

		it('should allow deleting thread with ManageThreads permission', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			// Create a thread channel
			const threadChannel = {
				id: 'thread-123',
				guildId: guild.id,
				parentId: Array.from(sessionState.channels.values())[0].id,
				name: 'Test Thread',
				type: 11 // PUBLIC_THREAD
			}
			sessionState.channels.set(threadChannel.id, threadChannel as any)

			// User with ManageThreads
			const testUserId = 'test-user-123'
			sessionState.createGuildMember(guild.id, testUserId)
			sessionState.updateGuildRole(guild.id, guild.id, {
				permissions: (PermissionFlagsBits.ManageChannels | PermissionFlagsBits.ManageThreads).toString()
			})

			const member = sessionState.getGuildMember(guild.id, testUserId)!
			const roles = sessionState.getGuildRoles(guild.id)

			const result = checkEndpointPermissionWithEnforcement(
				{
					guildId: guild.id,
					channelId: threadChannel.id,
					member,
					channel: threadChannel as any,
					guild,
					roles,
					botUserId: testUserId
				},
				'DELETE',
				`/channels/${threadChannel.id}`,
				{ level: 'strict' }
			)

			expect(result.allowed).toBe(true)
		})

		it('should only allow owner to delete guild with "strict" level', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channel = Array.from(sessionState.channels.values())[0]

			// Non-owner user with all permissions
			const testUserId = 'test-user-123'
			sessionState.createGuildMember(guild.id, testUserId)
			sessionState.updateGuildRole(guild.id, guild.id, {
				permissions: PermissionFlagsBits.Administrator.toString()
			})

			const member = sessionState.getGuildMember(guild.id, testUserId)!
			const roles = sessionState.getGuildRoles(guild.id)

			const result = checkEndpointPermissionWithEnforcement(
				{
					guildId: guild.id,
					channelId: channel.id,
					member,
					channel,
					guild,
					roles,
					botUserId: testUserId
				},
				'DELETE',
				`/guilds/${guild.id}`,
				{ level: 'strict' }
			)

			expect(result.allowed).toBe(false)
			expect(result.code).toBe(50013)
		})

		it('should allow owner to delete guild', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channel = Array.from(sessionState.channels.values())[0]

			const member = sessionState.getGuildMember(guild.id, guild.ownerId)!
			const roles = sessionState.getGuildRoles(guild.id)

			const result = checkEndpointPermissionWithEnforcement(
				{
					guildId: guild.id,
					channelId: channel.id,
					member,
					channel,
					guild,
					roles,
					botUserId: guild.ownerId
				},
				'DELETE',
				`/guilds/${guild.id}`,
				{ level: 'strict' }
			)

			expect(result.allowed).toBe(true)
		})

		it('should require MoveMembers to change voice channel_id', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channel = Array.from(sessionState.channels.values())[0]

			// User without MoveMembers
			const testUserId = 'test-user-123'
			sessionState.createGuildMember(guild.id, testUserId)
			sessionState.updateGuildRole(guild.id, guild.id, {
				permissions: '0'
			})

			const member = sessionState.getGuildMember(guild.id, testUserId)!
			const roles = sessionState.getGuildRoles(guild.id)

			const result = checkEndpointPermissionWithEnforcement(
				{
					guildId: guild.id,
					channelId: channel.id,
					member,
					channel,
					guild,
					roles,
					botUserId: testUserId
				},
				'PATCH',
				`/guilds/${guild.id}/members/${testUserId}`,
				{
					level: 'strict',
					body: { channel_id: 'voice-channel-456' }
				}
			)

			expect(result.allowed).toBe(false)
			expect(result.message).toContain('MoveMembers')
		})

		it('should require MuteMembers to mute a member', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channel = Array.from(sessionState.channels.values())[0]

			// User without MuteMembers
			const testUserId = 'test-user-123'
			sessionState.createGuildMember(guild.id, testUserId)
			sessionState.updateGuildRole(guild.id, guild.id, {
				permissions: '0'
			})

			const member = sessionState.getGuildMember(guild.id, testUserId)!
			const roles = sessionState.getGuildRoles(guild.id)

			const result = checkEndpointPermissionWithEnforcement(
				{
					guildId: guild.id,
					channelId: channel.id,
					member,
					channel,
					guild,
					roles,
					botUserId: testUserId
				},
				'PATCH',
				`/guilds/${guild.id}/members/${testUserId}`,
				{
					level: 'strict',
					body: { mute: true }
				}
			)

			expect(result.allowed).toBe(false)
			expect(result.message).toContain('MuteMembers')
		})

		it('should require DeafenMembers to deafen a member', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channel = Array.from(sessionState.channels.values())[0]

			// User without DeafenMembers
			const testUserId = 'test-user-123'
			sessionState.createGuildMember(guild.id, testUserId)
			sessionState.updateGuildRole(guild.id, guild.id, {
				permissions: '0'
			})

			const member = sessionState.getGuildMember(guild.id, testUserId)!
			const roles = sessionState.getGuildRoles(guild.id)

			const result = checkEndpointPermissionWithEnforcement(
				{
					guildId: guild.id,
					channelId: channel.id,
					member,
					channel,
					guild,
					roles,
					botUserId: testUserId
				},
				'PATCH',
				`/guilds/${guild.id}/members/${testUserId}`,
				{
					level: 'strict',
					body: { deaf: true }
				}
			)

			expect(result.allowed).toBe(false)
			expect(result.message).toContain('DeafenMembers')
		})

		it('should require SendMessagesInThreads for posting in thread channels', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			// Create a thread channel (type 11 = public thread)
			const threadChannel = {
				id: 'thread-123',
				guildId: guild.id,
				parentId: Array.from(sessionState.channels.values())[0].id,
				name: 'Test Thread',
				type: 11 // PUBLIC_THREAD
			}
			sessionState.channels.set(threadChannel.id, threadChannel as any)

			// User with SendMessages but NOT SendMessagesInThreads
			const testUserId = 'test-user-123'
			sessionState.createGuildMember(guild.id, testUserId)
			sessionState.updateGuildRole(guild.id, guild.id, {
				permissions: (PermissionFlagsBits.SendMessages | PermissionFlagsBits.ViewChannel).toString()
			})

			const member = sessionState.getGuildMember(guild.id, testUserId)!
			const roles = sessionState.getGuildRoles(guild.id)

			const result = checkEndpointPermissionWithEnforcement(
				{
					guildId: guild.id,
					channelId: threadChannel.id,
					member,
					channel: threadChannel as any,
					guild,
					roles,
					botUserId: testUserId
				},
				'POST',
				`/channels/${threadChannel.id}/messages`,
				{ level: 'strict' }
			)

			expect(result.allowed).toBe(false)
			expect(result.message).toContain('SendMessagesInThreads')
		})

		it('should allow posting in thread with SendMessagesInThreads permission', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			// Create a thread channel
			const threadChannel = {
				id: 'thread-123',
				guildId: guild.id,
				parentId: Array.from(sessionState.channels.values())[0].id,
				name: 'Test Thread',
				type: 11 // PUBLIC_THREAD
			}
			sessionState.channels.set(threadChannel.id, threadChannel as any)

			// User with SendMessagesInThreads
			const testUserId = 'test-user-123'
			sessionState.createGuildMember(guild.id, testUserId)
			sessionState.updateGuildRole(guild.id, guild.id, {
				permissions: (
					PermissionFlagsBits.SendMessages |
					PermissionFlagsBits.ViewChannel |
					PermissionFlagsBits.SendMessagesInThreads
				).toString()
			})

			const member = sessionState.getGuildMember(guild.id, testUserId)!
			const roles = sessionState.getGuildRoles(guild.id)

			const result = checkEndpointPermissionWithEnforcement(
				{
					guildId: guild.id,
					channelId: threadChannel.id,
					member,
					channel: threadChannel as any,
					guild,
					roles,
					botUserId: testUserId
				},
				'POST',
				`/channels/${threadChannel.id}/messages`,
				{ level: 'strict' }
			)

			expect(result.allowed).toBe(true)
		})
	})
})
