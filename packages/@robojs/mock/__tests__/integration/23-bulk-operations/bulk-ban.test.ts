/**
 * Bulk Ban Tests
 *
 * Tests for guild bulk ban functionality using guild.members.bulkBan().
 */
import { Client, ChannelType, GatewayIntentBits } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady, generateSnowflake } from '../utils/helpers.js'

describe('Bulk Ban', () => {
	let client: Client | null = null
	let session: { id: string; token: string }

	beforeAll(async () => {
		session = await createSession({
			name: 'bulk-ban',
			config: {
				guilds: [
					{
						name: 'Bulk Ban Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createClientWithIntents([
			GatewayIntentBits.Guilds,
			GatewayIntentBits.GuildMembers,
			GatewayIntentBits.GuildModeration
		])
		await client.login(session.token)
		await waitForReady(client)
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	it('should bulk ban users', async () => {
		const guild = client!.guilds.cache.first()!

		const userIds = [generateSnowflake(), generateSnowflake(), generateSnowflake()]

		const result = await guild.members.bulkBan(userIds)

		expect(result.bannedUsers.length).toBe(3)
		expect(result.failedUsers.length).toBe(0)

		// Verify all users are in bannedUsers
		for (const userId of userIds) {
			expect(result.bannedUsers).toContain(userId)
		}

		// Clean up
		for (const userId of userIds) {
			await guild.bans.remove(userId).catch(() => {})
		}
	})

	it('should bulk ban with reason', async () => {
		const guild = client!.guilds.cache.first()!
		const userId = generateSnowflake()

		const result = await guild.members.bulkBan([userId], {
			reason: 'Bulk ban test reason'
		})

		expect(result.bannedUsers).toContain(userId)

		// Verify the ban has the reason
		const ban = await guild.bans.fetch(userId)
		expect(ban.reason).toBe('Bulk ban test reason')

		// Clean up
		await guild.bans.remove(userId)
	})

	it('should bulk ban with deleteMessageSeconds', async () => {
		const guild = client!.guilds.cache.first()!
		const userId = generateSnowflake()

		const result = await guild.members.bulkBan([userId], {
			deleteMessageSeconds: 86400 // 1 day
		})

		expect(result.bannedUsers).toContain(userId)
		expect(result.bannedUsers.length).toBe(1)

		// Clean up
		await guild.bans.remove(userId)
	})

	it('should handle failed bans', async () => {
		const guild = client!.guilds.cache.first()!

		const validId = generateSnowflake()
		// Bot's own ID should fail (cannot ban self)
		const botId = client!.user!.id

		const result = await guild.members.bulkBan([validId, botId])

		// Valid user should be banned
		expect(result.bannedUsers).toContain(validId)
		// Bot should be in failed users
		expect(result.failedUsers).toContain(botId)

		// Clean up
		await guild.bans.remove(validId).catch(() => {})
	})

	it('should respect max 200 users limit', async () => {
		const guild = client!.guilds.cache.first()!

		// Create 201 user IDs
		const userIds = Array.from({ length: 201 }, () => generateSnowflake())

		// Should throw error for more than 200 users
		await expect(guild.members.bulkBan(userIds)).rejects.toThrow()
	})

	it('should ban multiple users and verify all bans', async () => {
		const guild = client!.guilds.cache.first()!

		const userIds = [generateSnowflake(), generateSnowflake()]

		const result = await guild.members.bulkBan(userIds)

		expect(result.bannedUsers.length).toBe(2)

		// Verify each ban exists
		for (const userId of userIds) {
			const ban = await guild.bans.fetch(userId)
			expect(ban).toBeDefined()
			expect(ban.user.id).toBe(userId)
		}

		// Clean up
		for (const userId of userIds) {
			await guild.bans.remove(userId).catch(() => {})
		}
	})
})
