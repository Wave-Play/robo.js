/**
 * Guild Asset Methods Tests
 *
 * Tests for guild asset methods including setIcon, setBanner, setSplash,
 * and setDiscoverySplash.
 */
import { ChannelType, Client, Guild, GatewayIntentBits } from 'discord.js'
import { createSession, mockRestAPI } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

// 1x1 PNG image data URL for testing
const TEST_IMAGE_DATA =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

describe('Guild Asset Methods', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guild: Guild

	beforeAll(async () => {
		session = await createSession({
			name: 'guild-asset-tests',
			config: {
				guilds: [
					{
						name: 'Asset Test Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds])
		await client.login(session.token)
		await waitForReady(client)

		guild = client.guilds.cache.first()!
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Guild Icon', () => {
		it('should set guild icon', async () => {
			await guild.setIcon(TEST_IMAGE_DATA)

			expect(guild.icon).toBeDefined()
			expect(guild.icon).not.toBeNull()
		})

		it('should clear guild icon', async () => {
			// First set an icon
			await guild.setIcon(TEST_IMAGE_DATA)
			expect(guild.icon).not.toBeNull()

			// Then clear it
			await guild.setIcon(null)

			expect(guild.icon).toBeNull()
		})
	})

	describe('Guild Banner', () => {
		beforeAll(async () => {
			// Set premium tier via direct REST API to enable banner
			await mockRestAPI(session.token, `/guilds/${guild.id}`, {
				method: 'PATCH',
				body: { premium_tier: 2 }
			})
			// Refetch guild to get updated data
			await guild.fetch()
		})

		it('should set guild banner', async () => {
			await guild.setBanner(TEST_IMAGE_DATA)

			expect(guild.banner).toBeDefined()
		})

		it('should clear guild banner', async () => {
			await guild.setBanner(null)

			expect(guild.banner).toBeNull()
		})
	})

	describe('Guild Splash', () => {
		beforeAll(async () => {
			// Set premium tier via direct REST API to enable splash
			await mockRestAPI(session.token, `/guilds/${guild.id}`, {
				method: 'PATCH',
				body: { premium_tier: 1 }
			})
			await guild.fetch()
		})

		it('should set guild splash', async () => {
			await guild.setSplash(TEST_IMAGE_DATA)

			expect(guild.splash).toBeDefined()
		})

		it('should clear guild splash', async () => {
			await guild.setSplash(null)

			expect(guild.splash).toBeNull()
		})
	})

	describe('Guild Discovery Splash', () => {
		beforeAll(async () => {
			// Set features and premium tier to enable discovery splash
			await mockRestAPI(session.token, `/guilds/${guild.id}`, {
				method: 'PATCH',
				body: {
					features: ['DISCOVERABLE'],
					premium_tier: 1
				}
			})
			await guild.fetch()
		})

		it('should set discovery splash', async () => {
			await guild.setDiscoverySplash(TEST_IMAGE_DATA)

			expect(guild.discoverySplash).toBeDefined()
		})

		it('should clear discovery splash', async () => {
			await guild.setDiscoverySplash(null)

			expect(guild.discoverySplash).toBeNull()
		})
	})
})
