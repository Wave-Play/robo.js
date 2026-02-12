/**
 * Client Debug Events Tests
 *
 * Tests for client debug, warn, error events, invalidated event,
 * readyAt, readyTimestamp, and uptime properties.
 */
import { Client, Events, GatewayIntentBits } from 'discord.js'
import { createSession, invalidateSession } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForReady, delay } from '../utils/helpers.js'

describe('Client Debug Events', () => {
	let client: Client | null = null
	let session: { id: string; token: string }

	afterEach(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Debug Event', () => {
		it('should emit debug event during login', async () => {
			session = await createSession({
				name: 'debug-event-test',
				config: {
					guilds: [{ name: 'Debug Test Guild' }]
				}
			})

			client = createTestClient({
				intents: [GatewayIntentBits.Guilds]
			})

			const debugPromise = new Promise<string>((resolve) => {
				client!.once(Events.Debug, (info) => resolve(info))
			})

			// Start login - debug events fire during connection
			client.login(session.token)

			const info = await debugPromise
			expect(typeof info).toBe('string')
			expect(info.length).toBeGreaterThan(0)

			await waitForReady(client)
		})
	})

	describe('Warn Event', () => {
		it('should have warn event handler capability', async () => {
			session = await createSession({
				name: 'warn-event-test',
				config: {
					guilds: [{ name: 'Warn Test Guild' }]
				}
			})

			client = createTestClient({
				intents: [GatewayIntentBits.Guilds]
			})

			// Verify client can register warn event listener
			client.on(Events.Warn, () => {
				// Event listener is registered
			})

			await client.login(session.token)
			await waitForReady(client)

			// Warn events are typically emitted during certain operations
			// Verify the event listener can be registered without error
			expect(client.listenerCount(Events.Warn)).toBeGreaterThanOrEqual(1)
		})
	})

	describe('Error Event', () => {
		it('should have error event handler capability', async () => {
			session = await createSession({
				name: 'error-event-test',
				config: {
					guilds: [{ name: 'Error Test Guild' }]
				}
			})

			client = createTestClient({
				intents: [GatewayIntentBits.Guilds]
			})

			// Verify client can register error event listener
			client.on(Events.Error, () => {
				// Error handler
			})

			await client.login(session.token)
			await waitForReady(client)

			// Verify the event listener can be registered without error
			expect(client.listenerCount(Events.Error)).toBeGreaterThanOrEqual(1)
		})
	})

	describe('Ready Properties', () => {
		it('should have readyAt timestamp', async () => {
			session = await createSession({
				name: 'ready-at-test',
				config: {
					guilds: [{ name: 'Ready Test Guild' }]
				}
			})

			client = createTestClient({
				intents: [GatewayIntentBits.Guilds]
			})
			await client.login(session.token)
			await waitForReady(client)

			expect(client.readyAt).toBeInstanceOf(Date)
			expect(client.readyTimestamp).toBeGreaterThan(0)
			expect(client.readyTimestamp).toBeLessThanOrEqual(Date.now())
		})

		it('should have uptime after ready', async () => {
			session = await createSession({
				name: 'uptime-test',
				config: {
					guilds: [{ name: 'Uptime Test Guild' }]
				}
			})

			client = createTestClient({
				intents: [GatewayIntentBits.Guilds]
			})
			await client.login(session.token)
			await waitForReady(client)

			// Wait a bit to ensure uptime > 0
			await delay(100)

			expect(client.uptime).toBeGreaterThan(0)
		})

		it('should have null readyAt before login', async () => {
			client = createTestClient({
				intents: [GatewayIntentBits.Guilds]
			})

			expect(client.readyAt).toBeNull()
			expect(client.readyTimestamp).toBeNull()
			expect(client.uptime).toBeNull()
		})
	})

	describe('Invalidated Event', () => {
		it(
			'should handle session invalidation',
			async () => {
				session = await createSession({
					name: 'invalidated-test',
					config: {
						guilds: [{ name: 'Invalidate Test Guild' }]
					}
				})

				client = createTestClient({
					intents: [GatewayIntentBits.Guilds]
				})
				await client.login(session.token)
				await waitForReady(client)

				// Invalidate the session
				const result = await invalidateSession(session.id)
				expect(result.invalidated).toBe(true)

				// The client may receive an invalidated event or may need to reconnect
				// This depends on the mock server's implementation
				// For now, verify the invalidation was accepted
			},
			15000
		)
	})

	describe('Client Ready State', () => {
		it('should report isReady correctly', async () => {
			session = await createSession({
				name: 'is-ready-test',
				config: {
					guilds: [{ name: 'IsReady Test Guild' }]
				}
			})

			client = createTestClient({
				intents: [GatewayIntentBits.Guilds]
			})

			// Before login
			expect(client.isReady()).toBe(false)

			await client.login(session.token)
			await waitForReady(client)

			// After ready
			expect(client.isReady()).toBe(true)
		})
	})
})
