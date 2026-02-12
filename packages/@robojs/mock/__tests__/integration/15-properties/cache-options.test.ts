/**
 * Cache Options Tests
 *
 * Tests for discord.js cache configuration options including limits and sweepers.
 */
import { ChannelType, Client, GatewayIntentBits, Options, TextChannel } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'
import { MOCK_CONFIG } from '../setup/constants.js'

describe('Cache Options', () => {
	it('should respect message cache limit', async () => {
		const session = await createSession({
			name: 'cache-limit-test',
			config: {
				guilds: [
					{
						name: 'Cache Test Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		const client = new Client({
			intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
			rest: { api: MOCK_CONFIG.REST_URL },
			// @ts-expect-error - Setting internal gateway URL for mock server
			ws: { gateway: MOCK_CONFIG.WS_URL },
			makeCache: Options.cacheWithLimits({
				MessageManager: 10
			})
		})

		try {
			await client.login(session.token)
			await waitForReady(client)

			const channel = client.guilds.cache.first()!.channels.cache.find(
				(c) => c.type === ChannelType.GuildText
			) as TextChannel

			// Send more than limit
			for (let i = 0; i < 15; i++) {
				await channel.send(`Cache test ${i}`)
			}

			// Cache should be limited
			expect(channel.messages.cache.size).toBeLessThanOrEqual(10)
		} finally {
			await destroyClient(client)
		}
	})

	it('should configure sweeper options', async () => {
		const session = await createSession({
			name: 'sweeper-test',
			config: {
				guilds: [
					{
						name: 'Sweeper Test Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		const client = new Client({
			intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
			rest: { api: MOCK_CONFIG.REST_URL },
			// @ts-expect-error - Setting internal gateway URL for mock server
			ws: { gateway: MOCK_CONFIG.WS_URL },
			sweepers: {
				messages: {
					interval: 60,
					lifetime: 30
				}
			}
		})

		try {
			await client.login(session.token)
			await waitForReady(client)

			expect(client.sweepers.options.messages).toBeDefined()
		} finally {
			await destroyClient(client)
		}
	})

	it('should use LimitedCollection with keepOverLimit', async () => {
		const session = await createSession({
			name: 'keep-over-limit-test',
			config: {
				guilds: [
					{
						name: 'Keep Over Limit Test Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		let botUserId: string | undefined

		const client = new Client({
			intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
			rest: { api: MOCK_CONFIG.REST_URL },
			// @ts-expect-error - Setting internal gateway URL for mock server
			ws: { gateway: MOCK_CONFIG.WS_URL },
			makeCache: Options.cacheWithLimits({
				GuildMemberManager: {
					maxSize: 100,
					keepOverLimit: (member) => member.id === botUserId
				}
			})
		})

		try {
			await client.login(session.token)
			await waitForReady(client)
			botUserId = client.user?.id

			expect(client.options.makeCache).toBeDefined()
		} finally {
			await destroyClient(client)
		}
	})

	it('should create client with no cache limits', async () => {
		const session = await createSession({
			name: 'no-limit-test',
			config: {
				guilds: [
					{
						name: 'No Limit Test Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		const client = new Client({
			intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
			rest: { api: MOCK_CONFIG.REST_URL },
			// @ts-expect-error - Setting internal gateway URL for mock server
			ws: { gateway: MOCK_CONFIG.WS_URL },
			makeCache: Options.cacheEverything()
		})

		try {
			await client.login(session.token)
			await waitForReady(client)

			const channel = client.guilds.cache.first()!.channels.cache.find(
				(c) => c.type === ChannelType.GuildText
			) as TextChannel

			// Send some messages
			for (let i = 0; i < 5; i++) {
				await channel.send(`No limit test ${i}`)
			}

			// All messages should be cached
			expect(channel.messages.cache.size).toBeGreaterThanOrEqual(5)
		} finally {
			await destroyClient(client)
		}
	})
})
