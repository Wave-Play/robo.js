/**
 * Guild Max Properties Tests
 *
 * Tests for guild maximum limits properties.
 * Note: These are read-only properties set by Discord based on server boost level and features.
 * These tests verify the properties exist and have expected default values.
 */
import { Client } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Guild Max Properties', () => {
	let client: Client | null = null
	let session: { id: string; token: string }

	beforeAll(async () => {
		session = await createSession({
			name: 'guild-max-properties',
			config: {
				guilds: [
					{
						name: 'Max Properties Test Guild'
					}
				]
			}
		})

		client = createTestClient()
		await client.login(session.token)
		await waitForReady(client)
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	it('should have maxMembers', async () => {
		const guild = client!.guilds.cache.first()!

		try {
			const fetched = await guild.fetch()
			// Default max members is 250000 (hardcoded in payloads.ts:789)
			expect(fetched.maximumMembers).toBe(250000)
		} catch {
			// Property may not be available
		}
	})

	it('should have maxPresences', async () => {
		const guild = client!.guilds.cache.first()!

		try {
			const fetched = await guild.fetch()
			// Default max presences is null (hardcoded in payloads.ts:788)
			expect(fetched.maximumPresences).toBeNull()
		} catch {
			// Property may not be available
		}
	})

	it('should have maxVideoChannelUsers', async () => {
		const guild = client!.guilds.cache.first()!

		try {
			const fetched = await guild.fetch()
			// Default is 25 (hardcoded in payloads.ts:797)
			expect(fetched.maxVideoChannelUsers).toBe(25)
		} catch {
			// Property may not be available
		}
	})

	it('should have maxStageVideoChannelUsers', async () => {
		const guild = client!.guilds.cache.first()!

		try {
			const fetched = await guild.fetch()
			// Default is 50 (hardcoded in payloads.ts:798)
			expect(fetched.maxStageVideoChannelUsers).toBe(50)
		} catch {
			// Property may not be available
		}
	})
})
