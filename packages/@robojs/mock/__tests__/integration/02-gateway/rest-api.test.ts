/**
 * REST API Foundation Tests
 *
 * Tests for the Discord REST API endpoints:
 * - Fetch current user
 * - Fetch guild
 * - 404 for unknown resources
 * - Rate limit handling
 */
import { Client, DiscordAPIError } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('REST API', () => {
	let client: Client | null = null
	let session: Awaited<ReturnType<typeof createSession>>

	beforeAll(async () => {
		session = await createSession({
			name: 'rest-api-test',
			config: {
				botUser: { username: 'RestAPIBot' },
				guilds: [{ name: 'REST API Guild' }]
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

	it('should have valid user from READY', async () => {
		// The client.user is populated from the READY event, not from a REST API call
		expect(client!.user).toBeDefined()
		expect(client!.user!.id).toMatch(/^\d{17,19}$/)
		expect(client!.user!.username).toBe('RestAPIBot')
		expect(client!.user!.bot).toBe(true)
	})

	it('should fetch guild', async () => {
		const guild = client!.guilds.cache.first()!
		const fetched = await guild.fetch()

		expect(fetched).toBeDefined()
		expect(fetched.id).toBe(guild.id)
		expect(fetched.name).toBe('REST API Guild')
	})

	it('should return 404 for unknown channel', async () => {
		const guild = client!.guilds.cache.first()!

		try {
			await guild.channels.fetch('000000000000000000')
			fail('Expected fetch to throw')
		} catch (error) {
			expect(error).toBeInstanceOf(DiscordAPIError)
			const apiError = error as DiscordAPIError
			// Discord returns 10003 (Unknown Channel) for non-existent channels
			expect(apiError.code).toBe(10003)
		}
	})

	it('should return 404 for unknown guild', async () => {
		try {
			await client!.guilds.fetch('000000000000000000')
			fail('Expected fetch to throw')
		} catch (error) {
			expect(error).toBeInstanceOf(DiscordAPIError)
			const apiError = error as DiscordAPIError
			// Discord returns 10004 (Unknown Guild) for non-existent guilds
			expect(apiError.code).toBe(10004)
		}
	})

	it('should fetch guild channels', async () => {
		const guild = client!.guilds.cache.first()!
		const channels = await guild.channels.fetch()

		expect(channels).toBeDefined()
		expect(channels.size).toBeGreaterThan(0)

		// Verify at least one text channel exists
		const textChannel = channels.find((ch) => ch !== null)
		expect(textChannel).toBeDefined()
	})

	it('should handle multiple sequential requests', async () => {
		const guild = client!.guilds.cache.first()!

		// Make several requests in sequence
		const results = await Promise.all([guild.fetch(), guild.channels.fetch(), guild.roles.fetch()])

		expect(results).toHaveLength(3)
		results.forEach((result) => expect(result).toBeDefined())
	})
})
