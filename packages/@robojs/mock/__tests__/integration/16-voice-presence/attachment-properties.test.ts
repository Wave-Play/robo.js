/**
 * Attachment Properties Tests
 *
 * Tests for Attachment properties including contentType, ephemeral,
 * duration/waveform (voice messages), dimensions, and description.
 */
import { ChannelType, Client, Events, GatewayIntentBits, Message, MessageFlags, TextChannel } from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForEvent, waitForReady } from '../utils/helpers.js'

describe('Attachment Properties', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel

	beforeAll(async () => {
		session = await createSession({
			name: 'attachment-properties-tests',
			config: {
				guilds: [
					{
						name: 'Attachment Test Guild',
						channels: [{ name: 'attachments', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages])
		await client.login(session.token)
		await waitForReady(client)

		const guild = client.guilds.cache.first()!
		channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Content Type', () => {
		it('should have contentType for image attachment', async () => {
			const messageId = generateSnowflake()
			const attachmentId = generateSnowflake()
			const authorId = generateSnowflake()

			const messagePromise = waitForEvent<Message>(client!, Events.MessageCreate, 5000)

			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				id: messageId,
				channel_id: channel.id,
				content: '',
				author: { id: authorId, username: 'ImageUploader', discriminator: '0000' },
				attachments: [
					{
						id: attachmentId,
						filename: 'image.png',
						size: 1024,
						url: 'https://cdn.example.com/image.png',
						proxy_url: 'https://cdn.example.com/image.png',
						content_type: 'image/png'
					}
				],
				timestamp: new Date().toISOString(),
				edited_timestamp: null,
				tts: false,
				mention_everyone: false,
				mentions: [],
				mention_roles: [],
				pinned: false,
				type: 0
			})

			const message = await messagePromise
			const attachment = message.attachments.first()

			expect(attachment).toBeDefined()
			expect(attachment?.contentType).toBe('image/png')
		})

		it('should have contentType for application/pdf', async () => {
			const messageId = generateSnowflake()
			const attachmentId = generateSnowflake()
			const authorId = generateSnowflake()

			const messagePromise = waitForEvent<Message>(client!, Events.MessageCreate, 5000)

			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				id: messageId,
				channel_id: channel.id,
				content: '',
				author: { id: authorId, username: 'PDFUploader', discriminator: '0000' },
				attachments: [
					{
						id: attachmentId,
						filename: 'document.pdf',
						size: 2048,
						url: 'https://cdn.example.com/document.pdf',
						proxy_url: 'https://cdn.example.com/document.pdf',
						content_type: 'application/pdf'
					}
				],
				timestamp: new Date().toISOString(),
				edited_timestamp: null,
				tts: false,
				mention_everyone: false,
				mentions: [],
				mention_roles: [],
				pinned: false,
				type: 0
			})

			const message = await messagePromise
			const attachment = message.attachments.first()

			expect(attachment?.contentType).toBe('application/pdf')
		})
	})

	describe('Ephemeral Flag', () => {
		it('should have ephemeral flag', async () => {
			const messageId = generateSnowflake()
			const attachmentId = generateSnowflake()
			const authorId = generateSnowflake()

			const messagePromise = waitForEvent<Message>(client!, Events.MessageCreate, 5000)

			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				id: messageId,
				channel_id: channel.id,
				content: '',
				author: { id: authorId, username: 'EphemeralUploader', discriminator: '0000' },
				attachments: [
					{
						id: attachmentId,
						filename: 'temp.txt',
						size: 512,
						url: 'https://cdn.example.com/temp.txt',
						proxy_url: 'https://cdn.example.com/temp.txt',
						ephemeral: true
					}
				],
				timestamp: new Date().toISOString(),
				edited_timestamp: null,
				tts: false,
				mention_everyone: false,
				mentions: [],
				mention_roles: [],
				pinned: false,
				type: 0
			})

			const message = await messagePromise
			const attachment = message.attachments.first()

			expect(attachment?.ephemeral).toBe(true)
		})

		it('should have false ephemeral by default', async () => {
			const messageId = generateSnowflake()
			const attachmentId = generateSnowflake()
			const authorId = generateSnowflake()

			const messagePromise = waitForEvent<Message>(client!, Events.MessageCreate, 5000)

			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				id: messageId,
				channel_id: channel.id,
				content: '',
				author: { id: authorId, username: 'NormalUploader', discriminator: '0000' },
				attachments: [
					{
						id: attachmentId,
						filename: 'normal.txt',
						size: 256,
						url: 'https://cdn.example.com/normal.txt',
						proxy_url: 'https://cdn.example.com/normal.txt'
					}
				],
				timestamp: new Date().toISOString(),
				edited_timestamp: null,
				tts: false,
				mention_everyone: false,
				mentions: [],
				mention_roles: [],
				pinned: false,
				type: 0
			})

			const message = await messagePromise
			const attachment = message.attachments.first()

			expect(attachment?.ephemeral).toBeFalsy()
		})
	})

	describe('Voice Message (Duration and Waveform)', () => {
		it('should have duration for voice messages', async () => {
			const messageId = generateSnowflake()
			const attachmentId = generateSnowflake()
			const authorId = generateSnowflake()

			const messagePromise = waitForEvent<Message>(client!, Events.MessageCreate, 5000)

			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				id: messageId,
				channel_id: channel.id,
				content: '',
				author: { id: authorId, username: 'VoiceMsg', discriminator: '0000' },
				attachments: [
					{
						id: attachmentId,
						filename: 'voice-message.ogg',
						size: 2048,
						url: 'https://cdn.example.com/voice.ogg',
						proxy_url: 'https://cdn.example.com/voice.ogg',
						content_type: 'audio/ogg',
						duration_secs: 5.5,
						waveform: 'base64encodedwaveform'
					}
				],
				flags: MessageFlags.IsVoiceMessage,
				timestamp: new Date().toISOString(),
				edited_timestamp: null,
				tts: false,
				mention_everyone: false,
				mentions: [],
				mention_roles: [],
				pinned: false,
				type: 0
			})

			const message = await messagePromise
			const attachment = message.attachments.first()

			expect(attachment?.duration).toBe(5.5)
			expect(attachment?.waveform).toBe('base64encodedwaveform')
		})

		it('should not have duration for non-voice attachments', async () => {
			const messageId = generateSnowflake()
			const attachmentId = generateSnowflake()
			const authorId = generateSnowflake()

			const messagePromise = waitForEvent<Message>(client!, Events.MessageCreate, 5000)

			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				id: messageId,
				channel_id: channel.id,
				content: '',
				author: { id: authorId, username: 'ImageUser', discriminator: '0000' },
				attachments: [
					{
						id: attachmentId,
						filename: 'photo.jpg',
						size: 4096,
						url: 'https://cdn.example.com/photo.jpg',
						proxy_url: 'https://cdn.example.com/photo.jpg',
						content_type: 'image/jpeg'
					}
				],
				timestamp: new Date().toISOString(),
				edited_timestamp: null,
				tts: false,
				mention_everyone: false,
				mentions: [],
				mention_roles: [],
				pinned: false,
				type: 0
			})

			const message = await messagePromise
			const attachment = message.attachments.first()

			expect(attachment?.duration).toBeNull()
			expect(attachment?.waveform).toBeNull()
		})
	})

	describe('Image Dimensions', () => {
		it('should have width and height for images', async () => {
			const messageId = generateSnowflake()
			const attachmentId = generateSnowflake()
			const authorId = generateSnowflake()

			const messagePromise = waitForEvent<Message>(client!, Events.MessageCreate, 5000)

			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				id: messageId,
				channel_id: channel.id,
				content: '',
				author: { id: authorId, username: 'ImageDims', discriminator: '0000' },
				attachments: [
					{
						id: attachmentId,
						filename: 'photo.jpg',
						size: 4096,
						url: 'https://cdn.example.com/photo.jpg',
						proxy_url: 'https://cdn.example.com/photo.jpg',
						width: 1920,
						height: 1080
					}
				],
				timestamp: new Date().toISOString(),
				edited_timestamp: null,
				tts: false,
				mention_everyone: false,
				mentions: [],
				mention_roles: [],
				pinned: false,
				type: 0
			})

			const message = await messagePromise
			const attachment = message.attachments.first()

			expect(attachment?.width).toBe(1920)
			expect(attachment?.height).toBe(1080)
		})

		it('should not have dimensions for non-image files', async () => {
			const messageId = generateSnowflake()
			const attachmentId = generateSnowflake()
			const authorId = generateSnowflake()

			const messagePromise = waitForEvent<Message>(client!, Events.MessageCreate, 5000)

			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				id: messageId,
				channel_id: channel.id,
				content: '',
				author: { id: authorId, username: 'TextFile', discriminator: '0000' },
				attachments: [
					{
						id: attachmentId,
						filename: 'data.txt',
						size: 128,
						url: 'https://cdn.example.com/data.txt',
						proxy_url: 'https://cdn.example.com/data.txt',
						content_type: 'text/plain'
					}
				],
				timestamp: new Date().toISOString(),
				edited_timestamp: null,
				tts: false,
				mention_everyone: false,
				mentions: [],
				mention_roles: [],
				pinned: false,
				type: 0
			})

			const message = await messagePromise
			const attachment = message.attachments.first()

			expect(attachment?.width).toBeNull()
			expect(attachment?.height).toBeNull()
		})
	})

	describe('Description (Alt Text)', () => {
		it('should have description for attachment', async () => {
			const messageId = generateSnowflake()
			const attachmentId = generateSnowflake()
			const authorId = generateSnowflake()

			const messagePromise = waitForEvent<Message>(client!, Events.MessageCreate, 5000)

			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				id: messageId,
				channel_id: channel.id,
				content: '',
				author: { id: authorId, username: 'DescUploader', discriminator: '0000' },
				attachments: [
					{
						id: attachmentId,
						filename: 'diagram.png',
						size: 3072,
						url: 'https://cdn.example.com/diagram.png',
						proxy_url: 'https://cdn.example.com/diagram.png',
						description: 'A flowchart showing the process'
					}
				],
				timestamp: new Date().toISOString(),
				edited_timestamp: null,
				tts: false,
				mention_everyone: false,
				mentions: [],
				mention_roles: [],
				pinned: false,
				type: 0
			})

			const message = await messagePromise
			const attachment = message.attachments.first()

			expect(attachment?.description).toBe('A flowchart showing the process')
		})

		it('should have null description when not provided', async () => {
			const messageId = generateSnowflake()
			const attachmentId = generateSnowflake()
			const authorId = generateSnowflake()

			const messagePromise = waitForEvent<Message>(client!, Events.MessageCreate, 5000)

			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				id: messageId,
				channel_id: channel.id,
				content: '',
				author: { id: authorId, username: 'NoDescUploader', discriminator: '0000' },
				attachments: [
					{
						id: attachmentId,
						filename: 'noalt.png',
						size: 1024,
						url: 'https://cdn.example.com/noalt.png',
						proxy_url: 'https://cdn.example.com/noalt.png'
					}
				],
				timestamp: new Date().toISOString(),
				edited_timestamp: null,
				tts: false,
				mention_everyone: false,
				mentions: [],
				mention_roles: [],
				pinned: false,
				type: 0
			})

			const message = await messagePromise
			const attachment = message.attachments.first()

			expect(attachment?.description).toBeNull()
		})
	})

	describe('Multiple Attachments', () => {
		it('should handle multiple attachments with different properties', async () => {
			const messageId = generateSnowflake()
			const authorId = generateSnowflake()

			const messagePromise = waitForEvent<Message>(client!, Events.MessageCreate, 5000)

			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				id: messageId,
				channel_id: channel.id,
				content: '',
				author: { id: authorId, username: 'MultiUploader', discriminator: '0000' },
				attachments: [
					{
						id: generateSnowflake(),
						filename: 'image.png',
						size: 1024,
						url: 'https://cdn.example.com/image.png',
						proxy_url: 'https://cdn.example.com/image.png',
						content_type: 'image/png',
						width: 800,
						height: 600
					},
					{
						id: generateSnowflake(),
						filename: 'doc.pdf',
						size: 2048,
						url: 'https://cdn.example.com/doc.pdf',
						proxy_url: 'https://cdn.example.com/doc.pdf',
						content_type: 'application/pdf',
						description: 'Important document'
					},
					{
						id: generateSnowflake(),
						filename: 'video.mp4',
						size: 10240,
						url: 'https://cdn.example.com/video.mp4',
						proxy_url: 'https://cdn.example.com/video.mp4',
						content_type: 'video/mp4',
						width: 1920,
						height: 1080
					}
				],
				timestamp: new Date().toISOString(),
				edited_timestamp: null,
				tts: false,
				mention_everyone: false,
				mentions: [],
				mention_roles: [],
				pinned: false,
				type: 0
			})

			const message = await messagePromise

			expect(message.attachments.size).toBe(3)

			const imageAttachment = message.attachments.find((a) => a.name === 'image.png')
			const pdfAttachment = message.attachments.find((a) => a.name === 'doc.pdf')
			const videoAttachment = message.attachments.find((a) => a.name === 'video.mp4')

			expect(imageAttachment?.contentType).toBe('image/png')
			expect(imageAttachment?.width).toBe(800)
			expect(imageAttachment?.height).toBe(600)

			expect(pdfAttachment?.contentType).toBe('application/pdf')
			expect(pdfAttachment?.description).toBe('Important document')

			expect(videoAttachment?.contentType).toBe('video/mp4')
			expect(videoAttachment?.width).toBe(1920)
			expect(videoAttachment?.height).toBe(1080)
		})
	})
})
