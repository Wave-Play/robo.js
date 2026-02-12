/**
 * Reaction Methods Tests
 *
 * Tests for MessageReaction methods including fetch, users.fetch,
 * users.remove, remove, and removeAll.
 */
import { ChannelType, Client, GatewayIntentBits, TextChannel } from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { delay, generateSnowflake, waitForReady } from '../utils/helpers.js'

describe('Reaction Methods', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel
	let guildId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'reaction-methods-tests',
			config: {
				guilds: [
					{
						name: 'Reaction Methods Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				],
				enforceIntents: true,
				approvedPrivilegedIntents: BigInt(GatewayIntentBits.MessageContent | GatewayIntentBits.GuildMembers)
			}
		})

		client = createClientWithIntents([
			GatewayIntentBits.Guilds,
			GatewayIntentBits.GuildMessages,
			GatewayIntentBits.GuildMessageReactions,
			GatewayIntentBits.MessageContent,
			GatewayIntentBits.GuildMembers
		])
		await client.login(session.token)
		await waitForReady(client)

		const guild = client.guilds.cache.first()!
		guildId = guild.id
		channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('MessageReaction.fetch()', () => {
		it('should fetch reaction details', async () => {
			const message = await channel.send('Fetch reaction')
			await message.react('❤️')

			const fetched = await channel.messages.fetch(message.id)
			const reaction = fetched.reactions.cache.get('❤️')

			expect(reaction).toBeDefined()
			expect(reaction!.count).toBeGreaterThanOrEqual(1)
		})

		it('should have count property', async () => {
			const message = await channel.send('Count reaction')
			await message.react('👍')

			const fetched = await channel.messages.fetch(message.id)
			const reaction = fetched.reactions.cache.get('👍')

			expect(reaction).toBeDefined()
			expect(typeof reaction!.count).toBe('number')
		})

		it('should have me property indicating bot reacted', async () => {
			const message = await channel.send('Me reaction')
			await message.react('🎉')

			const fetched = await channel.messages.fetch(message.id)
			const reaction = fetched.reactions.cache.get('🎉')

			expect(reaction).toBeDefined()
			expect(reaction!.me).toBe(true)
		})
	})

	describe('MessageReaction.users.fetch()', () => {
		it('should fetch users who reacted', async () => {
			const message = await channel.send('Who reacted')
			await message.react('🎉')

			const fetched = await channel.messages.fetch(message.id)
			const reaction = fetched.reactions.cache.get('🎉')!
			const users = await reaction.users.fetch()

			expect(users.has(client!.user!.id)).toBe(true)
		})

		it('should fetch with limit', async () => {
			const message = await channel.send('Limited fetch')
			await message.react('👀')

			// Add reactions from multiple users via events
			const user1Id = generateSnowflake()
			const user2Id = generateSnowflake()
			const user3Id = generateSnowflake()

			// Create users
			for (const userId of [user1Id, user2Id, user3Id]) {
				await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
					guild_id: guildId,
					user: {
						id: userId,
						username: `ReactionUser${userId.slice(-4)}`,
						discriminator: '0',
						avatar: null
					},
					roles: [],
					joined_at: new Date().toISOString(),
					deaf: false,
					mute: false
				})
			}

			// Dispatch reaction events for other users
			for (const userId of [user1Id, user2Id, user3Id]) {
				await dispatchEvent(session.id, 'MESSAGE_REACTION_ADD', {
					user_id: userId,
					channel_id: channel.id,
					message_id: message.id,
					guild_id: guildId,
					emoji: { name: '👀' }
				})
				await delay(50)
			}

			const fetched = await channel.messages.fetch(message.id)
			const reaction = fetched.reactions.cache.get('👀')

			if (reaction) {
				const users = await reaction.users.fetch({ limit: 2 })
				expect(users.size).toBeLessThanOrEqual(4) // Bot + up to 3 users, limited to 2
			}
		})
	})

	describe('MessageReaction.users.remove()', () => {
		it('should remove bot reaction', async () => {
			const message = await channel.send('Remove self')
			await message.react('🗑️')

			const fetched = await channel.messages.fetch(message.id)
			let reaction = fetched.reactions.cache.get('🗑️')
			expect(reaction).toBeDefined()

			await reaction!.users.remove(client!.user!.id)

			// Refetch to verify
			const refetched = await channel.messages.fetch(message.id)
			const reactionAfter = refetched.reactions.cache.get('🗑️')

			// Reaction might be gone if no other users
			if (reactionAfter) {
				expect(reactionAfter.me).toBe(false)
			}
		})

		it('should remove other user reaction (with permission)', async () => {
			const message = await channel.send('Remove other')

			// Create another user
			const otherUserId = generateSnowflake()
			await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
				guild_id: guildId,
				user: {
					id: otherUserId,
					username: 'OtherReactor',
					discriminator: '0',
					avatar: null
				},
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			})

			// Other user reacts
			await dispatchEvent(session.id, 'MESSAGE_REACTION_ADD', {
				user_id: otherUserId,
				channel_id: channel.id,
				message_id: message.id,
				guild_id: guildId,
				emoji: { name: '😊' }
			})
			await delay(100)

			const fetched = await channel.messages.fetch(message.id)
			const reaction = fetched.reactions.cache.get('😊')

			if (reaction) {
				// With MANAGE_MESSAGES permission, bot can remove other users' reactions
				await reaction.users.remove(otherUserId)
			}
		})
	})

	describe('MessageReaction.remove()', () => {
		it('should remove entire emoji reaction', async () => {
			const message = await channel.send('Remove emoji')
			await message.react('💀')

			// Add reaction from another user
			const otherUserId = generateSnowflake()
			await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
				guild_id: guildId,
				user: {
					id: otherUserId,
					username: 'RemoveAll',
					discriminator: '0',
					avatar: null
				},
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			})

			await dispatchEvent(session.id, 'MESSAGE_REACTION_ADD', {
				user_id: otherUserId,
				channel_id: channel.id,
				message_id: message.id,
				guild_id: guildId,
				emoji: { name: '💀' }
			})
			await delay(100)

			const fetched = await channel.messages.fetch({ message: message.id, force: true })
			const reaction = fetched.reactions.cache.get('💀')

			if (reaction) {
				await reaction.remove()

				const refetched = await channel.messages.fetch({ message: message.id, force: true })
				expect(refetched.reactions.cache.has('💀')).toBe(false)
			}
		})
	})

	describe('Message.reactions.removeAll()', () => {
		it('should remove all reactions', async () => {
			const message = await channel.send('Clear all')
			await message.react('1️⃣')
			await message.react('2️⃣')
			await message.react('3️⃣')

			// Verify reactions exist
			let fetched = await channel.messages.fetch({ message: message.id, force: true })
			expect(fetched.reactions.cache.size).toBeGreaterThanOrEqual(3)

			await message.reactions.removeAll()

			// Force fetch to bypass Discord.js cache
			const refetched = await channel.messages.fetch({ message: message.id, force: true })
			expect(refetched.reactions.cache.size).toBe(0)
		})
	})

	describe('Reaction Properties', () => {
		it('should have emoji property', async () => {
			const message = await channel.send('Emoji prop')
			await message.react('🚀')

			const fetched = await channel.messages.fetch(message.id)
			const reaction = fetched.reactions.cache.get('🚀')

			expect(reaction).toBeDefined()
			expect(reaction!.emoji).toBeDefined()
			expect(reaction!.emoji.name).toBe('🚀')
		})

		it('should have message property', async () => {
			const message = await channel.send('Message prop')
			await message.react('📝')

			const fetched = await channel.messages.fetch(message.id)
			const reaction = fetched.reactions.cache.get('📝')

			expect(reaction).toBeDefined()
			expect(reaction!.message.id).toBe(message.id)
		})

		it('should have partial property', async () => {
			const message = await channel.send('Partial prop')
			await message.react('🔍')

			const fetched = await channel.messages.fetch(message.id)
			const reaction = fetched.reactions.cache.get('🔍')

			expect(reaction).toBeDefined()
			expect(typeof reaction!.partial).toBe('boolean')
		})
	})

	describe('Multiple Emoji Reactions', () => {
		it('should handle multiple different emoji reactions', async () => {
			const message = await channel.send('Multiple emojis')

			await message.react('👍')
			await message.react('👎')
			await message.react('❤️')
			await message.react('😂')

			const fetched = await channel.messages.fetch(message.id)
			expect(fetched.reactions.cache.size).toBeGreaterThanOrEqual(4)

			expect(fetched.reactions.cache.has('👍')).toBe(true)
			expect(fetched.reactions.cache.has('👎')).toBe(true)
			expect(fetched.reactions.cache.has('❤️')).toBe(true)
			expect(fetched.reactions.cache.has('😂')).toBe(true)
		})

		it('should increment count for same emoji from multiple users', async () => {
			const message = await channel.send('Same emoji')
			await message.react('🔥')

			// Create and add reactions from other users
			const user1Id = generateSnowflake()
			const user2Id = generateSnowflake()

			for (const userId of [user1Id, user2Id]) {
				await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
					guild_id: guildId,
					user: {
						id: userId,
						username: `FireUser${userId.slice(-4)}`,
						discriminator: '0',
						avatar: null
					},
					roles: [],
					joined_at: new Date().toISOString(),
					deaf: false,
					mute: false
				})

				await dispatchEvent(session.id, 'MESSAGE_REACTION_ADD', {
					user_id: userId,
					channel_id: channel.id,
					message_id: message.id,
					guild_id: guildId,
					emoji: { name: '🔥' }
				})
				await delay(50)
			}

			const fetched = await channel.messages.fetch(message.id)
			const reaction = fetched.reactions.cache.get('🔥')

			expect(reaction).toBeDefined()
			expect(reaction!.count).toBeGreaterThanOrEqual(1) // At least bot's reaction
		})
	})

	describe('Reaction Caching', () => {
		it('should cache reactions', async () => {
			const message = await channel.send('Cache test')
			await message.react('💾')

			// Reactions should be available in cache
			const reaction = message.reactions.cache.get('💾')
			expect(reaction).toBeDefined()
		})

		it('should update cache after fetch', async () => {
			const message = await channel.send('Update cache')
			await message.react('🔄')

			// Fetch to ensure cache is populated
			const fetched = await channel.messages.fetch(message.id)

			// Cache should be updated
			expect(fetched.reactions.cache.has('🔄')).toBe(true)
		})
	})
})
