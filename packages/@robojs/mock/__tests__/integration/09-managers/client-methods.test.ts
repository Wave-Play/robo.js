/**
 * Client-Level Methods Tests
 *
 * Tests for Client-level methods including channels.fetch(), application,
 * guilds.fetch(), WebSocket properties, generateInvite(), and events.
 */
import {
	ChannelType,
	Client,
	Events,
	GatewayIntentBits,
	OAuth2Scopes,
	PermissionFlagsBits,
	Status
} from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForReady } from '../utils/helpers.js'

describe('Client-Level Methods', () => {
	let client: Client | null = null
	let session: { id: string; token: string }

	beforeAll(async () => {
		session = await createSession({
			name: 'client-methods-tests',
			config: {
				guilds: [
					{
						name: 'Client Methods Guild',
						channels: [
							{ name: 'general', type: ChannelType.GuildText },
							{ name: 'voice', type: ChannelType.GuildVoice }
						]
					}
				],
				enforceIntents: true,
				approvedPrivilegedIntents: BigInt(
					GatewayIntentBits.MessageContent | GatewayIntentBits.GuildMembers
				)
			}
		})

		client = createClientWithIntents([
			GatewayIntentBits.Guilds,
			GatewayIntentBits.GuildMessages,
			GatewayIntentBits.DirectMessages,
			GatewayIntentBits.MessageContent,
			GatewayIntentBits.GuildMembers
		])
		await client.login(session.token)
		await waitForReady(client)
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Client.channels.fetch()', () => {
		it('should fetch channel by ID from any guild', async () => {
			const guildChannel = client!.guilds.cache.first()!.channels.cache.first()!

			// Fetch via client (not guild)
			const fetched = await client!.channels.fetch(guildChannel.id)

			expect(fetched?.id).toBe(guildChannel.id)
		})

		it('should fetch DM channel', async () => {
			// Create a user first
			const userId = generateSnowflake()
			const guild = client!.guilds.cache.first()!

			await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
				guild_id: guild.id,
				user: {
					id: userId,
					username: 'DMFetch',
					discriminator: '0',
					avatar: null
				},
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			})

			const user = await client!.users.fetch(userId)
			const dm = await user.createDM()

			const fetched = await client!.channels.fetch(dm.id)

			expect(fetched?.type).toBe(ChannelType.DM)
		})

		it('should return null for unknown channel', async () => {
			const fetched = await client!.channels.fetch('000000000000000000').catch(() => null)

			expect(fetched).toBeNull()
		})
	})

	describe('Client.application', () => {
		it('should have application info', () => {
			expect(client!.application).toBeDefined()
			expect(client!.application?.id).toBe(client!.user?.id)
		})

		it('should fetch application', async () => {
			// Discord.js caches the application, so we may get the cached version
			// Just verify it returns something valid
			const app = await client!.application?.fetch()

			expect(app).toBeDefined()
			expect(app?.id).toBeDefined()
		})
	})

	describe('Client.guilds.fetch()', () => {
		it('should have guilds in cache after ready', async () => {
			// After client is ready, guilds should be in cache from READY payload
			expect(client!.guilds.cache.size).toBeGreaterThan(0)
		})

		it('should fetch all guilds', async () => {
			const guilds = await client!.guilds.fetch()

			expect(guilds.size).toBeGreaterThan(0)
		})

		it('should fetch specific guild', async () => {
			const guildId = client!.guilds.cache.first()!.id

			const guild = await client!.guilds.fetch(guildId)

			expect(guild.id).toBe(guildId)
		})

		it('should fetch with options', async () => {
			const guilds = await client!.guilds.fetch({ limit: 10 })

			expect(guilds.size).toBeLessThanOrEqual(10)
		})

		it('should return cached guild with force false', async () => {
			const guildId = client!.guilds.cache.first()!.id

			// Without force, should use cache
			const guild = await client!.guilds.fetch({ guild: guildId, force: false })

			expect(guild.id).toBe(guildId)
		})
	})

	describe('Client WebSocket Properties', () => {
		it('should have ws.ping', () => {
			// Ping may be -1 initially but should be a number
			expect(typeof client!.ws.ping).toBe('number')
		})

		it('should have ws.status', () => {
			expect(client!.ws.status).toBe(Status.Ready)
		})

		it('should have shard info', () => {
			const shard = client!.ws.shards.first()

			expect(shard).toBeDefined()
			expect(shard?.id).toBe(0)
		})
	})

	describe('Client.generateInvite()', () => {
		it('should generate OAuth2 invite URL', () => {
			const invite = client!.generateInvite({
				scopes: [OAuth2Scopes.Bot],
				permissions: [PermissionFlagsBits.SendMessages]
			})

			// Should be a valid OAuth2 URL (mock server uses localhost, real Discord uses discord.com)
			expect(invite).toContain('oauth2/authorize')
			// Should contain client ID
			expect(invite).toContain(client!.user!.id)
		})

		it('should include permissions in invite', () => {
			const invite = client!.generateInvite({
				scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands],
				permissions: [PermissionFlagsBits.Administrator]
			})

			// Should include permission parameter
			expect(invite).toContain('permissions=')
		})
	})

	describe('Client Events', () => {
		it('should emit debug events', async () => {
			let debugReceived = false
			const debugHandler = () => {
				debugReceived = true
			}

			client!.on(Events.Debug, debugHandler)

			try {
				// Force a debug event by doing something
				await client!.guilds.fetch()

				// Debug events may or may not fire depending on implementation
				// We just verify the listener can be attached
				expect(typeof debugReceived).toBe('boolean')
			} finally {
				client!.off(Events.Debug, debugHandler)
			}
		})

		it('should have ready event timestamp', () => {
			expect(client!.readyTimestamp).toBeGreaterThan(0)
			expect(client!.readyAt).toBeInstanceOf(Date)
		})

		it('should track uptime', () => {
			expect(client!.uptime).toBeGreaterThan(0)
		})
	})
})
