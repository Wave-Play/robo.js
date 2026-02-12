/**
 * TextChannel-Specific Methods Tests
 *
 * Tests for text channel specific methods including pinned messages,
 * default auto archive duration, and thread rate limits.
 */
import { ChannelType, Client, GatewayIntentBits, TextChannel, ThreadAutoArchiveDuration } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('TextChannel-Specific Methods', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel
	let guildId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'text-channel-methods-tests',
			config: {
				guilds: [
					{
						name: 'TextChannel Methods Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages])
		await client.login(session.token)
		await waitForReady(client)

		const guild = client.guilds.cache.first()!
		guildId = guild.id
		channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Pinned Messages', () => {
		it('should fetch pinned messages', async () => {
			const message = await channel.send('Pin me')

			try {
				await message.pin()

				const pinned = await channel.messages.fetchPinned()

				expect(pinned.has(message.id)).toBe(true)
			} finally {
				await message.unpin().catch(() => {})
			}
		})
	})

	describe('Channel Name', () => {
		it('should set channel name', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const newChannel = (await guild.channels.create({
				name: 'rename-test',
				type: ChannelType.GuildText
			})) as TextChannel

			try {
				await newChannel.setName('renamed-channel')

				expect(newChannel.name).toBe('renamed-channel')
			} finally {
				await newChannel.delete().catch(() => {})
			}
		})
	})

	describe('Thread Defaults', () => {
		it('should set default thread auto archive', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const testChannel = (await guild.channels.create({
				name: 'archive-test',
				type: ChannelType.GuildText
			})) as TextChannel

			try {
				await testChannel.setDefaultAutoArchiveDuration(ThreadAutoArchiveDuration.OneDay)

				expect(testChannel.defaultAutoArchiveDuration).toBe(ThreadAutoArchiveDuration.OneDay)
			} finally {
				await testChannel.delete().catch(() => {})
			}
		})

		it('should set default thread rate limit', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const testChannel = (await guild.channels.create({
				name: 'ratelimit-test',
				type: ChannelType.GuildText
			})) as TextChannel

			try {
				// Use edit() since setDefaultThreadRateLimitPerUser may not exist on TextChannel
				await testChannel.edit({ defaultThreadRateLimitPerUser: 10 })

				expect(testChannel.defaultThreadRateLimitPerUser).toBe(10)

				// Reset
				await testChannel.edit({ defaultThreadRateLimitPerUser: 0 })
			} finally {
				await testChannel.delete().catch(() => {})
			}
		})
	})
})
