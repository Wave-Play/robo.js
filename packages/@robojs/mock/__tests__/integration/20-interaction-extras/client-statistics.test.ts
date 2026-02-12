import { Client } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Client Statistics', () => {
	let client: Client | null = null
	let session: { id: string; token: string }

	beforeAll(async () => {
		session = await createSession({
			name: 'client-statistics',
			config: {
				guilds: [
					{
						name: 'Test Guild',
						channels: [{ name: 'general', type: 0 }]
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

	it('should have guild count', () => {
		expect(client!.guilds.cache.size).toBeGreaterThan(0)
	})

	it('should have channel count', () => {
		expect(client!.channels.cache.size).toBeGreaterThan(0)
	})

	it('should have user count', () => {
		expect(client!.users.cache.size).toBeGreaterThan(0)
	})

	it('should have emoji count', () => {
		const emojiCount = client!.emojis.cache.size
		expect(emojiCount).toBeGreaterThanOrEqual(0)
	})

	it('should have voice states', () => {
		const guild = client!.guilds.cache.first()!
		expect(guild.voiceStates.cache).toBeDefined()
	})

	it('should have presences', () => {
		const guild = client!.guilds.cache.first()!
		expect(guild.presences.cache).toBeDefined()
	})
})
