/**
 * Message Mentions Tests
 *
 * Tests for message mention parsing including users, roles, channels, and @everyone.
 */
import { ChannelType, Client, Events, GatewayIntentBits, TextChannel } from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForEvent, waitForReady } from '../utils/helpers.js'

describe('Message Mentions', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel
	let guildId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'message-mentions-tests',
			config: {
				guilds: [
					{
						name: 'Mentions Test Guild',
						channels: [{ name: 'mentions-channel', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createTestClient({
			intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
		})
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

	describe('User Mentions', () => {
		it('should parse user mentions from dispatch', async () => {
			const memberId = generateSnowflake()
			const messageId = generateSnowflake()

			const messagePromise = waitForEvent(client!, Events.MessageCreate, 5000)

			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				id: messageId,
				channel_id: channel.id,
				guild_id: guildId,
				content: `Hello <@${memberId}>!`,
				author: { id: generateSnowflake(), username: 'Sender', discriminator: '0', bot: false, avatar: null },
				mentions: [
					{
						id: memberId,
						username: 'Mentioned',
						discriminator: '0',
						avatar: null,
						bot: false,
						global_name: 'Mentioned'
					}
				],
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

			expect(message.mentions.users.has(memberId)).toBe(true)
		})
	})

	describe('Role Mentions', () => {
		it('should parse role mentions from dispatch', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const role = await guild.roles.create({ name: 'Mentioned Role', mentionable: true })

			try {
				const messageId = generateSnowflake()
				const messagePromise = waitForEvent(client!, Events.MessageCreate, 5000)

				await dispatchEvent(session.id, 'MESSAGE_CREATE', {
					id: messageId,
					channel_id: channel.id,
					guild_id: guildId,
					content: `Attention <@&${role.id}>!`,
					author: { id: generateSnowflake(), username: 'Sender', discriminator: '0', bot: false, avatar: null },
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

				// Role mentions are stored by ID in mention_roles
				expect(message.mentions.roles.has(role.id)).toBe(true)
			} finally {
				await role.delete().catch(() => {})
			}
		})
	})

	describe('Channel Mentions', () => {
		it('should parse channel mentions', async () => {
			const messageId = generateSnowflake()
			const messagePromise = waitForEvent(client!, Events.MessageCreate, 5000)

			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				id: messageId,
				channel_id: channel.id,
				guild_id: guildId,
				content: `Check out <#${channel.id}>`,
				author: { id: generateSnowflake(), username: 'Sender', discriminator: '0', bot: false, avatar: null },
				mentions: [],
				mention_roles: [],
				mention_channels: [{ id: channel.id, name: channel.name, type: 0, guild_id: guildId }],
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

	describe('@everyone Mentions', () => {
		it('should detect @everyone mention', async () => {
			const messageId = generateSnowflake()
			const messagePromise = waitForEvent(client!, Events.MessageCreate, 5000)

			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				id: messageId,
				channel_id: channel.id,
				guild_id: guildId,
				content: '@everyone Hello!',
				author: { id: generateSnowflake(), username: 'Sender', discriminator: '0', bot: false, avatar: null },
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

	describe('Mentions.has() Method', () => {
		it('should check if member was mentioned using has()', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const member = guild.members.me!

			const messageId = generateSnowflake()
			const messagePromise = waitForEvent(client!, Events.MessageCreate, 5000)

			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				id: messageId,
				channel_id: channel.id,
				guild_id: guildId,
				content: `Hey <@${member.id}>!`,
				author: { id: generateSnowflake(), username: 'Sender', discriminator: '0', bot: false, avatar: null },
				mentions: [
					{
						id: member.id,
						username: member.user.username,
						discriminator: '0',
						avatar: null,
						bot: true,
						global_name: member.user.username
					}
				],
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

			expect(message.mentions.has(member)).toBe(true)
		})
	})
})
