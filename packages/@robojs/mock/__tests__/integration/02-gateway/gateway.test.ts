/**
 * Gateway Connection Tests
 *
 * Tests for the Discord Gateway WebSocket connection, including:
 * - Connecting to the gateway
 * - Receiving valid READY payload
 * - Populating guild cache
 * - Token validation
 * - Privileged intent enforcement
 */
import { Client, GatewayIntentBits } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createTestClient, destroyClient, createClientWithIntents } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Gateway Connection', () => {
	let client: Client | null = null

	afterEach(async () => {
		await destroyClient(client)
		client = null
	})

	it('should connect to Gateway WebSocket', async () => {
		const session = await createSession({
			name: 'gateway-connect-test',
			config: {
				guilds: [{ name: 'Test Guild' }]
			}
		})

		client = createTestClient()
		await client.login(session.token)
		const readyClient = await waitForReady(client)

		expect(readyClient).toBeDefined()
		expect(client.ws.status).toBe(0) // Status.Ready
	})

	it('should receive valid READY payload', async () => {
		const session = await createSession({
			name: 'ready-payload-test',
			config: {
				botUser: { username: 'ReadyBot' },
				guilds: [{ name: 'Ready Test Guild' }]
			}
		})

		client = createTestClient()
		await client.login(session.token)
		await waitForReady(client)

		expect(client.user).toBeDefined()
		expect(client.user!.id).toMatch(/^\d{17,19}$/)
		expect(client.user!.bot).toBe(true)
		expect(client.guilds.cache.size).toBeGreaterThan(0)
	})

	it('should populate guild cache from READY', async () => {
		const session = await createSession({
			name: 'guild-cache-test',
			config: {
				guilds: [{ name: 'Cache Test Guild' }]
			}
		})

		client = createTestClient()
		await client.login(session.token)
		await waitForReady(client)

		const guild = client.guilds.cache.first()!
		expect(guild).toBeDefined()
		expect(guild.name).toBe('Cache Test Guild')
		expect(guild.channels.cache.size).toBeGreaterThan(0)
		expect(guild.roles.cache.size).toBeGreaterThan(0)
	})

	it('should reject invalid token', async () => {
		client = createTestClient()

		await expect(client.login('invalid-token-that-does-not-exist')).rejects.toThrow()
	})

	it('should reject disallowed privileged intents', async () => {
		// Create session with intent enforcement enabled but GuildMembers not approved
		const session = await createSession({
			name: 'privileged-intents-test',
			config: {
				guilds: [{ name: 'Intent Test Guild' }],
				enforceIntents: true,
				// Only approve MessageContent, not GuildMembers or GuildPresences
				approvedPrivilegedIntents: BigInt(1 << 15)
			}
		})

		// Create client that requests the unapproved GuildMembers intent
		client = createClientWithIntents([GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers])

		// Should reject with close code 4014 (Disallowed intents)
		await expect(client.login(session.token)).rejects.toThrow()
	})

	it('should allow approved privileged intents', async () => {
		// Create session with all privileged intents approved
		const session = await createSession({
			name: 'approved-intents-test',
			config: {
				guilds: [{ name: 'Approved Intent Guild' }],
				enforceIntents: true,
				// Approve all privileged intents
				approvedPrivilegedIntents: BigInt((1 << 1) | (1 << 8) | (1 << 15))
			}
		})

		// Create client requesting privileged intents
		client = createClientWithIntents([
			GatewayIntentBits.Guilds,
			GatewayIntentBits.GuildMembers,
			GatewayIntentBits.GuildPresences,
			GatewayIntentBits.MessageContent
		])

		await client.login(session.token)
		await waitForReady(client)

		expect(client.isReady()).toBe(true)
	})
})
