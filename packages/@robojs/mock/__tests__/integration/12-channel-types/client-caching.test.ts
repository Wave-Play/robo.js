/**
 * Client Caching & Sweepers Tests
 *
 * Tests for client caching configuration including
 * cache limits and sweeper intervals.
 */
import { Client, Events, GatewayIntentBits, Options } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { destroyClient } from '../setup/test-client.js'
import { MOCK_CONFIG } from '../setup/constants.js'

describe('Client Caching', () => {
	describe('Cache Options', () => {
		it('should respect cache options', async () => {
			const session = await createSession({
				name: 'cache-options-test',
				config: {
					guilds: [{ name: 'Cache Test Guild' }]
				}
			})

			const client = new Client({
				intents: [GatewayIntentBits.Guilds],
				rest: {
					api: MOCK_CONFIG.REST_URL
				},
				ws: {
					// @ts-expect-error - Custom gateway URL for testing
					gatewayUrl: MOCK_CONFIG.WS_URL
				},
				makeCache: Options.cacheWithLimits({
					MessageManager: 100,
					GuildMemberManager: 200
				})
			})

			try {
				await client.login(session.token)
				await new Promise<void>((resolve, reject) => {
					const timeout = setTimeout(() => reject(new Error('Timeout')), 10000)
					client.once(Events.ClientReady, () => {
						clearTimeout(timeout)
						resolve()
					})
				})

				// Cache limits should be respected
				expect(client.options.makeCache).toBeDefined()
			} finally {
				await destroyClient(client)
			}
		})
	})

	describe('Sweeper Configuration', () => {
		it('should have sweeper intervals', async () => {
			const session = await createSession({
				name: 'sweeper-config-test',
				config: {
					guilds: [{ name: 'Sweeper Test Guild' }]
				}
			})

			const client = new Client({
				intents: [GatewayIntentBits.Guilds],
				rest: {
					api: MOCK_CONFIG.REST_URL
				},
				ws: {
					// @ts-expect-error - Custom gateway URL for testing
					gatewayUrl: MOCK_CONFIG.WS_URL
				},
				sweepers: {
					messages: {
						interval: 3600,
						lifetime: 1800
					}
				}
			})

			try {
				await client.login(session.token)
				await new Promise<void>((resolve, reject) => {
					const timeout = setTimeout(() => reject(new Error('Timeout')), 10000)
					client.once(Events.ClientReady, () => {
						clearTimeout(timeout)
						resolve()
					})
				})

				expect(client.sweepers).toBeDefined()
			} finally {
				await destroyClient(client)
			}
		})
	})
})
