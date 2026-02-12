/**
 * Guild System Channel Tests
 *
 * Tests for guild system channel and system channel flags.
 * Covers setting system channel, reading/setting flags, and individual flag checks.
 */
import { ChannelType, Client, GuildSystemChannelFlags, TextChannel } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Guild System Channel', () => {
	let client: Client | null = null
	let session: { id: string; token: string }

	beforeAll(async () => {
		session = await createSession({
			name: 'guild-system-channel',
			config: {
				guilds: [
					{
						name: 'System Channel Test Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createTestClient()
		await client.login(session.token)
		await waitForReady(client)
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	it('should have systemChannel', async () => {
		const guild = client!.guilds.cache.first()!
		const textChannel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel

		await guild.setSystemChannel(textChannel)

		expect(guild.systemChannel?.id).toBe(textChannel.id)
		expect(guild.systemChannelId).toBe(textChannel.id)
	})

	it('should have systemChannelFlags', () => {
		const guild = client!.guilds.cache.first()!

		expect(guild.systemChannelFlags).toBeDefined()
	})

	it('should set systemChannelFlags', async () => {
		const guild = client!.guilds.cache.first()!

		await guild.setSystemChannelFlags([
			GuildSystemChannelFlags.SuppressJoinNotifications,
			GuildSystemChannelFlags.SuppressPremiumSubscriptions
		])

		expect(guild.systemChannelFlags.has(GuildSystemChannelFlags.SuppressJoinNotifications)).toBe(true)
	})

	it('should check individual flags', () => {
		const guild = client!.guilds.cache.first()!
		const flags = guild.systemChannelFlags

		expect(typeof flags.has(GuildSystemChannelFlags.SuppressJoinNotifications)).toBe('boolean')
		expect(typeof flags.has(GuildSystemChannelFlags.SuppressGuildReminderNotifications)).toBe('boolean')
		expect(typeof flags.has(GuildSystemChannelFlags.SuppressJoinNotificationReplies)).toBe('boolean')
		expect(typeof flags.has(GuildSystemChannelFlags.SuppressRoleSubscriptionPurchaseNotifications)).toBe('boolean')
	})
})
