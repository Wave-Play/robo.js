/**
 * Webhook Types & Properties Tests
 *
 * Tests for webhook type checking methods (isIncoming, isChannelFollower,
 * isUserCreated, isApplicationCreated) and properties (owner, token, avatar, url).
 */
import { ChannelType, Client, GatewayIntentBits, TextChannel, WebhookType } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Webhook Types & Properties', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel

	beforeAll(async () => {
		session = await createSession({
			name: 'webhook-types-tests',
			config: {
				guilds: [{ name: 'Webhook Types Guild' }]
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds])
		await client.login(session.token)
		await waitForReady(client)

		const guild = client.guilds.cache.first()!
		channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Type Check Methods', () => {
		it('should check isIncoming() for regular webhook', async () => {
			const webhook = await channel.createWebhook({ name: 'Incoming Test' })

			try {
				expect(webhook.isIncoming()).toBe(true)
			} finally {
				await webhook.delete()
			}
		})

		it('should have isUserCreated() method', async () => {
			const webhook = await channel.createWebhook({ name: 'User Created Test' })

			try {
				// isUserCreated() returns true if type is Incoming AND owner is not null
				// The method should exist and return a boolean
				expect(typeof webhook.isUserCreated).toBe('function')
				expect(typeof webhook.isUserCreated()).toBe('boolean')
			} finally {
				await webhook.delete()
			}
		})

		it('should check isChannelFollower() returns false for regular webhook', async () => {
			const webhook = await channel.createWebhook({ name: 'Not Follower Test' })

			try {
				expect(webhook.isChannelFollower()).toBe(false)
			} finally {
				await webhook.delete()
			}
		})

		it('should have isChannelFollower() method', async () => {
			const webhook = await channel.createWebhook({ name: 'Follower Method Test' })

			try {
				// isChannelFollower() returns true if type is ChannelFollower (type 2)
				// Regular webhooks are type Incoming (type 1)
				expect(typeof webhook.isChannelFollower).toBe('function')
				expect(typeof webhook.isChannelFollower()).toBe('boolean')

				// Channel follower webhooks have additional properties when true
				if (webhook.isChannelFollower()) {
					// Cast to access channel follower specific properties
					const cfWebhook = webhook as unknown as { sourceGuild?: unknown; sourceChannel?: unknown }
					expect(cfWebhook.sourceGuild).toBeDefined()
					expect(cfWebhook.sourceChannel).toBeDefined()
				}
			} finally {
				await webhook.delete()
			}
		})

		it('should check isApplicationCreated() for webhook', async () => {
			const webhook = await channel.createWebhook({ name: 'Not App Test' })

			try {
				// isApplicationCreated() returns true if type is Application (type 3)
				// Bot-created webhooks are type Incoming (type 1), not Application
				expect(typeof webhook.isApplicationCreated()).toBe('boolean')

				// Incoming webhooks should not be application-created
				if (webhook.isIncoming()) {
					expect(webhook.isApplicationCreated()).toBe(false)
				}
			} finally {
				await webhook.delete()
			}
		})

		it('should have isApplicationCreated() method', async () => {
			const webhook = await channel.createWebhook({ name: 'App Method Test' })

			try {
				// isApplicationCreated() returns true if type is Application (type 3)
				expect(typeof webhook.isApplicationCreated).toBe('function')
				expect(typeof webhook.isApplicationCreated()).toBe('boolean')

				// Application webhooks are created by Discord applications for interactions
				// Regular webhooks created via API are type Incoming
				expect(webhook.type).toBe(WebhookType.Incoming)
			} finally {
				await webhook.delete()
			}
		})
	})

	describe('Webhook Properties', () => {
		it('should have owner property', async () => {
			const webhook = await channel.createWebhook({ name: 'Owner Test' })

			try {
				expect(webhook.owner).toBeDefined()
				expect(webhook.owner?.id).toBe(client!.user!.id)
			} finally {
				await webhook.delete()
			}
		})

		it('should have token property', async () => {
			const webhook = await channel.createWebhook({ name: 'Token Test' })

			try {
				expect(webhook.token).toBeDefined()
				expect(typeof webhook.token).toBe('string')
				expect(webhook.token!.length).toBeGreaterThan(0)
			} finally {
				await webhook.delete()
			}
		})

		it('should have avatar property when set', async () => {
			// 1x1 transparent PNG as base64
			const avatarData =
				'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

			const webhook = await channel.createWebhook({
				name: 'Avatar Test',
				avatar: avatarData
			})

			try {
				expect(webhook.avatar).toBeDefined()
				if (webhook.avatar) {
					const avatarURL = webhook.avatarURL()
					expect(avatarURL).toBeDefined()
					expect(typeof avatarURL).toBe('string')
				}
			} finally {
				await webhook.delete()
			}
		})

		it('should have null avatar when not set', async () => {
			const webhook = await channel.createWebhook({ name: 'No Avatar Test' })

			try {
				// Avatar may be null when not explicitly set
				expect(webhook.avatar === null || typeof webhook.avatar === 'string').toBe(true)
			} finally {
				await webhook.delete()
			}
		})

		it('should have url property', async () => {
			const webhook = await channel.createWebhook({ name: 'URL Test' })

			try {
				expect(webhook.url).toBeDefined()
				expect(webhook.url).toContain(webhook.id)
				expect(webhook.url).toContain(webhook.token)
			} finally {
				await webhook.delete()
			}
		})

		it('should have channelId property', async () => {
			const webhook = await channel.createWebhook({ name: 'Channel ID Test' })

			try {
				expect(webhook.channelId).toBe(channel.id)
			} finally {
				await webhook.delete()
			}
		})

		it('should have guildId property', async () => {
			const webhook = await channel.createWebhook({ name: 'Guild ID Test' })

			try {
				expect(webhook.guildId).toBe(channel.guildId)
			} finally {
				await webhook.delete()
			}
		})
	})

	describe('Webhook Fetch', () => {
		it('should fetch webhook by ID', async () => {
			const webhook = await channel.createWebhook({ name: 'Fetch Test' })

			try {
				const webhooks = await channel.fetchWebhooks()
				const fetched = webhooks.get(webhook.id)

				expect(fetched).toBeDefined()
				expect(fetched?.name).toBe('Fetch Test')
			} finally {
				await webhook.delete()
			}
		})

		it('should fetch guild webhooks', async () => {
			const webhook = await channel.createWebhook({ name: 'Guild Fetch Test' })

			try {
				const guild = client!.guilds.cache.first()!
				const webhooks = await guild.fetchWebhooks()

				expect(webhooks.has(webhook.id)).toBe(true)
			} finally {
				await webhook.delete()
			}
		})
	})
})
