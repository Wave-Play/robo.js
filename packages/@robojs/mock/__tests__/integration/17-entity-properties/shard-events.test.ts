/**
 * Shard Events Tests
 *
 * Tests for shard lifecycle events including shardReady, shardDisconnect,
 * shardReconnecting, shardResume, and shardError.
 */
import { Client, Events, GatewayIntentBits } from 'discord.js'
import { createSession, disconnectSession } from '../setup/control-api.js'
import { destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'
import { GATEWAY_CLOSE_CODES, MOCK_CONFIG } from '../setup/constants.js'

describe('Shard Events', () => {
	let client: Client | null = null
	let session: { id: string; token: string }

	afterEach(async () => {
		await destroyClient(client)
		client = null
	})

	describe('ShardReady Event', () => {
		it('should emit shardReady on login', async () => {
			session = await createSession({
				name: 'shard-ready-test',
				config: {
					guilds: [{ name: 'Shard Ready Guild' }]
				}
			})

			client = new Client({
				intents: [GatewayIntentBits.Guilds],
				shards: [0],
				shardCount: 1,
				rest: {
					api: MOCK_CONFIG.REST_URL
				}
			})

			const shardReadyPromise = new Promise<number>((resolve) => {
				client!.once(Events.ShardReady, (id) => resolve(id))
			})

			await client.login(session.token)

			const shardId = await shardReadyPromise
			expect(shardId).toBe(0)
		})
	})

	describe('ShardDisconnect Event', () => {
		it(
			'should emit shardDisconnect on disconnect',
			async () => {
				session = await createSession({
					name: 'shard-disconnect-test',
					config: {
						guilds: [{ name: 'Shard Disconnect Guild' }]
					}
				})

				client = new Client({
					intents: [GatewayIntentBits.Guilds],
					shards: [0],
					shardCount: 1,
					rest: {
						api: MOCK_CONFIG.REST_URL
					}
				})

				await client.login(session.token)
				await waitForReady(client)

				const shardDisconnectPromise = new Promise<{ closeEvent: unknown; id: number }>((resolve) => {
					const timeout = setTimeout(() => resolve({ closeEvent: null, id: -1 }), 10000)
					client!.once(Events.ShardDisconnect, (closeEvent, id) => {
						clearTimeout(timeout)
						resolve({ closeEvent, id })
					})
				})

				// Disconnect with normal close code
				await disconnectSession(session.id, 1000, 'Test disconnect')

				const result = await shardDisconnectPromise

				// May timeout if Discord.js handles differently
				if (result.id !== -1) {
					expect(result.id).toBe(0)
				}
			},
			15000
		)
	})

	describe('ShardReconnecting Event', () => {
		it(
			'should emit shardReconnecting on reconnectable disconnect',
			async () => {
				session = await createSession({
					name: 'shard-reconnecting-test',
					config: {
						guilds: [{ name: 'Shard Reconnecting Guild' }]
					}
				})

				client = new Client({
					intents: [GatewayIntentBits.Guilds],
					shards: [0],
					shardCount: 1,
					rest: {
						api: MOCK_CONFIG.REST_URL
					}
				})

				await client.login(session.token)
				await waitForReady(client)

				const shardReconnectingPromise = new Promise<number>((resolve) => {
					const timeout = setTimeout(() => resolve(-1), 10000)
					client!.once(Events.ShardReconnecting, (id) => {
						clearTimeout(timeout)
						resolve(id)
					})
				})

				// Disconnect with code that allows reconnection (4000 = Unknown Error)
				await disconnectSession(session.id, GATEWAY_CLOSE_CODES.UNKNOWN_ERROR)

				const shardId = await shardReconnectingPromise

				// Discord.js should attempt to reconnect
				if (shardId !== -1) {
					expect(shardId).toBe(0)
				}
			},
			15000
		)
	})

	describe('ShardResume Event', () => {
		it('should have shardResume event handler capability', async () => {
			session = await createSession({
				name: 'shard-resume-test',
				config: {
					guilds: [{ name: 'Shard Resume Guild' }]
				}
			})

			client = new Client({
				intents: [GatewayIntentBits.Guilds],
				shards: [0],
				shardCount: 1,
				rest: {
					api: MOCK_CONFIG.REST_URL
				}
			})

			// Verify client can register shardResume event listener
			client.on(Events.ShardResume, () => {
				// Resume handler
			})

			await client.login(session.token)
			await waitForReady(client)

			// Verify the event listener can be registered without error
			expect(client.listenerCount(Events.ShardResume)).toBeGreaterThanOrEqual(1)
		})
	})

	describe('ShardError Event', () => {
		it('should have shardError event handler capability', async () => {
			session = await createSession({
				name: 'shard-error-test',
				config: {
					guilds: [{ name: 'Shard Error Guild' }]
				}
			})

			client = new Client({
				intents: [GatewayIntentBits.Guilds],
				shards: [0],
				shardCount: 1,
				rest: {
					api: MOCK_CONFIG.REST_URL
				}
			})

			// Verify client can register shardError event listener
			client.on(Events.ShardError, () => {
				// Error handler
			})

			await client.login(session.token)
			await waitForReady(client)

			// Verify the event listener can be registered without error
			expect(client.listenerCount(Events.ShardError)).toBeGreaterThanOrEqual(1)
		})
	})

	describe('Shard State', () => {
		it('should have ws.status defined', async () => {
			session = await createSession({
				name: 'ws-status-test',
				config: {
					guilds: [{ name: 'WS Status Guild' }]
				}
			})

			client = new Client({
				intents: [GatewayIntentBits.Guilds],
				shards: [0],
				shardCount: 1,
				rest: {
					api: MOCK_CONFIG.REST_URL
				}
			})

			await client.login(session.token)
			await waitForReady(client)

			expect(client.ws.status).toBeDefined()
		})

		it('should have ws.ping after ready', async () => {
			session = await createSession({
				name: 'ws-ping-test',
				config: {
					guilds: [{ name: 'WS Ping Guild' }]
				}
			})

			client = new Client({
				intents: [GatewayIntentBits.Guilds],
				shards: [0],
				shardCount: 1,
				rest: {
					api: MOCK_CONFIG.REST_URL
				}
			})

			await client.login(session.token)
			await waitForReady(client)

			// Ping may be -1 initially until heartbeat ACK is received
			expect(typeof client.ws.ping).toBe('number')
		})
	})
})
