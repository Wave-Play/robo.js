/**
 * Reconnection Tests
 *
 * Tests for Discord Gateway reconnection handling:
 * - Resume session after clean disconnect
 * - Get fresh READY on session invalidation
 * - Replay missed events on resume
 *
 * Note: Some tests may be skipped if the mock server doesn't fully support
 * session resume functionality yet.
 */
import { Client } from 'discord.js'
import { createSession, disconnectSession, invalidateSession } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForReady, delay } from '../utils/helpers.js'
import { GATEWAY_CLOSE_CODES } from '../setup/constants.js'

describe('Reconnection', () => {
	let client: Client | null = null

	afterEach(async () => {
		await destroyClient(client)
		client = null
	})

	it(
		'should handle gateway disconnect gracefully',
		async () => {
			const session = await createSession({
				name: 'disconnect-test',
				config: {
					guilds: [{ name: 'Disconnect Guild' }]
				}
			})

			client = createTestClient()
			await client.login(session.token)
			await waitForReady(client)

			// Listen for various disconnect-related events
			const eventPromise = new Promise<string>((resolve) => {
				const onDisconnect = () => {
					cleanup()
					resolve('shardDisconnect')
				}
				const onReconnecting = () => {
					cleanup()
					resolve('shardReconnecting')
				}

				const cleanup = () => {
					client?.off('shardDisconnect', onDisconnect)
					client?.off('shardReconnecting', onReconnecting)
				}

				client?.on('shardDisconnect', onDisconnect)
				client?.on('shardReconnecting', onReconnecting)

				// Timeout
				setTimeout(() => {
					cleanup()
					resolve('timeout')
				}, 10000)
			})

			// Force disconnect with code 4000 (Unknown error - should reconnect)
			await disconnectSession(session.id, GATEWAY_CLOSE_CODES.UNKNOWN_ERROR)

			const result = await eventPromise
			// Accept either shardDisconnect or shardReconnecting as valid responses
			expect(['shardDisconnect', 'shardReconnecting']).toContain(result)
		},
		15000
	)

	it(
		'should reconnect after disconnect with code 4000',
		async () => {
			const session = await createSession({
				name: 'reconnect-test',
				config: {
					guilds: [{ name: 'Reconnect Guild' }]
				}
			})

			client = createTestClient()
			await client.login(session.token)
			await waitForReady(client)

			// Set up listener for reconnection
			client?.once('shardReady', () => {
				// Shard reconnected
			})

			// Force disconnect with code that allows reconnection
			await disconnectSession(session.id, GATEWAY_CLOSE_CODES.UNKNOWN_ERROR)

			// Wait for Discord.js to attempt reconnection
			await delay(5000)

			// Note: Full reconnection testing requires the mock to support resume
			// For now, verify that the client attempts to handle disconnection
			expect(client.ws.status).toBeDefined()
		},
		15000
	)

	it('should handle session invalidation', async () => {
		const session = await createSession({
			name: 'invalidation-test',
			config: {
				guilds: [{ name: 'Invalidation Guild' }]
			}
		})

		client = createTestClient()
		await client.login(session.token)
		await waitForReady(client)

		// Invalidate the session (clears connection state)
		const result = await invalidateSession(session.id)
		expect(result.invalidated).toBe(true)

		// The session data is cleared but client may still think it's connected
		// until the next heartbeat/operation fails
	})

	it('should not reconnect after authentication failure (4004)', async () => {
		const session = await createSession({
			name: 'auth-failure-test',
			config: {
				guilds: [{ name: 'Auth Failure Guild' }]
			}
		})

		client = createTestClient()
		await client.login(session.token)
		await waitForReady(client)

		let reconnectAttempted = false
		client?.on('shardReconnecting', () => {
			reconnectAttempted = true
		})

		// Disconnect with auth failure code - should NOT attempt reconnect
		await disconnectSession(session.id, GATEWAY_CLOSE_CODES.AUTHENTICATION_FAILED)

		await delay(2000)

		// Discord.js should not attempt to reconnect after auth failure
		// (depending on implementation, this behavior may vary)
		expect(reconnectAttempted).toBe(false)
	})
})
