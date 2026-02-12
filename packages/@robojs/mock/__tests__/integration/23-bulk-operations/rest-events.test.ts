/**
 * REST Events Tests
 *
 * Tests for REST client events including rate limiting and response events.
 */
import { Client, ChannelType, TextChannel, RESTEvents, GatewayIntentBits } from 'discord.js'
import { createSession, setRateLimitSimulation } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('REST Events', () => {
	let client: Client | null = null
	let session: { id: string; token: string }

	beforeAll(async () => {
		session = await createSession({
			name: 'rest-events',
			config: {
				guilds: [
					{
						name: 'REST Events Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createClientWithIntents([
			GatewayIntentBits.Guilds,
			GatewayIntentBits.GuildMessages
		])
		await client.login(session.token)
		await waitForReady(client)
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	it('should emit rateLimited event', async () => {
		const guild = client!.guilds.cache.first()!
		const channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel

		// Set up rate limit listener before triggering
		const rateLimitPromise = new Promise<unknown>((resolve, reject) => {
			const timeout = setTimeout(() => reject(new Error('Timeout waiting for rateLimited event')), 10000)
			client!.rest.on(RESTEvents.RateLimited, (info) => {
				clearTimeout(timeout)
				resolve(info)
			})
		})

		// Enable rate limit simulation
		await setRateLimitSimulation(session.id, true, 1)

		// Make a request that will be rate limited
		try {
			await channel.send('Rate limit test')
		} catch {
			// Expected to potentially fail or be delayed
		}

		// The event should have been emitted
		const info = await rateLimitPromise
		expect(info).toBeDefined()
	}, 15000)

	it('should have rate limit info properties', async () => {
		const guild = client!.guilds.cache.first()!
		const channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel

		// Set up rate limit listener
		const rateLimitPromise = new Promise<{
			timeToReset: number
			limit: number
			method: string
			url: string
			route: string
			global: boolean
		}>((resolve, reject) => {
			const timeout = setTimeout(() => reject(new Error('Timeout waiting for rateLimited event')), 10000)
			client!.rest.on(RESTEvents.RateLimited, (info) => {
				clearTimeout(timeout)
				resolve(info as typeof info & { timeToReset: number; limit: number; method: string; url: string; route: string; global: boolean })
			})
		})

		// Enable rate limit simulation with retry_after of 2 seconds
		await setRateLimitSimulation(session.id, true, 2)

		// Make a request that will be rate limited
		try {
			await channel.send('Rate limit properties test')
		} catch {
			// Expected
		}

		const info = await rateLimitPromise

		// Check that expected properties exist
		expect(info.timeToReset).toBeDefined()
		expect(typeof info.timeToReset).toBe('number')
		expect(info.method).toBeDefined()
		expect(info.url).toBeDefined()
		expect(info.route).toBeDefined()
		expect(typeof info.global).toBe('boolean')
	}, 15000)

	it('should emit response event', async () => {
		const guild = client!.guilds.cache.first()!

		// Set up response listener
		const responsePromise = new Promise<{ path: string; method: string }>((resolve, reject) => {
			const timeout = setTimeout(() => reject(new Error('Timeout waiting for response event')), 5000)
			const handler = (request: { path: string; method: string }) => {
				clearTimeout(timeout)
				client!.rest.off(RESTEvents.Response, handler)
				resolve(request)
			}
			client!.rest.on(RESTEvents.Response, handler)
		})

		// Make a REST request
		await guild.fetch()

		const response = await responsePromise

		expect(response.path).toBeDefined()
		expect(response.method).toBeDefined()
	})

	it('should handle rate limit with retry', async () => {
		const guild = client!.guilds.cache.first()!
		const channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel

		// Enable rate limit with short retry
		await setRateLimitSimulation(session.id, true, 1)

		// Request should eventually succeed after retry
		const message = await channel.send('Rate limit retry test')

		expect(message.content).toBe('Rate limit retry test')
	}, 15000)

	it('should emit global rate limit', async () => {
		const guild = client!.guilds.cache.first()!
		const channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel

		// Set up rate limit listener for global rate limit
		const rateLimitPromise = new Promise<{
			global: boolean
			timeToReset: number
		}>((resolve, reject) => {
			const timeout = setTimeout(() => reject(new Error('Timeout waiting for rateLimited event')), 10000)
			client!.rest.on(RESTEvents.RateLimited, (info) => {
				clearTimeout(timeout)
				resolve(info as typeof info & { global: boolean; timeToReset: number })
			})
		})

		// Enable rate limit simulation (mock server treats all as potentially global)
		await setRateLimitSimulation(session.id, true, 1)

		// Make a request
		try {
			await channel.send('Global rate limit test')
		} catch {
			// Expected
		}

		const info = await rateLimitPromise

		// Verify we got a rate limit event
		expect(info).toBeDefined()
		expect(typeof info.global).toBe('boolean')
	}, 15000)

	it('should have RESTEvents.HashSweep available', () => {
		// The HashSweep event is an internal Discord.js REST optimization event
		// that fires when stale route hashes are cleaned up (typically every 4 hours).
		// We verify the event constant exists but don't test the actual emission
		// as it would require either modifying REST internals or waiting hours.
		expect(RESTEvents.HashSweep).toBeDefined()
		expect(typeof RESTEvents.HashSweep).toBe('string')

		// Verify we can attach a listener (won't fire during normal test runs)
		const handler = () => {}
		client!.rest.on(RESTEvents.HashSweep, handler)
		client!.rest.off(RESTEvents.HashSweep, handler)
	})
})
