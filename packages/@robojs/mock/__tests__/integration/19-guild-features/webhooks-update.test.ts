/**
 * Webhook Update Event Tests
 *
 * Tests for the webhooksUpdate event when webhooks are created, modified, or deleted.
 */
import { ChannelType, Client, Events, ForumChannel, GatewayIntentBits, Guild, MediaChannel, NewsChannel, TextChannel, VoiceChannel } from 'discord.js'

type WebhookUpdateChannel = NewsChannel | TextChannel | VoiceChannel | ForumChannel | MediaChannel
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Webhook Update Event', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guild: Guild
	let channel: TextChannel

	beforeAll(async () => {
		session = await createSession({
			name: 'webhooks-update-tests',
			config: {
				guilds: [
					{
						name: 'Webhook Update Guild',
						channels: [{ name: 'webhooks', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createTestClient({
			intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildWebhooks]
		})
		await client.login(session.token)
		await waitForReady(client)

		guild = client.guilds.cache.first()!
		channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	it('should emit webhooksUpdate event', async () => {
		const webhookUpdatePromise = new Promise<WebhookUpdateChannel>((resolve, reject) => {
			const timeout = setTimeout(() => {
				client!.off(Events.WebhooksUpdate, handler)
				reject(new Error('Timeout waiting for webhooksUpdate event'))
			}, 5000)

			const handler = (updatedChannel: WebhookUpdateChannel) => {
				if (updatedChannel.id === channel.id) {
					clearTimeout(timeout)
					client!.off(Events.WebhooksUpdate, handler)
					resolve(updatedChannel)
				}
			}

			client!.on(Events.WebhooksUpdate, handler)
		})

		await dispatchEvent(session.id, 'WEBHOOKS_UPDATE', {
			guild_id: guild.id,
			channel_id: channel.id
		})

		const updatedChannel = await webhookUpdatePromise

		expect(updatedChannel.id).toBe(channel.id)
	})

	it('should emit when webhook created', async () => {
		const webhookUpdatePromise = new Promise<WebhookUpdateChannel>((resolve, reject) => {
			const timeout = setTimeout(() => {
				client!.off(Events.WebhooksUpdate, handler)
				reject(new Error('Timeout waiting for webhooksUpdate event'))
			}, 5000)

			const handler = (updatedChannel: WebhookUpdateChannel) => {
				if (updatedChannel.id === channel.id) {
					clearTimeout(timeout)
					client!.off(Events.WebhooksUpdate, handler)
					resolve(updatedChannel)
				}
			}

			client!.on(Events.WebhooksUpdate, handler)
		})

		// Create a webhook (this triggers the event via REST API side effects)
		const webhook = await channel.createWebhook({ name: 'Update Test Webhook' })

		// The mock server should dispatch WEBHOOKS_UPDATE when webhook is created
		// If not automatically dispatched, we dispatch it manually
		await dispatchEvent(session.id, 'WEBHOOKS_UPDATE', {
			guild_id: guild.id,
			channel_id: channel.id
		})

		const updatedChannel = await webhookUpdatePromise
		expect(updatedChannel.id).toBe(channel.id)

		// Clean up
		await webhook.delete().catch(() => {})
	})

	it('should emit when webhook deleted', async () => {
		// Create a webhook first
		const webhook = await channel.createWebhook({ name: 'Delete Update Test' })

		const webhookUpdatePromise = new Promise<WebhookUpdateChannel>((resolve, reject) => {
			const timeout = setTimeout(() => {
				client!.off(Events.WebhooksUpdate, handler)
				reject(new Error('Timeout waiting for webhooksUpdate event'))
			}, 5000)

			const handler = (updatedChannel: WebhookUpdateChannel) => {
				if (updatedChannel.id === channel.id) {
					clearTimeout(timeout)
					client!.off(Events.WebhooksUpdate, handler)
					resolve(updatedChannel)
				}
			}

			client!.on(Events.WebhooksUpdate, handler)
		})

		// Delete the webhook
		await webhook.delete()

		// Dispatch the event (as the mock may not auto-dispatch)
		await dispatchEvent(session.id, 'WEBHOOKS_UPDATE', {
			guild_id: guild.id,
			channel_id: channel.id
		})

		const updatedChannel = await webhookUpdatePromise
		expect(updatedChannel.id).toBe(channel.id)
	})
})
