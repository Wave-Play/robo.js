/**
 * Voice Region Fetching Tests
 *
 * Tests for fetching voice regions at both client and guild level.
 */
import { ChannelType, Client, GatewayIntentBits } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Voice Region Fetching', () => {
	let client: Client | null = null
	let session: { id: string; token: string }

	beforeAll(async () => {
		session = await createSession({
			name: 'voice-regions-tests',
			config: {
				guilds: [
					{
						name: 'Voice Regions Test',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds])
		await client.login(session.token)
		await waitForReady(client)
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	// Skip: guild.fetchVoiceRegions() was deprecated and removed in Discord.js v14
	// Use client.fetchVoiceRegions() instead for client-level voice regions
	describe('Guild Voice Regions', () => {
		it.skip('should fetch voice regions', async () => {
			// guild.fetchVoiceRegions() doesn't exist in Discord.js v14
		})

		it.skip('should have region properties', async () => {
			// guild.fetchVoiceRegions() doesn't exist in Discord.js v14
		})

		it.skip('should have optimal region', async () => {
			// guild.fetchVoiceRegions() doesn't exist in Discord.js v14
		})

		it.skip('should have region IDs as strings', async () => {
			// guild.fetchVoiceRegions() doesn't exist in Discord.js v14
		})

		it.skip('should have region names as strings', async () => {
			// guild.fetchVoiceRegions() doesn't exist in Discord.js v14
		})
	})

	describe('Client Voice Regions', () => {
		it('should fetch client voice regions', async () => {
			const regions = await client!.fetchVoiceRegions()

			expect(regions.size).toBeGreaterThan(0)
		})

		it('should have same structure as guild regions', async () => {
			const regions = await client!.fetchVoiceRegions()
			const region = regions.first()!

			expect(region.id).toBeDefined()
			expect(region.name).toBeDefined()
			expect(typeof region.optimal).toBe('boolean')
			expect(typeof region.deprecated).toBe('boolean')
			expect(typeof region.custom).toBe('boolean')
		})

		it('should include common regions', async () => {
			const regions = await client!.fetchVoiceRegions()

			// Should have at least some common regions
			const regionIds = Array.from(regions.keys())
			const commonRegions = ['us-west', 'us-east', 'europe']

			const hasCommonRegion = commonRegions.some((id) => regionIds.includes(id))
			expect(hasCommonRegion).toBe(true)
		})
	})

	describe('Region Properties', () => {
		it('should not have deprecated regions marked as optimal', async () => {
			// Use client.fetchVoiceRegions() since guild.fetchVoiceRegions() is deprecated
			const regions = await client!.fetchVoiceRegions()

			regions.forEach((region) => {
				if (region.deprecated) {
					expect(region.optimal).toBe(false)
				}
			})
		})

		it('should have unique region IDs', async () => {
			// Use client.fetchVoiceRegions() since guild.fetchVoiceRegions() is deprecated
			const regions = await client!.fetchVoiceRegions()
			const ids = Array.from(regions.keys())
			const uniqueIds = new Set(ids)

			expect(uniqueIds.size).toBe(ids.length)
		})
	})
})
