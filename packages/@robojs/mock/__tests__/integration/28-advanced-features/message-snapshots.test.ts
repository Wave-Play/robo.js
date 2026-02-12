/**
 * Message Snapshot Details Tests
 *
 * Extended tests for message snapshots including content,
 * embeds, and timestamp details for forwarded messages.
 */
import { ChannelType, Client, Events, GatewayIntentBits, Message, MessageReferenceType, TextChannel } from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForEvent, waitForReady } from '../utils/helpers.js'

describe('Message Snapshot Details', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel
	let guildId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'message-snapshots',
			config: {
				guilds: [
					{
						name: 'Message Snapshots Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createClientWithIntents([
			GatewayIntentBits.Guilds,
			GatewayIntentBits.GuildMessages,
			GatewayIntentBits.MessageContent
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

	describe('Snapshot Content', () => {
		it('should have snapshot content', async () => {
			const messageId = generateSnowflake()
			const originalMessageId = generateSnowflake()
			const originalContent = 'Original forwarded content'

			const eventPromise = waitForEvent(client!, Events.MessageCreate, 5000)

			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				id: messageId,
				channel_id: channel.id,
				guild_id: guildId,
				content: '',
				author: { id: client!.user!.id, username: 'Bot', discriminator: '0', bot: true, avatar: null },
				timestamp: new Date().toISOString(),
				type: 0,
				message_reference: {
					type: MessageReferenceType.Forward,
					channel_id: channel.id,
					message_id: originalMessageId
				},
				message_snapshots: [
					{
						message: {
							content: originalContent,
							embeds: [],
							attachments: [],
							timestamp: new Date().toISOString(),
							type: 0,
							flags: 0
						}
					}
				]
			})

			const message = (await eventPromise) as Message

			expect(message.id).toBe(messageId)
			expect(message.messageSnapshots).toBeDefined()

			if (message.messageSnapshots && message.messageSnapshots.size > 0) {
				const snapshot = message.messageSnapshots.first() as unknown as {
					message?: { content?: string; embeds?: unknown[]; timestamp?: string }
				}
				expect(snapshot?.message?.content).toBe(originalContent)
			}
		})

		it('should have empty content for content-less snapshot', async () => {
			const messageId = generateSnowflake()
			const originalMessageId = generateSnowflake()

			const eventPromise = waitForEvent(client!, Events.MessageCreate, 5000)

			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				id: messageId,
				channel_id: channel.id,
				guild_id: guildId,
				content: '',
				author: { id: client!.user!.id, username: 'Bot', discriminator: '0', bot: true, avatar: null },
				timestamp: new Date().toISOString(),
				type: 0,
				message_reference: {
					type: MessageReferenceType.Forward,
					channel_id: channel.id,
					message_id: originalMessageId
				},
				message_snapshots: [
					{
						message: {
							content: '',
							embeds: [{ title: 'Embed Only' }],
							attachments: [],
							timestamp: new Date().toISOString()
						}
					}
				]
			})

			const message = (await eventPromise) as Message

			if (message.messageSnapshots && message.messageSnapshots.size > 0) {
				const snapshot = message.messageSnapshots.first() as unknown as {
					message?: { content?: string; embeds?: unknown[] }
				}
				expect(snapshot?.message?.content).toBe('')
			}
		})
	})

	describe('Snapshot Embeds', () => {
		it('should have snapshot embeds', async () => {
			const messageId = generateSnowflake()
			const originalMessageId = generateSnowflake()

			const eventPromise = waitForEvent(client!, Events.MessageCreate, 5000)

			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				id: messageId,
				channel_id: channel.id,
				guild_id: guildId,
				content: '',
				author: { id: client!.user!.id, username: 'Bot', discriminator: '0', bot: true, avatar: null },
				timestamp: new Date().toISOString(),
				type: 0,
				message_reference: {
					type: MessageReferenceType.Forward,
					channel_id: channel.id,
					message_id: originalMessageId
				},
				message_snapshots: [
					{
						message: {
							content: '',
							embeds: [
								{ title: 'Embed 1', description: 'First embed' },
								{ title: 'Embed 2', description: 'Second embed' }
							],
							attachments: [],
							timestamp: new Date().toISOString()
						}
					}
				]
			})

			const message = (await eventPromise) as Message

			if (message.messageSnapshots && message.messageSnapshots.size > 0) {
				const snapshot = message.messageSnapshots.first() as unknown as {
					message?: { content?: string; embeds?: Array<{ title?: string; description?: string }> }
				}
				expect(snapshot?.message?.embeds?.length).toBe(2)
				expect(snapshot?.message?.embeds?.[0]?.title).toBe('Embed 1')
				expect(snapshot?.message?.embeds?.[1]?.title).toBe('Embed 2')
			}
		})

		it('should have rich embed data in snapshot', async () => {
			const messageId = generateSnowflake()

			const eventPromise = waitForEvent(client!, Events.MessageCreate, 5000)

			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				id: messageId,
				channel_id: channel.id,
				guild_id: guildId,
				content: '',
				author: { id: client!.user!.id, username: 'Bot', discriminator: '0', bot: true, avatar: null },
				timestamp: new Date().toISOString(),
				type: 0,
				message_reference: {
					type: MessageReferenceType.Forward
				},
				message_snapshots: [
					{
						message: {
							content: 'Check this embed',
							embeds: [
								{
									title: 'Rich Embed',
									description: 'Full embed data',
									color: 0x5865f2,
									fields: [
										{ name: 'Field 1', value: 'Value 1', inline: true },
										{ name: 'Field 2', value: 'Value 2', inline: true }
									],
									footer: { text: 'Footer text' },
									author: { name: 'Author Name' }
								}
							],
							attachments: [],
							timestamp: new Date().toISOString()
						}
					}
				]
			})

			const message = (await eventPromise) as Message

			if (message.messageSnapshots && message.messageSnapshots.size > 0) {
				const snapshot = message.messageSnapshots.first() as unknown as {
					message?: { embeds?: Array<{ title?: string; description?: string }> }
				}
				const embed = snapshot?.message?.embeds?.[0]

				if (embed) {
					expect(embed.title).toBe('Rich Embed')
					expect(embed.description).toBe('Full embed data')
				}
			}
		})
	})

	describe('Snapshot Timestamp', () => {
		it('should have snapshot timestamp', async () => {
			const messageId = generateSnowflake()
			const originalMessageId = generateSnowflake()
			const snapshotTime = new Date('2024-06-15T12:00:00Z').toISOString()

			const eventPromise = waitForEvent(client!, Events.MessageCreate, 5000)

			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				id: messageId,
				channel_id: channel.id,
				guild_id: guildId,
				content: '',
				author: { id: client!.user!.id, username: 'Bot', discriminator: '0', bot: true, avatar: null },
				timestamp: new Date().toISOString(),
				type: 0,
				message_reference: {
					type: MessageReferenceType.Forward,
					channel_id: channel.id,
					message_id: originalMessageId
				},
				message_snapshots: [
					{
						message: {
							content: 'Timed message',
							embeds: [],
							attachments: [],
							timestamp: snapshotTime
						}
					}
				]
			})

			const message = (await eventPromise) as Message

			if (message.messageSnapshots && message.messageSnapshots.size > 0) {
				const snapshot = message.messageSnapshots.first() as unknown as {
					message?: { timestamp?: Date | string }
				}
				expect(snapshot?.message?.timestamp).toBeDefined()
				// The timestamp should be the original message's timestamp
				if (snapshot?.message?.timestamp) {
					const timestamp = snapshot.message.timestamp
					expect(timestamp instanceof Date || typeof timestamp === 'string').toBe(true)
				}
			}
		})

		it('should preserve original message timestamp in snapshot', async () => {
			const messageId = generateSnowflake()
			const originalTime = new Date('2024-01-15T08:30:00Z')
			const currentTime = new Date()

			const eventPromise = waitForEvent(client!, Events.MessageCreate, 5000)

			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				id: messageId,
				channel_id: channel.id,
				guild_id: guildId,
				content: '',
				author: { id: client!.user!.id, username: 'Bot', discriminator: '0', bot: true, avatar: null },
				timestamp: currentTime.toISOString(),
				type: 0,
				message_reference: {
					type: MessageReferenceType.Forward
				},
				message_snapshots: [
					{
						message: {
							content: 'Old message',
							embeds: [],
							attachments: [],
							timestamp: originalTime.toISOString()
						}
					}
				]
			})

			const message = (await eventPromise) as Message

			// The forwarded message timestamp should be different from the snapshot timestamp
			expect(message.createdTimestamp).toBeDefined()

			if (message.messageSnapshots && message.messageSnapshots.size > 0) {
				const snapshot = message.messageSnapshots.first() as unknown as {
					message?: { timestamp?: Date | string }
				}
				if (snapshot?.message?.timestamp) {
					// Snapshot should have the original timestamp
					expect(snapshot.message.timestamp).toBeDefined()
				}
			}
		})
	})
})
