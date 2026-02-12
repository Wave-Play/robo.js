/**
 * GuildBan Properties Tests
 *
 * Tests for GuildBan properties including reason, user, guild, and partial.
 */
import { Client, GatewayIntentBits, Guild } from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForReady, delay } from '../utils/helpers.js'

describe('GuildBan Properties', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guild: Guild
	let guildId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'guild-ban-properties-tests',
			config: {
				guilds: [{ name: 'Ban Properties Guild' }]
			}
		})

		client = createTestClient({
			intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildBans]
		})
		await client.login(session.token)
		await waitForReady(client)

		guild = client.guilds.cache.first()!
		guildId = guild.id
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	/**
	 * Helper to add a user to the system
	 */
	async function addUser(userId: string, username: string): Promise<void> {
		await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
			guild_id: guildId,
			user: {
				id: userId,
				username,
				discriminator: '0',
				avatar: null,
				bot: false
			},
			roles: [],
			joined_at: new Date().toISOString(),
			deaf: false,
			mute: false
		})
		await delay(100)
	}

	describe('Reason Property', () => {
		it('should have reason property when ban has reason', async () => {
			const userId = generateSnowflake()
			await addUser(userId, 'BanReasonUser')

			await guild.bans.create(userId, { reason: 'Test ban reason' })

			try {
				const ban = await guild.bans.fetch(userId)
				expect(ban.reason).toBe('Test ban reason')
			} finally {
				await guild.bans.remove(userId)
			}
		})

		it('should have null reason when no reason provided', async () => {
			const userId = generateSnowflake()
			await addUser(userId, 'NoReasonUser')

			await guild.bans.create(userId)

			try {
				const ban = await guild.bans.fetch(userId)
				expect(ban.reason).toBeNull()
			} finally {
				await guild.bans.remove(userId)
			}
		})
	})

	describe('User Property', () => {
		it('should have user property with user object', async () => {
			const userId = generateSnowflake()
			await addUser(userId, 'BanUserProp')

			await guild.bans.create(userId)

			try {
				const ban = await guild.bans.fetch(userId)
				expect(ban.user).toBeDefined()
				expect(ban.user.id).toBe(userId)
				expect(ban.user.username).toBe('BanUserProp')
			} finally {
				await guild.bans.remove(userId)
			}
		})

		it('should have user with avatar property', async () => {
			const userId = generateSnowflake()
			await addUser(userId, 'AvatarBanUser')

			await guild.bans.create(userId)

			try {
				const ban = await guild.bans.fetch(userId)
				expect(ban.user).toBeDefined()
				// Avatar may be null or a string
				expect(ban.user.avatar === null || typeof ban.user.avatar === 'string').toBe(true)
			} finally {
				await guild.bans.remove(userId)
			}
		})
	})

	describe('Guild Property', () => {
		it('should have guild property referencing the guild', async () => {
			const userId = generateSnowflake()
			await addUser(userId, 'GuildPropUser')

			await guild.bans.create(userId)

			try {
				const ban = await guild.bans.fetch(userId)
				expect(ban.guild).toBeDefined()
				expect(ban.guild.id).toBe(guild.id)
			} finally {
				await guild.bans.remove(userId)
			}
		})
	})

	describe('Partial Property', () => {
		it('should have partial property as false after fetch', async () => {
			const userId = generateSnowflake()
			await addUser(userId, 'PartialPropUser')

			await guild.bans.create(userId)

			try {
				const ban = await guild.bans.fetch(userId)
				expect(ban.partial).toBe(false)
			} finally {
				await guild.bans.remove(userId)
			}
		})
	})

	describe('Ban List', () => {
		it('should fetch all bans with properties', async () => {
			const userId1 = generateSnowflake()
			const userId2 = generateSnowflake()
			await addUser(userId1, 'BanList1')
			await addUser(userId2, 'BanList2')

			await guild.bans.create(userId1, { reason: 'Reason 1' })
			await guild.bans.create(userId2, { reason: 'Reason 2' })

			try {
				const bans = await guild.bans.fetch()

				const ban1 = bans.get(userId1)
				const ban2 = bans.get(userId2)

				expect(ban1).toBeDefined()
				expect(ban2).toBeDefined()
				expect(ban1?.reason).toBe('Reason 1')
				expect(ban2?.reason).toBe('Reason 2')
			} finally {
				await guild.bans.remove(userId1)
				await guild.bans.remove(userId2)
			}
		})
	})
})
