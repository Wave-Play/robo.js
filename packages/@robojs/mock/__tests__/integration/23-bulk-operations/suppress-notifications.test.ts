/**
 * Message Suppress Notifications Tests
 *
 * Tests for silent messages using MessageFlags.SuppressNotifications.
 */
import { Client, ChannelType, TextChannel, GatewayIntentBits, MessageFlags } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Message Suppress Notifications', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel

	beforeAll(async () => {
		session = await createSession({
			name: 'suppress-notifications',
			config: {
				guilds: [
					{
						name: 'Silent Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createClientWithIntents([
			GatewayIntentBits.Guilds,
			GatewayIntentBits.GuildMessages,
			GatewayIntentBits.MessageContent
		])
		await client.login(session.token)
		await waitForReady(client)

		const guild = client.guilds.cache.first()!
		channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	it('should send with suppressed notifications', async () => {
		const message = await channel.send({
			content: '@everyone silent mention',
			flags: MessageFlags.SuppressNotifications
		})

		expect(message.flags.has(MessageFlags.SuppressNotifications)).toBe(true)
	})

	it('should use flags array for silent option', async () => {
		const message = await channel.send({
			content: 'Silent message with array',
			flags: [MessageFlags.SuppressNotifications]
		})

		expect(message.flags.has(MessageFlags.SuppressNotifications)).toBe(true)
	})
})
