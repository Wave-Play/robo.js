import { Client, Events, TextChannel, ChannelType, GatewayIntentBits } from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForEvent, waitForReady, generateSnowflake } from '../utils/helpers.js'

describe('Message Position', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel

	beforeAll(async () => {
		session = await createSession({
			name: 'message-position',
			config: {
				guilds: [
					{
						name: 'Test Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages])
		await client.login(session.token)
		await waitForReady(client)

		const guild = client.guilds.cache.first()!
		channel = guild.channels.cache.find(c => c.type === ChannelType.GuildText) as TextChannel
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	it('should have position property', async () => {
		const messageId = generateSnowflake()
		const guild = client!.guilds.cache.first()!
		const eventPromise = waitForEvent(client!, Events.MessageCreate, 5000)

		await dispatchEvent(session.id, 'MESSAGE_CREATE', {
			id: messageId,
			channel_id: channel.id,
			guild_id: guild.id,
			content: 'Position test',
			author: { id: '111', username: 'User', bot: false },
			position: 42
		})

		const message = await eventPromise
		expect(message.position).toBe(42)
	})
})
