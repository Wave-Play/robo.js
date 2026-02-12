/**
 * Heartbeat Tests
 *
 * Tests for the Discord Gateway heartbeat mechanism:
 * - Sending heartbeats and receiving ACKs
 * - Disconnect on missed heartbeat ACK
 */
import { Client } from 'discord.js'
import { createSession, stopHeartbeatAcks, setHeartbeatInterval } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForReady, delay } from '../utils/helpers.js'

describe('Heartbeat', () => {
	let client: Client | null = null
	let originalInterval: number

	beforeAll(async () => {
		// Save original interval and set a short one for testing
		// Heartbeat interval of 1000ms means first heartbeat will be within ~1 second
		const result = await setHeartbeatInterval(1000)
		originalInterval = 41250 // Default Discord interval
		expect(result.success).toBe(true)
	})

	afterAll(async () => {
		// Restore original heartbeat interval
		await setHeartbeatInterval(originalInterval)
	})

	afterEach(async () => {
		await destroyClient(client)
		client = null
	})

	it('should send heartbeats and receive ACKs', async () => {
		const session = await createSession({
			name: 'heartbeat-ack-test',
			config: {
				guilds: [{ name: 'Heartbeat Guild' }]
			}
		})

		client = createTestClient()
		await client.login(session.token)
		await waitForReady(client)

		// Wait for heartbeat cycle to complete (with 1000ms interval, wait ~3 seconds)
		// Discord.js sends first heartbeat at jitter * interval (0-1s), then receives ACK
		await delay(3000)

		// If ping is >= 0, heartbeats are working
		expect(client.ws.ping).toBeGreaterThanOrEqual(0)
		// Ping should be reasonable (less than 1 second for local mock)
		expect(client.ws.ping).toBeLessThan(1000)
	}, 10000)

	it('should detect missed heartbeat ACKs and attempt reconnection', async () => {
		const session = await createSession({
			name: 'heartbeat-timeout-test',
			config: {
				guilds: [{ name: 'Timeout Guild' }]
			}
		})

		client = createTestClient()
		await client.login(session.token)
		await waitForReady(client)

		// Record initial ping to verify heartbeats were working
		await delay(2000)
		const initialPing = client.ws.ping
		expect(initialPing).toBeGreaterThanOrEqual(0)

		// Stop sending heartbeat ACKs
		await stopHeartbeatAcks(session.id, true)

		// Discord.js will detect zombie connection and try to reconnect
		// We listen for either:
		// - shardDisconnect: When the shard disconnects
		// - shardReconnecting: When the shard starts reconnecting
		// - error: When connection errors occur
		// With 1000ms heartbeat interval, detection happens after ~2-4 missed heartbeats
		const eventPromise = new Promise<string>((resolve) => {
			const onDisconnect = () => {
				cleanup()
				resolve('shardDisconnect')
			}
			const onReconnecting = () => {
				cleanup()
				resolve('shardReconnecting')
			}
			const onError = () => {
				cleanup()
				resolve('error')
			}

			const cleanup = () => {
				client?.off('shardDisconnect', onDisconnect)
				client?.off('shardReconnecting', onReconnecting)
				client?.off('error', onError)
			}

			client?.on('shardDisconnect', onDisconnect)
			client?.on('shardReconnecting', onReconnecting)
			client?.on('error', onError)

			// Timeout after 15 seconds
			setTimeout(() => {
				cleanup()
				resolve('timeout')
			}, 15000)
		})

		const result = await eventPromise
		// Accept any of these events as proof that heartbeat timeout was detected
		expect(['shardDisconnect', 'shardReconnecting', 'error']).toContain(result)
	}, 20000) // Timeout for heartbeat cycle with 1s interval
})
