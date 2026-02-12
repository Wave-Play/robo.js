/**
 * Ban Tests
 *
 * Tests for banning, unbanning, fetching bans, and ban events.
 */
import { Client, Events, GuildBan } from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForEvent, waitForReady } from '../utils/helpers.js'

describe('Bans', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guildId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'ban-tests',
			config: {
				guilds: [{ name: 'Ban Test Guild' }]
			}
		})

		client = createTestClient()
		await client.login(session.token)
		await waitForReady(client)

		guildId = client.guilds.cache.first()!.id
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Creating Bans', () => {
		it('should ban user', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const userId = generateSnowflake()

			// First add the user as a member
			await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
				guild_id: guildId,
				user: { id: userId, username: 'BanMe', discriminator: '0', global_name: null },
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			})

			// Wait for member to be added
			await new Promise((resolve) => setTimeout(resolve, 100))

			await guild.bans.create(userId, { reason: 'Test ban' })

			const ban = await guild.bans.fetch(userId)
			expect(ban.user.id).toBe(userId)
			expect(ban.reason).toBe('Test ban')

			await guild.bans.remove(userId)
		})

		it('should ban with message deletion', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const userId = generateSnowflake()

			// Add user as member first
			await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
				guild_id: guildId,
				user: { id: userId, username: 'BanDelete', discriminator: '0', global_name: null },
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			})

			await new Promise((resolve) => setTimeout(resolve, 100))

			await guild.bans.create(userId, {
				reason: 'Delete messages',
				deleteMessageSeconds: 86400
			})

			// Verify ban was created
			const ban = await guild.bans.fetch(userId)
			expect(ban.user.id).toBe(userId)

			await guild.bans.remove(userId)
		})

		it('should ban non-member by ID', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const userId = generateSnowflake()

			// Ban without adding as member first
			await guild.bans.create(userId, { reason: 'Preemptive' })

			const ban = await guild.bans.fetch(userId)
			expect(ban.user.id).toBe(userId)

			await guild.bans.remove(userId)
		})
	})

	describe('Fetching Bans', () => {
		let bannedUserId: string

		beforeAll(async () => {
			const guild = client!.guilds.cache.get(guildId)!
			bannedUserId = generateSnowflake()
			await guild.bans.create(bannedUserId, { reason: 'Fetch test' })
		})

		afterAll(async () => {
			const guild = client!.guilds.cache.get(guildId)!
			try {
				await guild.bans.remove(bannedUserId)
			} catch {
				// Ban may already be removed
			}
		})

		it('should fetch single ban', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const ban = await guild.bans.fetch(bannedUserId)

			expect(ban.user.id).toBe(bannedUserId)
			expect(ban.reason).toBe('Fetch test')
		})

		it('should fetch all bans', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const bans = await guild.bans.fetch()

			expect(bans.has(bannedUserId)).toBe(true)
		})

		it('should return 404 for non-banned user', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			await expect(guild.bans.fetch('000000000000000000')).rejects.toMatchObject({ code: 10026 })
		})
	})

	describe('Removing Bans', () => {
		it('should unban user', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const userId = generateSnowflake()

			await guild.bans.create(userId, { reason: 'Unban test' })
			await guild.bans.remove(userId)

			await expect(guild.bans.fetch(userId)).rejects.toMatchObject({ code: 10026 })
		})
	})

	describe('Ban Events', () => {
		it('should emit guildBanAdd', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const userId = generateSnowflake()

			const eventPromise = waitForEvent(client!, Events.GuildBanAdd)
			await guild.bans.create(userId)

			const ban = (await eventPromise) as GuildBan
			expect(ban.user.id).toBe(userId)

			await guild.bans.remove(userId)
		})

		it('should emit guildBanRemove', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const userId = generateSnowflake()

			await guild.bans.create(userId)

			const eventPromise = waitForEvent(client!, Events.GuildBanRemove)
			await guild.bans.remove(userId)

			const ban = (await eventPromise) as GuildBan
			expect(ban.user.id).toBe(userId)
		})
	})
})
