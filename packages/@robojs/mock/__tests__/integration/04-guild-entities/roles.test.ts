/**
 * Role Tests
 *
 * Tests for role creation, editing, deletion, hierarchy, and events.
 */
import { Client, Events, PermissionFlagsBits, Role } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForEvent, waitForReady } from '../utils/helpers.js'

describe('Roles', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guildId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'role-tests',
			config: {
				guilds: [{ name: 'Role Test Guild' }]
			}
		})

		client = createTestClient()
		await client.login(session.token)
		await waitForReady(client)

		guildId = client.guilds.cache.first()!.id
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Creating Roles', () => {
		it('should create basic role', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const role = await guild.roles.create({ name: 'Test Role' })

			expect(role.name).toBe('Test Role')
			expect(role.id).toMatch(/^\d{17,19}$/)

			await role.delete()
		})

		it('should create role with color', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const role = await guild.roles.create({
				name: 'Colored',
				color: 0xff0000
			})

			expect(role.color).toBe(0xff0000)
			await role.delete()
		})

		it('should create hoisted role', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const role = await guild.roles.create({
				name: 'Hoisted',
				hoist: true
			})

			expect(role.hoist).toBe(true)
			await role.delete()
		})

		it('should create role with permissions', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const role = await guild.roles.create({
				name: 'Permission Role',
				permissions: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.KickMembers]
			})

			expect(role.permissions.has(PermissionFlagsBits.SendMessages)).toBe(true)
			expect(role.permissions.has(PermissionFlagsBits.KickMembers)).toBe(true)
			expect(role.permissions.has(PermissionFlagsBits.Administrator)).toBe(false)

			await role.delete()
		})

		it('should create role with unicode emoji', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const role = await guild.roles.create({
				name: 'Emoji Role',
				unicodeEmoji: '🎮'
			})

			expect(role.unicodeEmoji).toBe('🎮')
			await role.delete()
		})

		it('should create mentionable role', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const role = await guild.roles.create({
				name: 'Mentionable',
				mentionable: true
			})

			expect(role.mentionable).toBe(true)
			await role.delete()
		})
	})

	describe('Editing Roles', () => {
		let role: Role

		beforeEach(async () => {
			const guild = client!.guilds.cache.get(guildId)!
			role = await guild.roles.create({ name: 'Edit Test' })
		})

		afterEach(async () => {
			if (role) {
				try {
					await role.delete()
				} catch {
					// Role may already be deleted
				}
			}
		})

		it('should edit role name', async () => {
			await role.edit({ name: 'Renamed' })
			expect(role.name).toBe('Renamed')
		})

		it('should edit role color', async () => {
			await role.edit({ color: 0x00ff00 })
			expect(role.color).toBe(0x00ff00)
		})

		it('should edit role permissions', async () => {
			await role.edit({
				permissions: [PermissionFlagsBits.ManageMessages]
			})
			expect(role.permissions.has(PermissionFlagsBits.ManageMessages)).toBe(true)
		})

		it('should set role position', async () => {
			// Get initial position
			const initialPosition = role.position

			// Create another role to have something to compare against
			const guild = client!.guilds.cache.get(guildId)!
			const otherRole = await guild.roles.create({ name: 'Other Role' })

			// Set position to be higher than the other role
			await role.setPosition(otherRole.position + 1)

			// Verify position changed
			expect(role.position).toBeGreaterThan(initialPosition)

			await otherRole.delete()
		})

		it('should use helper methods', async () => {
			await role.setColor(0x0000ff)
			expect(role.color).toBe(0x0000ff)

			await role.setHoist(true)
			expect(role.hoist).toBe(true)

			await role.setMentionable(true)
			expect(role.mentionable).toBe(true)
		})
	})

	describe('Deleting Roles', () => {
		it('should delete role', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const role = await guild.roles.create({ name: 'Delete Test' })
			const roleId = role.id

			await role.delete()
			expect(guild.roles.cache.has(roleId)).toBe(false)
		})

		it('should not delete @everyone', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const everyone = guild.roles.cache.get(guildId)!

			await expect(everyone.delete()).rejects.toBeDefined()
		})
	})

	describe('Role Hierarchy', () => {
		it('should order roles by position', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const role1 = await guild.roles.create({ name: 'Pos 1' })
			const role2 = await guild.roles.create({ name: 'Pos 2' })

			// Set role2 to a higher position (position 2)
			await role2.setPosition(2)

			// Re-fetch to get updated positions from cache
			const updatedRole2 = guild.roles.cache.get(role2.id)!

			// Role2 should now be at position 2, role1 should be at position 1
			expect(updatedRole2.position).toBe(2)

			await role1.delete()
			await role2.delete()
		})

		it('should compare roles', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const lower = await guild.roles.create({ name: 'Lower' })
			const higher = await guild.roles.create({ name: 'Higher' })

			// Set higher to position 2
			await higher.setPosition(2)

			// Re-fetch to get updated positions
			const updatedLower = guild.roles.cache.get(lower.id)!
			const updatedHigher = guild.roles.cache.get(higher.id)!

			expect(updatedHigher.comparePositionTo(updatedLower)).toBeGreaterThan(0)
			expect(updatedLower.comparePositionTo(updatedHigher)).toBeLessThan(0)

			await lower.delete()
			await higher.delete()
		})
	})

	describe('Role Events', () => {
		it('should emit roleCreate', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const eventPromise = waitForEvent(client!, Events.GuildRoleCreate)

			const role = await guild.roles.create({ name: 'Event Create' })
			const created = await eventPromise

			expect(created.id).toBe(role.id)

			await role.delete()
		})

		it('should emit roleUpdate', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const role = await guild.roles.create({ name: 'Event Update' })

			const eventPromise = new Promise<{ old: Role; updated: Role }>((resolve) => {
				client!.once(Events.GuildRoleUpdate, (old, updated) => resolve({ old, updated }))
			})

			await role.edit({ name: 'Updated' })
			const { old, updated } = await eventPromise

			expect(old.name).toBe('Event Update')
			expect(updated.name).toBe('Updated')

			await role.delete()
		})

		it('should emit roleDelete', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const role = await guild.roles.create({ name: 'Event Delete' })
			const roleId = role.id

			const eventPromise = waitForEvent(client!, Events.GuildRoleDelete)
			await role.delete()

			const deleted = await eventPromise
			expect(deleted.id).toBe(roleId)
		})
	})
})
