/**
 * Webhook Thread Operations Tests
 *
 * Tests for webhook operations within threads including sending,
 * editing, and deleting messages in threads.
 */
import { ChannelType, Client, GatewayIntentBits, TextChannel, ThreadChannel, Webhook } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Webhook Thread Operations', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel
	let webhook: Webhook
	let thread: ThreadChannel

	beforeAll(async () => {
		session = await createSession({
			name: 'webhook-thread-tests',
			config: {
				guilds: [
					{
						name: 'Webhook Thread Guild',
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

		// Create webhook for testing
		webhook = await channel.createWebhook({ name: 'Thread Webhook' })

		// Create a thread for testing
		const message = await channel.send('Thread parent message')
		thread = await message.startThread({ name: 'Webhook Thread' })
	})

	afterAll(async () => {
		if (thread) {
			try {
				await thread.delete()
			} catch {
				// Thread may already be deleted
			}
		}
		if (webhook) {
			try {
				await webhook.delete()
			} catch {
				// Webhook may already be deleted
			}
		}
		await destroyClient(client)
		client = null
	})

	it('should send webhook message to thread', async () => {
		const message = await webhook.send({
			content: 'Message in thread',
			threadId: thread.id
		})

		expect(message.channelId).toBe(thread.id)
		expect(message.content).toBe('Message in thread')
	})

	it('should edit webhook message in thread', async () => {
		const message = await webhook.send({
			content: 'Original in thread',
			threadId: thread.id
		})

		const edited = await webhook.editMessage(message.id, {
			content: 'Edited in thread',
			threadId: thread.id
		})

		expect(edited.content).toBe('Edited in thread')
	})

	it('should delete webhook message in thread', async () => {
		const message = await webhook.send({
			content: 'Delete me in thread',
			threadId: thread.id
		})

		await webhook.deleteMessage(message.id, thread.id)

		// Verify message is deleted
		await expect(thread.messages.fetch(message.id)).rejects.toMatchObject({ code: 10008 })
	})
})
