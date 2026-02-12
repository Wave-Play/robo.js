/**
 * Collector Methods Tests
 *
 * Tests for collector methods including awaitMessages, createMessageCollector,
 * awaitReactions, awaitMessageComponent, and createMessageComponentCollector.
 */
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ChannelType,
	Client,
	ComponentType,
	GatewayIntentBits,
	InteractionType,
	Message,
	MessageComponentInteraction,
	MessageReaction,
	ReadonlyCollection,
	TextChannel
} from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { delay, generateSnowflake, waitForReady } from '../utils/helpers.js'

describe('Collector Methods', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel
	let guildId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'collector-methods-tests',
			config: {
				guilds: [
					{
						name: 'Collector Methods Guild',
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

	describe('channel.awaitMessages()', () => {
		it('should await messages with filter', async () => {
			// Create a user to send messages
			const userId = generateSnowflake()
			await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
				guild_id: guildId,
				user: {
					id: userId,
					username: 'Awaiter',
					discriminator: '0',
					avatar: null
				},
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			})

			const awaitPromise = channel.awaitMessages({
				filter: (m) => m.content === 'expected',
				max: 1,
				time: 5000
			})

			// Simulate incoming message after a short delay
			setTimeout(async () => {
				await dispatchEvent(session.id, 'MESSAGE_CREATE', {
					id: generateSnowflake(),
					channel_id: channel.id,
					content: 'expected',
					author: { id: userId, username: 'Awaiter', discriminator: '0', avatar: null },
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
			}, 100)

			const collected = await awaitPromise

			expect(collected.size).toBe(1)
			expect(collected.first()?.content).toBe('expected')
		})

		it('should timeout if no messages match', async () => {
			const collected = await channel.awaitMessages({
				filter: () => false,
				max: 1,
				time: 100
			})

			expect(collected.size).toBe(0)
		})

		it('should respect max parameter', async () => {
			const userId = generateSnowflake()
			await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
				guild_id: guildId,
				user: {
					id: userId,
					username: 'MaxUser',
					discriminator: '0',
					avatar: null
				},
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			})

			const awaitPromise = channel.awaitMessages({
				filter: (m) => m.content.startsWith('max-'),
				max: 2,
				time: 5000
			})

			// Send 3 messages but should only collect 2
			for (let i = 0; i < 3; i++) {
				setTimeout(async () => {
					await dispatchEvent(session.id, 'MESSAGE_CREATE', {
						id: generateSnowflake(),
						channel_id: channel.id,
						content: `max-${i}`,
						author: { id: userId, username: 'MaxUser', discriminator: '0', avatar: null },
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
				}, 50 * (i + 1))
			}

			const collected = await awaitPromise

			expect(collected.size).toBe(2)
		})
	})

	describe('channel.createMessageCollector()', () => {
		it('should collect messages over time', async () => {
			const userId = generateSnowflake()
			await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
				guild_id: guildId,
				user: {
					id: userId,
					username: 'Collector',
					discriminator: '0',
					avatar: null
				},
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			})

			const collector = channel.createMessageCollector({
				filter: (m) => m.content.startsWith('collect-'),
				time: 5000,
				max: 3
			})

			const collected: Message[] = []
			collector.on('collect', (m) => collected.push(m))

			// Simulate messages
			for (let i = 0; i < 3; i++) {
				await dispatchEvent(session.id, 'MESSAGE_CREATE', {
					id: generateSnowflake(),
					channel_id: channel.id,
					content: `collect-${i}`,
					author: { id: userId, username: 'Collector', discriminator: '0', avatar: null },
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
			}

			// Wait for collector to end
			await new Promise((r) => collector.on('end', r))

			expect(collected.length).toBe(3)
		})

		it('should emit end event with collection', async () => {
			const collector = channel.createMessageCollector({
				time: 100
			})

			const endPromise = new Promise<ReadonlyCollection<string, Message>>((resolve) => {
				collector.on('end', (collected) => resolve(collected))
			})

			const collection = await endPromise

			expect(collection).toBeDefined()
		})

		it('should stop collector manually', async () => {
			const collector = channel.createMessageCollector({
				time: 10000
			})

			let ended = false
			collector.on('end', () => {
				ended = true
			})

			collector.stop()
			await delay(100)

			expect(ended).toBe(true)
		})
	})

	describe('message.awaitReactions()', () => {
		it('should await reactions', async () => {
			const message = await channel.send('React to this')

			const awaitPromise = message.awaitReactions({
				filter: (r) => r.emoji.name === '✅',
				max: 1,
				time: 5000
			})

			// Simulate reaction
			setTimeout(async () => {
				await dispatchEvent(session.id, 'MESSAGE_REACTION_ADD', {
					user_id: client!.user!.id,
					channel_id: channel.id,
					message_id: message.id,
					guild_id: guildId,
					emoji: { name: '✅' }
				})
			}, 100)

			const collected = await awaitPromise

			expect(collected.size).toBe(1)
		})

		it('should timeout if no reactions', async () => {
			const message = await channel.send('No reactions')

			const collected = await message.awaitReactions({
				filter: () => false,
				max: 1,
				time: 100
			})

			expect(collected.size).toBe(0)
		})
	})

	describe('message.createReactionCollector()', () => {
		it('should collect reactions', async () => {
			const message = await channel.send('Collect reactions')

			const collector = message.createReactionCollector({
				filter: (r) => r.emoji.name === '👍' || r.emoji.name === '👎',
				time: 5000,
				max: 2
			})

			const collected: MessageReaction[] = []
			collector.on('collect', (r) => collected.push(r))

			// Simulate reactions
			await dispatchEvent(session.id, 'MESSAGE_REACTION_ADD', {
				user_id: generateSnowflake(),
				channel_id: channel.id,
				message_id: message.id,
				guild_id: guildId,
				emoji: { name: '👍' }
			})

			await delay(50)

			await dispatchEvent(session.id, 'MESSAGE_REACTION_ADD', {
				user_id: generateSnowflake(),
				channel_id: channel.id,
				message_id: message.id,
				guild_id: guildId,
				emoji: { name: '👎' }
			})

			await new Promise((r) => collector.on('end', r))

			expect(collected.length).toBe(2)
		})
	})

	describe('message.awaitMessageComponent()', () => {
		it('should await button click', async () => {
			const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder().setCustomId('await_btn').setLabel('Click').setStyle(ButtonStyle.Primary)
			)

			const message = await channel.send({
				content: 'Click the button',
				components: [row]
			})

			const awaitPromise = message.awaitMessageComponent({
				filter: (i) => i.customId === 'await_btn',
				time: 5000
			})

			// Simulate button click
			setTimeout(async () => {
				await dispatchEvent(session.id, 'INTERACTION_CREATE', {
					id: generateSnowflake(),
					application_id: client!.user!.id,
					type: InteractionType.MessageComponent,
					channel_id: channel.id,
					guild_id: guildId,
					message: {
						id: message.id,
						channel_id: channel.id,
						author: { id: client!.user!.id, username: 'Bot', discriminator: '0', avatar: null },
						content: 'Click the button',
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
						user: { id: generateSnowflake(), username: 'Clicker', discriminator: '0', avatar: null },
						roles: [],
						joined_at: new Date().toISOString(),
						deaf: false,
						mute: false
					},
					data: {
						custom_id: 'await_btn',
						component_type: ComponentType.Button
					},
					token: `await-token-${Date.now()}`
				})
			}, 100)

			const interaction = await awaitPromise

			expect(interaction.customId).toBe('await_btn')
		})

		it('should timeout if no component interaction', async () => {
			const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder().setCustomId('timeout_btn').setLabel('Timeout').setStyle(ButtonStyle.Secondary)
			)

			const message = await channel.send({
				content: 'Timeout button',
				components: [row]
			})

			await expect(
				message.awaitMessageComponent({
					filter: (i) => i.customId === 'timeout_btn',
					time: 100
				})
			).rejects.toBeDefined()
		})
	})

	describe('message.createMessageComponentCollector()', () => {
		it('should collect button clicks', async () => {
			const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder().setCustomId('collect_btn').setLabel('Click').setStyle(ButtonStyle.Primary)
			)

			const message = await channel.send({
				content: 'Collect clicks',
				components: [row]
			})

			const collector = message.createMessageComponentCollector({
				filter: (i) => i.customId === 'collect_btn',
				time: 5000,
				max: 2
			})

			const collected: MessageComponentInteraction[] = []
			collector.on('collect', (i) => collected.push(i))

			// Simulate clicks
			for (let i = 0; i < 2; i++) {
				await dispatchEvent(session.id, 'INTERACTION_CREATE', {
					id: generateSnowflake(),
					application_id: client!.user!.id,
					type: InteractionType.MessageComponent,
					channel_id: channel.id,
					guild_id: guildId,
					message: {
						id: message.id,
						channel_id: channel.id,
						author: { id: client!.user!.id, username: 'Bot', discriminator: '0', avatar: null },
						content: 'Collect clicks',
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
						user: { id: `${i}${i}${i}`, username: `Clicker${i}`, discriminator: '0', avatar: null },
						roles: [],
						joined_at: new Date().toISOString(),
						deaf: false,
						mute: false
					},
					data: {
						custom_id: 'collect_btn',
						component_type: ComponentType.Button
					},
					token: `collect-token-${i}-${Date.now()}`
				})
				await delay(50)
			}

			await new Promise((r) => collector.on('end', r))

			expect(collected.length).toBe(2)
		})

		it('should stop collector manually', async () => {
			const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder().setCustomId('stop_btn').setLabel('Stop').setStyle(ButtonStyle.Danger)
			)

			const message = await channel.send({
				content: 'Stop test',
				components: [row]
			})

			const collector = message.createMessageComponentCollector({
				time: 10000
			})

			let ended = false
			collector.on('end', () => {
				ended = true
			})

			collector.stop()
			await delay(100)

			expect(ended).toBe(true)
		})
	})

	describe('Collector Options', () => {
		it('should respect idle option', async () => {
			const userId = generateSnowflake()
			await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
				guild_id: guildId,
				user: {
					id: userId,
					username: 'IdleUser',
					discriminator: '0',
					avatar: null
				},
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			})

			const collector = channel.createMessageCollector({
				filter: (m) => m.content.startsWith('idle-'),
				idle: 200, // End after 200ms of no messages
				time: 5000
			})

			let ended = false
			collector.on('end', () => {
				ended = true
			})

			// Send one message
			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				id: generateSnowflake(),
				channel_id: channel.id,
				content: 'idle-test',
				author: { id: userId, username: 'IdleUser', discriminator: '0', avatar: null },
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
			await delay(300)

			expect(ended).toBe(true)
		})
	})

	describe('Collector Events', () => {
		it('should emit collect event', async () => {
			const userId = generateSnowflake()
			await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
				guild_id: guildId,
				user: {
					id: userId,
					username: 'CollectEvent',
					discriminator: '0',
					avatar: null
				},
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			})

			const collector = channel.createMessageCollector({
				time: 5000,
				max: 1
			})

			let collectedMessage: Message | null = null
			collector.on('collect', (m) => {
				collectedMessage = m
			})

			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				id: generateSnowflake(),
				channel_id: channel.id,
				content: 'collect-event-test',
				author: { id: userId, username: 'CollectEvent', discriminator: '0', avatar: null },
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

			await new Promise((r) => collector.on('end', r))

			expect(collectedMessage).not.toBeNull()
			expect(collectedMessage!.content).toBe('collect-event-test')
		})

		it('should emit end event with reason', async () => {
			const collector = channel.createMessageCollector({
				time: 100
			})

			const endReason = await new Promise<string>((resolve) => {
				collector.on('end', (_, reason) => {
					resolve(reason)
				})
			})

			expect(endReason).toBe('time')
		})

		it('should emit end with limit reason', async () => {
			const userId = generateSnowflake()
			await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
				guild_id: guildId,
				user: {
					id: userId,
					username: 'LimitUser',
					discriminator: '0',
					avatar: null
				},
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			})

			const collector = channel.createMessageCollector({
				time: 5000,
				max: 1
			})

			const endPromise = new Promise<string>((resolve) => {
				collector.on('end', (_, reason) => {
					resolve(reason)
				})
			})

			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				id: generateSnowflake(),
				channel_id: channel.id,
				content: 'limit-test',
				author: { id: userId, username: 'LimitUser', discriminator: '0', avatar: null },
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

			const reason = await endPromise

			expect(reason).toBe('limit')
		})
	})

	describe('Collector Properties', () => {
		it('should have ended property', async () => {
			const collector = channel.createMessageCollector({
				time: 100
			})

			expect(collector.ended).toBe(false)

			await new Promise((r) => collector.on('end', r))

			expect(collector.ended).toBe(true)
		})

		it('should have collected property', async () => {
			const userId = generateSnowflake()
			await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
				guild_id: guildId,
				user: {
					id: userId,
					username: 'CollectedProp',
					discriminator: '0',
					avatar: null
				},
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			})

			const collector = channel.createMessageCollector({
				time: 5000,
				max: 1
			})

			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				id: generateSnowflake(),
				channel_id: channel.id,
				content: 'collected-prop',
				author: { id: userId, username: 'CollectedProp', discriminator: '0', avatar: null },
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

			await new Promise((r) => collector.on('end', r))

			expect(collector.collected.size).toBe(1)
		})
	})
})
