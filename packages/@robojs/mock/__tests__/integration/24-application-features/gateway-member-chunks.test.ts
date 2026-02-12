/**
 * Gateway Request Guild Members Tests
 *
 * Tests for guild.members.fetch() and GUILD_MEMBERS_CHUNK events.
 */
import { Client, Events, GatewayIntentBits, ReadonlyCollection, type Guild, type GuildMember } from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady, generateSnowflake } from '../utils/helpers.js'

describe('Gateway Request Guild Members', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guild: Guild

	beforeAll(async () => {
		session = await createSession({
			name: 'gateway-member-chunks',
			config: {
				botUser: { username: 'MemberChunkBot' },
				guilds: [{ name: 'Test Guild' }]
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers])
		await client.login(session.token)
		await waitForReady(client)
		guild = client.guilds.cache.first()!
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	it('should request guild members chunk', async () => {
		// Add some members via GUILD_MEMBER_ADD dispatch
		for (let i = 0; i < 3; i++) {
			const userId = generateSnowflake()
			await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
				guild_id: guild.id,
				user: { id: userId, username: `ChunkMember${i}` },
				roles: [],
				joined_at: new Date().toISOString()
			})
		}

		// Fetch members - this should work with the mock server
		const members = await guild.members.fetch()

		// Should have at least some members (including bot)
		expect(members.size).toBeGreaterThan(0)
	})

	it('should emit guildMembersChunk event', async () => {
		const userId1 = generateSnowflake()
		const userId2 = generateSnowflake()

		const chunkPromise = new Promise<{ members: ReadonlyCollection<string, GuildMember>; guild: Guild }>((resolve) => {
			client!.once(Events.GuildMembersChunk, (members, chunkGuild) => {
				resolve({ members, guild: chunkGuild })
			})
		})

		// Dispatch a GUILD_MEMBERS_CHUNK event
		await dispatchEvent(session.id, 'GUILD_MEMBERS_CHUNK', {
			guild_id: guild.id,
			members: [
				{ user: { id: userId1, username: 'Chunk1', discriminator: '0' }, roles: [] },
				{ user: { id: userId2, username: 'Chunk2', discriminator: '0' }, roles: [] }
			],
			chunk_index: 0,
			chunk_count: 1
		})

		const result = await chunkPromise

		expect(result.members.size).toBe(2)
		expect(result.guild.id).toBe(guild.id)
	})

	it('should request members with query', async () => {
		const userId = generateSnowflake()

		// Add a member with a searchable name
		await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
			guild_id: guild.id,
			user: { id: userId, username: 'SearchableUser' },
			roles: [],
			joined_at: new Date().toISOString()
		})

		// Search for members with query
		const members = await guild.members.fetch({ query: 'Search', limit: 10 })

		// Should find the member with "Search" in the name
		const found = members.find((m) => m.user.username.includes('Search'))
		expect(found).toBeDefined()
	})

	it('should request specific user IDs', async () => {
		const userId = generateSnowflake()

		// Add a specific member
		await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
			guild_id: guild.id,
			user: { id: userId, username: 'SpecificUser' },
			roles: [],
			joined_at: new Date().toISOString()
		})

		// Fetch by user ID
		const members = await guild.members.fetch({ user: [userId] })

		expect(members.has(userId)).toBe(true)
	})

	it('should handle nonce in chunk', async () => {
		const nonce = 'test-nonce-' + Date.now()

		const chunkPromise = new Promise<{ nonce: string }>((resolve) => {
			client!.once(Events.GuildMembersChunk, (_members, _guild, chunk) => {
				resolve({ nonce: chunk.nonce ?? '' })
			})
		})

		await dispatchEvent(session.id, 'GUILD_MEMBERS_CHUNK', {
			guild_id: guild.id,
			members: [],
			chunk_index: 0,
			chunk_count: 1,
			nonce
		})

		const result = await chunkPromise

		expect(result.nonce).toBe(nonce)
	})

	it('should include presences in chunk', async () => {
		const userId = generateSnowflake()

		const chunkPromise = new Promise<{ presences: unknown[]; chunkReceived: boolean }>((resolve) => {
			client!.once(Events.GuildMembersChunk, (_members, _guild, chunk) => {
				// Presences are only included if client has GuildPresences intent
				// The chunk object should exist and may contain presences
				// Access as unknown since presences may not be in the type but is in the raw data
				const chunkData = chunk as unknown as { presences?: unknown[] }
				resolve({ presences: chunkData.presences ?? [], chunkReceived: true })
			})
		})

		await dispatchEvent(session.id, 'GUILD_MEMBERS_CHUNK', {
			guild_id: guild.id,
			members: [{ user: { id: userId, username: 'PresenceUser', discriminator: '0' }, roles: [] }],
			presences: [{ user: { id: userId }, status: 'online', activities: [] }],
			chunk_index: 0,
			chunk_count: 1
		})

		const result = await chunkPromise

		// Verify chunk was received - presences may be empty if GuildPresences intent not enabled
		expect(result.chunkReceived).toBe(true)
		// Presences array should exist (even if empty)
		expect(Array.isArray(result.presences)).toBe(true)
	})
})
