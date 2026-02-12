/**
 * Channel Position & Category Sync Tests
 *
 * Tests for channel permission syncing with categories,
 * lockPermissions(), permissionsLocked property, and category moves.
 */
import {
	CategoryChannel,
	ChannelType,
	Client,
	GatewayIntentBits,
	PermissionFlagsBits,
	TextChannel
} from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Channel Position & Category Sync', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guildId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'channel-sync-tests',
			config: {
				guilds: [
					{
						name: 'Channel Sync Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds])
		await client.login(session.token)
		await waitForReady(client)

		guildId = client.guilds.cache.first()!.id
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Permission Syncing with Category', () => {
		it('should sync permissions with category', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const role = await guild.roles.create({ name: 'Sync Role' })

			const category = (await guild.channels.create({
				name: 'Sync Category',
				type: ChannelType.GuildCategory,
				permissionOverwrites: [{ id: role.id, deny: [PermissionFlagsBits.ViewChannel] }]
			})) as CategoryChannel

			const channel = (await guild.channels.create({
				name: 'sync-channel',
				type: ChannelType.GuildText,
				parent: category.id
			})) as TextChannel

			try {
				// Channel should inherit category permissions after lock
				await channel.lockPermissions()

				const overwrite = channel.permissionOverwrites.cache.get(role.id)
				expect(overwrite?.deny.has(PermissionFlagsBits.ViewChannel)).toBe(true)
			} finally {
				await channel.delete().catch(() => {})
				await category.delete().catch(() => {})
				await role.delete().catch(() => {})
			}
		})

		it('should check if permissions are synced', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			const category = (await guild.channels.create({
				name: 'Check Sync',
				type: ChannelType.GuildCategory
			})) as CategoryChannel

			const channel = (await guild.channels.create({
				name: 'check-sync-channel',
				type: ChannelType.GuildText,
				parent: category.id
			})) as TextChannel

			try {
				// Initially synced
				expect(channel.permissionsLocked).toBe(true)

				// Add custom overwrite to break sync
				await channel.permissionOverwrites.create(guild.roles.everyone, {
					SendMessages: false
				})

				// Refetch to check
				const refetched = (await guild.channels.fetch(channel.id)) as TextChannel
				expect(refetched.permissionsLocked).toBe(false)
			} finally {
				await channel.delete().catch(() => {})
				await category.delete().catch(() => {})
			}
		})
	})

	describe('Moving Channels Between Categories', () => {
		it('should move channel between categories', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			const category1 = (await guild.channels.create({
				name: 'Category 1',
				type: ChannelType.GuildCategory
			})) as CategoryChannel

			const category2 = (await guild.channels.create({
				name: 'Category 2',
				type: ChannelType.GuildCategory
			})) as CategoryChannel

			const channel = (await guild.channels.create({
				name: 'move-me',
				type: ChannelType.GuildText,
				parent: category1.id
			})) as TextChannel

			try {
				expect(channel.parentId).toBe(category1.id)

				await channel.setParent(category2.id)

				expect(channel.parentId).toBe(category2.id)
			} finally {
				await channel.delete().catch(() => {})
				await category1.delete().catch(() => {})
				await category2.delete().catch(() => {})
			}
		})

		it('should move channel to no category', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			const category = (await guild.channels.create({
				name: 'Remove Parent',
				type: ChannelType.GuildCategory
			})) as CategoryChannel

			const channel = (await guild.channels.create({
				name: 'remove-parent',
				type: ChannelType.GuildText,
				parent: category.id
			})) as TextChannel

			try {
				await channel.setParent(null)

				expect(channel.parentId).toBeNull()
			} finally {
				await channel.delete().catch(() => {})
				await category.delete().catch(() => {})
			}
		})
	})
})
