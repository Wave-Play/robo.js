/**
 * Webhook Avatar & Name Tests
 *
 * Tests for webhook customization including custom username/avatar on send
 * and editing webhook properties.
 */
import { ChannelType, Client, GatewayIntentBits, TextChannel, Webhook } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Webhook Avatar & Name', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel
	let webhook: Webhook

	beforeAll(async () => {
		session = await createSession({
			name: 'webhook-customization-tests',
			config: {
				guilds: [
					{
						name: 'Webhook Test Guild',
						channels: [{ name: 'webhook-channel', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createTestClient({
			intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildWebhooks]
		})
		await client.login(session.token)
		await waitForReady(client)

		const guild = client.guilds.cache.first()!
		channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel
		webhook = await channel.createWebhook({ name: 'Test Webhook' })
	})

	afterAll(async () => {
		if (webhook) {
			await webhook.delete().catch(() => {})
		}
		await destroyClient(client)
		client = null
	})

	describe('Custom Username on Send', () => {
		it('should send with custom username', async () => {
			const message = await webhook.send({
				content: 'Custom username message',
				username: 'Custom Bot Name'
			})

			expect(message.author.username).toBe('Custom Bot Name')
		})
	})

	describe('Custom Avatar on Send', () => {
		it('should send with custom avatar', async () => {
			const message = await webhook.send({
				content: 'Custom avatar message',
				avatarURL: 'https://cdn.discordapp.com/embed/avatars/0.png'
			})

			// Avatar should be defined (different from default)
			expect(message.author.avatar).toBeDefined()
		})
	})

	describe('Custom Username and Avatar', () => {
		it('should send with both custom username and avatar', async () => {
			const message = await webhook.send({
				content: 'Both custom',
				username: 'Impersonator',
				avatarURL: 'https://cdn.discordapp.com/embed/avatars/1.png'
			})

			expect(message.author.username).toBe('Impersonator')
		})
	})

	describe('Editing Webhook', () => {
		it('should edit webhook name', async () => {
			await webhook.edit({ name: 'Renamed Webhook' })

			expect(webhook.name).toBe('Renamed Webhook')
		})

		it('should edit webhook avatar', async () => {
			const avatarData =
				'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

			await webhook.edit({ avatar: avatarData })

			expect(webhook.avatar).toBeDefined()
		})

		it('should edit webhook channel', async () => {
			const guild = client!.guilds.cache.first()!

			const newChannel = (await guild.channels.create({
				name: 'webhook-move',
				type: ChannelType.GuildText
			})) as TextChannel

			try {
				await webhook.edit({ channel: newChannel.id })

				expect(webhook.channelId).toBe(newChannel.id)
			} finally {
				await newChannel.delete().catch(() => {})
			}
		})
	})
})
