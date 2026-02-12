/**
 * Embed Provider & Video Tests
 *
 * Tests for embed properties including provider, video, and image proxy URLs.
 */
import { ChannelType, Client, Events, GatewayIntentBits, Message, TextChannel } from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForEvent, waitForReady } from '../utils/helpers.js'

describe('Embed Provider & Video', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel
	let guildId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'embed-provider-video-tests',
			config: {
				guilds: [
					{
						name: 'Embed Provider Video Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				],
				enforceIntents: true,
				approvedPrivilegedIntents: BigInt(GatewayIntentBits.MessageContent)
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

	describe('provider in embed', () => {
		it('should have provider in embed', async () => {
			const messageId = generateSnowflake()
			const userId = generateSnowflake()

			const messagePromise = waitForEvent<Message>(client!, Events.MessageCreate, 5000)

			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				id: messageId,
				channel_id: channel.id,
				guild_id: guildId,
				content: 'https://youtube.com/watch?v=test',
				author: { id: userId, username: 'LinkPoster', discriminator: '0', avatar: null },
				timestamp: new Date().toISOString(),
				edited_timestamp: null,
				tts: false,
				mention_everyone: false,
				mentions: [],
				mention_roles: [],
				attachments: [],
				embeds: [
					{
						type: 'video',
						title: 'Test Video',
						provider: {
							name: 'YouTube',
							url: 'https://youtube.com'
						}
					}
				],
				pinned: false,
				type: 0
			})

			const message = await messagePromise

			expect(message.embeds.length).toBe(1)
			expect(message.embeds[0].provider?.name).toBe('YouTube')
			expect(message.embeds[0].provider?.url).toBe('https://youtube.com')
		})
	})

	describe('video in embed', () => {
		it('should have video in embed', async () => {
			const messageId = generateSnowflake()
			const userId = generateSnowflake()

			const messagePromise = waitForEvent<Message>(client!, Events.MessageCreate, 5000)

			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				id: messageId,
				channel_id: channel.id,
				guild_id: guildId,
				content: 'https://youtube.com/watch?v=test2',
				author: { id: userId, username: 'VideoPoster', discriminator: '0', avatar: null },
				timestamp: new Date().toISOString(),
				edited_timestamp: null,
				tts: false,
				mention_everyone: false,
				mentions: [],
				mention_roles: [],
				attachments: [],
				embeds: [
					{
						type: 'video',
						title: 'Video Embed',
						video: {
							url: 'https://youtube.com/embed/test2',
							proxy_url: 'https://proxy.youtube.com/test2',
							width: 1920,
							height: 1080
						}
					}
				],
				pinned: false,
				type: 0
			})

			const message = await messagePromise

			expect(message.embeds.length).toBe(1)
			expect(message.embeds[0].video?.url).toBe('https://youtube.com/embed/test2')
			expect(message.embeds[0].video?.width).toBe(1920)
			expect(message.embeds[0].video?.height).toBe(1080)
		})
	})

	describe('image proxy url', () => {
		it('should have image proxy url', async () => {
			const messageId = generateSnowflake()
			const userId = generateSnowflake()

			const messagePromise = waitForEvent<Message>(client!, Events.MessageCreate, 5000)

			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				id: messageId,
				channel_id: channel.id,
				guild_id: guildId,
				content: '',
				author: { id: userId, username: 'ImagePoster', discriminator: '0', avatar: null },
				timestamp: new Date().toISOString(),
				edited_timestamp: null,
				tts: false,
				mention_everyone: false,
				mentions: [],
				mention_roles: [],
				attachments: [],
				embeds: [
					{
						type: 'image',
						image: {
							url: 'https://example.com/image.png',
							proxy_url: 'https://images-ext.discordapp.net/image.png',
							width: 800,
							height: 600
						}
					}
				],
				pinned: false,
				type: 0
			})

			const message = await messagePromise

			expect(message.embeds.length).toBe(1)
			expect(message.embeds[0].image?.proxyURL).toContain('discordapp.net')
			expect(message.embeds[0].image?.width).toBe(800)
			expect(message.embeds[0].image?.height).toBe(600)
		})
	})

	describe('thumbnail proxy url', () => {
		it('should have thumbnail with proxy url', async () => {
			const messageId = generateSnowflake()
			const userId = generateSnowflake()

			const messagePromise = waitForEvent<Message>(client!, Events.MessageCreate, 5000)

			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				id: messageId,
				channel_id: channel.id,
				guild_id: guildId,
				content: '',
				author: { id: userId, username: 'ThumbnailPoster', discriminator: '0', avatar: null },
				timestamp: new Date().toISOString(),
				edited_timestamp: null,
				tts: false,
				mention_everyone: false,
				mentions: [],
				mention_roles: [],
				attachments: [],
				embeds: [
					{
						type: 'rich',
						title: 'Thumbnail Test',
						thumbnail: {
							url: 'https://example.com/thumb.png',
							proxy_url: 'https://images-ext.discordapp.net/thumb.png',
							width: 200,
							height: 200
						}
					}
				],
				pinned: false,
				type: 0
			})

			const message = await messagePromise

			expect(message.embeds.length).toBe(1)
			expect(message.embeds[0].thumbnail?.proxyURL).toContain('discordapp.net')
		})
	})
})
