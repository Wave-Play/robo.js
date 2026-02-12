/**
 * Guild Member Search Tests
 *
 * Extended tests for guild member search functionality including
 * query, limit, user IDs, force option, and pagination.
 */
import { ChannelType, Client, GatewayIntentBits, Guild } from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForReady } from '../utils/helpers.js'

describe('Guild Member Search', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guild: Guild
	const seededUserIds: string[] = []

	beforeAll(async () => {
		session = await createSession({
			name: 'member-search',
			config: {
				guilds: [
					{
						name: 'Member Search Guild',
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

		// Seed test members for search tests
		for (let i = 0; i < 15; i++) {
			const userId = generateSnowflake()
			seededUserIds.push(userId)
			await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
				guild_id: guild.id,
				user: {
					id: userId,
					username: `SearchMember${i}`,
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

	describe('Search by Query', () => {
		it('should search members by query', async () => {
			const members = await guild.members.fetch({ query: 'Search', limit: 20 })

			expect(members.size).toBeGreaterThan(0)
			// All results should contain "Search" in username
			members.forEach((member) => {
				expect(member.user.username.toLowerCase()).toContain('search')
			})
		})

		it('should be case-insensitive in search', async () => {
			const membersLower = await guild.members.fetch({ query: 'searchmember', limit: 10 })
			const membersUpper = await guild.members.fetch({ query: 'SEARCHMEMBER', limit: 10 })

			// Both searches should return results
			expect(membersLower.size).toBeGreaterThan(0)
			expect(membersUpper.size).toBeGreaterThan(0)
		})
	})

	describe('Limit Results', () => {
		it('should limit search results', async () => {
			const members = await guild.members.fetch({ query: 'Search', limit: 5 })

			expect(members.size).toBeLessThanOrEqual(5)
		})

		it('should return exactly limit members when more exist', async () => {
			// We seeded 15 members, requesting 5
			const members = await guild.members.fetch({ query: 'SearchMember', limit: 5 })

			expect(members.size).toBe(5)
		})
	})

	describe('Empty Query', () => {
		it('should search with empty query to get all', async () => {
			const members = await guild.members.fetch({ query: '', limit: 100 })

			// Should return all members including the bot
			expect(members.size).toBeGreaterThan(0)
		})

		it('should include bot in empty query results', async () => {
			const members = await guild.members.fetch({ query: '', limit: 100 })

			// Bot should be included
			expect(members.has(client!.user!.id)).toBe(true)
		})
	})

	describe('Search by User IDs', () => {
		it('should search by user IDs', async () => {
			// Use the first two seeded user IDs
			const targetIds = [seededUserIds[0], seededUserIds[1]]

			const members = await guild.members.fetch({ user: targetIds })

			expect(members.has(targetIds[0])).toBe(true)
			expect(members.has(targetIds[1])).toBe(true)
		})

		it('should return single member by ID', async () => {
			const targetId = seededUserIds[0]

			const member = await guild.members.fetch(targetId)

			expect(member.id).toBe(targetId)
		})

		it('should handle mix of existing and non-existing IDs', async () => {
			const existingId = seededUserIds[0]
			const nonExistingId = generateSnowflake()

			const members = await guild.members.fetch({ user: [existingId, nonExistingId] })

			// Should find the existing member
			expect(members.has(existingId)).toBe(true)
			// Non-existing might not be in the result
			expect(members.size).toBeGreaterThanOrEqual(1)
		})
	})

	describe('Force Option', () => {
		it('should use force option to bypass cache', async () => {
			const targetId = seededUserIds[0]

			// First fetch (cached)
			const firstFetch = await guild.members.fetch(targetId)
			expect(firstFetch.id).toBe(targetId)

			// Force fetch (bypass cache)
			const forceFetch = await guild.members.fetch({ user: targetId, force: true })

			expect(forceFetch.id).toBe(targetId)
			// Both should have same ID
			expect(firstFetch.id).toBe(forceFetch.id)
		})

		it('should force refresh member data', async () => {
			const targetId = seededUserIds[1]

			// Fetch without force
			const cached = await guild.members.fetch(targetId)

			// Force refresh
			const refreshed = await guild.members.fetch({ user: targetId, force: true })

			// IDs should match
			expect(cached.id).toBe(refreshed.id)
		})
	})

	describe('Pagination', () => {
		it('should paginate through members', async () => {
			// Fetch first batch
			const firstBatch = await guild.members.list({ limit: 5 })

			if (firstBatch.size > 0) {
				const lastId = firstBatch.lastKey()!

				// Fetch second batch after last ID
				const secondBatch = await guild.members.list({
					limit: 5,
					after: lastId
				})

				// Second batch should not contain the last ID from first batch
				expect(secondBatch.has(lastId)).toBe(false)

				// Should be different members
				if (secondBatch.size > 0) {
					const firstBatchIds = Array.from(firstBatch.keys())
					const secondBatchIds = Array.from(secondBatch.keys())

					// No overlap between batches
					const overlap = firstBatchIds.filter((id) => secondBatchIds.includes(id))
					expect(overlap.length).toBe(0)
				}
			}
		})

		it('should handle pagination with after parameter', async () => {
			// Get all members first
			const allMembers = await guild.members.list({ limit: 100 })

			if (allMembers.size > 5) {
				// Get members sorted by ID
				const sortedIds = Array.from(allMembers.keys()).sort()
				const afterId = sortedIds[4] // After 5th member

				const afterMembers = await guild.members.list({
					limit: 10,
					after: afterId
				})

				// All returned members should have IDs greater than afterId
				afterMembers.forEach((_, id) => {
					expect(BigInt(id) > BigInt(afterId)).toBe(true)
				})
			}
		})

		it('should return empty when paginating past all members', async () => {
			// Get the last member ID (largest snowflake)
			const allMembers = await guild.members.list({ limit: 100 })
			const sortedIds = Array.from(allMembers.keys()).sort()
			const lastId = sortedIds[sortedIds.length - 1]

			// Try to get members after the last one
			const emptyBatch = await guild.members.list({
				limit: 10,
				after: lastId
			})

			// Should be empty
			expect(emptyBatch.size).toBe(0)
		})
	})
})
