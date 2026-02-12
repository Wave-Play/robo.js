/**
 * Client Options Tests
 *
 * Tests for Discord.js Client configuration options including
 * failIfNotExists, allowedMentions, presence, sweepers, ws, and rest options.
 */
import { ActivityType, Client, ChannelType, GatewayIntentBits, TextChannel } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { destroyClient } from '../setup/test-client.js'
import { MOCK_CONFIG } from '../setup/constants.js'
import { generateSnowflake, waitForReady } from '../utils/helpers.js'

describe('Client Options', () => {
	describe('failIfNotExists Option', () => {
		let client: Client | null = null

		afterEach(async () => {
			await destroyClient(client)
			client = null
		})

		it('should respect failIfNotExists option set to false', async () => {
			const session = await createSession({
				name: 'fail-if-not-exists',
				config: {
					guilds: [
						{
							name: 'Test Guild',
							channels: [{ name: 'general', type: ChannelType.GuildText }]
						}
					]
				}
			})

			client = new Client({
				intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
				failIfNotExists: false,
				rest: { api: MOCK_CONFIG.REST_URL }
			})

			await client.login(session.token)
			await waitForReady(client)

			// Verify the option is set
			expect(client.options.failIfNotExists).toBe(false)

			// With failIfNotExists: false, sending a message with a reference
			// to a non-existent message should not throw
			const channel = client.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel

			// The message should send without throwing, even with invalid reference
			const message = await channel.send({
				content: 'Test message',
				reply: {
					messageReference: generateSnowflake() // Non-existent message
				}
			})

			expect(message.content).toBe('Test message')
		})
	})

	describe('allowedMentions Option', () => {
		let client: Client | null = null

		afterEach(async () => {
			await destroyClient(client)
			client = null
		})

		it('should respect allowedMentions option', async () => {
			const session = await createSession({
				name: 'allowed-mentions',
				config: {
					guilds: [{ name: 'Test Guild' }]
				}
			})

			client = new Client({
				intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
				allowedMentions: {
					parse: [],
					repliedUser: false
				},
				rest: { api: MOCK_CONFIG.REST_URL }
			})

			await client.login(session.token)
			await waitForReady(client)

			expect(client.options.allowedMentions?.parse).toEqual([])
			expect(client.options.allowedMentions?.repliedUser).toBe(false)
		})
	})

	describe('presence Option', () => {
		let client: Client | null = null

		afterEach(async () => {
			await destroyClient(client)
			client = null
		})

		it('should respect presence option', async () => {
			const session = await createSession({
				name: 'presence',
				config: {
					guilds: [{ name: 'Test Guild' }]
				}
			})

			client = new Client({
				intents: [GatewayIntentBits.Guilds],
				presence: {
					status: 'dnd',
					activities: [{ name: 'Testing', type: ActivityType.Playing }]
				},
				rest: { api: MOCK_CONFIG.REST_URL }
			})

			await client.login(session.token)
			await waitForReady(client)

			// The presence status should be set on the client user
			expect(client.user?.presence.status).toBe('dnd')
		})
	})

	describe('sweepers Option', () => {
		let client: Client | null = null

		afterEach(async () => {
			await destroyClient(client)
			client = null
		})

		it('should respect sweepers option', async () => {
			const session = await createSession({
				name: 'sweepers',
				config: {
					guilds: [{ name: 'Test Guild' }]
				}
			})

			client = new Client({
				intents: [GatewayIntentBits.Guilds],
				sweepers: {
					messages: {
						interval: 3600,
						lifetime: 1800
					}
				},
				rest: { api: MOCK_CONFIG.REST_URL }
			})

			await client.login(session.token)
			await waitForReady(client)

			expect(client.options.sweepers?.messages).toBeDefined()
			expect((client.options.sweepers?.messages as { interval: number })?.interval).toBe(3600)
		})
	})

	describe('ws Options', () => {
		let client: Client | null = null

		afterEach(async () => {
			await destroyClient(client)
			client = null
		})

		it('should respect ws options', async () => {
			const session = await createSession({
				name: 'ws-options',
				config: {
					guilds: [{ name: 'Test Guild' }]
				}
			})

			client = new Client({
				intents: [GatewayIntentBits.Guilds],
				ws: {
					large_threshold: 100
				},
				rest: { api: MOCK_CONFIG.REST_URL }
			})

			await client.login(session.token)
			await waitForReady(client)

			expect(client.options.ws?.large_threshold).toBe(100)
		})
	})

	describe('rest Options', () => {
		let client: Client | null = null

		afterEach(async () => {
			await destroyClient(client)
			client = null
		})

		it('should respect rest options', async () => {
			const session = await createSession({
				name: 'rest-options',
				config: {
					guilds: [{ name: 'Test Guild' }]
				}
			})

			client = new Client({
				intents: [GatewayIntentBits.Guilds],
				rest: {
					api: MOCK_CONFIG.REST_URL,
					timeout: 30000,
					retries: 3
				}
			})

			await client.login(session.token)
			await waitForReady(client)

			expect(client.options.rest?.timeout).toBe(30000)
			expect(client.options.rest?.retries).toBe(3)
		})
	})
})
