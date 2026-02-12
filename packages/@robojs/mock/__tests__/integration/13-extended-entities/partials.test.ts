/**
 * Partial Structures Tests
 *
 * Tests for handling partial structures in Discord.js including
 * partial messages, partial reactions, and fetching partials.
 */
import {
	ChannelType,
	Client,
	Events,
	GatewayIntentBits,
	Guild,
	Message,
	MessageReaction,
	Partials,
	TextChannel
} from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForEvent, waitForReady } from '../utils/helpers.js'
import { MOCK_CONFIG } from '../setup/constants.js'

describe('Partial Structures', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guild: Guild
	let channel: TextChannel

	beforeAll(async () => {
		session = await createSession({
			name: 'partials-tests',
			config: {
				guilds: [
					{
						name: 'Partials Test',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		// Create client with partials enabled
		client = new Client({
			intents: [
				GatewayIntentBits.Guilds,
				GatewayIntentBits.GuildMessages,
				GatewayIntentBits.MessageContent,
				GatewayIntentBits.GuildMessageReactions
			],
			partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User, Partials.GuildMember],
			rest: {
				api: MOCK_CONFIG.REST_URL
			},
			ws: {
				buildIdentifyThrottler: () => ({
					waitForIdentify: async () => {}
				})
			}
		})

		// @ts-expect-error - Setting internal property for mock server
		client.options.ws.gateway = MOCK_CONFIG.WS_URL

		await client.login(session.token)
		await waitForReady(client)

		guild = client.guilds.cache.first()!
		channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Partial Message in Delete Event', () => {
		it('should handle partial message in delete event', async () => {
			const messageId = generateSnowflake()

			// Set up listener for delete event
			const eventPromise = waitForEvent<Message>(client!, Events.MessageDelete, 5000)

			// Simulate delete of uncached message
			await dispatchEvent(session.id, 'MESSAGE_DELETE', {
				id: messageId,
				channel_id: channel.id,
				guild_id: guild.id
			})

			const message = await eventPromise

			// Message should be partial (not cached)
			expect(message.partial).toBe(true)
			expect(message.id).toBe(messageId)
		})

		it('should have channel for partial message', async () => {
			const messageId = generateSnowflake()

			const eventPromise = waitForEvent<Message>(client!, Events.MessageDelete, 5000)

			await dispatchEvent(session.id, 'MESSAGE_DELETE', {
				id: messageId,
				channel_id: channel.id,
				guild_id: guild.id
			})

			const message = await eventPromise

			expect(message.channelId).toBe(channel.id)
		})
	})

	describe('Fetching Partial Message', () => {
		it('should fetch partial message', async () => {
			// Send a message first
			const sent = await channel.send('Fetch partial test')
			const sentId = sent.id

			// Clear from cache to simulate partial
			channel.messages.cache.delete(sentId)

			// Fetch the message
			const fetched = await channel.messages.fetch(sentId)

			expect(fetched.partial).toBe(false)
			expect(fetched.content).toBe('Fetch partial test')
		})

		it('should resolve partial on fetch', async () => {
			const sent = await channel.send('Resolve partial')
			const sentId = sent.id

			// Clear cache
			channel.messages.cache.delete(sentId)

			// Create partial reference
			const partialRef = {
				id: sentId,
				channelId: channel.id
			}

			// Fetch to resolve
			const resolved = await channel.messages.fetch(partialRef.id)

			expect(resolved.id).toBe(sentId)
			expect(resolved.content).toBe('Resolve partial')
		})
	})

	describe('Partial Reaction', () => {
		it('should handle partial reaction on uncached message', async () => {
			const message = await channel.send('React partial test')
			const messageId = message.id

			// Clear cache to make it partial
			channel.messages.cache.delete(messageId)

			const eventPromise = waitForEvent<MessageReaction>(client!, Events.MessageReactionAdd, 5000)

			await dispatchEvent(session.id, 'MESSAGE_REACTION_ADD', {
				message_id: messageId,
				channel_id: channel.id,
				guild_id: guild.id,
				user_id: generateSnowflake(),
				emoji: { name: '⭐', id: null }
			})

			const reaction = await eventPromise

			// Reaction message may be partial
			if (reaction.partial || reaction.message.partial) {
				// Can fetch to resolve
				const fetched = await reaction.fetch()
				expect(fetched.partial).toBe(false)
			} else {
				expect(reaction.emoji.name).toBe('⭐')
			}
		})

		it('should have emoji info on partial reaction', async () => {
			const message = await channel.send('Emoji partial')
			const messageId = message.id

			channel.messages.cache.delete(messageId)

			const eventPromise = waitForEvent<MessageReaction>(client!, Events.MessageReactionAdd, 5000)

			await dispatchEvent(session.id, 'MESSAGE_REACTION_ADD', {
				message_id: messageId,
				channel_id: channel.id,
				guild_id: guild.id,
				user_id: generateSnowflake(),
				emoji: { name: '👍', id: null }
			})

			const reaction = await eventPromise

			expect(reaction.emoji.name).toBe('👍')
		})
	})

	describe('Partial Channel', () => {
		it('should handle events on uncached channel', async () => {
			// For partials, we can receive events for channels not in cache
			// The channel should be fetchable
			const channelId = channel.id

			// Verify channel can be fetched
			const fetched = await client!.channels.fetch(channelId)

			expect(fetched).toBeDefined()
			expect(fetched?.id).toBe(channelId)
		})
	})

	describe('Partial User', () => {
		it('should handle events with partial user', async () => {
			const userId = generateSnowflake()

			// Dispatch event with user not in cache
			await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
				guild_id: guild.id,
				user: { id: userId, username: 'PartialUser', discriminator: '0', avatar: null },
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			})

			// User should be fetchable
			const user = await client!.users.fetch(userId)

			expect(user.id).toBe(userId)
			expect(user.username).toBe('PartialUser')
		})
	})

	describe('Partial GuildMember', () => {
		it('should handle events with partial member', async () => {
			const userId = generateSnowflake()

			await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
				guild_id: guild.id,
				user: { id: userId, username: 'PartialMember', discriminator: '0', avatar: null },
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			})

			// Member should be fetchable
			const member = await guild.members.fetch(userId)

			expect(member.id).toBe(userId)
			expect(member.user.username).toBe('PartialMember')
		})

		it('should resolve partial member on fetch', async () => {
			const userId = generateSnowflake()

			await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
				guild_id: guild.id,
				user: { id: userId, username: 'ResolveMember', discriminator: '0', avatar: null },
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			})

			const member = await guild.members.fetch(userId)

			// After fetch, should have full member data
			expect(member.joinedAt).toBeDefined()
		})
	})

	describe('Partial Resolution', () => {
		it('should check partial property', async () => {
			const message = await channel.send('Check partial property')

			// Full message should not be partial
			expect(message.partial).toBe(false)
		})

		it('should distinguish partial from full', async () => {
			const full = await channel.send('Full message')

			expect(full.partial).toBe(false)
			expect(full.content).toBe('Full message')
		})
	})
})
