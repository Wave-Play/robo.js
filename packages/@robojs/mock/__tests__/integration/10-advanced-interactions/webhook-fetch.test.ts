/**
 * Webhook.fetchMessage() Tests
 *
 * Tests for fetching messages sent via webhooks.
 */
import { ChannelType, Client, GatewayIntentBits, TextChannel, Webhook } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Webhook.fetchMessage()', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel
	let webhook: Webhook

	beforeAll(async () => {
		session = await createSession({
			name: 'webhook-fetch-tests',
			config: {
				guilds: [
					{
						name: 'Webhook Fetch Test Guild',
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
		webhook = await channel.createWebhook({ name: 'Fetch Webhook' })
	})

	afterAll(async () => {
		if (webhook) await webhook.delete()
		await destroyClient(client)
		client = null
	})

	it('should fetch webhook message', async () => {
		const sent = await webhook.send({ content: 'Fetch me' })

		const fetched = await webhook.fetchMessage(sent.id)

		expect(fetched.content).toBe('Fetch me')
	})

	it('should fetch webhook message in thread', async () => {
		const message = await channel.send('Thread parent')
		const thread = await message.startThread({ name: 'Webhook Thread' })

		const sent = await webhook.send({
			content: 'Thread message',
			threadId: thread.id
		})

		const fetched = await webhook.fetchMessage(sent.id, { threadId: thread.id })

		expect(fetched.content).toBe('Thread message')

		await thread.delete()
	})
})
