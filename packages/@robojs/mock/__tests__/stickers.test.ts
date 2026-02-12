/**
 * Stickers Tests
 * Tests for Discord sticker support in messages and guild management
 */
import { createSessionState, createDefaultGuildWithChannel, MockServerState } from '../src/session/state.js'
import { mockMessageToAPIMessage, mockStickerToAPISticker, buildGuildStickersUpdatePayload } from '../src/discord/payloads.js'
import { StickerType, StickerFormatType, StickerLimits, MockStickerConfig } from '../src/types/index.js'

describe('Stickers', () => {
	describe('Sticker creation', () => {
		let sessionState: MockServerState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should create a guild sticker', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			const stickerConfig: MockStickerConfig = {
				name: 'test_sticker',
				description: 'A test sticker',
				tags: 'test, sticker, example'
			}

			const sticker = sessionState.createGuildSticker(guild.id, stickerConfig, sessionState.botUser.id)

			expect(sticker).toBeDefined()
			expect(sticker?.name).toBe('test_sticker')
			expect(sticker?.description).toBe('A test sticker')
			expect(sticker?.tags).toBe('test, sticker, example')
			expect(sticker?.type).toBe(StickerType.Guild)
			expect(sticker?.format_type).toBe(StickerFormatType.PNG)
			expect(sticker?.available).toBe(true)
			expect(sticker?.guild_id).toBe(guild.id)
			expect(sticker?.user?.id).toBe(sessionState.botUser.id)
		})

		it('should add sticker to guild stickers array', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			expect(guild.stickers).toHaveLength(0)

			const sticker = sessionState.createGuildSticker(
				guild.id,
				{ name: 'my_sticker', tags: 'cool' },
				sessionState.botUser.id
			)

			expect(guild.stickers).toHaveLength(1)
			expect(guild.stickers).toContain(sticker?.id)
		})

		it('should store sticker in session state', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			const sticker = sessionState.createGuildSticker(
				guild.id,
				{ name: 'stored_sticker', tags: 'storage' },
				sessionState.botUser.id
			)

			const retrieved = sessionState.getSticker(sticker!.id)
			expect(retrieved).toBeDefined()
			expect(retrieved?.id).toBe(sticker?.id)
			expect(retrieved?.name).toBe('stored_sticker')
		})

		it('should create sticker with custom format type', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			const sticker = sessionState.createGuildSticker(
				guild.id,
				{ name: 'animated_sticker', tags: 'animation', format_type: StickerFormatType.GIF },
				sessionState.botUser.id
			)

			expect(sticker?.format_type).toBe(StickerFormatType.GIF)
		})

		it('should reject sticker with name exceeding max length', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const longName = 'a'.repeat(StickerLimits.MAX_NAME_LENGTH + 1)

			const sticker = sessionState.createGuildSticker(
				guild.id,
				{ name: longName, tags: 'test' },
				sessionState.botUser.id
			)

			expect(sticker).toBeNull()
		})

		it('should reject sticker with description exceeding max length', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const longDesc = 'a'.repeat(StickerLimits.MAX_DESCRIPTION_LENGTH + 1)

			const sticker = sessionState.createGuildSticker(
				guild.id,
				{ name: 'test', description: longDesc, tags: 'test' },
				sessionState.botUser.id
			)

			expect(sticker).toBeNull()
		})

		it('should reject sticker with tags exceeding max length', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const longTags = 'a'.repeat(StickerLimits.MAX_TAGS_LENGTH + 1)

			const sticker = sessionState.createGuildSticker(
				guild.id,
				{ name: 'test', tags: longTags },
				sessionState.botUser.id
			)

			expect(sticker).toBeNull()
		})

		it('should reject sticker with name below minimum length', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			const sticker = sessionState.createGuildSticker(
				guild.id,
				{ name: 'a', tags: 'test' }, // 1 char, min is 2
				sessionState.botUser.id
			)

			expect(sticker).toBeNull()
		})

		it('should reject sticker with tags below minimum length', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			const sticker = sessionState.createGuildSticker(
				guild.id,
				{ name: 'test', tags: 'a' }, // 1 char, min is 2
				sessionState.botUser.id
			)

			expect(sticker).toBeNull()
		})

		it('should reject sticker with description below minimum length (when not empty)', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			const sticker = sessionState.createGuildSticker(
				guild.id,
				{ name: 'test', description: 'a', tags: 'test' }, // 1 char, min is 2 when not empty
				sessionState.botUser.id
			)

			expect(sticker).toBeNull()
		})

		it('should allow sticker with empty description', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			const sticker = sessionState.createGuildSticker(
				guild.id,
				{ name: 'test', description: '', tags: 'test' }, // Empty is allowed
				sessionState.botUser.id
			)

			expect(sticker).not.toBeNull()
			expect(sticker?.description).toBe('')
		})

		it('should return null when guild does not exist', () => {
			const sticker = sessionState.createGuildSticker(
				'nonexistent_guild_id',
				{ name: 'test', tags: 'test' },
				sessionState.botUser.id
			)

			expect(sticker).toBeNull()
		})
	})

	describe('Sticker retrieval', () => {
		let sessionState: MockServerState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should get all stickers for a guild', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			sessionState.createGuildSticker(guild.id, { name: 'sticker1', tags: 'one' }, sessionState.botUser.id)
			sessionState.createGuildSticker(guild.id, { name: 'sticker2', tags: 'two' }, sessionState.botUser.id)
			sessionState.createGuildSticker(guild.id, { name: 'sticker3', tags: 'three' }, sessionState.botUser.id)

			const stickers = sessionState.getGuildStickers(guild.id)
			expect(stickers).toHaveLength(3)
			expect(stickers.map((s) => s.name)).toEqual(['sticker1', 'sticker2', 'sticker3'])
		})

		it('should return empty array for guild with no stickers', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const stickers = sessionState.getGuildStickers(guild.id)
			expect(stickers).toHaveLength(0)
		})

		it('should return empty array for nonexistent guild', () => {
			const stickers = sessionState.getGuildStickers('nonexistent_guild')
			expect(stickers).toHaveLength(0)
		})

		it('should return undefined for nonexistent sticker', () => {
			const sticker = sessionState.getSticker('nonexistent_sticker')
			expect(sticker).toBeUndefined()
		})
	})

	describe('Sticker updates', () => {
		let sessionState: MockServerState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should update sticker name', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const sticker = sessionState.createGuildSticker(
				guild.id,
				{ name: 'original_name', tags: 'test' },
				sessionState.botUser.id
			)

			const updated = sessionState.updateGuildSticker(sticker!.id, { name: 'new_name' })

			expect(updated?.name).toBe('new_name')
			expect(sessionState.getSticker(sticker!.id)?.name).toBe('new_name')
		})

		it('should update sticker description', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const sticker = sessionState.createGuildSticker(
				guild.id,
				{ name: 'test', description: 'old description', tags: 'test' },
				sessionState.botUser.id
			)

			const updated = sessionState.updateGuildSticker(sticker!.id, { description: 'new description' })

			expect(updated?.description).toBe('new description')
		})

		it('should update sticker tags', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const sticker = sessionState.createGuildSticker(
				guild.id,
				{ name: 'test', tags: 'old, tags' },
				sessionState.botUser.id
			)

			const updated = sessionState.updateGuildSticker(sticker!.id, { tags: 'new, updated, tags' })

			expect(updated?.tags).toBe('new, updated, tags')
		})

		it('should reject update with name exceeding max length', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const sticker = sessionState.createGuildSticker(
				guild.id,
				{ name: 'test', tags: 'test' },
				sessionState.botUser.id
			)

			const longName = 'a'.repeat(StickerLimits.MAX_NAME_LENGTH + 1)
			const updated = sessionState.updateGuildSticker(sticker!.id, { name: longName })

			expect(updated).toBeNull()
			expect(sessionState.getSticker(sticker!.id)?.name).toBe('test') // Unchanged
		})

		it('should return null when updating nonexistent sticker', () => {
			const updated = sessionState.updateGuildSticker('nonexistent_id', { name: 'new_name' })
			expect(updated).toBeNull()
		})
	})

	describe('Sticker deletion', () => {
		let sessionState: MockServerState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should delete a guild sticker', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const sticker = sessionState.createGuildSticker(
				guild.id,
				{ name: 'to_delete', tags: 'delete' },
				sessionState.botUser.id
			)

			expect(sessionState.getSticker(sticker!.id)).toBeDefined()

			const deleted = sessionState.deleteGuildSticker(sticker!.id)

			expect(deleted).toBe(true)
			expect(sessionState.getSticker(sticker!.id)).toBeUndefined()
		})

		it('should remove sticker from guild stickers array', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const sticker = sessionState.createGuildSticker(
				guild.id,
				{ name: 'to_delete', tags: 'delete' },
				sessionState.botUser.id
			)

			expect(guild.stickers).toContain(sticker?.id)

			sessionState.deleteGuildSticker(sticker!.id)

			expect(guild.stickers).not.toContain(sticker?.id)
		})

		it('should return false when deleting nonexistent sticker', () => {
			const deleted = sessionState.deleteGuildSticker('nonexistent_id')
			expect(deleted).toBe(false)
		})
	})

	describe('Message sticker support', () => {
		let sessionState: MockServerState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should create message with sticker_items', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]

			const sticker = sessionState.createGuildSticker(
				guild.id,
				{ name: 'message_sticker', tags: 'message' },
				sessionState.botUser.id
			)

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: '',
				sticker_ids: [sticker!.id]
			})

			expect(message.sticker_items).toBeDefined()
			expect(message.sticker_items).toHaveLength(1)
			expect(message.sticker_items![0].id).toBe(sticker?.id)
			expect(message.sticker_items![0].name).toBe('message_sticker')
			expect(message.sticker_items![0].format_type).toBe(StickerFormatType.PNG)
		})

		it('should support multiple stickers in message', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]

			const sticker1 = sessionState.createGuildSticker(
				guild.id,
				{ name: 'sticker1', tags: 'one' },
				sessionState.botUser.id
			)
			const sticker2 = sessionState.createGuildSticker(
				guild.id,
				{ name: 'sticker2', tags: 'two' },
				sessionState.botUser.id
			)
			const sticker3 = sessionState.createGuildSticker(
				guild.id,
				{ name: 'sticker3', tags: 'three' },
				sessionState.botUser.id
			)

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: '',
				sticker_ids: [sticker1!.id, sticker2!.id, sticker3!.id]
			})

			expect(message.sticker_items).toHaveLength(3)
		})

		it('should ignore nonexistent sticker_ids', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]

			const sticker = sessionState.createGuildSticker(
				guild.id,
				{ name: 'valid_sticker', tags: 'valid' },
				sessionState.botUser.id
			)

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: '',
				sticker_ids: [sticker!.id, 'nonexistent_sticker_id']
			})

			expect(message.sticker_items).toHaveLength(1)
			expect(message.sticker_items![0].id).toBe(sticker?.id)
		})

		it('should not have sticker_items when no sticker_ids provided', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: 'Hello, world!'
			})

			expect(message.sticker_items).toBeUndefined()
		})
	})

	describe('Sticker serialization', () => {
		let sessionState: MockServerState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should serialize sticker to API format', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const sticker = sessionState.createGuildSticker(
				guild.id,
				{ name: 'serialize_test', description: 'Test description', tags: 'api, test' },
				sessionState.botUser.id
			)

			const apiSticker = mockStickerToAPISticker(sticker!)

			expect(apiSticker.id).toBe(sticker?.id)
			expect(apiSticker.name).toBe('serialize_test')
			expect(apiSticker.description).toBe('Test description')
			expect(apiSticker.tags).toBe('api, test')
			expect(apiSticker.type).toBe(StickerType.Guild)
			expect(apiSticker.format_type).toBe(StickerFormatType.PNG)
			expect(apiSticker.available).toBe(true)
			expect(apiSticker.guild_id).toBe(guild.id)
			expect(apiSticker.user?.id).toBe(sessionState.botUser.id)
		})

		it('should include sticker_items in message serialization', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]

			const sticker = sessionState.createGuildSticker(
				guild.id,
				{ name: 'message_sticker', tags: 'message' },
				sessionState.botUser.id
			)

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: '',
				sticker_ids: [sticker!.id]
			})

			const apiMessage = mockMessageToAPIMessage(message, sessionState.botUser) as {
				sticker_items?: unknown[]
			}

			expect(apiMessage.sticker_items).toBeDefined()
			expect(apiMessage.sticker_items).toHaveLength(1)
		})
	})

	describe('GUILD_STICKERS_UPDATE payload', () => {
		let sessionState: MockServerState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should build GUILD_STICKERS_UPDATE payload', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			// Create stickers (variables unused - we retrieve via getGuildStickers)
			sessionState.createGuildSticker(guild.id, { name: 'sticker1', tags: 'one' }, sessionState.botUser.id)
			sessionState.createGuildSticker(guild.id, { name: 'sticker2', tags: 'two' }, sessionState.botUser.id)

			const stickers = sessionState.getGuildStickers(guild.id)
			const payload = buildGuildStickersUpdatePayload({
				guildId: guild.id,
				stickers,
				sequence: 1
			})

			expect(payload.op).toBe(0) // DISPATCH
			expect(payload.t).toBe('GUILD_STICKERS_UPDATE')
			expect(payload.s).toBe(1)

			const data = payload.d as { guild_id: string; stickers: unknown[] }
			expect(data.guild_id).toBe(guild.id)
			expect(data.stickers).toHaveLength(2)
		})
	})

	describe('Guild sticker limit', () => {
		let sessionState: MockServerState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should reject sticker when guild reaches limit', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			// Create max stickers
			for (let i = 0; i < StickerLimits.MAX_GUILD_STICKERS; i++) {
				const sticker = sessionState.createGuildSticker(
					guild.id,
					{ name: `sticker${i}`, tags: `tag${i}` },
					sessionState.botUser.id
				)
				expect(sticker).not.toBeNull()
			}

			expect(guild.stickers).toHaveLength(StickerLimits.MAX_GUILD_STICKERS)

			// Try to create one more
			const extraSticker = sessionState.createGuildSticker(
				guild.id,
				{ name: 'extra_sticker', tags: 'extra' },
				sessionState.botUser.id
			)

			expect(extraSticker).toBeNull()
			expect(guild.stickers).toHaveLength(StickerLimits.MAX_GUILD_STICKERS)
		})
	})

	describe('State reset', () => {
		let sessionState: MockServerState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should clear stickers on reset', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			sessionState.createGuildSticker(guild.id, { name: 'sticker1', tags: 'one' }, sessionState.botUser.id)
			sessionState.createGuildSticker(guild.id, { name: 'sticker2', tags: 'two' }, sessionState.botUser.id)

			expect(sessionState.stickers.size).toBe(2)

			sessionState.reset()

			expect(sessionState.stickers.size).toBe(0)
		})
	})
})
