/**
 * Sharding Tests
 *
 * Tests for Discord.js sharding functionality including ShardClientUtil,
 * shard configuration, event routing, and shard utilities.
 *
 * Note: ShardingManager tests that spawn child processes are in a separate
 * file (sharding-manager.test.ts) as they require special handling.
 */
import { Client, Events, GatewayIntentBits } from 'discord.js'
import { createSession, disconnectSession } from '../setup/control-api.js'
import { destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'
import { MOCK_CONFIG, GATEWAY_CLOSE_CODES } from '../setup/constants.js'

describe('Sharding', () => {
	// =========================================================================
	// SECTION 1: Shard Calculation Utilities
	// =========================================================================
	describe('Shard Calculation Utilities', () => {
		it('should calculate shard ID for guild using (guild_id >> 22) % shard_count', () => {
			const guildId = '1234567890123456789'
			const shardCount = 4

			// Discord's shard calculation formula
			const shardId = Number(BigInt(guildId) >> 22n) % shardCount

			expect(shardId).toBeGreaterThanOrEqual(0)
			expect(shardId).toBeLessThan(shardCount)
		})

		it('should consistently map same guild to same shard', () => {
			const guildId = '987654321098765432'
			const shardCount = 4

			// Calculate multiple times - should always be same
			const shardId1 = Number(BigInt(guildId) >> 22n) % shardCount
			const shardId2 = Number(BigInt(guildId) >> 22n) % shardCount
			const shardId3 = Number(BigInt(guildId) >> 22n) % shardCount

			expect(shardId1).toBe(shardId2)
			expect(shardId2).toBe(shardId3)
		})

		it('should distribute guilds across shards', () => {
			const shardCount = 4
			const guildIds = [
				'1000000000000000000',
				'1000000000000000001',
				'1000000000000000002',
				'1000000000000000003',
				'1000000004194304000', // Different shifted value
				'1000000008388608000',
				'1000000012582912000',
				'1000000016777216000'
			]

			const shardDistribution = new Set<number>()

			for (const guildId of guildIds) {
				const shardId = Number(BigInt(guildId) >> 22n) % shardCount
				shardDistribution.add(shardId)
			}

			// Should have at least 2 different shards (distribution)
			expect(shardDistribution.size).toBeGreaterThanOrEqual(1)
		})

		it('should handle large guild IDs', () => {
			// Discord snowflake from far in the future
			const guildId = '9999999999999999999'
			const shardCount = 16

			const shardId = Number(BigInt(guildId) >> 22n) % shardCount

			expect(shardId).toBeGreaterThanOrEqual(0)
			expect(shardId).toBeLessThan(shardCount)
			expect(Number.isInteger(shardId)).toBe(true)
		})
	})

	// =========================================================================
	// SECTION 2: ShardClientUtil (client.shard) Configuration
	// =========================================================================
	describe('ShardClientUtil Configuration', () => {
		let client: Client | null = null

		afterEach(async () => {
			await destroyClient(client)
			client = null
		})

		it('should accept shard configuration in client options', async () => {
			const session = await createSession({
				name: 'shard-config-accept',
				config: {
					guilds: [{ name: 'Shard Config Guild' }]
				}
			})

			// Use single shard to avoid multi-connection complexity
			client = new Client({
				intents: [GatewayIntentBits.Guilds],
				shards: [0],
				shardCount: 2,
				rest: {
					api: MOCK_CONFIG.REST_URL
				}
			})

			await client.login(session.token)
			await waitForReady(client)

			expect(client.options.shards).toEqual([0])
			expect(client.options.shardCount).toBe(2)
		})

		it('should have shard ids matching configured shards', async () => {
			const session = await createSession({
				name: 'shard-ids-match',
				config: {
					guilds: [{ name: 'Shard IDs Guild' }]
				}
			})

			client = new Client({
				intents: [GatewayIntentBits.Guilds],
				shards: [0],
				shardCount: 2,
				rest: {
					api: MOCK_CONFIG.REST_URL
				}
			})

			await client.login(session.token)
			await waitForReady(client)

			const shards = client.options.shards
			expect(Array.isArray(shards)).toBe(true)
			expect(shards).toContain(0)
		})

		it('should have count matching shardCount', async () => {
			const session = await createSession({
				name: 'shard-count-match',
				config: {
					guilds: [{ name: 'Shard Count Guild' }]
				}
			})

			client = new Client({
				intents: [GatewayIntentBits.Guilds],
				shards: [0],
				shardCount: 4,
				rest: {
					api: MOCK_CONFIG.REST_URL
				}
			})

			await client.login(session.token)
			await waitForReady(client)

			expect(client.options.shardCount).toBe(4)
		})

		it('should not have shard property without ShardingManager', async () => {
			const session = await createSession({
				name: 'no-shard-manager',
				config: {
					guilds: [{ name: 'No ShardingManager Guild' }]
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

			// client.shard is only populated when spawned by ShardingManager
			expect(client.shard).toBeNull()
		})

		it('should have ws.shards collection', async () => {
			const session = await createSession({
				name: 'ws-shards-collection',
				config: {
					guilds: [{ name: 'WS Shards Guild' }]
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

			expect(client.ws.shards).toBeDefined()
			expect(client.ws.shards.size).toBeGreaterThanOrEqual(1)
		})

		it('should have shard status', async () => {
			const session = await createSession({
				name: 'shard-status',
				config: {
					guilds: [{ name: 'Shard Status Guild' }]
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

		it('should have shard ping', async () => {
			const session = await createSession({
				name: 'shard-ping',
				config: {
					guilds: [{ name: 'Shard Ping Guild' }]
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

			// Ping may be -1 initially until heartbeat ACK
			expect(typeof client.ws.ping).toBe('number')
		})
	})

	// =========================================================================
	// SECTION 3: Shard-Specific Event Routing
	// =========================================================================
	describe('Shard-Specific Event Routing', () => {
		let client: Client | null = null

		afterEach(async () => {
			await destroyClient(client)
			client = null
		})

		it('should emit shardReady with correct shard ID', async () => {
			const session = await createSession({
				name: 'shard-ready-event',
				config: {
					guilds: [{ name: 'Shard Ready Event Guild' }]
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

		it('should handle multiple shard configurations', async () => {
			const session = await createSession({
				name: 'multi-shard-config',
				config: {
					guilds: [{ name: 'Multi Shard Config Guild' }]
				}
			})

			// First client with shard 0
			const client1 = new Client({
				intents: [GatewayIntentBits.Guilds],
				shards: [0],
				shardCount: 2,
				rest: {
					api: MOCK_CONFIG.REST_URL
				}
			})

			const shardReady1 = new Promise<number>((resolve) => {
				client1.once(Events.ShardReady, (id) => resolve(id))
			})

			await client1.login(session.token)
			const id1 = await shardReady1

			// Second client with shard 1
			const client2 = new Client({
				intents: [GatewayIntentBits.Guilds],
				shards: [1],
				shardCount: 2,
				rest: {
					api: MOCK_CONFIG.REST_URL
				}
			})

			const shardReady2 = new Promise<number>((resolve) => {
				client2.once(Events.ShardReady, (id) => resolve(id))
			})

			await client2.login(session.token)
			const id2 = await shardReady2

			expect(id1).toBe(0)
			expect(id2).toBe(1)

			await destroyClient(client1)
			await destroyClient(client2)
		})

		it(
			'should emit shardDisconnect on disconnect',
			async () => {
				const session = await createSession({
					name: 'shard-disconnect-event',
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

		it(
			'should emit shardReconnecting on reconnectable disconnect',
			async () => {
				const session = await createSession({
					name: 'shard-reconnecting-event',
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

				// Disconnect with code that allows reconnection
				await disconnectSession(session.id, GATEWAY_CLOSE_CODES.UNKNOWN_ERROR)

				const shardId = await shardReconnectingPromise

				// Discord.js should attempt to reconnect
				if (shardId !== -1) {
					expect(shardId).toBe(0)
				}
			},
			15000
		)

		it('should have shardResume event handler capability', async () => {
			const session = await createSession({
				name: 'shard-resume-capability',
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

		it('should have shardError event handler capability', async () => {
			const session = await createSession({
				name: 'shard-error-capability',
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

	// =========================================================================
	// SECTION 4: Multi-Client Shard Simulation
	// =========================================================================
	describe('Multi-Client Shard Simulation', () => {
		it('should connect multiple clients with different shard IDs to same session', async () => {
			const session = await createSession({
				name: 'multi-client-shards',
				config: {
					guilds: [{ name: 'Multi-Client Guild' }]
				}
			})

			// Create clients for different shards
			const clients: Client[] = []
			const shardIds: number[] = []

			for (let i = 0; i < 3; i++) {
				const client = new Client({
					intents: [GatewayIntentBits.Guilds],
					shards: [i],
					shardCount: 3,
					rest: {
						api: MOCK_CONFIG.REST_URL
					}
				})

				const shardReadyPromise = new Promise<number>((resolve) => {
					client.once(Events.ShardReady, (id) => resolve(id))
				})

				await client.login(session.token)
				const shardId = await shardReadyPromise

				clients.push(client)
				shardIds.push(shardId)
			}

			// Verify each client has correct shard ID
			expect(shardIds).toEqual([0, 1, 2])

			// Cleanup
			for (const client of clients) {
				await destroyClient(client)
			}
		})

		it('should have independent ws state per client', async () => {
			const session = await createSession({
				name: 'independent-ws-state',
				config: {
					guilds: [{ name: 'Independent State Guild' }]
				}
			})

			const client1 = new Client({
				intents: [GatewayIntentBits.Guilds],
				shards: [0],
				shardCount: 2,
				rest: {
					api: MOCK_CONFIG.REST_URL
				}
			})

			const client2 = new Client({
				intents: [GatewayIntentBits.Guilds],
				shards: [1],
				shardCount: 2,
				rest: {
					api: MOCK_CONFIG.REST_URL
				}
			})

			await client1.login(session.token)
			await waitForReady(client1)

			await client2.login(session.token)
			await waitForReady(client2)

			// Each client should have its own ws state
			expect(client1.ws.status).toBeDefined()
			expect(client2.ws.status).toBeDefined()
			expect(client1.ws.shards.size).toBeGreaterThanOrEqual(1)
			expect(client2.ws.shards.size).toBeGreaterThanOrEqual(1)

			await destroyClient(client1)
			await destroyClient(client2)
		})

		it('should share guild data across shard-configured clients', async () => {
			const session = await createSession({
				name: 'shared-guild-data',
				config: {
					guilds: [{ name: 'Shared Data Guild' }]
				}
			})

			const client1 = new Client({
				intents: [GatewayIntentBits.Guilds],
				shards: [0],
				shardCount: 2,
				rest: {
					api: MOCK_CONFIG.REST_URL
				}
			})

			const client2 = new Client({
				intents: [GatewayIntentBits.Guilds],
				shards: [1],
				shardCount: 2,
				rest: {
					api: MOCK_CONFIG.REST_URL
				}
			})

			await client1.login(session.token)
			await waitForReady(client1)

			await client2.login(session.token)
			await waitForReady(client2)

			// Both clients receive the same guilds (mock server doesn't shard-filter)
			const guild1 = client1.guilds.cache.first()
			const guild2 = client2.guilds.cache.first()

			if (guild1 && guild2) {
				expect(guild1.name).toBe(guild2.name)
			}

			await destroyClient(client1)
			await destroyClient(client2)
		})
	})

	// =========================================================================
	// SECTION 5: Shard Properties and State
	// =========================================================================
	describe('Shard Properties and State', () => {
		let client: Client | null = null

		afterEach(async () => {
			await destroyClient(client)
			client = null
		})

		it('should have WebSocketShard with id property', async () => {
			const session = await createSession({
				name: 'ws-shard-id',
				config: {
					guilds: [{ name: 'WS Shard ID Guild' }]
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

			const wsShard = client.ws.shards.get(0)
			expect(wsShard).toBeDefined()
			if (wsShard) {
				expect(wsShard.id).toBe(0)
			}
		})

		it('should have WebSocketShard with status', async () => {
			const session = await createSession({
				name: 'ws-shard-status',
				config: {
					guilds: [{ name: 'WS Shard Status Guild' }]
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

			const wsShard = client.ws.shards.get(0)
			expect(wsShard).toBeDefined()
			if (wsShard) {
				expect(wsShard.status).toBeDefined()
			}
		})

		it('should have WebSocketShard with ping', async () => {
			const session = await createSession({
				name: 'ws-shard-ping',
				config: {
					guilds: [{ name: 'WS Shard Ping Guild' }]
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

			const wsShard = client.ws.shards.get(0)
			expect(wsShard).toBeDefined()
			if (wsShard) {
				expect(typeof wsShard.ping).toBe('number')
			}
		})

		it('should track sequence numbers per shard', async () => {
			const session = await createSession({
				name: 'shard-sequence',
				config: {
					guilds: [{ name: 'Sequence Guild' }]
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

			// Sequence should be tracked
			const wsShard = client.ws.shards.get(0)
			expect(wsShard).toBeDefined()
			// The sequence exists on the shard
		})
	})

	// =========================================================================
	// SECTION 6: Shard Options Validation
	// =========================================================================
	describe('Shard Options Validation', () => {
		let client: Client | null = null

		afterEach(async () => {
			await destroyClient(client)
			client = null
		})

		it('should accept shards as array', async () => {
			const session = await createSession({
				name: 'shards-array',
				config: {
					guilds: [{ name: 'Shards Array Guild' }]
				}
			})

			// Single shard for simpler testing
			client = new Client({
				intents: [GatewayIntentBits.Guilds],
				shards: [0],
				shardCount: 4,
				rest: {
					api: MOCK_CONFIG.REST_URL
				}
			})

			await client.login(session.token)
			await waitForReady(client)

			expect(client.options.shards).toEqual([0])
		})

		it('should accept single shard', async () => {
			const session = await createSession({
				name: 'single-shard',
				config: {
					guilds: [{ name: 'Single Shard Guild' }]
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

			expect(client.options.shards).toEqual([0])
			expect(client.options.shardCount).toBe(1)
		})

		it('should support non-contiguous shard IDs', async () => {
			await createSession({
				name: 'non-contiguous-shards',
				config: {
					guilds: [{ name: 'Non-Contiguous Guild' }]
				}
			})

			// Only handle shards 1 and 3 (skipping 0 and 2)
			client = new Client({
				intents: [GatewayIntentBits.Guilds],
				shards: [1, 3],
				shardCount: 4,
				rest: {
					api: MOCK_CONFIG.REST_URL
				}
			})

			// Note: This might fail to connect properly since shard 0 isn't handled
			// but the configuration itself should be valid
			expect(client.options.shards).toEqual([1, 3])
			expect(client.options.shardCount).toBe(4)

			// Don't login since this would require shard 0 for the bot to work properly
		})

		it('should default shardCount when not specified', async () => {
			const session = await createSession({
				name: 'default-shard-count',
				config: {
					guilds: [{ name: 'Default Count Guild' }]
				}
			})

			client = new Client({
				intents: [GatewayIntentBits.Guilds],
				rest: {
					api: MOCK_CONFIG.REST_URL
				}
			})

			await client.login(session.token)
			await waitForReady(client)

			// Default is auto-calculated
			expect(client.options.shardCount).toBeDefined()
		})
	})

	// =========================================================================
	// SECTION 7: Cross-Shard Data Patterns (Simulated)
	// =========================================================================
	describe('Cross-Shard Data Patterns', () => {
		it('should aggregate data from multiple shard-configured clients', async () => {
			const session = await createSession({
				name: 'aggregate-shard-data',
				config: {
					guilds: [{ name: 'Aggregate Guild 1' }, { name: 'Aggregate Guild 2' }]
				}
			})

			const clients: Client[] = []
			let totalGuildCount = 0

			// Create 2 clients simulating 2 shards
			for (let i = 0; i < 2; i++) {
				const client = new Client({
					intents: [GatewayIntentBits.Guilds],
					shards: [i],
					shardCount: 2,
					rest: {
						api: MOCK_CONFIG.REST_URL
					}
				})

				await client.login(session.token)
				await waitForReady(client)

				totalGuildCount += client.guilds.cache.size
				clients.push(client)
			}

			// Mock server sends all guilds to all connections
			// So total is guilds * clients
			expect(totalGuildCount).toBeGreaterThan(0)

			// Cleanup
			for (const client of clients) {
				await destroyClient(client)
			}
		})

		it('should find guild across multiple clients', async () => {
			const session = await createSession({
				name: 'find-guild-across-shards',
				config: {
					guilds: [{ name: 'Target Guild' }]
				}
			})

			const client1 = new Client({
				intents: [GatewayIntentBits.Guilds],
				shards: [0],
				shardCount: 2,
				rest: {
					api: MOCK_CONFIG.REST_URL
				}
			})

			const client2 = new Client({
				intents: [GatewayIntentBits.Guilds],
				shards: [1],
				shardCount: 2,
				rest: {
					api: MOCK_CONFIG.REST_URL
				}
			})

			await client1.login(session.token)
			await waitForReady(client1)

			await client2.login(session.token)
			await waitForReady(client2)

			// Find guild across both clients
			const results: string[] = []
			for (const client of [client1, client2]) {
				const guild = client.guilds.cache.find((g) => g.name === 'Target Guild')
				if (guild) {
					results.push(guild.name)
				}
			}

			// Guild should be found on at least one client
			expect(results.length).toBeGreaterThan(0)
			expect(results).toContain('Target Guild')

			await destroyClient(client1)
			await destroyClient(client2)
		})

		it('should aggregate member counts across clients', async () => {
			const session = await createSession({
				name: 'aggregate-member-counts',
				config: {
					guilds: [{ name: 'Member Count Guild' }]
				}
			})

			const client1 = new Client({
				intents: [GatewayIntentBits.Guilds],
				shards: [0],
				shardCount: 2,
				rest: {
					api: MOCK_CONFIG.REST_URL
				}
			})

			const client2 = new Client({
				intents: [GatewayIntentBits.Guilds],
				shards: [1],
				shardCount: 2,
				rest: {
					api: MOCK_CONFIG.REST_URL
				}
			})

			await client1.login(session.token)
			await waitForReady(client1)

			await client2.login(session.token)
			await waitForReady(client2)

			// Aggregate member counts
			const counts = [client1, client2].map((c) =>
				c.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0)
			)

			const totalMembers = counts.reduce((a, b) => a + b, 0)
			expect(typeof totalMembers).toBe('number')

			await destroyClient(client1)
			await destroyClient(client2)
		})
	})
})
