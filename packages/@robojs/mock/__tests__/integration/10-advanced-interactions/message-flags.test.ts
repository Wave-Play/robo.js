/**
 * Message Flags Tests
 *
 * Tests for message flags like SuppressEmbeds and SuppressNotifications.
 */
import { ChannelType, Client, GatewayIntentBits, MessageFlags, TextChannel } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Message Flags', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel

	beforeAll(async () => {
		session = await createSession({
			name: 'message-flags-tests',
			config: {
				guilds: [
					{
						name: 'Message Flags Test Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages])
		await client.login(session.token)
		await waitForReady(client)

		const guild = client.guilds.cache.first()!
		channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	it('should check SuppressEmbeds flag', async () => {
		const message = await channel.send('Test flags')

		await message.suppressEmbeds(true)

		expect(message.flags.has(MessageFlags.SuppressEmbeds)).toBe(true)
	})

	it('should check SuppressNotifications flag', async () => {
		const message = await channel.send({
			content: 'Silent message',
			flags: MessageFlags.SuppressNotifications
		})

		expect(message.flags.has(MessageFlags.SuppressNotifications)).toBe(true)
	})

	it('should serialize flags to array', async () => {
		const message = await channel.send({
			content: 'Flags array',
			flags: MessageFlags.SuppressNotifications
		})

		const flagsArray = message.flags.toArray()

		expect(flagsArray).toContain('SuppressNotifications')
	})
})
