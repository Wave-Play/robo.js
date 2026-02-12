/**
 * Components V2 Tests
 *
 * Comprehensive tests for Discord's Components V2 message format.
 * Tests cover validation, error handling, and message creation with V2 components.
 */
import { Session } from '../src/session/session.js'
import {
	createSessionState,
	createDefaultGuildWithChannel,
	validateComponentsV2
} from '../src/session/state.js'
import {
	MessageFlags,
	ComponentTypeV2,
	ComponentsV2Limits,
	createComponentValidationError,
	createV2ConflictError
} from '../src/types/index.js'
import type { SessionState } from '../src/types/index.js'

describe('Components V2', () => {
	describe('MessageFlags', () => {
		it('should define IsComponentsV2 as 1 << 15 (32768)', () => {
			expect(MessageFlags.IsComponentsV2).toBe(32768)
			expect(MessageFlags.IsComponentsV2).toBe(1 << 15)
		})

		it('should define all standard message flags', () => {
			expect(MessageFlags.Crossposted).toBe(1 << 0)
			expect(MessageFlags.IsCrosspost).toBe(1 << 1)
			expect(MessageFlags.SuppressEmbeds).toBe(1 << 2)
			expect(MessageFlags.SourceMessageDeleted).toBe(1 << 3)
			expect(MessageFlags.Urgent).toBe(1 << 4)
			expect(MessageFlags.HasThread).toBe(1 << 5)
			expect(MessageFlags.Ephemeral).toBe(1 << 6)
			expect(MessageFlags.Loading).toBe(1 << 7)
			expect(MessageFlags.SuppressNotifications).toBe(1 << 12)
			expect(MessageFlags.IsVoiceMessage).toBe(1 << 13)
		})
	})

	describe('ComponentTypeV2', () => {
		it('should define V1 component types', () => {
			expect(ComponentTypeV2.ActionRow).toBe(1)
			expect(ComponentTypeV2.Button).toBe(2)
			expect(ComponentTypeV2.StringSelect).toBe(3)
			expect(ComponentTypeV2.TextInput).toBe(4)
			expect(ComponentTypeV2.UserSelect).toBe(5)
			expect(ComponentTypeV2.RoleSelect).toBe(6)
			expect(ComponentTypeV2.MentionableSelect).toBe(7)
			expect(ComponentTypeV2.ChannelSelect).toBe(8)
		})

		it('should define V2 display component types', () => {
			expect(ComponentTypeV2.Section).toBe(9)
			expect(ComponentTypeV2.TextDisplay).toBe(10)
			expect(ComponentTypeV2.Thumbnail).toBe(11)
			expect(ComponentTypeV2.MediaGallery).toBe(12)
			expect(ComponentTypeV2.File).toBe(13)
			expect(ComponentTypeV2.Separator).toBe(14)
			expect(ComponentTypeV2.ContentInventoryEntry).toBe(16)
			expect(ComponentTypeV2.Container).toBe(17)
		})
	})

	describe('ComponentsV2Limits', () => {
		it('should define correct limits', () => {
			expect(ComponentsV2Limits.MAX_COMPONENTS).toBe(40)
			expect(ComponentsV2Limits.MAX_TEXT_LENGTH).toBe(4000)
			expect(ComponentsV2Limits.MAX_MEDIA_GALLERY_ITEMS).toBe(10)
			expect(ComponentsV2Limits.MAX_SECTION_TEXT_COMPONENTS).toBe(3)
			expect(ComponentsV2Limits.MIN_SECTION_TEXT_COMPONENTS).toBe(1)
			expect(ComponentsV2Limits.MAX_MEDIA_DESCRIPTION_LENGTH).toBe(1024)
		})
	})

	describe('validateComponentsV2', () => {
		describe('Basic validation', () => {
			it('should accept empty components array', () => {
				const result = validateComponentsV2([])
				expect(result.valid).toBe(true)
				expect(result.errors).toHaveLength(0)
			})

			it('should accept valid TextDisplay component', () => {
				const components = [
					{
						type: ComponentTypeV2.TextDisplay,
						content: 'Hello, World!'
					}
				]
				const result = validateComponentsV2(components)
				expect(result.valid).toBe(true)
				expect(result.errors).toHaveLength(0)
			})

			it('should accept valid Separator component', () => {
				const components = [
					{
						type: ComponentTypeV2.Separator,
						divider: true,
						spacing: 'large'
					}
				]
				const result = validateComponentsV2(components)
				expect(result.valid).toBe(true)
				expect(result.errors).toHaveLength(0)
			})

			it('should accept valid Section component', () => {
				const components = [
					{
						type: ComponentTypeV2.Section,
						components: [
							{ type: ComponentTypeV2.TextDisplay, content: 'Text 1' },
							{ type: ComponentTypeV2.TextDisplay, content: 'Text 2' }
						]
					}
				]
				const result = validateComponentsV2(components)
				expect(result.valid).toBe(true)
				expect(result.errors).toHaveLength(0)
			})

			it('should accept valid Container component', () => {
				const components = [
					{
						type: ComponentTypeV2.Container,
						accent_color: 0xff0000,
						components: [
							{ type: ComponentTypeV2.TextDisplay, content: 'Inside container' },
							{ type: ComponentTypeV2.Separator }
						]
					}
				]
				const result = validateComponentsV2(components)
				expect(result.valid).toBe(true)
				expect(result.errors).toHaveLength(0)
			})

			it('should accept valid MediaGallery component', () => {
				const components = [
					{
						type: ComponentTypeV2.MediaGallery,
						items: [
							{ media: { url: 'https://example.com/image1.png' } },
							{ media: { url: 'https://example.com/image2.png' } }
						]
					}
				]
				const result = validateComponentsV2(components)
				expect(result.valid).toBe(true)
				expect(result.errors).toHaveLength(0)
			})

			it('should accept valid File component with attachment:// URL', () => {
				const attachmentFilenames = new Set(['document.pdf'])
				const components = [
					{
						type: ComponentTypeV2.File,
						file: { url: 'attachment://document.pdf' }
					}
				]
				const result = validateComponentsV2(components, attachmentFilenames)
				expect(result.valid).toBe(true)
				expect(result.errors).toHaveLength(0)
			})

			it('should accept valid Thumbnail component', () => {
				const components = [
					{
						type: ComponentTypeV2.Thumbnail,
						media: { url: 'https://example.com/thumb.png' },
						description: 'A thumbnail'
					}
				]
				const result = validateComponentsV2(components)
				expect(result.valid).toBe(true)
				expect(result.errors).toHaveLength(0)
			})
		})

		describe('Component count limits', () => {
			it('should accept exactly 40 components', () => {
				const components = Array(40)
					.fill(null)
					.map((_, i) => ({
						type: ComponentTypeV2.TextDisplay,
						content: `Component ${i}`
					}))
				const result = validateComponentsV2(components)
				expect(result.valid).toBe(true)
				expect(result.errors).toHaveLength(0)
			})

			it('should reject more than 40 components', () => {
				const components = Array(41)
					.fill(null)
					.map((_, i) => ({
						type: ComponentTypeV2.TextDisplay,
						content: `Component ${i}`
					}))
				const result = validateComponentsV2(components)
				expect(result.valid).toBe(false)
				expect(result.errors.some((e) => e.includes('Too many components'))).toBe(true)
			})

			it('should count nested components toward limit', () => {
				// Create structure with nested components that exceed 40 total
				const containers = Array(10)
					.fill(null)
					.map(() => ({
						type: ComponentTypeV2.Container,
						components: Array(5)
							.fill(null)
							.map(() => ({
								type: ComponentTypeV2.TextDisplay,
								content: 'Nested'
							}))
					}))
				// 10 containers + 50 nested = 60 total
				const result = validateComponentsV2(containers)
				expect(result.valid).toBe(false)
				expect(result.errors.some((e) => e.includes('Too many components'))).toBe(true)
			})
		})

		describe('Text length limits', () => {
			it('should accept total text length of exactly 4000 chars', () => {
				const content = 'a'.repeat(4000)
				const components = [
					{
						type: ComponentTypeV2.TextDisplay,
						content
					}
				]
				const result = validateComponentsV2(components)
				expect(result.valid).toBe(true)
			})

			it('should reject total text length exceeding 4000 chars', () => {
				const content = 'a'.repeat(4001)
				const components = [
					{
						type: ComponentTypeV2.TextDisplay,
						content
					}
				]
				const result = validateComponentsV2(components)
				expect(result.valid).toBe(false)
				expect(result.errors.some((e) => e.includes('exceeds 4000'))).toBe(true)
			})

			it('should sum text across multiple TextDisplay components', () => {
				const components = [
					{ type: ComponentTypeV2.TextDisplay, content: 'a'.repeat(2000) },
					{ type: ComponentTypeV2.TextDisplay, content: 'b'.repeat(2001) }
				]
				const result = validateComponentsV2(components)
				expect(result.valid).toBe(false)
				expect(result.errors.some((e) => e.includes('exceeds 4000'))).toBe(true)
			})
		})

		describe('Component ID uniqueness', () => {
			it('should accept components with unique IDs', () => {
				const components = [
					{ type: ComponentTypeV2.TextDisplay, id: 1, content: 'Text 1' },
					{ type: ComponentTypeV2.TextDisplay, id: 2, content: 'Text 2' },
					{ type: ComponentTypeV2.TextDisplay, id: 3, content: 'Text 3' }
				]
				const result = validateComponentsV2(components)
				expect(result.valid).toBe(true)
			})

			it('should reject components with duplicate IDs', () => {
				const components = [
					{ type: ComponentTypeV2.TextDisplay, id: 1, content: 'Text 1' },
					{ type: ComponentTypeV2.TextDisplay, id: 1, content: 'Text 2' }
				]
				const result = validateComponentsV2(components)
				expect(result.valid).toBe(false)
				expect(result.errors.some((e) => e.includes('Duplicate component ID'))).toBe(true)
			})

			it('should detect duplicate IDs in nested components', () => {
				const components = [
					{
						type: ComponentTypeV2.Container,
						id: 1,
						components: [{ type: ComponentTypeV2.TextDisplay, id: 1, content: 'Duplicate' }]
					}
				]
				const result = validateComponentsV2(components)
				expect(result.valid).toBe(false)
				expect(result.errors.some((e) => e.includes('Duplicate component ID'))).toBe(true)
			})

			it('should allow components without IDs', () => {
				const components = [
					{ type: ComponentTypeV2.TextDisplay, content: 'No ID 1' },
					{ type: ComponentTypeV2.TextDisplay, content: 'No ID 2' }
				]
				const result = validateComponentsV2(components)
				expect(result.valid).toBe(true)
			})
		})

		describe('Attachment URL validation', () => {
			it('should accept valid attachment:// URLs when attachment exists', () => {
				const attachmentFilenames = new Set(['image.png', 'document.pdf'])
				const components = [
					{
						type: ComponentTypeV2.MediaGallery,
						items: [{ media: { url: 'attachment://image.png' } }]
					}
				]
				const result = validateComponentsV2(components, attachmentFilenames)
				expect(result.valid).toBe(true)
			})

			it('should reject attachment:// URLs for non-existent attachments', () => {
				const attachmentFilenames = new Set(['other.png'])
				const components = [
					{
						type: ComponentTypeV2.MediaGallery,
						items: [{ media: { url: 'attachment://missing.png' } }]
					}
				]
				const result = validateComponentsV2(components, attachmentFilenames)
				expect(result.valid).toBe(false)
				expect(result.errors.some((e) => e.includes('Unknown attachment reference'))).toBe(true)
			})

			it('should validate attachment:// URLs in Thumbnail components', () => {
				const attachmentFilenames = new Set(['thumb.jpg'])
				const components = [
					{
						type: ComponentTypeV2.Thumbnail,
						media: { url: 'attachment://missing-thumb.jpg' }
					}
				]
				const result = validateComponentsV2(components, attachmentFilenames)
				expect(result.valid).toBe(false)
				expect(result.errors.some((e) => e.includes('Unknown attachment reference'))).toBe(true)
			})

			it('should validate attachment:// URLs in File components', () => {
				const attachmentFilenames = new Set(['doc.pdf'])
				const components = [
					{
						type: ComponentTypeV2.File,
						file: { url: 'attachment://missing-doc.pdf' }
					}
				]
				const result = validateComponentsV2(components, attachmentFilenames)
				expect(result.valid).toBe(false)
				expect(result.errors.some((e) => e.includes('Unknown attachment reference'))).toBe(true)
			})

			it('should accept https:// URLs without validation', () => {
				const attachmentFilenames = new Set([])
				const components = [
					{
						type: ComponentTypeV2.MediaGallery,
						items: [{ media: { url: 'https://example.com/image.png' } }]
					}
				]
				const result = validateComponentsV2(components, attachmentFilenames)
				expect(result.valid).toBe(true)
			})
		})

		describe('MediaGallery item limits', () => {
			it('should accept MediaGallery with 1 item', () => {
				const components = [
					{
						type: ComponentTypeV2.MediaGallery,
						items: [{ media: { url: 'https://example.com/image.png' } }]
					}
				]
				const result = validateComponentsV2(components)
				expect(result.valid).toBe(true)
			})

			it('should accept MediaGallery with 10 items', () => {
				const components = [
					{
						type: ComponentTypeV2.MediaGallery,
						items: Array(10)
							.fill(null)
							.map((_, i) => ({
								media: { url: `https://example.com/image${i}.png` }
							}))
					}
				]
				const result = validateComponentsV2(components)
				expect(result.valid).toBe(true)
			})

			it('should reject MediaGallery with 0 items', () => {
				const components = [
					{
						type: ComponentTypeV2.MediaGallery,
						items: []
					}
				]
				const result = validateComponentsV2(components)
				expect(result.valid).toBe(false)
				expect(result.errors.some((e) => e.includes('at least 1 item'))).toBe(true)
			})

			it('should reject MediaGallery with more than 10 items', () => {
				const components = [
					{
						type: ComponentTypeV2.MediaGallery,
						items: Array(11)
							.fill(null)
							.map((_, i) => ({
								media: { url: `https://example.com/image${i}.png` }
							}))
					}
				]
				const result = validateComponentsV2(components)
				expect(result.valid).toBe(false)
				expect(result.errors.some((e) => e.includes('too many items'))).toBe(true)
			})
		})

		describe('Section component limits', () => {
			it('should accept Section with 1 TextDisplay component', () => {
				const components = [
					{
						type: ComponentTypeV2.Section,
						components: [{ type: ComponentTypeV2.TextDisplay, content: 'Single' }]
					}
				]
				const result = validateComponentsV2(components)
				expect(result.valid).toBe(true)
			})

			it('should accept Section with 3 TextDisplay components', () => {
				const components = [
					{
						type: ComponentTypeV2.Section,
						components: [
							{ type: ComponentTypeV2.TextDisplay, content: 'One' },
							{ type: ComponentTypeV2.TextDisplay, content: 'Two' },
							{ type: ComponentTypeV2.TextDisplay, content: 'Three' }
						]
					}
				]
				const result = validateComponentsV2(components)
				expect(result.valid).toBe(true)
			})

			it('should reject Section with more than 3 TextDisplay components', () => {
				const components = [
					{
						type: ComponentTypeV2.Section,
						components: [
							{ type: ComponentTypeV2.TextDisplay, content: 'One' },
							{ type: ComponentTypeV2.TextDisplay, content: 'Two' },
							{ type: ComponentTypeV2.TextDisplay, content: 'Three' },
							{ type: ComponentTypeV2.TextDisplay, content: 'Four' }
						]
					}
				]
				const result = validateComponentsV2(components)
				expect(result.valid).toBe(false)
				expect(result.errors.some((e) => e.includes('too many text components'))).toBe(true)
			})

			it('should validate Section with Thumbnail accessory', () => {
				const components = [
					{
						type: ComponentTypeV2.Section,
						components: [{ type: ComponentTypeV2.TextDisplay, content: 'Text' }],
						accessory: {
							type: ComponentTypeV2.Thumbnail,
							media: { url: 'https://example.com/thumb.png' }
						}
					}
				]
				const result = validateComponentsV2(components)
				expect(result.valid).toBe(true)
			})

			it('should count accessory component in total', () => {
				// 39 TextDisplay + 1 Section with accessory = 41 components (over limit)
				const textDisplays = Array(39)
					.fill(null)
					.map(() => ({
						type: ComponentTypeV2.TextDisplay,
						content: 'Text'
					}))
				const section = {
					type: ComponentTypeV2.Section,
					components: [{ type: ComponentTypeV2.TextDisplay, content: 'In section' }],
					accessory: {
						type: ComponentTypeV2.Thumbnail,
						media: { url: 'https://example.com/thumb.png' }
					}
				}
				// 39 + 1 section + 1 text in section + 1 accessory = 42
				const result = validateComponentsV2([...textDisplays, section])
				expect(result.valid).toBe(false)
			})
		})

		describe('TextDisplay required fields', () => {
			it('should reject TextDisplay without content', () => {
				const components = [
					{
						type: ComponentTypeV2.TextDisplay
						// Missing content
					}
				]
				const result = validateComponentsV2(components)
				expect(result.valid).toBe(false)
				expect(result.errors.some((e) => e.includes('requires content'))).toBe(true)
			})

			it('should reject TextDisplay with empty content', () => {
				const components = [
					{
						type: ComponentTypeV2.TextDisplay,
						content: ''
					}
				]
				const result = validateComponentsV2(components)
				expect(result.valid).toBe(false)
				expect(result.errors.some((e) => e.includes('requires content'))).toBe(true)
			})
		})

		describe('Section required fields', () => {
			it('should reject Section without components', () => {
				const components = [
					{
						type: ComponentTypeV2.Section
						// Missing components array
					}
				]
				const result = validateComponentsV2(components)
				expect(result.valid).toBe(false)
				expect(result.errors.some((e) => e.includes('requires at least 1'))).toBe(true)
			})

			it('should reject Section with empty components array', () => {
				const components = [
					{
						type: ComponentTypeV2.Section,
						components: []
					}
				]
				const result = validateComponentsV2(components)
				expect(result.valid).toBe(false)
				expect(result.errors.some((e) => e.includes('requires at least 1'))).toBe(true)
			})
		})

		describe('File component required fields', () => {
			it('should reject File without file field', () => {
				const components = [
					{
						type: ComponentTypeV2.File
						// Missing file field
					}
				]
				const result = validateComponentsV2(components)
				expect(result.valid).toBe(false)
				expect(result.errors.some((e) => e.includes('requires file field'))).toBe(true)
			})

			it('should reject File without file.url', () => {
				const components = [
					{
						type: ComponentTypeV2.File,
						file: {}
					}
				]
				const result = validateComponentsV2(components)
				expect(result.valid).toBe(false)
				expect(result.errors.some((e) => e.includes('requires file.url'))).toBe(true)
			})

			it('should reject File with https:// URL (only attachment:// allowed)', () => {
				const components = [
					{
						type: ComponentTypeV2.File,
						file: { url: 'https://example.com/file.pdf' }
					}
				]
				const result = validateComponentsV2(components)
				expect(result.valid).toBe(false)
				expect(result.errors.some((e) => e.includes('only supports attachment://'))).toBe(true)
			})
		})

		describe('Description length limits', () => {
			it('should reject MediaGallery item with description > 1024 chars', () => {
				const components = [
					{
						type: ComponentTypeV2.MediaGallery,
						items: [
							{
								media: { url: 'https://example.com/image.png' },
								description: 'x'.repeat(1025)
							}
						]
					}
				]
				const result = validateComponentsV2(components)
				expect(result.valid).toBe(false)
				expect(result.errors.some((e) => e.includes('description exceeds 1024'))).toBe(true)
			})

			it('should accept MediaGallery item with description exactly 1024 chars', () => {
				const components = [
					{
						type: ComponentTypeV2.MediaGallery,
						items: [
							{
								media: { url: 'https://example.com/image.png' },
								description: 'x'.repeat(1024)
							}
						]
					}
				]
				const result = validateComponentsV2(components)
				expect(result.valid).toBe(true)
			})

			it('should reject Thumbnail with description > 1024 chars', () => {
				const components = [
					{
						type: ComponentTypeV2.Thumbnail,
						media: { url: 'https://example.com/thumb.png' },
						description: 'x'.repeat(1025)
					}
				]
				const result = validateComponentsV2(components)
				expect(result.valid).toBe(false)
				expect(result.errors.some((e) => e.includes('description exceeds 1024'))).toBe(true)
			})

			it('should accept Thumbnail with description exactly 1024 chars', () => {
				const components = [
					{
						type: ComponentTypeV2.Thumbnail,
						media: { url: 'https://example.com/thumb.png' },
						description: 'x'.repeat(1024)
					}
				]
				const result = validateComponentsV2(components)
				expect(result.valid).toBe(true)
			})
		})

		describe('Nesting depth limits', () => {
			it('should accept reasonable nesting depth', () => {
				const components = [
					{
						type: ComponentTypeV2.Container,
						components: [
							{
								type: ComponentTypeV2.Section,
								components: [{ type: ComponentTypeV2.TextDisplay, content: 'Deep' }]
							}
						]
					}
				]
				const result = validateComponentsV2(components)
				expect(result.valid).toBe(true)
			})

			it('should reject excessive nesting depth (> 10 levels)', () => {
				// Build deeply nested structure
				let current: Record<string, unknown> = {
					type: ComponentTypeV2.TextDisplay,
					content: 'Deepest'
				}
				for (let i = 0; i < 15; i++) {
					current = {
						type: ComponentTypeV2.Container,
						components: [current]
					}
				}
				const result = validateComponentsV2([current])
				expect(result.valid).toBe(false)
				expect(result.errors.some((e) => e.includes('nesting too deep'))).toBe(true)
			})
		})

		describe('Multiple error collection', () => {
			it('should collect multiple validation errors', () => {
				const components = [
					{ type: ComponentTypeV2.TextDisplay, id: 1, content: 'a'.repeat(4001) },
					{ type: ComponentTypeV2.TextDisplay, id: 1, content: 'Duplicate ID' },
					{
						type: ComponentTypeV2.MediaGallery,
						items: [{ media: { url: 'attachment://missing.png' } }]
					}
				]
				const result = validateComponentsV2(components, new Set())
				expect(result.valid).toBe(false)
				expect(result.errors.length).toBeGreaterThan(1)
			})
		})
	})

	describe('Discord error format', () => {
		describe('createComponentValidationError', () => {
			it('should create Discord-formatted error response', () => {
				const error = createComponentValidationError(['Error 1', 'Error 2'])
				expect(error.code).toBe(50035)
				expect(error.message).toBe('Invalid Form Body')
				expect(error.errors).toBeDefined()
				expect(error.errors?.components?._errors).toHaveLength(2)
				expect(error.errors?.components?._errors[0].code).toBe('COMPONENT_VALIDATION_FAILED')
				expect(error.errors?.components?._errors[0].message).toBe('Error 1')
				expect(error.errors?.components?._errors[1].message).toBe('Error 2')
			})
		})

		describe('createV2ConflictError', () => {
			it('should create Discord-formatted conflict error', () => {
				const error = createV2ConflictError()
				expect(error.code).toBe(50035)
				expect(error.message).toBe('Invalid Form Body')
				expect(error.errors?.components?._errors).toHaveLength(1)
				expect(error.errors?.components?._errors[0].code).toBe('COMPONENT_VALIDATION_FAILED')
				expect(error.errors?.components?._errors[0].message).toContain(
					'Cannot use content or embeds with Components V2'
				)
			})
		})
	})

	describe('Message creation with V2 components', () => {
		let sessionState: SessionState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should create message with flags', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: '',
				flags: MessageFlags.IsComponentsV2
			})

			expect(message.flags).toBe(MessageFlags.IsComponentsV2)
		})

		it('should create message with V2 components', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]

			const components = [
				{ type: ComponentTypeV2.TextDisplay, content: 'Hello V2!' },
				{ type: ComponentTypeV2.Separator, divider: true }
			]

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: '',
				flags: MessageFlags.IsComponentsV2,
				components
			})

			expect(message.components).toBeDefined()
			expect(message.components).toHaveLength(2)
			expect((message.components![0] as Record<string, unknown>).type).toBe(ComponentTypeV2.TextDisplay)
		})

		it('should store and retrieve message with V2 components', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]

			const components = [{ type: ComponentTypeV2.TextDisplay, content: 'Stored V2' }]

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: '',
				flags: MessageFlags.IsComponentsV2,
				components
			})

			const stored = sessionState.getMessage(message.id)
			expect(stored?.components).toEqual(components)
			expect(stored?.flags).toBe(MessageFlags.IsComponentsV2)
		})
	})

	describe('Session message creation with V2', () => {
		let session: Session

		beforeEach(() => {
			session = new Session({
				name: 'v2-test-session',
				config: {
					guilds: [{ name: 'Test Guild' }]
				}
			})
		})

		afterEach(async () => {
			await session.end()
		})

		it('should create message with V2 components in session', () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]

			const components = [
				{
					type: ComponentTypeV2.Container,
					accent_color: 0x5865f2,
					components: [
						{ type: ComponentTypeV2.TextDisplay, content: '# Welcome!' },
						{ type: ComponentTypeV2.Separator },
						{
							type: ComponentTypeV2.Section,
							components: [{ type: ComponentTypeV2.TextDisplay, content: 'Section content' }],
							accessory: {
								type: ComponentTypeV2.Thumbnail,
								media: { url: 'https://example.com/icon.png' }
							}
						}
					]
				}
			]

			const message = session.state.createMessage({
				channelId,
				guildId: guild.id,
				authorId: session.state.botUser.id,
				content: '',
				flags: MessageFlags.IsComponentsV2,
				components
			})

			expect(message.components).toEqual(components)
			expect(message.flags).toBe(MessageFlags.IsComponentsV2)
		})

		it('should record V2 message_sent action with components', () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]

			const components = [{ type: ComponentTypeV2.TextDisplay, content: 'Recorded V2' }]

			const message = session.state.createMessage({
				channelId,
				guildId: guild.id,
				authorId: session.state.botUser.id,
				content: '',
				flags: MessageFlags.IsComponentsV2,
				components
			})

			session.recorder.record('message_sent', {
				message_id: message.id,
				channel_id: channelId,
				guild_id: guild.id,
				content: message.content,
				flags: message.flags,
				components: message.components
			})

			const actions = session.recorder.getMessagesSent()
			const lastAction = actions[actions.length - 1]
			const data = lastAction.data as Record<string, unknown>

			expect(data.flags).toBe(MessageFlags.IsComponentsV2)
			expect(data.components).toEqual(components)
		})
	})

	describe('API Message conversion with V2', () => {
		let sessionState: SessionState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should convert V2 message to API format', async () => {
			const { mockMessageToAPIMessage } = await import('../src/discord/payloads.js')

			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]

			const components = [{ type: ComponentTypeV2.TextDisplay, content: 'API V2' }]

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: '',
				flags: MessageFlags.IsComponentsV2,
				components
			})

			const apiMessage = mockMessageToAPIMessage(message, sessionState.botUser)

			expect(apiMessage.flags).toBe(MessageFlags.IsComponentsV2)
			expect(apiMessage.components).toEqual(components)
		})

		it('should include empty content with V2 components', async () => {
			const { mockMessageToAPIMessage } = await import('../src/discord/payloads.js')

			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: '',
				flags: MessageFlags.IsComponentsV2,
				components: [{ type: ComponentTypeV2.TextDisplay, content: 'V2 Text' }]
			})

			const apiMessage = mockMessageToAPIMessage(message, sessionState.botUser)

			expect(apiMessage.content).toBe('')
			expect(apiMessage.embeds).toHaveLength(0)
		})
	})

	describe('Complex V2 layouts', () => {
		it('should validate realistic Discord layout', () => {
			const components = [
				{
					type: ComponentTypeV2.Container,
					accent_color: 0x5865f2,
					components: [
						// Header
						{ type: ComponentTypeV2.TextDisplay, id: 1, content: '# Server Dashboard' },
						{ type: ComponentTypeV2.Separator, id: 2, divider: true },

						// Stats section
						{
							type: ComponentTypeV2.Section,
							id: 3,
							components: [
								{ type: ComponentTypeV2.TextDisplay, id: 4, content: '**Members:** 1,234' },
								{ type: ComponentTypeV2.TextDisplay, id: 5, content: '**Online:** 567' }
							],
							accessory: {
								type: ComponentTypeV2.Thumbnail,
								id: 6,
								media: { url: 'https://example.com/server-icon.png' }
							}
						},

						// Media section
						{
							type: ComponentTypeV2.MediaGallery,
							id: 7,
							items: [
								{ media: { url: 'https://example.com/banner1.png' }, description: 'Server Banner' },
								{ media: { url: 'https://example.com/banner2.png' }, spoiler: true }
							]
						},

						// Footer
						{ type: ComponentTypeV2.Separator, id: 8 },
						{ type: ComponentTypeV2.TextDisplay, id: 9, content: '*Last updated: Just now*' }
					]
				}
			]

			const result = validateComponentsV2(components)
			expect(result.valid).toBe(true)
		})

		it('should validate multiple containers layout', () => {
			const components = [
				{
					type: ComponentTypeV2.Container,
					accent_color: 0x57f287,
					components: [{ type: ComponentTypeV2.TextDisplay, content: '# Success!' }]
				},
				{ type: ComponentTypeV2.Separator, spacing: 'large' },
				{
					type: ComponentTypeV2.Container,
					accent_color: 0xed4245,
					components: [{ type: ComponentTypeV2.TextDisplay, content: '# Error!' }]
				}
			]

			const result = validateComponentsV2(components)
			expect(result.valid).toBe(true)
		})
	})
})
