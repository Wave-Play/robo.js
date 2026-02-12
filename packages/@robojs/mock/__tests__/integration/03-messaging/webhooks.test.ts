/**
 * Webhook Tests
 *
 * Covers webhook creation, fetching, sending, editing, deletion, and message cleanup.
 */
import {
	Client,
	EmbedBuilder,
	GatewayIntentBits,
	type TextChannel,
	type Webhook
} from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Webhooks', () => {
	let client: Client | null = null
	let channel: TextChannel
	let session: { id: string; token: string; guildId: string }

	beforeAll(async () => {
		session = await createSession({
			name: 'webhook-tests',
			config: {
				guilds: [{ name: 'Webhook Guild' }]
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds])
		await client.login(session.token)
		await waitForReady(client)

		const guild = client.guilds.cache.first()
		if (!guild) {
			throw new Error('Guild not found for webhook tests')
		}

		const textChannel = guild.channels.cache.find((c) => c?.isTextBased()) as TextChannel | undefined
		if (!textChannel) {
			throw new Error('Text channel not found for webhook tests')
		}
		channel = textChannel
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Creating Webhooks', () => {
		it('should create webhook', async () => {
			const webhook = await channel.createWebhook({ name: 'Test Webhook' })

			expect(webhook.name).toBe('Test Webhook')
			expect(webhook.channelId).toBe(channel.id)
			expect(webhook.token).toBeDefined()

			await webhook.delete()
		})
	})

	describe('Fetching Webhooks', () => {
		let webhook: Webhook

		beforeAll(async () => {
			webhook = await channel.createWebhook({ name: 'Fetch Test' })
		})

		afterAll(async () => {
			if (webhook) {
				await webhook.delete()
			}
		})

		it('should fetch channel webhooks', async () => {
			const webhooks = await channel.fetchWebhooks()
			expect(webhooks.has(webhook.id)).toBe(true)
		})

		it('should fetch guild webhooks', async () => {
			const guild = client!.guilds.cache.first()!
			const webhooks = await guild.fetchWebhooks()
			expect(webhooks.has(webhook.id)).toBe(true)
		})

		it('should fetch specific webhook', async () => {
			const response = await fetch(`http://localhost:3000/api/v10/webhooks/${webhook.id}`, {
				headers: { Authorization: `Bot ${session.token}` }
			})
			expect(response.status).toBe(200)
			const data = (await response.json()) as { name: string }
			expect(data.name).toBe('Fetch Test')
		})
	})

	describe('Sending via Webhooks', () => {
		let webhook: Webhook

		beforeAll(async () => {
			webhook = await channel.createWebhook({ name: 'Send Test' })
		})

		afterAll(async () => {
			if (webhook) {
				await webhook.delete()
			}
		})

		it('should send simple message', async () => {
			// Use direct REST API for reliable testing
			const response = await fetch(`http://localhost:3000/api/v10/webhooks/${webhook.id}/${webhook.token}?wait=true`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content: 'Hello webhook!' })
			})
			expect(response.status).toBe(200)
			const data = (await response.json()) as { content: string; webhook_id?: string }
			expect(data.content).toBe('Hello webhook!')
			// Note: webhook_id is not included in webhook message responses per Discord API
		})

		it('should send with custom username', async () => {
			const message = await webhook.send({
				content: 'Custom',
				username: 'Custom Bot'
			})
			expect(message.author.username).toBe('Custom Bot')
		})

		it('should send embed', async () => {
			const embed = new EmbedBuilder().setTitle('Webhook Embed')
			const message = await webhook.send({ embeds: [embed] })
			expect(message.embeds[0].title).toBe('Webhook Embed')
		})

		it('should edit webhook message', async () => {
			const message = await webhook.send('Original')
			const edited = await webhook.editMessage(message.id, { content: 'Edited' })
			expect(edited.content).toBe('Edited')
		})

		it('should delete webhook message', async () => {
			const message = await webhook.send('Delete this')
			await webhook.deleteMessage(message.id)

			await expect(channel.messages.fetch(message.id)).rejects.toMatchObject({ code: 10008 })
		})
	})

	describe('Deleting Webhooks', () => {
		it('should delete webhook', async () => {
			const webhook = await channel.createWebhook({ name: 'Delete Test' })
			const webhookId = webhook.id

			// Delete via direct REST API
			const deleteResponse = await fetch(`http://localhost:3000/api/v10/webhooks/${webhookId}`, {
				method: 'DELETE',
				headers: { Authorization: `Bot ${session.token}` }
			})
			expect(deleteResponse.status).toBe(204)

			// Verify webhook no longer exists via direct REST API
			const fetchResponse = await fetch(`http://localhost:3000/api/v10/webhooks/${webhookId}`, {
				headers: { Authorization: `Bot ${session.token}` }
			})
			expect(fetchResponse.status).toBe(404)
		})
	})
})

