/**
 * Collector Detailed Options Tests
 *
 * Tests for MessageCollector, ReactionCollector, and InteractionCollector
 * with detailed options including filter, max, maxProcessed, idle, and dispose.
 */
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonInteraction,
	ButtonStyle,
	ChannelType,
	Client,
	ComponentType,
	GatewayIntentBits,
	InteractionType,
	Message,
	MessageReaction,
	TextChannel
} from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { delay, generateSnowflake, waitForReady } from '../utils/helpers.js'

describe('Collector Detailed Options', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel
	let guildId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'collector-options-tests',
			config: {
				guilds: [
					{
						name: 'Collector Options Guild',
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

	describe('MessageCollector', () => {
		it('should filter messages', async () => {
			const collector = channel.createMessageCollector({
				filter: (m) => m.content.startsWith('!'),
				time: 5000
			})

			const collected: Message[] = []
			collector.on('collect', (m) => collected.push(m))

			const userId = generateSnowflake()

			// Send matching message
			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				id: generateSnowflake(),
				channel_id: channel.id,
				guild_id: guildId,
				content: '!command',
				author: { id: userId, username: 'User', discriminator: '0', avatar: null },
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
			})

			// Send non-matching message
			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				id: generateSnowflake(),
				channel_id: channel.id,
				guild_id: guildId,
				content: 'regular message',
				author: { id: generateSnowflake(), username: 'User2', discriminator: '0', avatar: null },
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
			})

			await delay(100)

			expect(collected.length).toBe(1)
			expect(collected[0].content).toBe('!command')

			collector.stop()
		})

		it('should respect max option', async () => {
			const collector = channel.createMessageCollector({
				max: 2,
				time: 5000
			})

			const collected: Message[] = []
			collector.on('collect', (m) => collected.push(m))

			// Send 5 messages but should only collect 2
			for (let i = 0; i < 5; i++) {
				await dispatchEvent(session.id, 'MESSAGE_CREATE', {
					id: generateSnowflake(),
					channel_id: channel.id,
					guild_id: guildId,
					content: `Message ${i}`,
					author: { id: generateSnowflake(), username: 'Spammer', discriminator: '0', avatar: null },
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
				})
			}

			await delay(100)

			expect(collected.length).toBe(2)
			expect(collector.ended).toBe(true)
			expect(collector.endReason).toBe('limit')
		})

		it('should respect maxProcessed option', async () => {
			const collector = channel.createMessageCollector({
				filter: (m) => m.content.includes('valid'),
				maxProcessed: 3,
				time: 5000
			})

			// Send 5 messages, only some are valid
			for (let i = 0; i < 5; i++) {
				await dispatchEvent(session.id, 'MESSAGE_CREATE', {
					id: generateSnowflake(),
					channel_id: channel.id,
					guild_id: guildId,
					content: i % 2 === 0 ? 'valid' : 'invalid',
					author: { id: generateSnowflake(), username: 'Mixed', discriminator: '0', avatar: null },
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
				})
			}

			await delay(100)

			expect(collector.ended).toBe(true)
			expect(collector.endReason).toBe('processedLimit')
		})

		it('should emit end event with reason', async () => {
			const collector = channel.createMessageCollector({
				time: 100
			})

			const endPromise = new Promise<string>((resolve) => {
				collector.on('end', (_, reason) => resolve(reason))
			})

			const reason = await endPromise
			expect(reason).toBe('time')
		})

		it('should respect idle option', async () => {
			const collector = channel.createMessageCollector({
				idle: 100,
				time: 5000
			})

			const endPromise = new Promise<string>((resolve) => {
				collector.on('end', (_, reason) => resolve(reason))
			})

			// Send one message
			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				id: generateSnowflake(),
				channel_id: channel.id,
				guild_id: guildId,
				content: 'Activity',
				author: { id: generateSnowflake(), username: 'Active', discriminator: '0', avatar: null },
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
			})

			// Wait for idle timeout
			const reason = await endPromise
			expect(reason).toBe('idle')
		})

		it('should emit dispose event when message deleted', async () => {
			const collector = channel.createMessageCollector({
				time: 5000,
				dispose: true
			})

			const disposePromise = new Promise<Message>((resolve) => {
				collector.on('dispose', (m) => resolve(m))
			})

			const messageId = generateSnowflake()
			const userId = generateSnowflake()

			// Send message
			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				id: messageId,
				channel_id: channel.id,
				guild_id: guildId,
				content: 'Will be deleted',
				author: { id: userId, username: 'Deleter', discriminator: '0', avatar: null },
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
			})

			await delay(50)

			// Delete message
			await dispatchEvent(session.id, 'MESSAGE_DELETE', {
				id: messageId,
				channel_id: channel.id,
				guild_id: guildId
			})

			const disposed = await disposePromise
			expect(disposed.id).toBe(messageId)

			collector.stop()
		})
	})

	describe('ReactionCollector', () => {
		it('should filter reactions', async () => {
			const message = await channel.send('React to filter')

			const collector = message.createReactionCollector({
				filter: (reaction) => reaction.emoji.name === '✅',
				time: 5000
			})

			const collected: MessageReaction[] = []
			collector.on('collect', (r) => collected.push(r))

			const userId1 = generateSnowflake()
			const userId2 = generateSnowflake()

			// Add matching reaction
			await dispatchEvent(session.id, 'MESSAGE_REACTION_ADD', {
				message_id: message.id,
				channel_id: channel.id,
				guild_id: guildId,
				user_id: userId1,
				member: {
					user: { id: userId1, username: 'Reactor1', discriminator: '0', avatar: null },
					roles: [],
					joined_at: new Date().toISOString(),
					deaf: false,
					mute: false
				},
				emoji: { id: null, name: '✅' }
			})

			// Add non-matching reaction
			await dispatchEvent(session.id, 'MESSAGE_REACTION_ADD', {
				message_id: message.id,
				channel_id: channel.id,
				guild_id: guildId,
				user_id: userId2,
				member: {
					user: { id: userId2, username: 'Reactor2', discriminator: '0', avatar: null },
					roles: [],
					joined_at: new Date().toISOString(),
					deaf: false,
					mute: false
				},
				emoji: { id: null, name: '❌' }
			})

			await delay(200)

			expect(collected.length).toBe(1)
			expect(collected[0].emoji.name).toBe('✅')

			collector.stop()
		})

		it('should respect max option', async () => {
			const message = await channel.send('React max')

			const collector = message.createReactionCollector({
				max: 2,
				time: 5000
			})

			// Add 5 reactions but should only collect 2
			for (let i = 0; i < 5; i++) {
				const userId = generateSnowflake()
				await dispatchEvent(session.id, 'MESSAGE_REACTION_ADD', {
					message_id: message.id,
					channel_id: channel.id,
					guild_id: guildId,
					user_id: userId,
					member: {
						user: { id: userId, username: `Reactor${i}`, discriminator: '0', avatar: null },
						roles: [],
						joined_at: new Date().toISOString(),
						deaf: false,
						mute: false
					},
					emoji: { id: null, name: '👍' }
				})
				await delay(20)
			}

			await delay(200)

			expect(collector.total).toBe(2)
			expect(collector.ended).toBe(true)

			collector.stop()
		})
	})

	describe('InteractionCollector', () => {
		it('should filter interactions', async () => {
			const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder().setCustomId('filter_btn').setLabel('Click').setStyle(ButtonStyle.Primary)
			)

			const message = await channel.send({ content: 'Click filter', components: [row] })

			const collector = message.createMessageComponentCollector({
				filter: (i) => i.customId === 'filter_btn',
				time: 5000
			})

			const collected: ButtonInteraction[] = []
			collector.on('collect', (i) => collected.push(i as ButtonInteraction))

			const userId = generateSnowflake()

			// Matching interaction
			await dispatchEvent(session.id, 'INTERACTION_CREATE', {
				id: generateSnowflake(),
				application_id: client!.user!.id,
				type: InteractionType.MessageComponent,
				guild_id: guildId,
				channel_id: channel.id,
				channel: {
					id: channel.id,
					type: ChannelType.GuildText
				},
				message: {
					id: message.id,
					channel_id: channel.id,
					content: 'Click filter',
					author: { id: client!.user!.id, username: client!.user!.username, discriminator: '0', avatar: null },
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
				member: {
					user: { id: userId, username: 'Clicker', discriminator: '0', avatar: null },
					roles: [],
					joined_at: new Date().toISOString(),
					deaf: false,
					mute: false
				},
				user: { id: userId, username: 'Clicker', discriminator: '0', avatar: null },
				data: {
					custom_id: 'filter_btn',
					component_type: ComponentType.Button
				},
				token: `filter-token-${Date.now()}`,
				version: 1,
				app_permissions: '0',
				locale: 'en-US',
				guild_locale: 'en-US',
				entitlements: []
			})

			await delay(100)

			expect(collected.length).toBe(1)

			collector.stop()
		})

		it('should filter by componentType', async () => {
			const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder().setCustomId('type_btn').setLabel('Button').setStyle(ButtonStyle.Primary)
			)

			const message = await channel.send({ content: 'Type filter', components: [row] })

			const collector = message.createMessageComponentCollector({
				componentType: ComponentType.Button,
				time: 5000
			})

			expect(collector.options.componentType).toBe(ComponentType.Button)

			collector.stop()
		})

		it('should have max option', async () => {
			const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder().setCustomId('max_btn').setLabel('Max').setStyle(ButtonStyle.Primary)
			)

			const message = await channel.send({ content: 'Max test', components: [row] })

			const collector = message.createMessageComponentCollector({
				max: 1,
				time: 5000
			})

			expect(collector.options.max).toBe(1)

			collector.stop()
		})
	})
})
