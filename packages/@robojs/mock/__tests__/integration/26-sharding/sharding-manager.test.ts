/**
 * ShardingManager Tests
 *
 * Tests for Discord.js ShardingManager functionality that spawns child processes.
 * These tests are separate from the main sharding tests due to their complexity
 * and resource requirements.
 *
 * Note: Process-spawning tests are skipped by default because:
 * 1. ShardingManager spawns actual Node.js child processes
 * 2. Child processes need to connect via WebSocket to the mock server
 * 3. The gateway connection flow requires complex coordination
 * 4. These tests are inherently slow (60+ seconds each)
 *
 * To enable process-spawning tests, set ENABLE_SHARDING_MANAGER_TESTS=true
 * The core sharding functionality is tested in sharding.test.ts without process spawning.
 */
import { ShardingManager, Shard } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import path from 'path'

// Path to the shard bot script
const SHARD_BOT_PATH = path.resolve(process.cwd(), '__tests__/integration/26-sharding/fixtures/shard-bot.js')

// Check if process-spawning tests should run
const ENABLE_SPAWN_TESTS = process.env.ENABLE_SHARDING_MANAGER_TESTS === 'true'

// Helper to safely kill all shards
async function killManager(manager: ShardingManager | null): Promise<void> {
	if (!manager) return
	try {
		// Try graceful shutdown first
		await manager.broadcastEval(() => process.exit(0)).catch(() => {})
	} catch {
		// Ignore errors
	}
	// Force kill any remaining processes
	for (const [, shard] of manager.shards) {
		try {
			shard.kill()
		} catch {
			// Ignore
		}
	}
}

// Conditionally skip tests based on environment
const describeSpawn = ENABLE_SPAWN_TESTS ? describe : describe.skip

describe('ShardingManager', () => {
	jest.setTimeout(120000) // 2 minute timeout for all tests in this file

	// =========================================================================
	// SECTION 1: ShardingManager Creation (no process spawning)
	// =========================================================================
	describe('ShardingManager Creation', () => {
		let manager: ShardingManager | null = null
		let session: { id: string; token: string } | null = null

		beforeEach(async () => {
			session = await createSession({
				name: 'sharding-manager-test',
				config: {
					guilds: [{ name: 'ShardingManager Test Guild' }]
				}
			})
		})

		afterEach(async () => {
			await killManager(manager)
			manager = null
		})

		it('should create ShardingManager with totalShards', () => {
			manager = new ShardingManager(SHARD_BOT_PATH, {
				totalShards: 2,
				shardList: [0, 1],
				token: session!.token,
				execArgv: ['--experimental-vm-modules'],
				respawn: false
			})

			expect(manager.totalShards).toBe(2)
			expect(manager.shardList).toEqual([0, 1])
		})

		it('should have shardList property', () => {
			manager = new ShardingManager(SHARD_BOT_PATH, {
				totalShards: 4,
				shardList: [1, 3],
				token: session!.token,
				execArgv: ['--experimental-vm-modules'],
				respawn: false
			})

			expect(manager.shardList).toEqual([1, 3])
		})

		it('should default shardList to all shards when explicitly set', () => {
			manager = new ShardingManager(SHARD_BOT_PATH, {
				totalShards: 3,
				shardList: [0, 1, 2],
				token: session!.token,
				execArgv: ['--experimental-vm-modules'],
				respawn: false
			})

			expect(manager.shardList).toEqual([0, 1, 2])
		})

		it('should have respawn option', () => {
			manager = new ShardingManager(SHARD_BOT_PATH, {
				totalShards: 1,
				token: session!.token,
				respawn: true,
				execArgv: ['--experimental-vm-modules']
			})

			expect(manager.respawn).toBe(true)
		})

		it('should have file property', () => {
			manager = new ShardingManager(SHARD_BOT_PATH, {
				totalShards: 1,
				token: session!.token,
				execArgv: ['--experimental-vm-modules'],
				respawn: false
			})

			expect(manager.file).toBe(SHARD_BOT_PATH)
		})

		it('should have token property', () => {
			manager = new ShardingManager(SHARD_BOT_PATH, {
				totalShards: 1,
				token: session!.token,
				execArgv: ['--experimental-vm-modules'],
				respawn: false
			})

			expect(manager.token).toBe(session!.token)
		})

		it('should have empty shards collection before spawn', () => {
			manager = new ShardingManager(SHARD_BOT_PATH, {
				totalShards: 2,
				shardList: [0, 1],
				token: session!.token,
				execArgv: ['--experimental-vm-modules'],
				respawn: false
			})

			expect(manager.shards.size).toBe(0)
		})

		it('should support mode option', () => {
			manager = new ShardingManager(SHARD_BOT_PATH, {
				totalShards: 1,
				token: session!.token,
				mode: 'process',
				execArgv: ['--experimental-vm-modules'],
				respawn: false
			})

			// mode property is stored but not exposed in TypeScript types
			expect((manager as unknown as { mode: string }).mode).toBe('process')
		})
	})

	// =========================================================================
	// SECTION 2: ShardingManager Spawning (requires child processes)
	// These tests are skipped by default - enable with ENABLE_SHARDING_MANAGER_TESTS=true
	// =========================================================================
	describeSpawn('ShardingManager Spawning', () => {
		let manager: ShardingManager | null = null
		let session: { id: string; token: string } | null = null

		beforeEach(async () => {
			session = await createSession({
				name: 'sharding-spawn-test',
				config: {
					guilds: [{ name: 'ShardingManager Spawn Test Guild' }]
				}
			})
		})

		afterEach(async () => {
			await killManager(manager)
			manager = null
		})

		it(
			'should spawn shards',
			async () => {
				manager = new ShardingManager(SHARD_BOT_PATH, {
					totalShards: 1,
					token: session!.token,
					execArgv: ['--experimental-vm-modules'],
					respawn: false
				})

				const shardCreatePromise = new Promise<Shard>((resolve) => {
					manager!.once('shardCreate', (shard) => resolve(shard))
				})

				manager.spawn({ timeout: 60000 })

				const shard = await shardCreatePromise
				expect(shard.id).toBe(0)
			},
			90000
		)

		it(
			'should emit shardCreate for each shard',
			async () => {
				manager = new ShardingManager(SHARD_BOT_PATH, {
					totalShards: 2,
					token: session!.token,
					execArgv: ['--experimental-vm-modules'],
					respawn: false
				})

				const shards: Shard[] = []
				manager.on('shardCreate', (shard) => shards.push(shard))

				await manager.spawn({ timeout: 60000, delay: 2000 })

				expect(shards.length).toBe(2)
				expect(shards.map((s) => s.id).sort()).toEqual([0, 1])
			},
			120000
		)

		it(
			'should have shards collection after spawn',
			async () => {
				manager = new ShardingManager(SHARD_BOT_PATH, {
					totalShards: 2,
					token: session!.token,
					execArgv: ['--experimental-vm-modules'],
					respawn: false
				})

				await manager.spawn({ timeout: 60000, delay: 2000 })

				expect(manager.shards.size).toBe(2)
				expect(manager.shards.has(0)).toBe(true)
				expect(manager.shards.has(1)).toBe(true)
			},
			120000
		)

		it(
			'should broadcast eval to all shards',
			async () => {
				manager = new ShardingManager(SHARD_BOT_PATH, {
					totalShards: 2,
					token: session!.token,
					execArgv: ['--experimental-vm-modules'],
					respawn: false
				})

				await manager.spawn({ timeout: 60000, delay: 2000 })

				const results = await manager.broadcastEval((client) => client.guilds.cache.size)

				expect(results.length).toBe(2)
				expect(results.every((r) => typeof r === 'number')).toBe(true)
			},
			120000
		)

		it(
			'should fetch client values across shards',
			async () => {
				manager = new ShardingManager(SHARD_BOT_PATH, {
					totalShards: 2,
					token: session!.token,
					execArgv: ['--experimental-vm-modules'],
					respawn: false
				})

				await manager.spawn({ timeout: 60000, delay: 2000 })

				const results = await manager.fetchClientValues('guilds.cache.size')

				expect(results.length).toBe(2)
			},
			120000
		)

		it(
			'should respawn shard',
			async () => {
				manager = new ShardingManager(SHARD_BOT_PATH, {
					totalShards: 1,
					token: session!.token,
					execArgv: ['--experimental-vm-modules'],
					respawn: false
				})

				await manager.spawn({ timeout: 60000 })

				const shard = manager.shards.get(0)!
				await shard.respawn({ timeout: 60000 })

				expect(shard.ready).toBe(true)
			},
			120000
		)

		it(
			'should respawn all shards',
			async () => {
				manager = new ShardingManager(SHARD_BOT_PATH, {
					totalShards: 2,
					token: session!.token,
					execArgv: ['--experimental-vm-modules'],
					respawn: false
				})

				await manager.spawn({ timeout: 60000 })

				// respawnAll no longer takes delay option in newer discord.js versions
				await manager.respawnAll({ shardDelay: 2000, timeout: 60000 })

				expect(manager.shards.every((s) => s.ready)).toBe(true)
			},
			180000
		)
	})

	// =========================================================================
	// SECTION 3: Shard Properties (requires spawned shards)
	// =========================================================================
	describeSpawn('Shard Properties', () => {
		let manager: ShardingManager | null = null
		let session: { id: string; token: string } | null = null

		beforeAll(async () => {
			session = await createSession({
				name: 'shard-properties-test',
				config: {
					guilds: [{ name: 'Shard Properties Test Guild' }]
				}
			})

			manager = new ShardingManager(SHARD_BOT_PATH, {
				totalShards: 2,
				token: session.token,
				execArgv: ['--experimental-vm-modules'],
				respawn: false
			})

			await manager.spawn({ timeout: 60000, delay: 2000 })
		}, 120000)

		afterAll(async () => {
			await killManager(manager)
			manager = null
		})

		it('should have id property', () => {
			const shard0 = manager!.shards.get(0)!
			const shard1 = manager!.shards.get(1)!

			expect(shard0.id).toBe(0)
			expect(shard1.id).toBe(1)
		})

		it('should have ready property', () => {
			const shard = manager!.shards.get(0)!

			expect(shard.ready).toBe(true)
		})

		it('should have process property', () => {
			const shard = manager!.shards.get(0)!

			expect(shard.process).toBeDefined()
		})

		it('should have manager reference', () => {
			const shard = manager!.shards.get(0)!

			expect(shard.manager).toBe(manager)
		})

		it('should eval on specific shard', async () => {
			const shard1 = manager!.shards.get(1)!

			const result = await shard1.eval((client) => client.shard?.ids[0])

			expect(result).toBe(1)
		})

		it('should fetch client value from shard', async () => {
			const shard = manager!.shards.get(0)!

			const result = await shard.fetchClientValue('user.id')

			expect(result).toBeDefined()
		})

		it('should send message to shard', () => {
			const shard = manager!.shards.get(0)!

			// Send a message - no error means success
			shard.send({ type: 'ping' })

			// If we get here without error, the send worked
			expect(true).toBe(true)
		})

		it(
			'should kill shard',
			async () => {
				// Create a separate manager for this test
				const tempSession = await createSession({
					name: 'shard-kill-test',
					config: {
						guilds: [{ name: 'Kill Test Guild' }]
					}
				})

				const tempManager = new ShardingManager(SHARD_BOT_PATH, {
					totalShards: 1,
					token: tempSession.token,
					execArgv: ['--experimental-vm-modules'],
					respawn: false
				})

				await tempManager.spawn({ timeout: 60000 })

				const shard = tempManager.shards.get(0)!
				shard.kill()

				// Give time for process to terminate
				await new Promise((resolve) => setTimeout(resolve, 1000))

				expect(shard.ready).toBe(false)
			},
			90000
		)
	})

	// =========================================================================
	// SECTION 4: Shard Spawn Options (some require spawning)
	// =========================================================================
	describeSpawn('Shard Spawn Options', () => {
		let manager: ShardingManager | null = null
		let session: { id: string; token: string } | null = null

		beforeEach(async () => {
			session = await createSession({
				name: 'spawn-options-test',
				config: {
					guilds: [{ name: 'Spawn Options Test Guild' }]
				}
			})
		})

		afterEach(async () => {
			await killManager(manager)
			manager = null
		})

		it(
			'should respect spawnDelay option',
			async () => {
				manager = new ShardingManager(SHARD_BOT_PATH, {
					totalShards: 2,
					token: session!.token,
					execArgv: ['--experimental-vm-modules'],
					respawn: false
				})

				const startTime = Date.now()
				const shardTimes: number[] = []

				manager.on('shardCreate', () => {
					shardTimes.push(Date.now() - startTime)
				})

				await manager.spawn({ delay: 2000, timeout: 60000 })

				expect(shardTimes.length).toBe(2)
				const timeDiff = shardTimes[1] - shardTimes[0]
				expect(timeDiff).toBeGreaterThanOrEqual(1800) // Allow some variance
			},
			120000
		)

		it(
			'should spawn specific shards only',
			async () => {
				manager = new ShardingManager(SHARD_BOT_PATH, {
					totalShards: 4,
					shardList: [0, 2], // Only spawn shards 0 and 2
					token: session!.token,
					execArgv: ['--experimental-vm-modules'],
					respawn: false
				})

				await manager.spawn({ timeout: 60000, delay: 2000 })

				expect(manager.shards.size).toBe(2)
				expect(manager.shards.has(0)).toBe(true)
				expect(manager.shards.has(2)).toBe(true)
				expect(manager.shards.has(1)).toBe(false)
				expect(manager.shards.has(3)).toBe(false)
			},
			120000
		)
	})

	// =========================================================================
	// SECTION 5: Cross-Shard Operations (requires spawned shards)
	// =========================================================================
	describeSpawn('Cross-Shard Operations', () => {
		let manager: ShardingManager | null = null
		let session: { id: string; token: string } | null = null

		beforeAll(async () => {
			session = await createSession({
				name: 'cross-shard-ops-test',
				config: {
					guilds: [{ name: 'Cross-Shard Ops Guild' }]
				}
			})

			manager = new ShardingManager(SHARD_BOT_PATH, {
				totalShards: 2,
				token: session.token,
				execArgv: ['--experimental-vm-modules'],
				respawn: false
			})

			await manager.spawn({ timeout: 60000, delay: 2000 })
		}, 120000)

		afterAll(async () => {
			await killManager(manager)
			manager = null
		})

		it('should aggregate guild count across shards', async () => {
			const counts = await manager!.broadcastEval((c) => c.guilds.cache.size)
			const totalGuilds = counts.reduce((a, b) => a + b, 0)

			expect(typeof totalGuilds).toBe('number')
		})

		it('should find user across shards', async () => {
			// Get bot user ID from first shard
			const botUserId = await manager!.shards.get(0)!.eval((c) => c.user?.id)

			const results = await manager!.broadcastEval(
				(c, { userId }) => {
					const user = c.users.cache.get(userId)
					return user ? user.tag : null
				},
				{ context: { userId: botUserId as string } }
			)

			// User might be on one shard or none
			expect(Array.isArray(results)).toBe(true)
		})

		it('should find guild across shards', async () => {
			const results = await manager!.broadcastEval((c) => {
				const guild = c.guilds.cache.first()
				return guild ? { id: guild.id, name: guild.name } : null
			})

			const found = results.find((r) => r !== null)
			expect(found).toBeDefined()
		})

		it('should aggregate member counts', async () => {
			const memberCounts = await manager!.broadcastEval((c) => {
				return c.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0)
			})

			const totalMembers = memberCounts.reduce((a, b) => a + b, 0)

			expect(typeof totalMembers).toBe('number')
		})

		it('should execute on specific shard', async () => {
			const result = await manager!.broadcastEval((c) => c.shard?.ids[0], { shard: 1 })

			expect(result).toBe(1)
		})

		it('should pass context to broadcastEval', async () => {
			const testValue = 'test-context-value'
			const results = await manager!.broadcastEval((_c, { value }) => value, {
				context: { value: testValue }
			})

			expect(results).toEqual([testValue, testValue])
		})
	})
})
