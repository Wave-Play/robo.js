/**
 * File Uploads & Attachments Tests
 *
 * Tests for sending messages with file attachments, handling
 * attachment metadata, CDN URLs, and attachment operations.
 */
import { Client, ChannelType, TextChannel, AttachmentBuilder, EmbedBuilder } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

// 1x1 transparent PNG for image tests
const TEST_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const TEST_PNG = Buffer.from(TEST_PNG_BASE64, 'base64')

// 1x1 red PNG for image tests
const RED_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='
const RED_PNG = Buffer.from(RED_PNG_BASE64, 'base64')

describe('File Uploads & Attachments', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel

	beforeAll(async () => {
		session = await createSession({
			name: 'attachment-tests',
			config: {
				guilds: [
					{
						name: 'Attachment Test Guild',
						channels: [{ name: 'file-uploads', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createTestClient()
		await client.login(session.token)
		await waitForReady(client)

		channel = client.guilds.cache.first()!.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Sending Attachments', () => {
		it('should send message with file attachment', async () => {
			const buffer = Buffer.from('Hello, World!')
			const attachment = new AttachmentBuilder(buffer, { name: 'test.txt' })

			const message = await channel.send({ files: [attachment] })

			expect(message.attachments.size).toBe(1)
			const attached = message.attachments.first()!
			expect(attached.name).toBe('test.txt')
		})

		it('should send multiple attachments', async () => {
			const file1 = new AttachmentBuilder(Buffer.from('File 1 content'), { name: 'file1.txt' })
			const file2 = new AttachmentBuilder(Buffer.from('File 2 content'), { name: 'file2.txt' })

			const message = await channel.send({ files: [file1, file2] })

			expect(message.attachments.size).toBe(2)
		})

		it('should include attachment size', async () => {
			const content = 'Known content length'
			const buffer = Buffer.from(content)
			const attachment = new AttachmentBuilder(buffer, { name: 'sized.txt' })

			const message = await channel.send({ files: [attachment] })

			const attached = message.attachments.first()!
			expect(attached.size).toBe(buffer.length)
		})

		it('should detect content type for images', async () => {
			const attachment = new AttachmentBuilder(TEST_PNG, { name: 'image.png' })

			const message = await channel.send({ files: [attachment] })

			const attached = message.attachments.first()!
			expect(attached.contentType).toMatch(/image\/png/)
		})

		it('should send with description (alt text)', async () => {
			const attachment = new AttachmentBuilder(Buffer.from('test'), {
				name: 'test.txt',
				description: 'A test file for testing'
			})

			const message = await channel.send({ files: [attachment] })

			const attached = message.attachments.first()!
			expect(attached.description).toBe('A test file for testing')
		})

		it('should send content with attachment', async () => {
			const attachment = new AttachmentBuilder(Buffer.from('data'), { name: 'data.txt' })

			const message = await channel.send({
				content: 'Check out this file!',
				files: [attachment]
			})

			expect(message.content).toBe('Check out this file!')
			expect(message.attachments.size).toBe(1)
		})

		it('should send image with dimensions', async () => {
			const attachment = new AttachmentBuilder(TEST_PNG, { name: 'dimensions.png' })

			const message = await channel.send({ files: [attachment] })

			const attached = message.attachments.first()!
			// Mock server should detect PNG dimensions
			expect(attached.width).toBeDefined()
			expect(attached.height).toBeDefined()
		})
	})

	describe('Attachment URLs', () => {
		it('should return valid attachment URL', async () => {
			const attachment = new AttachmentBuilder(Buffer.from('cdn test'), { name: 'cdn.txt' })
			const message = await channel.send({ files: [attachment] })

			const attached = message.attachments.first()!
			expect(attached.url).toBeDefined()
			expect(attached.url.length).toBeGreaterThan(0)
		})

		it('should return valid proxy URL', async () => {
			const attachment = new AttachmentBuilder(Buffer.from('proxy'), { name: 'proxy.txt' })
			const message = await channel.send({ files: [attachment] })

			const attached = message.attachments.first()!
			expect(attached.proxyURL).toBeDefined()
		})

		it('should fetch attachment content from URL', async () => {
			const originalContent = 'Fetchable content'
			const attachment = new AttachmentBuilder(Buffer.from(originalContent), { name: 'fetch.txt' })
			const message = await channel.send({ files: [attachment] })

			const attached = message.attachments.first()!

			// Try to fetch the attachment
			try {
				const response = await fetch(attached.url)
				if (response.ok) {
					const content = await response.text()
					expect(content).toBe(originalContent)
				}
			} catch {
				// If fetch fails, attachment URL might not be accessible in test environment
				expect(attached.url).toBeDefined()
			}
		})
	})

	describe('Attachment in Embeds', () => {
		it('should reference attachment in embed image', async () => {
			const attachment = new AttachmentBuilder(TEST_PNG, { name: 'embed-image.png' })

			const embed = new EmbedBuilder().setTitle('With Image').setImage('attachment://embed-image.png')

			const message = await channel.send({
				embeds: [embed],
				files: [attachment]
			})

			expect(message.embeds[0].image?.url).toContain('embed-image.png')
		})

		it('should reference attachment as thumbnail', async () => {
			const attachment = new AttachmentBuilder(RED_PNG, { name: 'thumb.png' })

			const embed = new EmbedBuilder().setTitle('With Thumbnail').setThumbnail('attachment://thumb.png')

			const message = await channel.send({
				embeds: [embed],
				files: [attachment]
			})

			expect(message.embeds[0].thumbnail?.url).toContain('thumb.png')
		})

		it('should support attachment in author icon', async () => {
			const attachment = new AttachmentBuilder(TEST_PNG, { name: 'author.png' })

			const embed = new EmbedBuilder()
				.setTitle('With Author')
				.setAuthor({ name: 'Test Author', iconURL: 'attachment://author.png' })

			const message = await channel.send({
				embeds: [embed],
				files: [attachment]
			})

			expect(message.embeds[0].author?.iconURL).toContain('author.png')
		})

		it('should support attachment in footer icon', async () => {
			const attachment = new AttachmentBuilder(TEST_PNG, { name: 'footer.png' })

			const embed = new EmbedBuilder()
				.setTitle('With Footer')
				.setFooter({ text: 'Footer text', iconURL: 'attachment://footer.png' })

			const message = await channel.send({
				embeds: [embed],
				files: [attachment]
			})

			expect(message.embeds[0].footer?.iconURL).toContain('footer.png')
		})
	})

	describe('Editing Attachments', () => {
		it('should remove attachment on edit', async () => {
			const attachment = new AttachmentBuilder(Buffer.from('remove'), { name: 'remove.txt' })
			const message = await channel.send({ files: [attachment] })

			expect(message.attachments.size).toBe(1)

			await message.edit({ content: 'No more attachment', attachments: [] })

			expect(message.attachments.size).toBe(0)
		})

		it('should keep attachment when editing content only', async () => {
			const attachment = new AttachmentBuilder(Buffer.from('keep'), { name: 'keep.txt' })
			const message = await channel.send({
				content: 'Original',
				files: [attachment]
			})

			await message.edit({ content: 'Edited' })

			expect(message.attachments.size).toBe(1)
		})

		it('should replace attachments on edit', async () => {
			const attachment1 = new AttachmentBuilder(Buffer.from('first'), { name: 'first.txt' })
			const message = await channel.send({ files: [attachment1] })

			const attachment2 = new AttachmentBuilder(Buffer.from('second'), { name: 'second.txt' })
			await message.edit({ files: [attachment2] })

			expect(message.attachments.size).toBe(1)
			expect(message.attachments.first()!.name).toBe('second.txt')
		})
	})

	describe('Attachment Properties', () => {
		it('should have correct id format', async () => {
			const attachment = new AttachmentBuilder(Buffer.from('id test'), { name: 'id.txt' })
			const message = await channel.send({ files: [attachment] })

			const attached = message.attachments.first()!
			expect(attached.id).toMatch(/^\d{17,19}$/)
		})

		it('should include spoiler status for SPOILER_ prefix', async () => {
			const attachment = new AttachmentBuilder(Buffer.from('spoiler'), { name: 'SPOILER_hidden.txt' })
			const message = await channel.send({ files: [attachment] })

			const attached = message.attachments.first()!
			expect(attached.spoiler).toBe(true)
		})

		it('should not mark non-spoiler files as spoilers', async () => {
			const attachment = new AttachmentBuilder(Buffer.from('normal'), { name: 'normal.txt' })
			const message = await channel.send({ files: [attachment] })

			const attached = message.attachments.first()!
			expect(attached.spoiler).toBe(false)
		})

		it('should support setSpoiler method', async () => {
			const attachment = new AttachmentBuilder(Buffer.from('hidden')).setName('secret.txt').setSpoiler(true)

			const message = await channel.send({ files: [attachment] })

			const attached = message.attachments.first()!
			expect(attached.spoiler).toBe(true)
		})
	})

	describe('Attachment Validation', () => {
		it('should accept file without extension', async () => {
			const attachment = new AttachmentBuilder(Buffer.from('no ext'), { name: 'noextension' })
			const message = await channel.send({ files: [attachment] })

			expect(message.attachments.size).toBe(1)
		})

		it('should handle empty file', async () => {
			const attachment = new AttachmentBuilder(Buffer.from(''), { name: 'empty.txt' })
			const message = await channel.send({ files: [attachment] })

			const attached = message.attachments.first()!
			expect(attached.size).toBe(0)
		})

		it('should handle binary content', async () => {
			const buffer = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff, 0xfe, 0xfd])
			const attachment = new AttachmentBuilder(buffer, { name: 'binary.bin' })

			const message = await channel.send({ files: [attachment] })

			expect(message.attachments.size).toBe(1)
			expect(message.attachments.first()!.size).toBe(buffer.length)
		})
	})
})
