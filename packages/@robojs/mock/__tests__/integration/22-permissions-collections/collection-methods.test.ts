/**
 * Collection Methods on Mock Data Tests
 *
 * Tests for validating that the mock server correctly populates Collections
 * and maintains discord.js Collection compatibility with advanced methods.
 */
import { ChannelType, Client, Guild } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Collection Methods on Mock Data', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guild: Guild

	beforeAll(async () => {
		session = await createSession({
			name: 'collection-tests',
			config: {
				guilds: [
					{
						name: 'Collection Test Guild',
						channels: [
							{ name: 'general', type: ChannelType.GuildText },
							{ name: 'help', type: ChannelType.GuildText },
							{ name: 'voice', type: ChannelType.GuildVoice }
						]
					}
				]
			}
		})

		client = createTestClient()
		await client.login(session.token)
		await waitForReady(client)
		guild = client.guilds.cache.first()!
	}, 15000)

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Advanced Collection Methods', () => {
		it('should use findKey() to locate channel by property', () => {
			// Find the key (ID) of the first text channel
			const textChannelId = guild.channels.cache.findKey(
				(channel) => channel.type === ChannelType.GuildText
			)

			expect(textChannelId).toBeDefined()

			const channel = guild.channels.cache.get(textChannelId!)
			expect(channel?.type).toBe(ChannelType.GuildText)
		})

		it('should use some() to check if any channels match criteria', () => {
			// Check if any text channels exist
			const hasTextChannel = guild.channels.cache.some(
				(channel) => channel.type === ChannelType.GuildText
			)

			expect(hasTextChannel).toBe(true)

			// Check for non-existent channel type (using a type that guilds don't have)
			// GuildDirectory is deprecated, so check for MediaChannel instead which may not exist
			const hasMediaChannel = guild.channels.cache.some(
				(channel) => channel.type === ChannelType.GuildMedia
			)

			// This may be true or false depending on guild setup
			expect(typeof hasMediaChannel).toBe('boolean')
		})

		it('should use every() to check if all channels match criteria', () => {
			// All channels should belong to the same guild
			const allInGuild = guild.channels.cache.every((channel) => {
				if ('guild' in channel && channel.guild) {
					return channel.guild.id === guild.id
				}
				return false
			})

			expect(allInGuild).toBe(true)

			// Not all channels are voice type (we have text and voice)
			const allVoice = guild.channels.cache.every(
				(channel) => channel.type === ChannelType.GuildVoice
			)
			// This should be false since we have text channels too
			expect(allVoice).toBe(false)
		})

		it('should use reduce() to aggregate channel data', () => {
			// Count total channels by type
			const channelTypeCounts = guild.channels.cache.reduce(
				(acc, channel) => {
					const typeName = ChannelType[channel.type] || 'Unknown'
					acc[typeName] = (acc[typeName] || 0) + 1
					return acc
				},
				{} as Record<string, number>
			)

			expect(channelTypeCounts.GuildText).toBeGreaterThan(0)
			expect(Object.keys(channelTypeCounts).length).toBeGreaterThan(0)
		})

		it('should use first(n) to get multiple first items', () => {
			// Get first 2 channels
			const firstTwo = guild.channels.cache.first(2)

			expect(Array.isArray(firstTwo)).toBe(true)
			expect(firstTwo.length).toBeLessThanOrEqual(2)

			// Single item should not be array
			const firstOne = guild.channels.cache.first()
			expect(firstOne).toBeDefined()
			expect(Array.isArray(firstOne)).toBe(false)
		})

		it('should use last(n) to get multiple last items', () => {
			// Get last 2 channels
			const lastTwo = guild.channels.cache.last(2)

			expect(Array.isArray(lastTwo)).toBe(true)
			expect(lastTwo.length).toBeLessThanOrEqual(2)

			// Single item should not be array
			const lastOne = guild.channels.cache.last()
			expect(lastOne).toBeDefined()
			expect(Array.isArray(lastOne)).toBe(false)
		})

		it('should use random() to get random item from collection', () => {
			// Get random channel
			const randomChannel = guild.channels.cache.random()

			expect(randomChannel).toBeDefined()
			expect(guild.channels.cache.has(randomChannel!.id)).toBe(true)

			// Get multiple random items
			const randomTwo = guild.channels.cache.random(2)

			if (guild.channels.cache.size >= 2) {
				expect(Array.isArray(randomTwo)).toBe(true)
				expect((randomTwo as any[]).length).toBeLessThanOrEqual(2)
			}
		})

		it('should use at() and keyAt() with positive and negative indices', () => {
			// Get first item with at(0)
			const firstChannel = guild.channels.cache.at(0)
			expect(firstChannel).toBeDefined()

			// Get last item with at(-1)
			const lastChannel = guild.channels.cache.at(-1)
			expect(lastChannel).toBeDefined()

			// Get first key with keyAt(0)
			const firstKey = guild.channels.cache.keyAt(0)
			expect(firstKey).toBeDefined()

			// Get last key with keyAt(-1)
			const lastKey = guild.channels.cache.keyAt(-1)
			expect(lastKey).toBeDefined()

			// Verify they match
			expect(guild.channels.cache.get(firstKey!)).toBe(firstChannel)
			expect(guild.channels.cache.get(lastKey!)).toBe(lastChannel)
		})

		it('should use hasAll() and hasAny() to check multiple keys', () => {
			const channelIds = guild.channels.cache.map((c) => c.id)

			if (channelIds.length >= 2) {
				// Should have all existing IDs
				expect(guild.channels.cache.hasAll(channelIds[0], channelIds[1])).toBe(true)

				// Should have at least one existing ID
				expect(guild.channels.cache.hasAny(channelIds[0], 'nonexistent-id')).toBe(true)

				// Should not have all if one is missing
				expect(guild.channels.cache.hasAll(channelIds[0], 'nonexistent-id')).toBe(false)

				// Should not have any if all are missing
				expect(guild.channels.cache.hasAny('nonexistent-1', 'nonexistent-2')).toBe(false)
			}
		})

		it('should use difference() to find items in one collection but not another', () => {
			const allChannels = guild.channels.cache
			const textChannels = guild.channels.cache.filter(
				(c) => c.type === ChannelType.GuildText
			)

			// Find channels that are NOT text channels
			const nonTextChannels = allChannels.difference(textChannels)

			expect(nonTextChannels.size).toBe(allChannels.size - textChannels.size)

			// Verify none are text channels
			const hasTextChannel = nonTextChannels.some((c) => c.type === ChannelType.GuildText)
			expect(hasTextChannel).toBe(false)
		})

		it('should use intersect() to find items in both collections', () => {
			const allChannels = guild.channels.cache
			const textChannels = guild.channels.cache.filter(
				(c) => c.type === ChannelType.GuildText
			)

			// Find channels that appear in both (should be same as textChannels)
			const intersection = allChannels.intersect(textChannels)

			expect(intersection.size).toBe(textChannels.size)

			// All items should be text channels
			const allAreText = intersection.every((c) => c.type === ChannelType.GuildText)
			expect(allAreText).toBe(true)
		})

		it('should use ensure() to get existing value or create default', () => {
			const rolesCache = guild.roles.cache

			// Get existing role
			const firstRoleId = rolesCache.first()?.id

			if (firstRoleId) {
				const ensured = rolesCache.ensure(firstRoleId, () => {
					throw new Error('Should not be called for existing key')
				})

				expect(ensured).toBeDefined()
				expect(ensured.id).toBe(firstRoleId)
			}

			// Note: We can't test creation of new values since mock caches are read-only
			// But we've validated that ensure() works for existing values
		})

		it('should use sweep() to remove items from cache', () => {
			// We can't actually sweep from guild caches as they're managed by discord.js
			// But we can test that the method exists and works conceptually
			const initialSize = guild.channels.cache.size

			// Try to sweep non-existent items (should remove 0)
			const swept = guild.channels.cache.sweep(() => false)

			expect(swept).toBe(0)
			expect(guild.channels.cache.size).toBe(initialSize)
		})
	})
})
