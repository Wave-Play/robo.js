/**
 * ChannelManager Methods Tests
 *
 * Tests for client.channels manager methods including
 * fetch, resolve, resolveId, and DM creation.
 */
import { ChannelType, Client, GatewayIntentBits } from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForReady } from '../utils/helpers.js'

describe('ChannelManager Methods', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guildId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'channel-manager',
			config: {
				guilds: [
					{
						name: 'Channel Manager Guild',
						channels: [
							{ name: 'general', type: ChannelType.GuildText },
							{ name: 'secondary', type: ChannelType.GuildText }
						]
					}
				]
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages])
		await client.login(session.token)
		await waitForReady(client)

		const guild = client.guilds.cache.first()!
		guildId = guild.id
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('fetch methods', () => {
		it('should fetch channel by ID', async () => {
			const channelId = client!.channels.cache.first()!.id

			const channel = await client!.channels.fetch(channelId)

			expect(channel).not.toBeNull()
			expect(channel?.id).toBe(channelId)
		})

		it('should fetch channel with force option', async () => {
			const channelId = client!.channels.cache.first()!.id

			const channel = await client!.channels.fetch(channelId, { force: true })

			expect(channel).not.toBeNull()
			expect(channel?.id).toBe(channelId)
		})
	})

	describe('resolve methods', () => {
		it('should resolve channel from cache', () => {
			const channelId = client!.channels.cache.first()!.id

			const channel = client!.channels.resolve(channelId)

			expect(channel).not.toBeNull()
			expect(channel?.id).toBe(channelId)
		})

		it('should resolve channel ID', () => {
			const channel = client!.channels.cache.first()!

			const id = client!.channels.resolveId(channel)

			expect(id).toBe(channel.id)
		})
	})

	describe('DM channels', () => {
		it('should create DM channel', async () => {
			// Dispatch a user to the session
			const userId = generateSnowflake()
			await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
				guild_id: guildId,
				user: {
					id: userId,
					username: 'DMTarget',
					discriminator: '0',
					avatar: null
				},
				roles: [],
				joined_at: new Date().toISOString()
			})

			// Small delay for state update
			await new Promise((resolve) => setTimeout(resolve, 100))

			// Create DM channel
			const dm = await client!.users.createDM(userId)

			expect(dm).not.toBeNull()
			expect(dm.type).toBe(ChannelType.DM)
			// DM channels have recipient property
			expect(dm.recipientId).toBe(userId)
		})
	})
})
