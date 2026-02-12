/**
 * Message Nonce & System Messages Tests
 *
 * Tests for message nonce, enforceNonce, and various system message types
 * including join, boost, pin, and thread created messages.
 */
import { ChannelType, Client, GatewayIntentBits, Guild, MessageType, TextChannel } from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForReady } from '../utils/helpers.js'

describe('Message Nonce & System Messages', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guild: Guild
	let channel: TextChannel

	beforeAll(async () => {
		session = await createSession({
			name: 'message-nonce-tests',
			config: {
				guilds: [
					{
						name: 'Message Nonce Test',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages])
		await client.login(session.token)
		await waitForReady(client)

		guild = client.guilds.cache.first()!
		channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Message Nonce', () => {
		it('should send message with nonce', async () => {
			const nonce = '123456789012345678'

			const message = await channel.send({
				content: 'Message with nonce',
				nonce
			})

			expect(message.nonce).toBe(nonce)
		})

		it('should send with string nonce', async () => {
			const nonce = 'string-nonce-value'

			const message = await channel.send({
				content: 'String nonce',
				nonce
			})

			expect(message.nonce).toBe(nonce)
		})

		it('should send with enforceNonce', async () => {
			const nonce = generateSnowflake()

			const message = await channel.send({
				content: 'Enforced nonce',
				nonce,
				enforceNonce: true
			})

			expect(message.nonce).toBe(nonce)
		})

		it('should generate unique nonce per message', async () => {
			const nonce1 = generateSnowflake()
			const nonce2 = generateSnowflake()

			const message1 = await channel.send({ content: 'Msg 1', nonce: nonce1 })
			const message2 = await channel.send({ content: 'Msg 2', nonce: nonce2 })

			expect(message1.nonce).not.toBe(message2.nonce)
		})

		it('should accept message without nonce', async () => {
			const message = await channel.send('No nonce')

			// nonce may be null or undefined
			expect(message.content).toBe('No nonce')
		})
	})

	describe('System Messages', () => {
		it('should identify member join message', async () => {
			const messageId = generateSnowflake()

			// Simulate a system message (member join)
			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				id: messageId,
				channel_id: channel.id,
				guild_id: guild.id,
				content: '',
				author: { id: '111', username: 'NewMember', discriminator: '0', avatar: null },
				type: MessageType.UserJoin,
				timestamp: new Date().toISOString(),
				tts: false,
				mention_everyone: false,
				mentions: [],
				mention_roles: [],
				attachments: [],
				embeds: []
			})

			const messages = await channel.messages.fetch({ limit: 1 })
			const systemMsg = messages.first()!

			expect(systemMsg.system).toBe(true)
			expect(systemMsg.type).toBe(MessageType.UserJoin)
		})

		it('should identify boost message', async () => {
			const messageId = generateSnowflake()

			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				id: messageId,
				channel_id: channel.id,
				guild_id: guild.id,
				content: '',
				author: { id: '222', username: 'Booster', discriminator: '0', avatar: null },
				type: MessageType.GuildBoost,
				timestamp: new Date().toISOString(),
				tts: false,
				mention_everyone: false,
				mentions: [],
				mention_roles: [],
				attachments: [],
				embeds: []
			})

			const messages = await channel.messages.fetch({ limit: 1 })
			const boostMsg = messages.first()!

			expect(boostMsg.system).toBe(true)
			expect(boostMsg.type).toBe(MessageType.GuildBoost)
		})

		it('should identify pin message', async () => {
			const messageId = generateSnowflake()
			const pinnedMessageId = generateSnowflake()

			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				id: messageId,
				channel_id: channel.id,
				guild_id: guild.id,
				content: '',
				author: { id: '333', username: 'Pinner', discriminator: '0', avatar: null },
				type: MessageType.ChannelPinnedMessage,
				timestamp: new Date().toISOString(),
				tts: false,
				mention_everyone: false,
				mentions: [],
				mention_roles: [],
				attachments: [],
				embeds: [],
				message_reference: {
					message_id: pinnedMessageId,
					channel_id: channel.id
				}
			})

			const messages = await channel.messages.fetch({ limit: 1 })
			const pinMsg = messages.first()!

			expect(pinMsg.type).toBe(MessageType.ChannelPinnedMessage)
		})

		it('should identify thread created message', async () => {
			const messageId = generateSnowflake()
			const threadId = generateSnowflake()

			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				id: messageId,
				channel_id: channel.id,
				guild_id: guild.id,
				content: 'Thread Started',
				author: { id: '444', username: 'ThreadStarter', discriminator: '0', avatar: null },
				type: MessageType.ThreadCreated,
				timestamp: new Date().toISOString(),
				tts: false,
				mention_everyone: false,
				mentions: [],
				mention_roles: [],
				attachments: [],
				embeds: [],
				message_reference: {
					channel_id: threadId
				}
			})

			const messages = await channel.messages.fetch({ limit: 1 })
			const threadMsg = messages.first()!

			expect(threadMsg.type).toBe(MessageType.ThreadCreated)
		})

		it('should identify default message type', async () => {
			const message = await channel.send('Regular message')

			expect(message.type).toBe(MessageType.Default)
			expect(message.system).toBe(false)
		})

		it('should identify reply message type', async () => {
			const original = await channel.send('Original')
			const reply = await original.reply('This is a reply')

			expect(reply.type).toBe(MessageType.Reply)
		})
	})

	describe('Message Type Properties', () => {
		it('should check system property for non-system message', async () => {
			const message = await channel.send('Not a system message')

			expect(message.system).toBe(false)
		})

		it('should have type property', async () => {
			const message = await channel.send('Type check')

			expect(typeof message.type).toBe('number')
		})

		it('should distinguish between message types', async () => {
			const regular = await channel.send('Regular')
			const reply = await regular.reply('Reply')

			expect(regular.type).not.toBe(reply.type)
		})
	})
})
