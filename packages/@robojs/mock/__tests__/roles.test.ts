/**
 * Roles & Permissions Tests
 * Tests for Discord role management and state operations
 */
import { createSessionState, createDefaultGuildWithChannel, MockServerState, createMockRole } from '../src/session/state.js'
import { mockRoleToAPIRole, buildGuildRoleCreatePayload, buildGuildRoleUpdatePayload, buildGuildRoleDeletePayload } from '../src/discord/payloads.js'
import type { MockRoleConfig } from '../src/types/index.js'
import { RoleLimits } from '../src/types/index.js'

describe('Roles', () => {
	describe('Role creation', () => {
		let sessionState: MockServerState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should create a guild role with default values', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			const role = sessionState.createGuildRole(guild.id)

			expect(role).toBeDefined()
			expect(role?.name).toBe('new role')
			expect(role?.color).toBe(0)
			expect(role?.hoist).toBe(false)
			expect(role?.mentionable).toBe(false)
			expect(role?.position).toBeGreaterThan(0)
			expect(role?.guildId).toBe(guild.id)
		})

		it('should create a guild role with custom config', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			const config: MockRoleConfig = {
				name: 'Admin',
				color: 0xFF0000,
				hoist: true,
				mentionable: true,
				permissions: '8' // Administrator
			}

			const role = sessionState.createGuildRole(guild.id, config)

			expect(role?.name).toBe('Admin')
			expect(role?.color).toBe(0xFF0000)
			expect(role?.hoist).toBe(true)
			expect(role?.mentionable).toBe(true)
			expect(role?.permissions).toBe('8')
		})

		it('should add role to guild roles array', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const initialRoleCount = guild.roles.length

			const role = sessionState.createGuildRole(guild.id, { name: 'TestRole' })

			expect(guild.roles).toHaveLength(initialRoleCount + 1)
			expect(guild.roles).toContain(role?.id)
		})

		it('should store role in session state', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			const role = sessionState.createGuildRole(guild.id, { name: 'StoredRole' })

			const retrieved = sessionState.getRole(role!.id)
			expect(retrieved).toBeDefined()
			expect(retrieved?.id).toBe(role?.id)
			expect(retrieved?.name).toBe('StoredRole')
		})

		it('should create @everyone role on guild creation', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			const everyoneRole = sessionState.getGuildRole(guild.id, guild.id)

			expect(everyoneRole).toBeDefined()
			expect(everyoneRole?.id).toBe(guild.id)
			expect(everyoneRole?.name).toBe('@everyone')
			expect(everyoneRole?.position).toBe(0)
		})

		it('should reject role name shorter than minimum', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			const role = sessionState.createGuildRole(guild.id, { name: '' })

			expect(role).toBeNull()
		})

		it('should reject role name exceeding maximum length', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const longName = 'a'.repeat(RoleLimits.MAX_NAME_LENGTH + 1)

			const role = sessionState.createGuildRole(guild.id, { name: longName })

			expect(role).toBeNull()
		})

		it('should return null when guild does not exist', () => {
			const role = sessionState.createGuildRole('nonexistent_guild_id', { name: 'test' })

			expect(role).toBeNull()
		})

		it('should create role with icon', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			const role = sessionState.createGuildRole(guild.id, {
				name: 'IconRole',
				icon: 'icon_hash_123'
			})

			expect(role?.icon).toBe('icon_hash_123')
		})

		it('should create role with unicode emoji', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			const role = sessionState.createGuildRole(guild.id, {
				name: 'EmojiRole',
				unicodeEmoji: '🔥'
			})

			expect(role?.unicodeEmoji).toBe('🔥')
		})
	})

	describe('Role retrieval', () => {
		let sessionState: MockServerState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should get all roles for a guild', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			sessionState.createGuildRole(guild.id, { name: 'Role1' })
			sessionState.createGuildRole(guild.id, { name: 'Role2' })
			sessionState.createGuildRole(guild.id, { name: 'Role3' })

			const roles = sessionState.getGuildRoles(guild.id)
			// +1 for @everyone role created by default
			expect(roles.length).toBeGreaterThanOrEqual(3)
			const roleNames = roles.map((r) => r.name)
			expect(roleNames).toContain('Role1')
			expect(roleNames).toContain('Role2')
			expect(roleNames).toContain('Role3')
		})

		it('should return roles with their positions', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			sessionState.createGuildRole(guild.id, { name: 'High', position: 10 })
			sessionState.createGuildRole(guild.id, { name: 'Low', position: 1 })
			sessionState.createGuildRole(guild.id, { name: 'Mid', position: 5 })

			const roles = sessionState.getGuildRoles(guild.id)
			const highRole = roles.find((r) => r.name === 'High')
			const lowRole = roles.find((r) => r.name === 'Low')
			const midRole = roles.find((r) => r.name === 'Mid')

			expect(highRole?.position).toBe(10)
			expect(lowRole?.position).toBe(1)
			expect(midRole?.position).toBe(5)
		})

		it('should return empty array for guild with no custom roles', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const roles = sessionState.getGuildRoles(guild.id)
			// Should only have @everyone
			expect(roles.some((r) => r.name === '@everyone')).toBe(true)
		})

		it('should return empty array for nonexistent guild', () => {
			const roles = sessionState.getGuildRoles('nonexistent_guild')
			expect(roles).toHaveLength(0)
		})

		it('should return undefined for nonexistent role', () => {
			const role = sessionState.getRole('nonexistent_role')
			expect(role).toBeUndefined()
		})

		it('should get role by guild and role ID', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const created = sessionState.createGuildRole(guild.id, { name: 'SpecificRole' })

			const role = sessionState.getGuildRole(guild.id, created!.id)

			expect(role).toBeDefined()
			expect(role?.name).toBe('SpecificRole')
		})
	})

	describe('Role updates', () => {
		let sessionState: MockServerState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should update role name', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const role = sessionState.createGuildRole(guild.id, { name: 'OldName' })

			const updated = sessionState.updateGuildRole(guild.id, role!.id, { name: 'NewName' })

			expect(updated?.name).toBe('NewName')
			expect(sessionState.getRole(role!.id)?.name).toBe('NewName')
		})

		it('should update role color', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const role = sessionState.createGuildRole(guild.id, { name: 'ColorRole', color: 0 })

			const updated = sessionState.updateGuildRole(guild.id, role!.id, { color: 0x00FF00 })

			expect(updated?.color).toBe(0x00FF00)
		})

		it('should update role permissions', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const role = sessionState.createGuildRole(guild.id, { name: 'PermRole', permissions: '0' })

			const updated = sessionState.updateGuildRole(guild.id, role!.id, { permissions: '8' })

			expect(updated?.permissions).toBe('8')
		})

		it('should update role hoist', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const role = sessionState.createGuildRole(guild.id, { name: 'HoistRole', hoist: false })

			const updated = sessionState.updateGuildRole(guild.id, role!.id, { hoist: true })

			expect(updated?.hoist).toBe(true)
		})

		it('should update role mentionable', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const role = sessionState.createGuildRole(guild.id, { name: 'MentionRole', mentionable: false })

			const updated = sessionState.updateGuildRole(guild.id, role!.id, { mentionable: true })

			expect(updated?.mentionable).toBe(true)
		})

		it('should reject update with invalid name length', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const role = sessionState.createGuildRole(guild.id, { name: 'ValidName' })

			const updated = sessionState.updateGuildRole(guild.id, role!.id, { name: '' })

			expect(updated).toBeNull()
			expect(sessionState.getRole(role!.id)?.name).toBe('ValidName')
		})

		it('should return null when updating nonexistent role', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const updated = sessionState.updateGuildRole(guild.id, 'nonexistent_role', { name: 'NewName' })
			expect(updated).toBeNull()
		})
	})

	describe('Role position updates', () => {
		let sessionState: MockServerState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should update multiple role positions', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const role1 = sessionState.createGuildRole(guild.id, { name: 'Role1' })
			const role2 = sessionState.createGuildRole(guild.id, { name: 'Role2' })
			const role3 = sessionState.createGuildRole(guild.id, { name: 'Role3' })

			sessionState.updateGuildRolePositions(guild.id, [
				{ id: role1!.id, position: 5 },
				{ id: role2!.id, position: 10 },
				{ id: role3!.id, position: 3 }
			])

			expect(sessionState.getRole(role1!.id)?.position).toBe(5)
			expect(sessionState.getRole(role2!.id)?.position).toBe(10)
			expect(sessionState.getRole(role3!.id)?.position).toBe(3)
		})

		it('should not move @everyone role', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			sessionState.updateGuildRolePositions(guild.id, [{ id: guild.id, position: 100 }])

			expect(sessionState.getRole(guild.id)?.position).toBe(0)
		})
	})

	describe('Role deletion', () => {
		let sessionState: MockServerState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should delete a guild role', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const role = sessionState.createGuildRole(guild.id, { name: 'ToDelete' })

			expect(sessionState.getRole(role!.id)).toBeDefined()

			const deleted = sessionState.deleteGuildRole(guild.id, role!.id)

			expect(deleted).toBe(true)
			expect(sessionState.getRole(role!.id)).toBeUndefined()
		})

		it('should remove role from guild roles array', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const role = sessionState.createGuildRole(guild.id, { name: 'ToDelete' })

			expect(guild.roles).toContain(role?.id)

			sessionState.deleteGuildRole(guild.id, role!.id)

			expect(guild.roles).not.toContain(role?.id)
		})

		it('should not delete @everyone role', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			const deleted = sessionState.deleteGuildRole(guild.id, guild.id)

			expect(deleted).toBe(false)
			expect(sessionState.getRole(guild.id)).toBeDefined()
		})

		it('should return false when deleting nonexistent role', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const deleted = sessionState.deleteGuildRole(guild.id, 'nonexistent_role')
			expect(deleted).toBe(false)
		})

		it('should remove role from members when deleted', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const role = sessionState.createGuildRole(guild.id, { name: 'MemberRole' })

			// Add role to a member
			sessionState.addMemberRole(guild.id, sessionState.botUser.id, role!.id)
			const memberBefore = sessionState.getGuildMember(guild.id, sessionState.botUser.id)
			expect(memberBefore?.roles).toContain(role?.id)

			// Delete the role
			sessionState.deleteGuildRole(guild.id, role!.id)

			// Member should no longer have the role
			const memberAfter = sessionState.getGuildMember(guild.id, sessionState.botUser.id)
			expect(memberAfter?.roles).not.toContain(role?.id)
		})
	})

	describe('Guild member role management', () => {
		let sessionState: MockServerState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should add role to member', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const role = sessionState.createGuildRole(guild.id, { name: 'TestRole' })

			const result = sessionState.addMemberRole(guild.id, sessionState.botUser.id, role!.id)

			expect(result).toBe(true)
			const member = sessionState.getGuildMember(guild.id, sessionState.botUser.id)
			expect(member?.roles).toContain(role?.id)
		})

		it('should not add duplicate role to member', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const role = sessionState.createGuildRole(guild.id, { name: 'TestRole' })

			sessionState.addMemberRole(guild.id, sessionState.botUser.id, role!.id)
			sessionState.addMemberRole(guild.id, sessionState.botUser.id, role!.id)

			const member = sessionState.getGuildMember(guild.id, sessionState.botUser.id)
			const roleCount = member?.roles.filter((r) => r === role?.id).length
			expect(roleCount).toBe(1)
		})

		it('should remove role from member', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const role = sessionState.createGuildRole(guild.id, { name: 'TestRole' })

			sessionState.addMemberRole(guild.id, sessionState.botUser.id, role!.id)
			const result = sessionState.removeMemberRole(guild.id, sessionState.botUser.id, role!.id)

			expect(result).toBe(true)
			const member = sessionState.getGuildMember(guild.id, sessionState.botUser.id)
			expect(member?.roles).not.toContain(role?.id)
		})

		it('should return false when removing role member does not have', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const role = sessionState.createGuildRole(guild.id, { name: 'TestRole' })

			const result = sessionState.removeMemberRole(guild.id, sessionState.botUser.id, role!.id)

			expect(result).toBe(false)
		})
	})

	describe('Role serialization', () => {
		let sessionState: MockServerState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should serialize role to API format', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const role = sessionState.createGuildRole(guild.id, {
				name: 'SerializeTest',
				color: 0xFF0000,
				hoist: true,
				mentionable: true,
				permissions: '8'
			})

			const apiRole = mockRoleToAPIRole(role!)

			expect(apiRole.id).toBe(role?.id)
			expect(apiRole.name).toBe('SerializeTest')
			expect(apiRole.color).toBe(0xFF0000)
			expect(apiRole.hoist).toBe(true)
			expect(apiRole.mentionable).toBe(true)
			expect(apiRole.permissions).toBe('8')
		})
	})

	describe('Role event payloads', () => {
		let sessionState: MockServerState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should build GUILD_ROLE_CREATE payload', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const role = sessionState.createGuildRole(guild.id, { name: 'NewRole' })

			const payload = buildGuildRoleCreatePayload({
				guildId: guild.id,
				role: role!,
				sequence: 1
			})

			expect(payload.op).toBe(0) // DISPATCH
			expect(payload.t).toBe('GUILD_ROLE_CREATE')
			expect(payload.s).toBe(1)

			const data = payload.d as { guild_id: string; role: { name: string } }
			expect(data.guild_id).toBe(guild.id)
			expect(data.role.name).toBe('NewRole')
		})

		it('should build GUILD_ROLE_UPDATE payload', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const role = sessionState.createGuildRole(guild.id, { name: 'UpdatedRole' })

			const payload = buildGuildRoleUpdatePayload({
				guildId: guild.id,
				role: role!,
				sequence: 2
			})

			expect(payload.op).toBe(0)
			expect(payload.t).toBe('GUILD_ROLE_UPDATE')
			expect(payload.s).toBe(2)

			const data = payload.d as { guild_id: string; role: { name: string } }
			expect(data.guild_id).toBe(guild.id)
			expect(data.role.name).toBe('UpdatedRole')
		})

		it('should build GUILD_ROLE_DELETE payload', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const role = sessionState.createGuildRole(guild.id, { name: 'DeletedRole' })

			const payload = buildGuildRoleDeletePayload({
				guildId: guild.id,
				roleId: role!.id,
				sequence: 3
			})

			expect(payload.op).toBe(0)
			expect(payload.t).toBe('GUILD_ROLE_DELETE')
			expect(payload.s).toBe(3)

			const data = payload.d as { guild_id: string; role_id: string }
			expect(data.guild_id).toBe(guild.id)
			expect(data.role_id).toBe(role!.id)
		})
	})

	describe('Guild role limit', () => {
		let sessionState: MockServerState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should track role count correctly', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			for (let i = 0; i < 10; i++) {
				sessionState.createGuildRole(guild.id, { name: `Role${i}` })
			}

			const roles = sessionState.getGuildRoles(guild.id)
			expect(roles.length).toBeGreaterThanOrEqual(10)
		})
	})

	describe('State reset', () => {
		let sessionState: MockServerState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should clear roles on reset', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			sessionState.createGuildRole(guild.id, { name: 'Role1' })
			sessionState.createGuildRole(guild.id, { name: 'Role2' })

			expect(sessionState.roles.size).toBeGreaterThan(0)

			sessionState.reset()

			expect(sessionState.roles.size).toBe(0)
		})

		it('should clear guild members on reset', () => {
			createDefaultGuildWithChannel(sessionState)

			expect(sessionState.guildMembers.size).toBeGreaterThan(0)

			sessionState.reset()

			expect(sessionState.guildMembers.size).toBe(0)
		})
	})

	describe('createMockRole factory function', () => {
		it('should create role with defaults', () => {
			const role = createMockRole('guild123')

			expect(role.guildId).toBe('guild123')
			expect(role.name).toBe('new role')
			expect(role.color).toBe(0)
			expect(role.hoist).toBe(false)
			expect(role.position).toBe(1) // Default position is 1 (0 is reserved for @everyone)
			expect(role.permissions).toBe('0')
			expect(role.managed).toBe(false)
			expect(role.mentionable).toBe(false)
		})

		it('should create role with custom config', () => {
			const role = createMockRole('guild123', {
				name: 'CustomRole',
				color: 0x00FF00,
				hoist: true,
				position: 5,
				permissions: '8'
			})

			expect(role.name).toBe('CustomRole')
			expect(role.color).toBe(0x00FF00)
			expect(role.hoist).toBe(true)
			expect(role.position).toBe(5)
			expect(role.permissions).toBe('8')
		})
	})
})
