/**
 * AnnouncementChannel Methods Tests
 *
 * Tests for announcement (news) channel specific methods
 * including crosspost and addFollower.
 */
import { ChannelType, Client, GatewayIntentBits, MessageFlags, NewsChannel, TextChannel } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('AnnouncementChannel Methods', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guildId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'announcement-channel-tests',
			config: {
				guilds: [
					{
						name: 'Announcement Test Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages])
		await client.login(session.token)
		await waitForReady(client)

		guildId = client.guilds.cache.first()!.id
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Creating Announcement Channels', () => {
		it('should create announcement channel', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			const channel = (await guild.channels.create({
				name: 'announcements',
				type: ChannelType.GuildAnnouncement
			})) as NewsChannel

			try {
				expect(channel.type).toBe(ChannelType.GuildAnnouncement)
			} finally {
				await channel.delete().catch(() => {})
			}
		})
	})

	describe('Crossposting Messages', () => {
		it('should crosspost message', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			const channel = (await guild.channels.create({
				name: 'crosspost-test',
				type: ChannelType.GuildAnnouncement
			})) as NewsChannel

			try {
				const message = await channel.send('Crosspost me!')
				const crossposted = await message.crosspost()

				expect(crossposted.flags.has(MessageFlags.Crossposted)).toBe(true)
			} finally {
				await channel.delete().catch(() => {})
			}
		})
	})

	describe('Following Announcement Channels', () => {
		it('should add follower', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			const announcement = (await guild.channels.create({
				name: 'follow-source',
				type: ChannelType.GuildAnnouncement
			})) as NewsChannel

			const target = (await guild.channels.create({
				name: 'follow-target',
				type: ChannelType.GuildText
			})) as TextChannel

			try {
				// Follow the announcement channel
				await announcement.addFollower(target.id, 'Following announcements')
				// If no error thrown, follow worked
			} finally {
				await announcement.delete().catch(() => {})
				await target.delete().catch(() => {})
			}
		})
	})
})
