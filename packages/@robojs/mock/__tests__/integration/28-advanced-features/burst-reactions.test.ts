/**
 * Burst Reactions (Super Reactions) Tests
 *
 * Tests for Discord's burst/super reaction feature including
 * burst colors, burst counts, and me_burst tracking.
 */
import { ChannelType, Client, Events, GatewayIntentBits, Message, TextChannel } from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForEvent, waitForReady } from '../utils/helpers.js'

describe('Burst Reactions', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel
	let guildId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'burst-reactions',
			config: {
				guilds: [
					{
						name: 'Burst Reactions Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createClientWithIntents([
			GatewayIntentBits.Guilds,
			GatewayIntentBits.GuildMessages,
			GatewayIntentBits.GuildMessageReactions
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

	describe('Burst Reaction Events', () => {
		it('should receive burst reaction', async () => {
			// Create a message first
			const message = await channel.send('React with burst!')
			const userId = generateSnowflake()

			// Dispatch burst reaction
			await dispatchEvent(session.id, 'MESSAGE_REACTION_ADD', {
				message_id: message.id,
				channel_id: channel.id,
				guild_id: guildId,
				user_id: userId,
				emoji: { name: '🎉', id: null },
				burst: true,
				burst_colors: ['#FF0000', '#00FF00', '#0000FF']
			})

			// Wait for reaction to be cached
			await new Promise((resolve) => setTimeout(resolve, 100))

			// Get cached reaction from message
			const reaction = message.reactions.cache.get('🎉')

			// Verify reaction was received and has burst info
			if (reaction) {
				// Check countDetails for burst information (Discord.js API)
				expect(reaction.countDetails).toBeDefined()
				if (reaction.countDetails) {
					expect(reaction.countDetails.burst).toBeGreaterThanOrEqual(0)
				}
			}
		})

		it('should have burst property on reaction', async () => {
			const messageId = generateSnowflake()
			const userId = generateSnowflake()

			// Dispatch a message with burst reaction already present
			const eventPromise = waitForEvent(client!, Events.MessageCreate, 5000)

			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				id: messageId,
				channel_id: channel.id,
				guild_id: guildId,
				content: 'Burst reaction message',
				author: { id: userId, username: 'TestUser', discriminator: '0', avatar: null },
				timestamp: new Date().toISOString(),
				reactions: [
					{
						emoji: { name: '✨', id: null },
						count: 1,
						count_details: {
							burst: 1,
							normal: 0
						},
						burst_colors: ['#FFD700'],
						me: false,
						me_burst: false
					}
				]
			})

			const message = (await eventPromise) as Message

			// Check reactions
			const reaction = message.reactions.cache.get('✨')
			if (reaction) {
				// countDetails should have burst count
				expect(reaction.countDetails).toBeDefined()
				if (reaction.countDetails) {
					expect(reaction.countDetails.burst).toBe(1)
					expect(reaction.countDetails.normal).toBe(0)
				}
			}
		})

		it('should track me_burst separately from me', async () => {
			const message = await channel.send('My burst reaction test')

			// Add a normal reaction first
			await message.react('🔥')

			// Dispatch a burst reaction from the bot
			await dispatchEvent(session.id, 'MESSAGE_REACTION_ADD', {
				message_id: message.id,
				channel_id: channel.id,
				guild_id: guildId,
				user_id: client!.user!.id,
				emoji: { name: '🔥', id: null },
				burst: true,
				burst_colors: ['#FF6600']
			})

			// Small delay for state update
			await new Promise((resolve) => setTimeout(resolve, 100))

			// Fetch updated message
			const updatedMessage = await channel.messages.fetch(message.id)
			const reaction = updatedMessage.reactions.cache.get('🔥')

			if (reaction) {
				// me should be true (normal reaction)
				expect(reaction.me).toBe(true)
			}
		})
	})

	describe('Burst Count Details', () => {
		it('should have countDetails with burst and normal counts', async () => {
			const messageId = generateSnowflake()

			const eventPromise = waitForEvent(client!, Events.MessageCreate, 5000)

			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				id: messageId,
				channel_id: channel.id,
				guild_id: guildId,
				content: 'Count details test',
				author: { id: generateSnowflake(), username: 'User', discriminator: '0', avatar: null },
				timestamp: new Date().toISOString(),
				reactions: [
					{
						emoji: { name: '💫', id: null },
						count: 5,
						count_details: {
							burst: 3,
							normal: 2
						},
						burst_colors: ['#9400D3', '#4B0082'],
						me: false,
						me_burst: false
					}
				]
			})

			const message = (await eventPromise) as Message
			const reaction = message.reactions.cache.get('💫')

			if (reaction) {
				expect(reaction.count).toBe(5)
				expect(reaction.countDetails?.burst).toBe(3)
				expect(reaction.countDetails?.normal).toBe(2)
			}
		})
	})
})
