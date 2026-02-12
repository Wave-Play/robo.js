/**
 * GuildMemberManager Methods Tests
 *
 * Tests for GuildMemberManager methods including search(), list(), and fetchMe().
 */
import { ChannelType, Client, GatewayIntentBits, Guild } from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForReady } from '../utils/helpers.js'

describe('GuildMemberManager Methods', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guild: Guild

	beforeAll(async () => {
		session = await createSession({
			name: 'member-manager-tests',
			config: {
				guilds: [
					{
						name: 'Member Manager Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				],
				enforceIntents: true,
				approvedPrivilegedIntents: BigInt(GatewayIntentBits.GuildMembers)
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers])
		await client.login(session.token)
		await waitForReady(client)

		guild = client.guilds.cache.first()!

		// Seed some members for search tests
		for (let i = 0; i < 10; i++) {
			const userId = generateSnowflake()
			await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
				guild_id: guild.id,
				user: {
					id: userId,
					username: `SearchUser${i}`,
					discriminator: '0',
					avatar: null
				},
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			})
		}
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('GuildMemberManager.search()', () => {
		it('should search members by query', async () => {
			const results = await guild.members.search({ query: 'Search' })

			expect(results.size).toBeGreaterThan(0)
			results.forEach((member) => {
				expect(member.user.username.toLowerCase()).toContain('search')
			})
		})

		it('should search with limit', async () => {
			const results = await guild.members.search({
				query: 'Search',
				limit: 5
			})

			expect(results.size).toBeLessThanOrEqual(5)
		})

		it('should return empty for no matches', async () => {
			const results = await guild.members.search({
				query: 'NonExistentName123456'
			})

			expect(results.size).toBe(0)
		})
	})

	describe('GuildMemberManager.list()', () => {
		it('should list members with limit', async () => {
			const members = await guild.members.list({ limit: 5 })

			expect(members.size).toBeLessThanOrEqual(5)
		})

		it('should list members after specific ID', async () => {
			const firstBatch = await guild.members.list({ limit: 5 })

			if (firstBatch.size > 0) {
				const lastId = firstBatch.last()!.id

				const secondBatch = await guild.members.list({
					limit: 5,
					after: lastId
				})

				// Should not contain the last ID from first batch
				expect(secondBatch.has(lastId)).toBe(false)
			}
		})
	})

	describe('GuildMemberManager.fetchMe()', () => {
		it('should fetch bot member', async () => {
			const me = await guild.members.fetchMe()

			expect(me.id).toBe(client!.user!.id)
		})

		it('should have correct permissions', async () => {
			const me = await guild.members.fetchMe()

			expect(me.permissions).toBeDefined()
		})
	})
})
