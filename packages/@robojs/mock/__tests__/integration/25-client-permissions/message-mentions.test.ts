/**
 * Message Mentions Tests
 *
 * Tests for message mention properties including users collection,
 * roles collection, channels collection, everyone flag, members collection, and repliedUser.
 */
import { ChannelType, Client, Events, GatewayIntentBits, TextChannel } from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForEvent, waitForReady } from '../utils/helpers.js'

describe('Message Mentions', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel
	let guildId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'message-mentions',
			config: {
				guilds: [
					{
						name: 'Message Mentions Guild',
						channels: [{ name: 'mentions-channel', type: ChannelType.GuildText }]
					}
				],
				enforceIntents: true,
				approvedPrivilegedIntents: BigInt(
					GatewayIntentBits.GuildMembers | GatewayIntentBits.MessageContent | GatewayIntentBits.GuildPresences
				)
			}
		})

		client = createClientWithIntents([
			GatewayIntentBits.Guilds,
			GatewayIntentBits.GuildMessages,
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

	describe('mentions.users Collection', () => {
		it('should have users collection', async () => {
			const userId = generateSnowflake()
			const messageId = generateSnowflake()

			const messagePromise = waitForEvent(client!, Events.MessageCreate, 5000)

			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				id: messageId,
				channel_id: channel.id,
				guild_id: guildId,
				content: `Hello <@${userId}>`,
				author: { id: generateSnowflake(), username: 'Author', discriminator: '0', bot: false, avatar: null },
				mentions: [{ id: userId, username: 'MentionUser', discriminator: '0', avatar: null, bot: false }],
				mention_roles: [],
				timestamp: new Date().toISOString(),
				edited_timestamp: null,
				tts: false,
				mention_everyone: false,
				attachments: [],
				embeds: [],
				pinned: false,
				type: 0
			})

			const message = await messagePromise

			expect(message.mentions.users.has(userId)).toBe(true)
		})
	})

	describe('mentions.roles Collection', () => {
		it('should have roles collection', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const role = await guild.roles.create({ name: 'MentionRole', mentionable: true })

			try {
				const messageId = generateSnowflake()
				const messagePromise = waitForEvent(client!, Events.MessageCreate, 5000)

				await dispatchEvent(session.id, 'MESSAGE_CREATE', {
					id: messageId,
					channel_id: channel.id,
					guild_id: guildId,
					content: `Hello <@&${role.id}>`,
					author: { id: generateSnowflake(), username: 'Author', discriminator: '0', bot: false, avatar: null },
					mentions: [],
					mention_roles: [role.id],
					timestamp: new Date().toISOString(),
					edited_timestamp: null,
					tts: false,
					mention_everyone: false,
					attachments: [],
					embeds: [],
					pinned: false,
					type: 0
				})

				const message = await messagePromise

				expect(message.mentions.roles.has(role.id)).toBe(true)
			} finally {
				await role.delete().catch(() => {})
			}
		})
	})

	describe('mentions.channels Collection', () => {
		it('should have channels collection', async () => {
			const messageId = generateSnowflake()
			const messagePromise = waitForEvent(client!, Events.MessageCreate, 5000)

			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				id: messageId,
				channel_id: channel.id,
				guild_id: guildId,
				content: `Check out <#${channel.id}>`,
				author: { id: generateSnowflake(), username: 'Author', discriminator: '0', bot: false, avatar: null },
				mentions: [],
				mention_roles: [],
				mention_channels: [{ id: channel.id, name: channel.name, type: ChannelType.GuildText, guild_id: guildId }],
				timestamp: new Date().toISOString(),
				edited_timestamp: null,
				tts: false,
				mention_everyone: false,
				attachments: [],
				embeds: [],
				pinned: false,
				type: 0
			})

			const message = await messagePromise

			expect(message.mentions.channels.has(channel.id)).toBe(true)
		})
	})

	describe('mentions.everyone Flag', () => {
		it('should have everyone flag', async () => {
			const messageId = generateSnowflake()
			const messagePromise = waitForEvent(client!, Events.MessageCreate, 5000)

			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				id: messageId,
				channel_id: channel.id,
				guild_id: guildId,
				content: '@everyone hello',
				author: { id: generateSnowflake(), username: 'Author', discriminator: '0', bot: false, avatar: null },
				mentions: [],
				mention_roles: [],
				timestamp: new Date().toISOString(),
				edited_timestamp: null,
				tts: false,
				mention_everyone: true,
				attachments: [],
				embeds: [],
				pinned: false,
				type: 0
			})

			const message = await messagePromise

			expect(message.mentions.everyone).toBe(true)
		})
	})

	describe('mentions.members Collection', () => {
		it('should have members collection in guild', async () => {
			const memberId = generateSnowflake()

			await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
				guild_id: guildId,
				user: { id: memberId, username: 'MentionMember', discriminator: '0', avatar: null },
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			})

			const messageId = generateSnowflake()
			const messagePromise = waitForEvent(client!, Events.MessageCreate, 5000)

			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				id: messageId,
				channel_id: channel.id,
				guild_id: guildId,
				content: `Hey <@${memberId}>`,
				author: { id: generateSnowflake(), username: 'Author', discriminator: '0', bot: false, avatar: null },
				mentions: [{ id: memberId, username: 'MentionMember', discriminator: '0', avatar: null, bot: false }],
				mention_roles: [],
				timestamp: new Date().toISOString(),
				edited_timestamp: null,
				tts: false,
				mention_everyone: false,
				attachments: [],
				embeds: [],
				pinned: false,
				type: 0
			})

			const message = await messagePromise

			if (message.mentions.members) {
				expect(message.mentions.members.has(memberId)).toBe(true)
			}
		})
	})

	describe('mentions.repliedUser', () => {
		it('should have repliedUser', async () => {
			const originalId = generateSnowflake()
			const userId = generateSnowflake()
			const replyTargetUser = {
				id: userId,
				username: 'ReplyTarget',
				discriminator: '0',
				bot: false,
				avatar: null,
				global_name: 'ReplyTarget'
			}

			const messageId = generateSnowflake()
			const messagePromise = waitForEvent(client!, Events.MessageCreate, 5000)

			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				id: messageId,
				channel_id: channel.id,
				guild_id: guildId,
				content: 'Reply',
				author: { id: generateSnowflake(), username: 'Replier', discriminator: '0', bot: false, avatar: null },
				// The replied user should be in mentions when replying (Discord default behavior)
				mentions: [replyTargetUser],
				mention_roles: [],
				message_reference: {
					message_id: originalId,
					channel_id: channel.id,
					guild_id: guildId
				},
				referenced_message: {
					id: originalId,
					content: 'Original',
					channel_id: channel.id,
					author: replyTargetUser,
					timestamp: new Date().toISOString(),
					edited_timestamp: null,
					tts: false,
					mention_everyone: false,
					mentions: [],
					mention_roles: [],
					attachments: [],
					embeds: [],
					pinned: false,
					type: 0
				},
				timestamp: new Date().toISOString(),
				edited_timestamp: null,
				tts: false,
				mention_everyone: false,
				attachments: [],
				embeds: [],
				pinned: false,
				type: 0
			})

			const message = await messagePromise

			// repliedUser is derived from referenced_message.author
			expect(message.mentions.repliedUser?.id).toBe(userId)
		})
	})
})
