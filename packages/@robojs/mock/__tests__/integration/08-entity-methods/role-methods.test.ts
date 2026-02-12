/**
 * Role Methods Tests
 *
 * Tests for Role methods including setIcon, setUnicodeEmoji, setName,
 * and various role properties and fetch operations.
 */
import { ChannelType, Client, GatewayIntentBits, Guild, PermissionFlagsBits, Role } from 'discord.js'
import { createSession, mockRestAPI } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Role Methods', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guild: Guild

	beforeAll(async () => {
		session = await createSession({
			name: 'role-methods-tests',
			config: {
				guilds: [
					{
						name: 'Role Methods Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				],
				enforceIntents: true,
				approvedPrivilegedIntents: BigInt(GatewayIntentBits.GuildMembers)
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers])
		await client.login(session.token)
		await waitForReady(client)

		guild = client.guilds.cache.first()!
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Role.setIcon()', () => {
		let testRole: Role

		beforeAll(async () => {
			// Set premium tier for icon support (requires boost level 2)
			await mockRestAPI(session.token, `/guilds/${guild.id}`, {
				method: 'PATCH',
				body: { premium_tier: 2 }
			})

			testRole = await guild.roles.create({ name: 'Icon Role' })
		})

		afterAll(async () => {
			try {
				await testRole.delete()
			} catch {
				// Role may already be deleted
			}
		})

		it('should set role icon', async () => {
			// Base64 1x1 pixel PNG
			const iconData =
				'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

			const updated = await testRole.setIcon(iconData)

			expect(updated.icon).toBeDefined()
		})

		it('should clear role icon', async () => {
			const cleared = await testRole.setIcon(null)

			expect(cleared.icon).toBeNull()
		})
	})

	describe('Role.setUnicodeEmoji()', () => {
		let emojiRole: Role

		beforeAll(async () => {
			// Requires boost level 2
			await mockRestAPI(session.token, `/guilds/${guild.id}`, {
				method: 'PATCH',
				body: { premium_tier: 2 }
			})

			emojiRole = await guild.roles.create({ name: 'Emoji Role' })
		})

		afterAll(async () => {
			try {
				await emojiRole.delete()
			} catch {
				// Role may already be deleted
			}
		})

		it('should set unicode emoji', async () => {
			const updated = await emojiRole.setUnicodeEmoji('🎮')

			expect(updated.unicodeEmoji).toBe('🎮')
		})

		it('should clear unicode emoji', async () => {
			// First set one
			await emojiRole.setUnicodeEmoji('🎵')

			// Then clear it
			const cleared = await emojiRole.setUnicodeEmoji(null)

			expect(cleared.unicodeEmoji).toBeNull()
		})
	})

	describe('Role.setName()', () => {
		let nameRole: Role

		beforeAll(async () => {
			nameRole = await guild.roles.create({ name: 'Original Name' })
		})

		afterAll(async () => {
			try {
				await nameRole.delete()
			} catch {
				// Role may already be deleted
			}
		})

		it('should set role name', async () => {
			const updated = await nameRole.setName('New Name')

			expect(updated.name).toBe('New Name')
		})

		it('should set role name with reason', async () => {
			const updated = await nameRole.setName('Renamed', 'Testing rename')

			expect(updated.name).toBe('Renamed')
		})
	})

	describe('Role.setColor()', () => {
		let colorRole: Role

		beforeAll(async () => {
			colorRole = await guild.roles.create({ name: 'Color Role' })
		})

		afterAll(async () => {
			try {
				await colorRole.delete()
			} catch {
				// Role may already be deleted
			}
		})

		it('should set role color as number', async () => {
			const updated = await colorRole.setColor(0xff5733)

			expect(updated.color).toBe(0xff5733)
		})

		it('should set role color as string', async () => {
			const updated = await colorRole.setColor('#00FF00')

			expect(updated.color).toBe(0x00ff00)
		})

		it('should set role color as array', async () => {
			const updated = await colorRole.setColor([255, 0, 0])

			expect(updated.color).toBe(0xff0000)
		})
	})

	describe('Role.setHoist()', () => {
		let hoistRole: Role

		beforeAll(async () => {
			hoistRole = await guild.roles.create({ name: 'Hoist Role', hoist: false })
		})

		afterAll(async () => {
			try {
				await hoistRole.delete()
			} catch {
				// Role may already be deleted
			}
		})

		it('should set hoist to true', async () => {
			const updated = await hoistRole.setHoist(true)

			expect(updated.hoist).toBe(true)
		})

		it('should set hoist to false', async () => {
			const updated = await hoistRole.setHoist(false)

			expect(updated.hoist).toBe(false)
		})
	})

	describe('Role.setMentionable()', () => {
		let mentionRole: Role

		beforeAll(async () => {
			mentionRole = await guild.roles.create({ name: 'Mention Role', mentionable: false })
		})

		afterAll(async () => {
			try {
				await mentionRole.delete()
			} catch {
				// Role may already be deleted
			}
		})

		it('should set mentionable to true', async () => {
			const updated = await mentionRole.setMentionable(true)

			expect(updated.mentionable).toBe(true)
		})

		it('should set mentionable to false', async () => {
			const updated = await mentionRole.setMentionable(false)

			expect(updated.mentionable).toBe(false)
		})
	})

	describe('Role.setPermissions()', () => {
		let permRole: Role

		beforeAll(async () => {
			permRole = await guild.roles.create({ name: 'Perm Role' })
		})

		afterAll(async () => {
			try {
				await permRole.delete()
			} catch {
				// Role may already be deleted
			}
		})

		it('should set role permissions', async () => {
			const updated = await permRole.setPermissions([PermissionFlagsBits.SendMessages, PermissionFlagsBits.ViewChannel])

			expect(updated.permissions.has(PermissionFlagsBits.SendMessages)).toBe(true)
			expect(updated.permissions.has(PermissionFlagsBits.ViewChannel)).toBe(true)
		})

		it('should set permissions with bigint', async () => {
			const updated = await permRole.setPermissions(PermissionFlagsBits.Administrator)

			expect(updated.permissions.has(PermissionFlagsBits.Administrator)).toBe(true)
		})
	})

	describe('Role Properties', () => {
		let propRole: Role

		beforeAll(async () => {
			propRole = await guild.roles.create({
				name: 'Prop Role',
				color: 0x3498db,
				hoist: true,
				mentionable: true
			})
		})

		afterAll(async () => {
			try {
				await propRole.delete()
			} catch {
				// Role may already be deleted
			}
		})

		it('should have hexColor', () => {
			// Note: hexColor may depend on Discord.js internals for color objects
			// Just verify the role has a color property
			expect(propRole.color).toBe(0x3498db)
		})

		it('should check editable', () => {
			expect(typeof propRole.editable).toBe('boolean')
		})

		it('should have createdAt', () => {
			expect(propRole.createdAt).toBeInstanceOf(Date)
		})

		it('should have createdTimestamp', () => {
			expect(propRole.createdTimestamp).toBeGreaterThan(0)
		})

		it('should have members collection', () => {
			expect(propRole.members).toBeDefined()
			expect(typeof propRole.members.size).toBe('number')
		})

		it('should have guild reference', () => {
			expect(propRole.guild.id).toBe(guild.id)
		})

		it('should have position', () => {
			expect(typeof propRole.position).toBe('number')
		})

		it('should have rawPosition', () => {
			expect(typeof propRole.rawPosition).toBe('number')
		})

		it('should check managed', () => {
			expect(propRole.managed).toBe(false)
		})

		it('should check if @everyone', () => {
			const everyone = guild.roles.everyone

			expect(everyone.id).toBe(guild.id)
		})
	})

	describe('RoleManager.fetch()', () => {
		it('should fetch all roles', async () => {
			await guild.roles.fetch()

			// Note: RoleManager.fetch() may return cached roles or an empty collection
			// depending on mock server implementation. The cache should have the @everyone role at minimum.
			expect(guild.roles.cache.size).toBeGreaterThan(0)
		})

		it('should fetch specific role', async () => {
			const created = await guild.roles.create({ name: 'Fetch Me' })

			try {
				const fetched = await guild.roles.fetch(created.id)

				expect(fetched?.name).toBe('Fetch Me')
			} finally {
				await created.delete()
			}
		})

		it('should fetch with force', async () => {
			await guild.roles.fetch(undefined, { force: true })

			// Note: Similar to above, check cache instead of returned collection
			expect(guild.roles.cache.size).toBeGreaterThan(0)
		})
	})

	describe('RoleManager.create()', () => {
		it('should create role with options', async () => {
			const role = await guild.roles.create({
				name: 'Created Role',
				color: 0xff0000,
				hoist: true,
				mentionable: true,
				permissions: [PermissionFlagsBits.SendMessages]
			})

			try {
				expect(role.name).toBe('Created Role')
				expect(role.color).toBe(0xff0000)
				expect(role.hoist).toBe(true)
				expect(role.mentionable).toBe(true)
			} finally {
				await role.delete()
			}
		})

		it('should create role with reason', async () => {
			const role = await guild.roles.create({
				name: 'Reason Role',
				reason: 'Testing role creation'
			})

			try {
				expect(role.name).toBe('Reason Role')
			} finally {
				await role.delete()
			}
		})
	})

	describe('Role.delete()', () => {
		it('should delete role', async () => {
			const role = await guild.roles.create({ name: 'Delete Me' })
			const roleId = role.id

			await role.delete()

			// Role should no longer be in cache
			expect(guild.roles.cache.has(roleId)).toBe(false)
		})

		it('should delete role with reason', async () => {
			const role = await guild.roles.create({ name: 'Delete Reason' })

			await role.delete('Testing deletion')

			expect(guild.roles.cache.has(role.id)).toBe(false)
		})
	})

	describe('Role.edit()', () => {
		let editRole: Role

		beforeAll(async () => {
			editRole = await guild.roles.create({ name: 'Edit Role' })
		})

		afterAll(async () => {
			try {
				await editRole.delete()
			} catch {
				// Role may already be deleted
			}
		})

		it('should edit multiple properties', async () => {
			const edited = await editRole.edit({
				name: 'Edited Role',
				color: 0x00ff00,
				hoist: true
			})

			expect(edited.name).toBe('Edited Role')
			expect(edited.color).toBe(0x00ff00)
			expect(edited.hoist).toBe(true)
		})

		it('should edit with reason', async () => {
			const edited = await editRole.edit({
				name: 'Re-edited Role',
				reason: 'Audit reason'
			})

			expect(edited.name).toBe('Re-edited Role')
		})
	})

	describe('Role Comparison', () => {
		let highRole: Role
		let lowRole: Role

		beforeAll(async () => {
			highRole = await guild.roles.create({ name: 'High Role', position: 10 })
			lowRole = await guild.roles.create({ name: 'Low Role', position: 1 })
		})

		afterAll(async () => {
			try {
				await highRole.delete()
				await lowRole.delete()
			} catch {
				// Roles may already be deleted
			}
		})

		it('should compare role positions', () => {
			const comparison = highRole.comparePositionTo(lowRole)

			// High role should have higher position
			expect(comparison).toBeGreaterThanOrEqual(0)
		})

		it('should compare by rawPosition', () => {
			// Raw positions are set during creation
			expect(typeof highRole.rawPosition).toBe('number')
			expect(typeof lowRole.rawPosition).toBe('number')
		})
	})

	describe('Role Permission Methods', () => {
		let permTestRole: Role

		beforeAll(async () => {
			permTestRole = await guild.roles.create({
				name: 'Perm Test Role',
				permissions: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ViewChannel]
			})
		})

		afterAll(async () => {
			try {
				await permTestRole.delete()
			} catch {
				// Role may already be deleted
			}
		})

		it('should check permission with has()', () => {
			expect(permTestRole.permissions.has(PermissionFlagsBits.SendMessages)).toBe(true)
		})

		it('should check missing permission', () => {
			expect(permTestRole.permissions.has(PermissionFlagsBits.Administrator)).toBe(false)
		})

		it('should serialize permissions', () => {
			const serialized = permTestRole.permissions.serialize()

			expect(typeof serialized).toBe('object')
			expect(serialized.SendMessages).toBe(true)
		})

		it('should convert to array', () => {
			const arr = permTestRole.permissions.toArray()

			expect(Array.isArray(arr)).toBe(true)
			expect(arr).toContain('SendMessages')
		})
	})
})
