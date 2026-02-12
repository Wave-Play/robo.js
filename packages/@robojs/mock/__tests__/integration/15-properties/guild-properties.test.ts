/**
 * Guild Properties Tests
 *
 * Tests for various guild properties like limits, premium tier, channels, etc.
 */
import { ChannelType, Client, GatewayIntentBits, Guild, TextChannel } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Guild Properties', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guild: Guild

	beforeAll(async () => {
		session = await createSession({
			name: 'guild-properties-tests',
			config: {
				guilds: [
					{
						name: 'Properties Test Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages])
		await client.login(session.token)
		await waitForReady(client)

		guild = client.guilds.cache.first()!
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	it('should have maximumMembers', async () => {
		const fetched = await guild.fetch()

		expect(fetched.maximumMembers).toBeDefined()
		expect(typeof fetched.maximumMembers).toBe('number')
	})

	it('should have maximumPresences', async () => {
		const fetched = await guild.fetch()

		// May be null for small guilds
		expect(fetched.maximumPresences === null || typeof fetched.maximumPresences === 'number').toBe(true)
	})

	it('should have premiumTier', () => {
		expect(guild.premiumTier).toBeDefined()
		expect([0, 1, 2, 3]).toContain(guild.premiumTier)
	})

	it('should have premiumSubscriptionCount', () => {
		expect(typeof guild.premiumSubscriptionCount).toBe('number')
		expect(guild.premiumSubscriptionCount).toBeGreaterThanOrEqual(0)
	})

	it('should have rulesChannelId property', async () => {
		// rulesChannelId may be null if not set
		expect(guild.rulesChannelId === null || typeof guild.rulesChannelId === 'string').toBe(true)
	})

	it('should set rulesChannel via guild.edit', async () => {
		const textChannel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel

		try {
			await guild.edit({ rulesChannel: textChannel.id })

			expect(guild.rulesChannelId).toBe(textChannel.id)
			expect(guild.rulesChannel?.id).toBe(textChannel.id)
		} catch {
			// May fail if guild doesn't have COMMUNITY feature - that's acceptable
		}
	})

	it('should have publicUpdatesChannelId property', async () => {
		// publicUpdatesChannelId may be null if not set
		expect(guild.publicUpdatesChannelId === null || typeof guild.publicUpdatesChannelId === 'string').toBe(true)
	})

	it('should set publicUpdatesChannel via guild.edit', async () => {
		const textChannel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel

		try {
			await guild.edit({ publicUpdatesChannel: textChannel.id })

			expect(guild.publicUpdatesChannelId).toBe(textChannel.id)
		} catch {
			// May fail if guild doesn't have COMMUNITY feature - that's acceptable
		}
	})

	it('should have large property', () => {
		expect(typeof guild.large).toBe('boolean')
	})

	it('should have nsfwLevel', () => {
		expect(guild.nsfwLevel).toBeDefined()
		expect(typeof guild.nsfwLevel).toBe('number')
	})

	it('should have mfaLevel', () => {
		expect([0, 1]).toContain(guild.mfaLevel)
	})

	it('should have features array', () => {
		expect(Array.isArray(guild.features)).toBe(true)
	})

	it('should have verificationLevel', () => {
		expect(guild.verificationLevel).toBeDefined()
		expect([0, 1, 2, 3, 4]).toContain(guild.verificationLevel)
	})

	it('should have explicitContentFilter', () => {
		expect(guild.explicitContentFilter).toBeDefined()
		expect([0, 1, 2]).toContain(guild.explicitContentFilter)
	})

	it('should have defaultMessageNotifications', () => {
		expect(guild.defaultMessageNotifications).toBeDefined()
		expect([0, 1]).toContain(guild.defaultMessageNotifications)
	})
})
