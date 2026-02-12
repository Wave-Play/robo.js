/**
 * Guild Splash & Banner Tests
 *
 * Tests for guild splash, banner, and discovery splash images.
 * Covers setting images, generating URLs, and guild features.
 */
import { Client } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Guild Splash & Banner', () => {
	let client: Client | null = null
	let session: { id: string; token: string }

	beforeAll(async () => {
		session = await createSession({
			name: 'guild-splash-banner',
			config: {
				guilds: [
					{
						name: 'Splash Banner Test Guild'
					}
				]
			}
		})

		client = createTestClient()
		await client.login(session.token)
		await waitForReady(client)

		// Enable features that allow splash/banner
		const guild = client.guilds.cache.first()!
		await guild.edit({ features: ['INVITE_SPLASH', 'BANNER', 'DISCOVERABLE'] })
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	it('should have splash property', () => {
		const guild = client!.guilds.cache.first()!

		expect('splash' in guild).toBe(true)
	})

	it('should set splash', async () => {
		const guild = client!.guilds.cache.first()!
		const splashData =
			'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

		await guild.setSplash(splashData)

		expect(guild.splash).toBeDefined()
	})

	it('should generate splashURL', async () => {
		const guild = client!.guilds.cache.first()!

		if (guild.splash) {
			const url = guild.splashURL({ size: 1024 })
			expect(url).toContain(guild.splash)
		}
	})

	it('should have banner property', () => {
		const guild = client!.guilds.cache.first()!

		expect('banner' in guild).toBe(true)
	})

	it('should set banner', async () => {
		const guild = client!.guilds.cache.first()!
		const bannerData =
			'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

		await guild.setBanner(bannerData)

		expect(guild.banner).toBeDefined()
	})

	it('should generate bannerURL', async () => {
		const guild = client!.guilds.cache.first()!

		if (guild.banner) {
			const url = guild.bannerURL({ size: 2048 })
			expect(url).toContain(guild.banner)
		}
	})

	it('should have discoverySplash', () => {
		const guild = client!.guilds.cache.first()!

		expect('discoverySplash' in guild).toBe(true)
	})

	it('should generate discoverySplashURL', async () => {
		const guild = client!.guilds.cache.first()!

		if (guild.discoverySplash) {
			const url = guild.discoverySplashURL()
			expect(url).toContain(guild.discoverySplash)
		}
	})
})
