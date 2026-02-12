/**
 * Guild Integrations & Vanity Tests
 *
 * Tests for guild integrations fetching, vanity URL management,
 * and guild webhooks fetching.
 */
import { ChannelType, Client, GatewayIntentBits, Guild, TextChannel } from 'discord.js'
import { createSession, mockRestAPI } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Guild Integrations & Vanity', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guild: Guild

	beforeAll(async () => {
		session = await createSession({
			name: 'guild-integrations-tests',
			config: {
				guilds: [
					{
						name: 'Integrations Test',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds, GatewayIntentBits.GuildWebhooks])
		await client.login(session.token)
		await waitForReady(client)

		guild = client.guilds.cache.first()!
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Guild Integrations', () => {
		it('should fetch guild integrations', async () => {
			const integrations = await guild.fetchIntegrations()

			expect(integrations).toBeDefined()
			// May be empty collection
		})

		it('should return collection', async () => {
			const integrations = await guild.fetchIntegrations()

			// Should be a Collection (Map-like)
			expect(typeof integrations.size).toBe('number')
		})
	})

	describe('Guild Vanity URL', () => {
		it('should fetch vanity data when feature enabled', async () => {
			// First, enable VANITY_URL feature via REST API
			await mockRestAPI(session.token, `/guilds/${guild.id}`, {
				method: 'PATCH',
				body: {
					features: ['VANITY_URL']
				}
			})

			// Set a vanity code
			await mockRestAPI(session.token, `/guilds/${guild.id}/vanity-url`, {
				method: 'PATCH',
				body: {
					code: 'testvanity'
				}
			})

			const vanity = await guild.fetchVanityData()

			expect(vanity.code).toBe('testvanity')
			expect(vanity.uses).toBeGreaterThanOrEqual(0)
		})

		it('should set vanity code', async () => {
			// Ensure VANITY_URL feature is enabled
			await mockRestAPI(session.token, `/guilds/${guild.id}`, {
				method: 'PATCH',
				body: {
					features: ['VANITY_URL']
				}
			})

			await mockRestAPI(session.token, `/guilds/${guild.id}/vanity-url`, {
				method: 'PATCH',
				body: {
					code: 'newvanity'
				}
			})

			const vanity = await guild.fetchVanityData()
			expect(vanity.code).toBe('newvanity')
		})

		it('should have uses count', async () => {
			const vanity = await guild.fetchVanityData()

			expect(typeof vanity.uses).toBe('number')
		})
	})

	describe('Guild Webhooks', () => {
		it('should fetch guild webhooks', async () => {
			const channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel

			// Create a webhook first
			const webhook = await channel.createWebhook({ name: 'Guild Webhook' })

			try {
				const webhooks = await guild.fetchWebhooks()

				expect(webhooks.has(webhook.id)).toBe(true)
			} finally {
				await webhook.delete()
			}
		})

		it('should return empty collection when no webhooks', async () => {
			// Create fresh guild scenario
			const webhooks = await guild.fetchWebhooks()

			// Should be a collection
			expect(typeof webhooks.size).toBe('number')
		})

		it('should include webhook from all channels', async () => {
			const channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel

			const webhook1 = await channel.createWebhook({ name: 'Webhook 1' })

			try {
				const webhooks = await guild.fetchWebhooks()

				expect(webhooks.size).toBeGreaterThanOrEqual(1)
			} finally {
				await webhook1.delete()
			}
		})
	})

	describe('Guild Vanity URL Code Property', () => {
		it('should have vanityURLCode property', () => {
			// vanityURLCode may be null if not set
			expect(guild.vanityURLCode === null || typeof guild.vanityURLCode === 'string').toBe(true)
		})

		it('should have vanityURLUses property', () => {
			// vanityURLUses may be null or number
			expect(guild.vanityURLUses === null || typeof guild.vanityURLUses === 'number').toBe(true)
		})
	})
})
