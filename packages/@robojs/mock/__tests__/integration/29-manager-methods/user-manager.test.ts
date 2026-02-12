/**
 * UserManager Methods Tests
 *
 * Tests for client.users manager methods including
 * fetch, resolve, resolveId, DM creation, deletion, and sending.
 */
import { ChannelType, Client, GatewayIntentBits } from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForReady } from '../utils/helpers.js'

describe('UserManager Methods', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guildId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'user-manager',
			config: {
				guilds: [
					{
						name: 'User Manager Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createClientWithIntents([
			GatewayIntentBits.Guilds,
			GatewayIntentBits.GuildMembers,
			GatewayIntentBits.GuildMessages,
			GatewayIntentBits.DirectMessages
		])
		await client.login(session.token)
		await waitForReady(client)

		const guild = client.guilds.cache.first()!
		guildId = guild.id
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	// Helper to create a test user in the session
	async function createTestUser(username: string): Promise<string> {
		const userId = generateSnowflake()
		await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
			guild_id: guildId,
			user: {
				id: userId,
				username,
				discriminator: '0',
				avatar: null
			},
			roles: [],
			joined_at: new Date().toISOString()
		})
		// Small delay for state update
		await new Promise((resolve) => setTimeout(resolve, 100))
		return userId
	}

	describe('fetch methods', () => {
		it('should fetch user by ID', async () => {
			const userId = await createTestUser('FetchUser')

			const user = await client!.users.fetch(userId)

			expect(user).not.toBeNull()
			expect(user.id).toBe(userId)
			expect(user.username).toBe('FetchUser')
		})

		it('should fetch user with force option', async () => {
			const userId = await createTestUser('ForceUser')

			const user = await client!.users.fetch(userId, { force: true })

			expect(user).not.toBeNull()
			expect(user.id).toBe(userId)
		})
	})

	describe('resolve methods', () => {
		it('should resolve user from cache', async () => {
			const userId = await createTestUser('ResolveUser')

			// Fetch to cache it first
			await client!.users.fetch(userId)

			const user = client!.users.resolve(userId)

			expect(user).not.toBeNull()
			expect(user?.id).toBe(userId)
		})

		it('should resolve user ID', () => {
			const user = client!.users.cache.first()!

			const id = client!.users.resolveId(user)

			expect(id).toBe(user.id)
		})
	})

	describe('DM operations', () => {
		it('should create DM channel via user object', async () => {
			const userId = await createTestUser('DMUser')

			const user = await client!.users.fetch(userId)
			const dm = await user.createDM()

			expect(dm).not.toBeNull()
			expect(dm.type).toBe(ChannelType.DM)
			expect(dm.recipientId).toBe(userId)
		})

		it('should delete DM channel', async () => {
			const userId = await createTestUser('DeleteDMUser')

			const user = await client!.users.fetch(userId)
			const dm = await user.createDM()
			const dmId = dm.id

			await user.deleteDM()

			// DM should be removed from cache
			expect(client!.channels.cache.has(dmId)).toBe(false)
		})

		it('should send DM directly via user object', async () => {
			const userId = await createTestUser('SendDMUser')

			const user = await client!.users.fetch(userId)
			const message = await user.send('Hello via send()')

			expect(message).not.toBeNull()
			expect(message.content).toBe('Hello via send()')
			expect(message.channel.type).toBe(ChannelType.DM)
		})
	})
})
