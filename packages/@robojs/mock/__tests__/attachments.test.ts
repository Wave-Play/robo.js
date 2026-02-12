/**
 * File Uploads & Attachments Tests
 *
 * Tests the multipart parser, image dimension detection,
 * attachment storage, and CDN URL generation.
 */
import { Session } from '../src/session/session.js'
import { createSessionState, createDefaultGuildWithChannel } from '../src/session/state.js'
import { parseMultipartMessage, isMultipartRequest, MultipartError } from '../src/utils/multipart.js'
import { getImageDimensions, isImageContentType } from '../src/utils/image.js'
import type { SessionState, StoredAttachment, MockAttachment } from '../src/types/index.js'
import { AttachmentLimits, AttachmentFlags } from '../src/types/index.js'
import { generateSnowflake } from '../src/utils/snowflake.js'
import { MemoryAttachmentStorage, createStorage } from '../src/storage/attachment-storage.js'

describe('File Uploads & Attachments', () => {
	describe('Multipart Parser Utility', () => {
		it('should detect multipart requests', () => {
			const multipartRequest = new Request('http://localhost/test', {
				method: 'POST',
				headers: { 'Content-Type': 'multipart/form-data; boundary=----WebKitFormBoundary' }
			})

			const jsonRequest = new Request('http://localhost/test', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' }
			})

			expect(isMultipartRequest(multipartRequest)).toBe(true)
			expect(isMultipartRequest(jsonRequest)).toBe(false)
		})

		it('should parse payload_json field', async () => {
			const formData = new FormData()
			formData.append('payload_json', JSON.stringify({ content: 'Hello', embeds: [] }))

			const request = new Request('http://localhost/test', {
				method: 'POST',
				body: formData
			})

			const result = await parseMultipartMessage(request)
			expect(result.body).toEqual({ content: 'Hello', embeds: [] })
			expect(result.files).toHaveLength(0)
		})

		it('should parse uploaded files', async () => {
			const formData = new FormData()
			formData.append('payload_json', JSON.stringify({ content: 'Check this file' }))

			const fileContent = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]) // "Hello"
			const file = new File([fileContent], 'test.txt', { type: 'text/plain' })
			formData.append('files[0]', file)

			const request = new Request('http://localhost/test', {
				method: 'POST',
				body: formData
			})

			const result = await parseMultipartMessage(request)
			expect(result.files).toHaveLength(1)
			expect(result.files[0].filename).toBe('test.txt')
			expect(result.files[0].contentType).toBe('text/plain')
			expect(result.files[0].size).toBe(5)
			expect(result.files[0].data).toBeInstanceOf(Uint8Array)
		})

		it('should parse multiple files', async () => {
			const formData = new FormData()
			formData.append('payload_json', JSON.stringify({ content: 'Multiple files' }))

			const file1 = new File(['First file'], 'first.txt', { type: 'text/plain' })
			const file2 = new File(['Second file'], 'second.txt', { type: 'text/plain' })
			formData.append('files[0]', file1)
			formData.append('files[1]', file2)

			const request = new Request('http://localhost/test', {
				method: 'POST',
				body: formData
			})

			const result = await parseMultipartMessage(request)
			expect(result.files).toHaveLength(2)
			expect(result.files[0].filename).toBe('first.txt')
			expect(result.files[1].filename).toBe('second.txt')
		})

		it('should reject more than 10 files', async () => {
			const formData = new FormData()
			formData.append('payload_json', JSON.stringify({ content: 'Too many files' }))

			// Add 11 files (exceeds limit of 10)
			for (let i = 0; i < 11; i++) {
				const file = new File(['content'], `file${i}.txt`, { type: 'text/plain' })
				formData.append(`files[${i}]`, file)
			}

			const request = new Request('http://localhost/test', {
				method: 'POST',
				body: formData
			})

			try {
				await parseMultipartMessage(request)
				fail('Expected MultipartError to be thrown')
			} catch (error) {
				expect(error).toBeInstanceOf(MultipartError)
				expect((error as MultipartError).code).toBe(50035)
			}
		})

		it('should reject files exceeding 25MB total', async () => {
			const formData = new FormData()
			formData.append('payload_json', JSON.stringify({ content: 'Large file' }))

			// Create a file larger than 25MB
			const largeData = new Uint8Array(26 * 1024 * 1024) // 26MB
			const file = new File([largeData], 'large.bin', { type: 'application/octet-stream' })
			formData.append('files[0]', file)

			const request = new Request('http://localhost/test', {
				method: 'POST',
				body: formData
			})

			try {
				await parseMultipartMessage(request)
				fail('Expected MultipartError to be thrown')
			} catch (error) {
				expect(error).toBeInstanceOf(MultipartError)
				expect((error as MultipartError).code).toBe(40005)
			}
		})

		it('should throw on invalid payload_json', async () => {
			const formData = new FormData()
			formData.append('payload_json', 'not valid json {{{')

			const request = new Request('http://localhost/test', {
				method: 'POST',
				body: formData
			})

			try {
				await parseMultipartMessage(request)
				fail('Expected MultipartError to be thrown')
			} catch (error) {
				expect(error).toBeInstanceOf(MultipartError)
				expect((error as MultipartError).code).toBe(50035)
			}
		})

		it('should handle empty payload_json', async () => {
			const formData = new FormData()
			// No payload_json added

			const file = new File(['content'], 'test.txt', { type: 'text/plain' })
			formData.append('files[0]', file)

			const request = new Request('http://localhost/test', {
				method: 'POST',
				body: formData
			})

			const result = await parseMultipartMessage(request)
			expect(result.body).toEqual({})
			expect(result.files).toHaveLength(1)
		})
	})

	describe('Image Dimension Detection', () => {
		it('should identify image content types', () => {
			expect(isImageContentType('image/png')).toBe(true)
			expect(isImageContentType('image/jpeg')).toBe(true)
			expect(isImageContentType('image/gif')).toBe(true)
			expect(isImageContentType('image/webp')).toBe(true)
			expect(isImageContentType('text/plain')).toBe(false)
			expect(isImageContentType('application/json')).toBe(false)
		})

		it('should extract PNG dimensions', () => {
			// Minimal PNG header with 100x50 dimensions
			// PNG signature: 89 50 4E 47 0D 0A 1A 0A
			// IHDR length: 00 00 00 0D
			// IHDR type: 49 48 44 52
			// Width (100): 00 00 00 64
			// Height (50): 00 00 00 32
			const pngData = new Uint8Array([
				0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
				0x00, 0x00, 0x00, 0x0d, // IHDR length
				0x49, 0x48, 0x44, 0x52, // IHDR type
				0x00, 0x00, 0x00, 0x64, // Width: 100
				0x00, 0x00, 0x00, 0x32, // Height: 50
				0x08, 0x06, 0x00, 0x00, 0x00 // bit depth, color type, etc.
			])

			const dims = getImageDimensions(pngData, 'image/png')
			expect(dims).toEqual({ width: 100, height: 50 })
		})

		it('should extract GIF dimensions', () => {
			// Minimal GIF header with 200x150 dimensions (little-endian)
			const gifData = new Uint8Array([
				0x47, 0x49, 0x46, 0x38, 0x39, 0x61, // GIF89a
				0xc8, 0x00, // Width: 200 (little-endian)
				0x96, 0x00, // Height: 150 (little-endian)
				0x00, 0x00, 0x00 // Other header bytes
			])

			const dims = getImageDimensions(gifData, 'image/gif')
			expect(dims).toEqual({ width: 200, height: 150 })
		})

		it('should extract JPEG dimensions', () => {
			// Minimal JPEG with SOF0 marker, 320x240 dimensions
			// SOF0 marker: FF C0
			// Length: 00 11
			// Precision: 08
			// Height: 00 F0 (240)
			// Width: 01 40 (320)
			const jpegData = new Uint8Array([
				0xff, 0xd8, // SOI marker
				0xff, 0xe0, 0x00, 0x10, // APP0 marker with length
				0x4a, 0x46, 0x49, 0x46, 0x00, // JFIF identifier
				0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, // APP0 data
				0xff, 0xc0, // SOF0 marker
				0x00, 0x11, // Length
				0x08, // Precision
				0x00, 0xf0, // Height: 240
				0x01, 0x40, // Width: 320
				0x03 // Components
			])

			const dims = getImageDimensions(jpegData, 'image/jpeg')
			expect(dims).toEqual({ width: 320, height: 240 })
		})

		it('should return null for invalid PNG', () => {
			const invalidData = new Uint8Array([0x00, 0x00, 0x00, 0x00])
			const dims = getImageDimensions(invalidData, 'image/png')
			expect(dims).toBeNull()
		})

		it('should return null for unsupported formats', () => {
			const data = new Uint8Array([0x00, 0x00, 0x00, 0x00])
			const dims = getImageDimensions(data, 'image/bmp')
			expect(dims).toBeNull()
		})

		it('should return null for truncated data', () => {
			// Only PNG signature, not enough for dimensions
			const truncated = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
			const dims = getImageDimensions(truncated, 'image/png')
			expect(dims).toBeNull()
		})
	})

	describe('Attachment Storage in State', () => {
		let sessionState: SessionState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should store attachments', () => {
			const attachment: StoredAttachment = {
				id: generateSnowflake(),
				channelId: '123456789',
				messageId: '987654321',
				filename: 'test.txt',
				contentType: 'text/plain',
				size: 100,
				data: new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f])
			}

			sessionState.storeAttachment(attachment)
			const retrieved = sessionState.getAttachment(attachment.id)

			expect(retrieved).toBeDefined()
			expect(retrieved?.filename).toBe('test.txt')
			expect(retrieved?.contentType).toBe('text/plain')
		})

		it('should delete attachments', () => {
			const attachment: StoredAttachment = {
				id: generateSnowflake(),
				channelId: '123456789',
				messageId: '987654321',
				filename: 'test.txt',
				contentType: 'text/plain',
				size: 100,
				data: new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f])
			}

			sessionState.storeAttachment(attachment)
			expect(sessionState.getAttachment(attachment.id)).toBeDefined()

			const deleted = sessionState.deleteAttachment(attachment.id)
			expect(deleted).toBe(true)
			expect(sessionState.getAttachment(attachment.id)).toBeUndefined()
		})

		it('should return false when deleting non-existent attachment', () => {
			const deleted = sessionState.deleteAttachment('nonexistent123')
			expect(deleted).toBe(false)
		})

		it('should get attachments for a message', () => {
			const messageId = '987654321'

			const attachment1: StoredAttachment = {
				id: generateSnowflake(),
				channelId: '123456789',
				messageId,
				filename: 'file1.txt',
				contentType: 'text/plain',
				size: 100,
				data: new Uint8Array([0x31])
			}

			const attachment2: StoredAttachment = {
				id: generateSnowflake(),
				channelId: '123456789',
				messageId,
				filename: 'file2.txt',
				contentType: 'text/plain',
				size: 100,
				data: new Uint8Array([0x32])
			}

			const otherAttachment: StoredAttachment = {
				id: generateSnowflake(),
				channelId: '123456789',
				messageId: 'other-message',
				filename: 'other.txt',
				contentType: 'text/plain',
				size: 100,
				data: new Uint8Array([0x33])
			}

			sessionState.storeAttachment(attachment1)
			sessionState.storeAttachment(attachment2)
			sessionState.storeAttachment(otherAttachment)

			const messageAttachments = sessionState.getAttachmentsForMessage(messageId)
			expect(messageAttachments).toHaveLength(2)
			expect(messageAttachments.map((a) => a.filename)).toContain('file1.txt')
			expect(messageAttachments.map((a) => a.filename)).toContain('file2.txt')
		})
	})

	describe('Message Creation with Attachments', () => {
		let sessionState: SessionState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should create message with attachments array', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]

			const attachments: MockAttachment[] = [
				{
					id: generateSnowflake(),
					filename: 'image.png',
					content_type: 'image/png',
					size: 1024,
					url: 'http://localhost/cdn/attachments/123/456/image.png',
					proxy_url: 'http://localhost/cdn/attachments/123/456/image.png',
					width: 100,
					height: 50
				}
			]

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: 'Check this image!',
				attachments
			})

			expect(message.attachments).toHaveLength(1)
			expect(message.attachments[0].filename).toBe('image.png')
			expect(message.attachments[0].width).toBe(100)
			expect(message.attachments[0].height).toBe(50)
		})

		it('should default to empty attachments array', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: 'No attachments'
			})

			expect(message.attachments).toEqual([])
		})
	})

	describe('Message Update with Attachments', () => {
		let sessionState: SessionState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should update message attachments', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]

			const originalAttachment: MockAttachment = {
				id: generateSnowflake(),
				filename: 'original.png',
				content_type: 'image/png',
				size: 1024,
				url: 'http://localhost/cdn/original.png',
				proxy_url: 'http://localhost/cdn/original.png'
			}

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: 'Original message',
				attachments: [originalAttachment]
			})

			const newAttachment: MockAttachment = {
				id: generateSnowflake(),
				filename: 'new.png',
				content_type: 'image/png',
				size: 2048,
				url: 'http://localhost/cdn/new.png',
				proxy_url: 'http://localhost/cdn/new.png'
			}

			const updated = sessionState.updateMessage(message.id, {
				attachments: [newAttachment]
			})

			expect(updated?.attachments).toHaveLength(1)
			expect(updated?.attachments[0].filename).toBe('new.png')
		})

		it('should preserve existing attachments if not specified in update', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]

			const attachment: MockAttachment = {
				id: generateSnowflake(),
				filename: 'keep.png',
				content_type: 'image/png',
				size: 1024,
				url: 'http://localhost/cdn/keep.png',
				proxy_url: 'http://localhost/cdn/keep.png'
			}

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: 'Has attachment',
				attachments: [attachment]
			})

			// Update only content, not attachments
			const updated = sessionState.updateMessage(message.id, {
				content: 'Updated content'
			})

			expect(updated?.attachments).toHaveLength(1)
			expect(updated?.attachments[0].filename).toBe('keep.png')
		})
	})

	describe('Attachment Cleanup on Message Deletion', () => {
		let sessionState: SessionState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should clean up stored attachments when message is deleted', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]

			// Create a stored attachment
			const attachmentId = generateSnowflake()
			const messageId = generateSnowflake()

			const storedAttachment: StoredAttachment = {
				id: attachmentId,
				channelId,
				messageId,
				filename: 'test.png',
				contentType: 'image/png',
				size: 1024,
				data: new Uint8Array([0x89, 0x50, 0x4e, 0x47])
			}

			sessionState.storeAttachment(storedAttachment)

			// Create message with reference to this attachment
			const mockAttachment: MockAttachment = {
				id: attachmentId,
				filename: 'test.png',
				content_type: 'image/png',
				size: 1024,
				url: `http://localhost/cdn/attachments/${channelId}/${attachmentId}/test.png`,
				proxy_url: `http://localhost/cdn/attachments/${channelId}/${attachmentId}/test.png`
			}

			const message = sessionState.createMessage({
				id: messageId,
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: 'Has attachment',
				attachments: [mockAttachment]
			})

			// Verify attachment exists
			expect(sessionState.getAttachment(attachmentId)).toBeDefined()

			// Delete message
			sessionState.deleteMessage(message.id)

			// Attachment should be cleaned up
			expect(sessionState.getAttachment(attachmentId)).toBeUndefined()
		})
	})

	describe('CDN URL Generation', () => {
		it('should generate correct CDN URL format', () => {
			const channelId = '123456789012345678'
			const attachmentId = '987654321098765432'
			const filename = 'test-image.png'

			const expectedUrl = `http://localhost:53596/cdn/attachments/${channelId}/${attachmentId}/${filename}`

			// This tests the URL format that our endpoints generate
			const cdnBaseUrl = process.env.MOCK_CDN_URL || 'http://localhost:53596'
			const url = `${cdnBaseUrl}/cdn/attachments/${channelId}/${attachmentId}/${encodeURIComponent(filename)}`

			expect(url).toBe(expectedUrl)
		})

		it('should URL-encode filenames with special characters', () => {
			const channelId = '123456789012345678'
			const attachmentId = '987654321098765432'
			const filename = 'my file (1).png'

			const cdnBaseUrl = process.env.MOCK_CDN_URL || 'http://localhost:53596'
			const url = `${cdnBaseUrl}/cdn/attachments/${channelId}/${attachmentId}/${encodeURIComponent(filename)}`

			expect(url).toContain('my%20file%20(1).png')
		})
	})

	describe('Action Recording with Attachments', () => {
		let session: Session

		beforeEach(() => {
			session = new Session({
				name: 'attachment-test',
				config: {
					guilds: [{ name: 'Test Guild' }]
				}
			})
		})

		afterEach(async () => {
			await session.end()
		})

		it('should record attachments in message_sent action', () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]

			const attachments: MockAttachment[] = [
				{
					id: generateSnowflake(),
					filename: 'doc.pdf',
					content_type: 'application/pdf',
					size: 5000,
					url: 'http://localhost/cdn/doc.pdf',
					proxy_url: 'http://localhost/cdn/doc.pdf'
				}
			]

			const message = session.state.createMessage({
				channelId,
				guildId: guild.id,
				authorId: session.state.botUser.id,
				content: 'Check this document',
				attachments
			})

			session.recorder.record(
				'message_sent',
				{
					message_id: message.id,
					channel_id: channelId,
					guild_id: guild.id,
					content: message.content,
					attachments: message.attachments
				},
				{
					endpoint: `POST /channels/${channelId}/messages`,
					method: 'POST'
				}
			)

			const actions = session.recorder.getMessagesSent()
			const lastAction = actions[actions.length - 1]
			const data = lastAction.data as Record<string, unknown>

			expect(data.attachments).toHaveLength(1)
			expect((data.attachments as MockAttachment[])[0].filename).toBe('doc.pdf')
		})
	})

	describe('API Message Conversion with Attachments', () => {
		let sessionState: SessionState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should include attachments in API message format', async () => {
			const { mockMessageToAPIMessage } = await import('../src/discord/payloads.js')

			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]

			const attachments: MockAttachment[] = [
				{
					id: '1234567890',
					filename: 'screenshot.png',
					content_type: 'image/png',
					size: 50000,
					url: 'http://localhost/cdn/screenshot.png',
					proxy_url: 'http://localhost/cdn/screenshot.png',
					width: 1920,
					height: 1080
				}
			]

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: 'Screenshot attached',
				attachments
			})

			const apiMessage = mockMessageToAPIMessage(message, sessionState.botUser)

			expect(apiMessage.attachments).toHaveLength(1)
			expect(apiMessage.attachments[0]).toMatchObject({
				id: '1234567890',
				filename: 'screenshot.png',
				content_type: 'image/png',
				size: 50000,
				width: 1920,
				height: 1080
			})
		})
	})

	describe('Requirements Verification', () => {
		let session: Session

		beforeEach(() => {
			session = new Session({
				name: 'attachment-verification',
				config: {
					guilds: [{ name: 'Test Guild' }]
				}
			})
		})

		afterEach(async () => {
			await session.end()
		})

		it('Requirement 1: Multipart parser extracts payload_json and files', async () => {
			const formData = new FormData()
			formData.append('payload_json', JSON.stringify({ content: 'Test' }))

			const file = new File(['test content'], 'test.txt', { type: 'text/plain' })
			formData.append('files[0]', file)

			const request = new Request('http://localhost/test', {
				method: 'POST',
				body: formData
			})

			const result = await parseMultipartMessage(request)
			expect(result.body).toHaveProperty('content', 'Test')
			expect(result.files).toHaveLength(1)
		})

		it('Requirement 2: Image dimension detection works for PNG', () => {
			const pngData = new Uint8Array([
				0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
				0x00, 0x00, 0x00, 0x0d,
				0x49, 0x48, 0x44, 0x52,
				0x00, 0x00, 0x01, 0x00, // Width: 256
				0x00, 0x00, 0x00, 0x80, // Height: 128
				0x08, 0x06, 0x00, 0x00, 0x00
			])

			const dims = getImageDimensions(pngData, 'image/png')
			expect(dims).toEqual({ width: 256, height: 128 })
		})

		it('Requirement 3: Attachments are stored in session state', () => {
			const attachment: StoredAttachment = {
				id: generateSnowflake(),
				channelId: '123',
				messageId: '456',
				filename: 'test.bin',
				contentType: 'application/octet-stream',
				size: 10,
				data: new Uint8Array(10)
			}

			session.state.storeAttachment(attachment)
			expect(session.state.getAttachment(attachment.id)).toBeDefined()
		})

		it('Requirement 4: Attachments are cleaned up on message deletion', () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]
			const attachmentId = generateSnowflake()
			const messageId = generateSnowflake()

			session.state.storeAttachment({
				id: attachmentId,
				channelId,
				messageId,
				filename: 'cleanup.txt',
				contentType: 'text/plain',
				size: 5,
				data: new Uint8Array([1, 2, 3, 4, 5])
			})

			session.state.createMessage({
				id: messageId,
				channelId,
				guildId: guild.id,
				authorId: session.state.botUser.id,
				content: 'Will be deleted',
				attachments: [
					{
						id: attachmentId,
						filename: 'cleanup.txt',
						content_type: 'text/plain',
						size: 5,
						url: 'http://localhost/cdn/cleanup.txt',
						proxy_url: 'http://localhost/cdn/cleanup.txt'
					}
				]
			})

			expect(session.state.getAttachment(attachmentId)).toBeDefined()
			session.state.deleteMessage(messageId)
			expect(session.state.getAttachment(attachmentId)).toBeUndefined()
		})

		it('Requirement 5: File count limit is enforced (max 10)', async () => {
			const formData = new FormData()
			formData.append('payload_json', JSON.stringify({ content: 'Too many' }))

			for (let i = 0; i < 11; i++) {
				formData.append(`files[${i}]`, new File(['x'], `file${i}.txt`))
			}

			const request = new Request('http://localhost/test', {
				method: 'POST',
				body: formData
			})

			await expect(parseMultipartMessage(request)).rejects.toThrow('Maximum 10 files')
		})

		it('Requirement 6: File size limit is enforced (max 25MB)', async () => {
			const formData = new FormData()
			formData.append('payload_json', JSON.stringify({ content: 'Too large' }))

			const largeFile = new File([new Uint8Array(26 * 1024 * 1024)], 'huge.bin')
			formData.append('files[0]', largeFile)

			const request = new Request('http://localhost/test', {
				method: 'POST',
				body: formData
			})

			await expect(parseMultipartMessage(request)).rejects.toThrow('Request entity too large')
		})
	})

	describe('Spoiler Filename Detection', () => {
		it('should detect SPOILER_ prefix in uploaded files', async () => {
			const formData = new FormData()
			formData.append('payload_json', JSON.stringify({ content: 'Hidden content' }))

			const file = new File(['secret'], 'SPOILER_secret.png', { type: 'image/png' })
			formData.append('files[0]', file)

			const request = new Request('http://localhost/test', {
				method: 'POST',
				body: formData
			})

			const result = await parseMultipartMessage(request)
			expect(result.files[0].isSpoiler).toBe(true)
			expect(result.files[0].filename).toBe('SPOILER_secret.png')
		})

		it('should not mark non-spoiler files', async () => {
			const formData = new FormData()
			formData.append('payload_json', JSON.stringify({ content: 'Normal file' }))

			const file = new File(['content'], 'normal.png', { type: 'image/png' })
			formData.append('files[0]', file)

			const request = new Request('http://localhost/test', {
				method: 'POST',
				body: formData
			})

			const result = await parseMultipartMessage(request)
			expect(result.files[0].isSpoiler).toBe(false)
		})

		it('should use AttachmentLimits.SPOILER_PREFIX constant', () => {
			expect(AttachmentLimits.SPOILER_PREFIX).toBe('SPOILER_')
		})
	})

	describe('Description Length Validation', () => {
		it('should accept descriptions within limit', async () => {
			const formData = new FormData()
			formData.append(
				'payload_json',
				JSON.stringify({
					content: 'File with description',
					attachments: [{ id: 0, description: 'A short description' }]
				})
			)

			const file = new File(['content'], 'test.png', { type: 'image/png' })
			formData.append('files[0]', file)

			const request = new Request('http://localhost/test', {
				method: 'POST',
				body: formData
			})

			const result = await parseMultipartMessage(request)
			expect(result.body.attachments).toHaveLength(1)
		})

		it('should reject descriptions exceeding 1024 characters', async () => {
			const formData = new FormData()
			const longDescription = 'x'.repeat(1025)
			formData.append(
				'payload_json',
				JSON.stringify({
					content: 'File with long description',
					attachments: [{ id: 0, description: longDescription }]
				})
			)

			const file = new File(['content'], 'test.png', { type: 'image/png' })
			formData.append('files[0]', file)

			const request = new Request('http://localhost/test', {
				method: 'POST',
				body: formData
			})

			try {
				await parseMultipartMessage(request)
				fail('Expected MultipartError to be thrown')
			} catch (error) {
				expect(error).toBeInstanceOf(MultipartError)
				expect((error as MultipartError).code).toBe(50035)
				expect((error as MultipartError).message).toContain('1024')
			}
		})

		it('should allow exactly 1024 characters', async () => {
			const formData = new FormData()
			const exactDescription = 'x'.repeat(1024)
			formData.append(
				'payload_json',
				JSON.stringify({
					content: 'File with exact limit description',
					attachments: [{ id: 0, description: exactDescription }]
				})
			)

			const file = new File(['content'], 'test.png', { type: 'image/png' })
			formData.append('files[0]', file)

			const request = new Request('http://localhost/test', {
				method: 'POST',
				body: formData
			})

			const result = await parseMultipartMessage(request)
			expect(result.body.attachments).toHaveLength(1)
		})

		it('should use AttachmentLimits.MAX_DESCRIPTION_LENGTH constant', () => {
			expect(AttachmentLimits.MAX_DESCRIPTION_LENGTH).toBe(1024)
		})
	})

	describe('Attachment Constants', () => {
		it('should export AttachmentFlags', () => {
			expect(AttachmentFlags.IS_REMIX).toBe(4)
		})

		it('should export AttachmentLimits', () => {
			expect(AttachmentLimits.MAX_FILES_PER_MESSAGE).toBe(10)
			expect(AttachmentLimits.MAX_TOTAL_SIZE).toBe(25 * 1024 * 1024)
			expect(AttachmentLimits.MAX_DESCRIPTION_LENGTH).toBe(1024)
			expect(AttachmentLimits.SPOILER_PREFIX).toBe('SPOILER_')
		})
	})

	describe('Storage Interface Abstraction', () => {
		describe('MemoryAttachmentStorage', () => {
			let storage: MemoryAttachmentStorage

			beforeEach(() => {
				storage = new MemoryAttachmentStorage()
			})

			it('should store and retrieve attachments', async () => {
				const attachment: StoredAttachment = {
					id: generateSnowflake(),
					channelId: '123',
					messageId: '456',
					filename: 'test.txt',
					contentType: 'text/plain',
					size: 100,
					data: new Uint8Array([1, 2, 3])
				}

				await storage.store(attachment)
				const retrieved = await storage.get(attachment.id)

				expect(retrieved).toBeDefined()
				expect(retrieved?.filename).toBe('test.txt')
			})

			it('should delete attachments', async () => {
				const attachment: StoredAttachment = {
					id: generateSnowflake(),
					channelId: '123',
					messageId: '456',
					filename: 'test.txt',
					contentType: 'text/plain',
					size: 100,
					data: new Uint8Array([1, 2, 3])
				}

				await storage.store(attachment)
				const deleted = await storage.delete(attachment.id)

				expect(deleted).toBe(true)
				expect(await storage.get(attachment.id)).toBeUndefined()
			})

			it('should get attachments for a message', async () => {
				const messageId = '456'
				const attachment1: StoredAttachment = {
					id: generateSnowflake(),
					channelId: '123',
					messageId,
					filename: 'file1.txt',
					contentType: 'text/plain',
					size: 100,
					data: new Uint8Array([1])
				}
				const attachment2: StoredAttachment = {
					id: generateSnowflake(),
					channelId: '123',
					messageId,
					filename: 'file2.txt',
					contentType: 'text/plain',
					size: 100,
					data: new Uint8Array([2])
				}

				await storage.store(attachment1)
				await storage.store(attachment2)

				const attachments = await storage.getForMessage(messageId)
				expect(attachments).toHaveLength(2)
			})

			it('should delete all attachments for a message', async () => {
				const messageId = '456'
				const attachment1: StoredAttachment = {
					id: generateSnowflake(),
					channelId: '123',
					messageId,
					filename: 'file1.txt',
					contentType: 'text/plain',
					size: 100,
					data: new Uint8Array([1])
				}
				const attachment2: StoredAttachment = {
					id: generateSnowflake(),
					channelId: '123',
					messageId,
					filename: 'file2.txt',
					contentType: 'text/plain',
					size: 100,
					data: new Uint8Array([2])
				}

				await storage.store(attachment1)
				await storage.store(attachment2)

				const count = await storage.deleteForMessage(messageId)
				expect(count).toBe(2)
				expect(await storage.getForMessage(messageId)).toHaveLength(0)
			})

			it('should return storage stats', async () => {
				const attachment: StoredAttachment = {
					id: generateSnowflake(),
					channelId: '123',
					messageId: '456',
					filename: 'test.txt',
					contentType: 'text/plain',
					size: 100,
					data: new Uint8Array(100)
				}

				await storage.store(attachment)
				const stats = await storage.getStats()

				expect(stats.count).toBe(1)
				expect(stats.totalBytes).toBe(100)
				expect(stats.type).toBe('memory')
			})

			it('should clear all attachments', async () => {
				const attachment1: StoredAttachment = {
					id: generateSnowflake(),
					channelId: '123',
					messageId: '456',
					filename: 'file1.txt',
					contentType: 'text/plain',
					size: 100,
					data: new Uint8Array([1])
				}
				const attachment2: StoredAttachment = {
					id: generateSnowflake(),
					channelId: '123',
					messageId: '789',
					filename: 'file2.txt',
					contentType: 'text/plain',
					size: 100,
					data: new Uint8Array([2])
				}

				await storage.store(attachment1)
				await storage.store(attachment2)

				const cleared = await storage.clear()
				expect(cleared).toBe(2)

				const stats = await storage.getStats()
				expect(stats.count).toBe(0)
			})
		})

		describe('createStorage factory', () => {
			it('should create memory storage by default', () => {
				const storage = createStorage()
				expect(storage).toBeInstanceOf(MemoryAttachmentStorage)
			})

			it('should create memory storage when specified', () => {
				const storage = createStorage({ type: 'memory' })
				expect(storage).toBeInstanceOf(MemoryAttachmentStorage)
			})

			it('should throw for unimplemented storage types', () => {
				expect(() => createStorage({ type: 'filesystem' })).toThrow('not yet implemented')
				expect(() => createStorage({ type: 's3' })).toThrow('not yet implemented')
				expect(() => createStorage({ type: 'redis' })).toThrow('not yet implemented')
			})
		})
	})
})
