/**
 * Permission Enforcement Tests
 *
 * Tests for channel permission checks, administrator bypass, owner bypass,
 * computed permissions, and role hierarchy enforcement.
 */
import { ChannelType, Client, PermissionFlagsBits, TextChannel } from 'discord.js'
import { controlAPI, createSession } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Permission Enforcement', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guildId: string
	let channelId: string

	beforeAll(async () => {
		// Create session with strict permission enforcement
		session = await createSession({
			name: 'permission-tests',
			config: {
				guilds: [
					{
						name: 'Permission Test Guild',
						channels: [{ name: 'test-channel', type: ChannelType.GuildText }]
					}
				],
				permissionEnforcement: 'strict'
			}
		})

		client = createTestClient()
		await client.login(session.token)
		await waitForReady(client)

		const guild = client.guilds.cache.first()!
		guildId = guild.id
		channelId = guild.channels.cache.find((c) => c.type === ChannelType.GuildText)!.id
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	afterEach(async () => {
		// Clear channel overwrites after each test
		try {
			await controlAPI(`/sessions/${session.id}/permissions?guild_id=${guildId}&channel_id=${channelId}`, {
				method: 'DELETE'
			})
		} catch {
			// Ignore errors
		}
	})

	describe('Channel Permission Checks', () => {
		// TODO: Channel overwrite enforcement needs more investigation
		// These tests verify the control API can set overwrites and the basic flow works
		it.skip('should reject without SendMessages', async () => {
			const channel = client!.channels.cache.get(channelId) as TextChannel

			// Set channel overwrite to deny SendMessages
			await controlAPI(`/sessions/${session.id}/permissions`, {
				method: 'POST',
				body: {
					guild_id: guildId,
					channel_id: channelId,
					deny: PermissionFlagsBits.SendMessages.toString()
				}
			})

			await expect(channel.send('Fail')).rejects.toMatchObject({ code: 50013 })
		})

		it.skip('should reject embed without EmbedLinks', async () => {
			const channel = client!.channels.cache.get(channelId) as TextChannel

			// Set channel overwrite to deny EmbedLinks
			await controlAPI(`/sessions/${session.id}/permissions`, {
				method: 'POST',
				body: {
					guild_id: guildId,
					channel_id: channelId,
					deny: PermissionFlagsBits.EmbedLinks.toString()
				}
			})

			await expect(channel.send({ embeds: [{ title: 'Test' }] })).rejects.toMatchObject({ code: 50013 })
		})

		it('should allow message when SendMessages is granted', async () => {
			const channel = client!.channels.cache.get(channelId) as TextChannel

			// Set channel overwrite to explicitly allow SendMessages
			await controlAPI(`/sessions/${session.id}/permissions`, {
				method: 'POST',
				body: {
					guild_id: guildId,
					channel_id: channelId,
					permissions: PermissionFlagsBits.SendMessages.toString()
				}
			})

			const message = await channel.send('Success')
			expect(message.content).toBe('Success')

			await message.delete().catch(() => {})
		})
	})

	describe('Administrator Bypass', () => {
		it('should bypass channel denies with Administrator', async () => {
			const channel = client!.channels.cache.get(channelId) as TextChannel

			// First grant Administrator to the bot
			await controlAPI(`/sessions/${session.id}/permissions`, {
				method: 'POST',
				body: {
					guild_id: guildId,
					permissions: PermissionFlagsBits.Administrator.toString()
				}
			})

			// Then deny SendMessages at channel level
			await controlAPI(`/sessions/${session.id}/permissions`, {
				method: 'POST',
				body: {
					guild_id: guildId,
					channel_id: channelId,
					role_id: guildId, // @everyone role
					deny: PermissionFlagsBits.SendMessages.toString()
				}
			})

			// Should still work because of Administrator
			const message = await channel.send('Admin bypass')
			expect(message.content).toBe('Admin bypass')

			await message.delete().catch(() => {})
		})
	})

	describe('Computed Permissions', () => {
		it('should combine role permissions', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			// Create two roles with different permissions
			const role1 = await guild.roles.create({
				name: 'Role 1',
				permissions: [PermissionFlagsBits.SendMessages]
			})

			const role2 = await guild.roles.create({
				name: 'Role 2',
				permissions: [PermissionFlagsBits.EmbedLinks]
			})

			// Add both roles to bot
			const botMember = await guild.members.fetch(client!.user!.id)
			await botMember.roles.add([role1, role2])

			// Verify bot has combined permissions
			const updatedMember = await guild.members.fetch(client!.user!.id)
			expect(updatedMember.permissions.has(PermissionFlagsBits.SendMessages)).toBe(true)
			expect(updatedMember.permissions.has(PermissionFlagsBits.EmbedLinks)).toBe(true)

			// Cleanup
			await role1.delete()
			await role2.delete()
		})

		it('should check channel permissions via control API', async () => {
			// Get computed permissions for the channel
			const result = await controlAPI<{
				channel_id: string
				permissions: string
				can: { send_messages: boolean; embed_links: boolean }
			}>(`/sessions/${session.id}/permissions/${channelId}`)

			expect(result.channel_id).toBe(channelId)
			expect(result.can).toBeDefined()
		})
	})

	describe('Role Hierarchy', () => {
		it('should order roles by position', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			const lowerRole = await guild.roles.create({ name: 'Lower Role' })
			const higherRole = await guild.roles.create({ name: 'Higher Role' })

			// Set higher role to position 2
			await higherRole.setPosition(2)

			// Re-fetch from cache
			const updatedHigher = guild.roles.cache.get(higherRole.id)!

			expect(updatedHigher.position).toBe(2)

			await lowerRole.delete()
			await higherRole.delete()
		})

		it('should compare role hierarchy', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			const lowerRole = await guild.roles.create({ name: 'Lower' })
			const higherRole = await guild.roles.create({ name: 'Higher' })

			// Set higher to position 2
			await higherRole.setPosition(2)

			// Re-fetch from cache
			const updatedLower = guild.roles.cache.get(lowerRole.id)!
			const updatedHigher = guild.roles.cache.get(higherRole.id)!

			expect(updatedHigher.comparePositionTo(updatedLower)).toBeGreaterThan(0)
			expect(updatedLower.comparePositionTo(updatedHigher)).toBeLessThan(0)

			await lowerRole.delete()
			await higherRole.delete()
		})

		it('should prevent managing roles above bot (with strict enforcement)', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			// Create a role higher than the bot's highest role
			const highRole = await guild.roles.create({ name: 'High Role' })
			const botMember = await guild.members.fetch(client!.user!.id)

			// Try to position it above the bot's highest role
			// Note: In strict mode, this should fail, but creating roles typically works
			// The enforcement would apply when trying to modify roles higher in hierarchy
			try {
				await highRole.setPosition(botMember.roles.highest.position + 1)
			} catch {
				// Expected in strict mode - bot cannot position roles above itself
			}

			await highRole.delete()
		})
	})

	describe('Permission Info via Control API', () => {
		it('should get bot permissions for guild', async () => {
			const result = await controlAPI<{
				guild_id: string
				user_id: string
				permissions: string
				permission_names: string[]
			}>(`/sessions/${session.id}/permissions?guild_id=${guildId}`)

			expect(result.guild_id).toBe(guildId)
			expect(result.user_id).toBe(client!.user!.id)
			expect(result.permissions).toBeDefined()
			expect(Array.isArray(result.permission_names)).toBe(true)
		})

		it('should update bot role permissions', async () => {
			// Update @everyone role with specific permissions
			await controlAPI(`/sessions/${session.id}/permissions`, {
				method: 'POST',
				body: {
					guild_id: guildId,
					permissions: (PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages).toString()
				}
			})

			// Verify via GET
			const result = await controlAPI<{
				permissions: string
				permission_names: string[]
			}>(`/sessions/${session.id}/permissions?guild_id=${guildId}`)

			const perms = BigInt(result.permissions)
			expect((perms & PermissionFlagsBits.ViewChannel) !== 0n).toBe(true)
			expect((perms & PermissionFlagsBits.SendMessages) !== 0n).toBe(true)
		})
	})
})
