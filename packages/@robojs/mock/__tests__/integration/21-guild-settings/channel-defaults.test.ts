/**
 * Channel Default Settings Tests
 *
 * Tests for channel default settings including auto-archive duration,
 * thread rate limits, and slowmode (rateLimitPerUser).
 */
import { ChannelType, Client, ForumChannel, TextChannel, ThreadAutoArchiveDuration } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Channel Default Settings', () => {
	let client: Client | null = null
	let session: { id: string; token: string }

	beforeAll(async () => {
		session = await createSession({
			name: 'channel-defaults',
			config: {
				guilds: [
					{
						name: 'Channel Defaults Test Guild'
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

	it('should have defaultAutoArchiveDuration on text channel', async () => {
		const guild = client!.guilds.cache.first()!

		const channel = (await guild.channels.create({
			name: 'auto-archive-test',
			type: ChannelType.GuildText,
			defaultAutoArchiveDuration: ThreadAutoArchiveDuration.OneDay
		})) as TextChannel

		try {
			expect(channel.defaultAutoArchiveDuration).toBe(ThreadAutoArchiveDuration.OneDay)
		} finally {
			await channel.delete().catch(() => {})
		}
	})

	it('should set defaultAutoArchiveDuration', async () => {
		const guild = client!.guilds.cache.first()!

		const channel = (await guild.channels.create({
			name: 'archive-edit',
			type: ChannelType.GuildText
		})) as TextChannel

		try {
			await channel.setDefaultAutoArchiveDuration(ThreadAutoArchiveDuration.OneWeek)

			expect(channel.defaultAutoArchiveDuration).toBe(ThreadAutoArchiveDuration.OneWeek)
		} finally {
			await channel.delete().catch(() => {})
		}
	})

	it('should have defaultThreadRateLimitPerUser on forum', async () => {
		const guild = client!.guilds.cache.first()!

		const forum = (await guild.channels.create({
			name: 'rate-limit-forum',
			type: ChannelType.GuildForum,
			defaultThreadRateLimitPerUser: 60
		})) as ForumChannel

		try {
			expect(forum.defaultThreadRateLimitPerUser).toBe(60)
		} finally {
			await forum.delete().catch(() => {})
		}
	})

	it('should have rateLimitPerUser (slowmode) on text channel', async () => {
		const guild = client!.guilds.cache.first()!

		const channel = (await guild.channels.create({
			name: 'slowmode-test',
			type: ChannelType.GuildText,
			rateLimitPerUser: 10
		})) as TextChannel

		try {
			expect(channel.rateLimitPerUser).toBe(10)
		} finally {
			await channel.delete().catch(() => {})
		}
	})

	it('should set rateLimitPerUser', async () => {
		const guild = client!.guilds.cache.first()!

		const channel = (await guild.channels.create({
			name: 'slowmode-edit',
			type: ChannelType.GuildText
		})) as TextChannel

		try {
			await channel.setRateLimitPerUser(30)

			expect(channel.rateLimitPerUser).toBe(30)
		} finally {
			await channel.delete().catch(() => {})
		}
	})
})
