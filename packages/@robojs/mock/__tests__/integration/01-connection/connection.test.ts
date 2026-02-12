/**
 * Basic Connection Tests
 *
 * These tests verify that a real discord.js client can connect to the
 * @robojs/mock server and receive proper READY and GUILD_CREATE events.
 *
 * Server lifecycle is managed by global setup/teardown.
 */
import { Client } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Basic Connection', () => {
	let client: Client | null = null

	afterEach(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Bot Connection', () => {
		it('should connect and emit ready event', async () => {
			const session = await createSession({
				name: 'ready-test',
				config: {
					botUser: { username: 'TestBot' },
					guilds: [{ name: 'Test Guild' }]
				}
			})

			client = createTestClient()
			await client.login(session.token)
			await waitForReady(client)

			expect(client.isReady()).toBe(true)
		})

		it('should populate client.user with bot info', async () => {
			const session = await createSession({
				name: 'user-test',
				config: {
					botUser: { username: 'MyTestBot' },
					guilds: [{ name: 'Test Guild' }]
				}
			})

			client = createTestClient()
			await client.login(session.token)
			await waitForReady(client)

			expect(client.user).not.toBeNull()
			expect(client.user?.username).toBe('MyTestBot')
			expect(client.user?.bot).toBe(true)
			expect(client.user?.id).toBe(session.botUser.id)
		})

		it('should populate client.guilds.cache with test guild', async () => {
			const session = await createSession({
				name: 'guilds-test',
				config: {
					botUser: { username: 'GuildTestBot' },
					guilds: [{ name: 'My Test Server' }]
				}
			})

			client = createTestClient()
			await client.login(session.token)
			await waitForReady(client)

			expect(client.guilds.cache.size).toBe(1)

			const cachedGuild = client.guilds.cache.first()
			expect(cachedGuild).toBeDefined()
			expect(cachedGuild?.name).toBe('My Test Server')
			expect(cachedGuild?.id).toBe(session.guilds[0]?.id)
		})

		it('should have correct guild channels', async () => {
			const session = await createSession({
				name: 'channels-test',
				config: {
					botUser: { username: 'ChannelTestBot' },
					guilds: [{ name: 'Channel Test Guild' }]
				}
			})

			client = createTestClient()
			await client.login(session.token)
			await waitForReady(client)

			const cachedGuild = client.guilds.cache.first()
			expect(cachedGuild).toBeDefined()
			expect(cachedGuild?.channels.cache.size).toBeGreaterThan(0)

			const generalChannel = cachedGuild?.channels.cache.find((ch) => ch.name === 'general')
			expect(generalChannel).toBeDefined()
			expect(generalChannel?.name).toBe('general')
		})
	})
})
