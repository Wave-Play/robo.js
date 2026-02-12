/**
 * Channel Invites Tests
 *
 * Tests for channel.fetchInvites() method.
 */
import { ChannelType, Client, GatewayIntentBits, TextChannel } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Channel.fetchInvites()', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel

	beforeAll(async () => {
		session = await createSession({
			name: 'channel-invites-tests',
			config: {
				guilds: [
					{
						name: 'Invites Test Guild',
						channels: [{ name: 'invite-channel', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createTestClient({
			intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildInvites]
		})
		await client.login(session.token)
		await waitForReady(client)

		const guild = client.guilds.cache.first()!
		channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Fetching Channel Invites', () => {
		it('should fetch channel invites', async () => {
			// Create invites for the channel
			const invite1 = await channel.createInvite({ maxAge: 3600 })
			const invite2 = await channel.createInvite({ maxAge: 7200 })

			try {
				const invites = await channel.fetchInvites()

				expect(invites.size).toBeGreaterThanOrEqual(2)
				expect(invites.has(invite1.code)).toBe(true)
				expect(invites.has(invite2.code)).toBe(true)
			} finally {
				// Clean up invites
				await invite1.delete().catch(() => {})
				await invite2.delete().catch(() => {})
			}
		})

		it('should return empty for channel with no invites', async () => {
			const guild = client!.guilds.cache.first()!

			// Create a fresh channel with no invites
			const newChannel = (await guild.channels.create({
				name: 'no-invites',
				type: ChannelType.GuildText
			})) as TextChannel

			try {
				const invites = await newChannel.fetchInvites()

				expect(invites.size).toBe(0)
			} finally {
				await newChannel.delete().catch(() => {})
			}
		})
	})
})
