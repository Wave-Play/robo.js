/**
 * Custom Emojis Tests
 * Tests for Discord custom emoji support in guilds
 */
import { createSessionState, createDefaultGuildWithChannel, MockServerState } from '../src/session/state.js'
import { mockEmojiToAPIEmoji, buildGuildEmojisUpdatePayload } from '../src/discord/payloads.js'
import type { MockEmojiConfig } from '../src/types/index.js'
import { EmojiLimits } from '../src/types/index.js'

describe('Custom Emojis', () => {
	describe('Emoji creation', () => {
		let sessionState: MockServerState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should create a guild emoji', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			const emojiConfig: MockEmojiConfig = {
				name: 'test_emoji',
				roles: [],
				animated: false
			}

			const emoji = sessionState.createGuildEmoji(guild.id, emojiConfig, sessionState.botUser.id)

			expect(emoji).toBeDefined()
			expect(emoji?.name).toBe('test_emoji')
			expect(emoji?.roles).toEqual([])
			expect(emoji?.animated).toBe(false)
			expect(emoji?.available).toBe(true)
			expect(emoji?.require_colons).toBe(true)
			expect(emoji?.managed).toBe(false)
			expect(emoji?.user?.id).toBe(sessionState.botUser.id)
		})

		it('should create an animated emoji', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			const emoji = sessionState.createGuildEmoji(
				guild.id,
				{ name: 'animated_emoji', animated: true },
				sessionState.botUser.id
			)

			expect(emoji?.animated).toBe(true)
		})

		it('should add emoji to guild emojis array', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			expect(guild.emojis).toHaveLength(0)

			const emoji = sessionState.createGuildEmoji(
				guild.id,
				{ name: 'my_emoji' },
				sessionState.botUser.id
			)

			expect(guild.emojis).toHaveLength(1)
			expect(guild.emojis).toContain(emoji?.id)
		})

		it('should store emoji in session state', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			const emoji = sessionState.createGuildEmoji(
				guild.id,
				{ name: 'stored_emoji' },
				sessionState.botUser.id
			)

			const retrieved = sessionState.getEmoji(emoji!.id!)
			expect(retrieved).toBeDefined()
			expect(retrieved?.id).toBe(emoji?.id)
			expect(retrieved?.name).toBe('stored_emoji')
		})

		it('should reject emoji with name shorter than min length', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const shortName = 'a' // 1 character, min is 2

			const emoji = sessionState.createGuildEmoji(
				guild.id,
				{ name: shortName },
				sessionState.botUser.id
			)

			expect(emoji).toBeNull()
		})

		it('should reject emoji with name exceeding max length', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const longName = 'a'.repeat(EmojiLimits.MAX_NAME_LENGTH + 1)

			const emoji = sessionState.createGuildEmoji(
				guild.id,
				{ name: longName },
				sessionState.botUser.id
			)

			expect(emoji).toBeNull()
		})

		it('should return null when guild does not exist', () => {
			const emoji = sessionState.createGuildEmoji(
				'nonexistent_guild_id',
				{ name: 'test' },
				sessionState.botUser.id
			)

			expect(emoji).toBeNull()
		})

		it('should create emoji with role restrictions', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const roleIds = ['role1', 'role2']

			const emoji = sessionState.createGuildEmoji(
				guild.id,
				{ name: 'restricted_emoji', roles: roleIds },
				sessionState.botUser.id
			)

			expect(emoji?.roles).toEqual(roleIds)
		})

		it('should reject emoji name with spaces', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			const emoji = sessionState.createGuildEmoji(
				guild.id,
				{ name: 'invalid name' },
				sessionState.botUser.id
			)

			expect(emoji).toBeNull()
		})

		it('should reject emoji name with special characters', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			// Test various invalid characters
			const invalidNames = ['emoji-name', 'emoji.name', 'emoji@name', 'emoji!', 'emoji#tag']

			for (const name of invalidNames) {
				const emoji = sessionState.createGuildEmoji(
					guild.id,
					{ name },
					sessionState.botUser.id
				)
				expect(emoji).toBeNull()
			}
		})

		it('should accept emoji name with numbers and underscores', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			const emoji = sessionState.createGuildEmoji(
				guild.id,
				{ name: 'emoji_123_test' },
				sessionState.botUser.id
			)

			expect(emoji).not.toBeNull()
			expect(emoji?.name).toBe('emoji_123_test')
		})
	})

	describe('Emoji retrieval', () => {
		let sessionState: MockServerState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should get all emojis for a guild', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			sessionState.createGuildEmoji(guild.id, { name: 'emoji1' }, sessionState.botUser.id)
			sessionState.createGuildEmoji(guild.id, { name: 'emoji2' }, sessionState.botUser.id)
			sessionState.createGuildEmoji(guild.id, { name: 'emoji3' }, sessionState.botUser.id)

			const emojis = sessionState.getGuildEmojis(guild.id)
			expect(emojis).toHaveLength(3)
			expect(emojis.map((e) => e.name)).toEqual(['emoji1', 'emoji2', 'emoji3'])
		})

		it('should return empty array for guild with no emojis', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const emojis = sessionState.getGuildEmojis(guild.id)
			expect(emojis).toHaveLength(0)
		})

		it('should return empty array for nonexistent guild', () => {
			const emojis = sessionState.getGuildEmojis('nonexistent_guild')
			expect(emojis).toHaveLength(0)
		})

		it('should return undefined for nonexistent emoji', () => {
			const emoji = sessionState.getEmoji('nonexistent_emoji')
			expect(emoji).toBeUndefined()
		})
	})

	describe('Emoji updates', () => {
		let sessionState: MockServerState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should update emoji name', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const emoji = sessionState.createGuildEmoji(
				guild.id,
				{ name: 'original_name' },
				sessionState.botUser.id
			)

			const updated = sessionState.updateGuildEmoji(emoji!.id!, { name: 'new_name' })

			expect(updated?.name).toBe('new_name')
			expect(sessionState.getEmoji(emoji!.id!)?.name).toBe('new_name')
		})

		it('should update emoji roles', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const emoji = sessionState.createGuildEmoji(
				guild.id,
				{ name: 'test_emoji', roles: [] },
				sessionState.botUser.id
			)

			const newRoles = ['role1', 'role2', 'role3']
			const updated = sessionState.updateGuildEmoji(emoji!.id!, { roles: newRoles })

			expect(updated?.roles).toEqual(newRoles)
		})

		it('should reject update with name shorter than min length', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const emoji = sessionState.createGuildEmoji(
				guild.id,
				{ name: 'test' },
				sessionState.botUser.id
			)

			const shortName = 'a' // 1 character, min is 2
			const updated = sessionState.updateGuildEmoji(emoji!.id!, { name: shortName })

			expect(updated).toBeNull()
			expect(sessionState.getEmoji(emoji!.id!)?.name).toBe('test') // Unchanged
		})

		it('should reject update with name exceeding max length', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const emoji = sessionState.createGuildEmoji(
				guild.id,
				{ name: 'test' },
				sessionState.botUser.id
			)

			const longName = 'a'.repeat(EmojiLimits.MAX_NAME_LENGTH + 1)
			const updated = sessionState.updateGuildEmoji(emoji!.id!, { name: longName })

			expect(updated).toBeNull()
			expect(sessionState.getEmoji(emoji!.id!)?.name).toBe('test') // Unchanged
		})

		it('should return null when updating nonexistent emoji', () => {
			const updated = sessionState.updateGuildEmoji('nonexistent_id', { name: 'new_name' })
			expect(updated).toBeNull()
		})

		it('should reject update with name containing spaces', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const emoji = sessionState.createGuildEmoji(
				guild.id,
				{ name: 'valid_name' },
				sessionState.botUser.id
			)

			const updated = sessionState.updateGuildEmoji(emoji!.id!, { name: 'invalid name' })

			expect(updated).toBeNull()
			expect(sessionState.getEmoji(emoji!.id!)?.name).toBe('valid_name') // Unchanged
		})

		it('should reject update with name containing special characters', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const emoji = sessionState.createGuildEmoji(
				guild.id,
				{ name: 'valid_name' },
				sessionState.botUser.id
			)

			const updated = sessionState.updateGuildEmoji(emoji!.id!, { name: 'invalid-name' })

			expect(updated).toBeNull()
			expect(sessionState.getEmoji(emoji!.id!)?.name).toBe('valid_name') // Unchanged
		})
	})

	describe('Emoji deletion', () => {
		let sessionState: MockServerState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should delete a guild emoji', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const emoji = sessionState.createGuildEmoji(
				guild.id,
				{ name: 'to_delete' },
				sessionState.botUser.id
			)

			expect(sessionState.getEmoji(emoji!.id!)).toBeDefined()

			const deleted = sessionState.deleteGuildEmoji(emoji!.id!)

			expect(deleted).toBe(true)
			expect(sessionState.getEmoji(emoji!.id!)).toBeUndefined()
		})

		it('should remove emoji from guild emojis array', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const emoji = sessionState.createGuildEmoji(
				guild.id,
				{ name: 'to_delete' },
				sessionState.botUser.id
			)

			expect(guild.emojis).toContain(emoji?.id)

			sessionState.deleteGuildEmoji(emoji!.id!)

			expect(guild.emojis).not.toContain(emoji?.id)
		})

		it('should return false when deleting nonexistent emoji', () => {
			const deleted = sessionState.deleteGuildEmoji('nonexistent_id')
			expect(deleted).toBe(false)
		})
	})

	describe('Emoji serialization', () => {
		let sessionState: MockServerState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should serialize emoji to API format', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const emoji = sessionState.createGuildEmoji(
				guild.id,
				{ name: 'serialize_test', roles: ['role1'], animated: true },
				sessionState.botUser.id
			)

			const apiEmoji = mockEmojiToAPIEmoji(emoji!)

			expect(apiEmoji.id).toBe(emoji?.id)
			expect(apiEmoji.name).toBe('serialize_test')
			expect(apiEmoji.roles).toEqual(['role1'])
			expect(apiEmoji.animated).toBe(true)
			expect(apiEmoji.available).toBe(true)
			expect(apiEmoji.require_colons).toBe(true)
			expect(apiEmoji.managed).toBe(false)
			expect(apiEmoji.user?.id).toBe(sessionState.botUser.id)
		})
	})

	describe('GUILD_EMOJIS_UPDATE payload', () => {
		let sessionState: MockServerState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should build GUILD_EMOJIS_UPDATE payload', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			sessionState.createGuildEmoji(guild.id, { name: 'emoji1' }, sessionState.botUser.id)
			sessionState.createGuildEmoji(guild.id, { name: 'emoji2' }, sessionState.botUser.id)

			const emojis = sessionState.getGuildEmojis(guild.id)
			const payload = buildGuildEmojisUpdatePayload({
				guildId: guild.id,
				emojis,
				sequence: 1
			})

			expect(payload.op).toBe(0) // DISPATCH
			expect(payload.t).toBe('GUILD_EMOJIS_UPDATE')
			expect(payload.s).toBe(1)

			const data = payload.d as { guild_id: string; emojis: unknown[] }
			expect(data.guild_id).toBe(guild.id)
			expect(data.emojis).toHaveLength(2)
		})

		it('should include empty array when guild has no emojis', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			const emojis = sessionState.getGuildEmojis(guild.id)
			const payload = buildGuildEmojisUpdatePayload({
				guildId: guild.id,
				emojis,
				sequence: 1
			})

			const data = payload.d as { guild_id: string; emojis: unknown[] }
			expect(data.emojis).toHaveLength(0)
		})
	})

	describe('Guild emoji limit', () => {
		let sessionState: MockServerState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should reject emoji when guild reaches limit', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			// Create max emojis
			for (let i = 0; i < EmojiLimits.MAX_GUILD_EMOJIS; i++) {
				const emoji = sessionState.createGuildEmoji(
					guild.id,
					{ name: `emoji${i.toString().padStart(2, '0')}` }, // Ensures at least 2 chars
					sessionState.botUser.id
				)
				expect(emoji).not.toBeNull()
			}

			expect(guild.emojis).toHaveLength(EmojiLimits.MAX_GUILD_EMOJIS)

			// Try to create one more
			const extraEmoji = sessionState.createGuildEmoji(
				guild.id,
				{ name: 'extra_emoji' },
				sessionState.botUser.id
			)

			expect(extraEmoji).toBeNull()
			expect(guild.emojis).toHaveLength(EmojiLimits.MAX_GUILD_EMOJIS)
		})
	})

	describe('State reset', () => {
		let sessionState: MockServerState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should clear emojis on reset', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			sessionState.createGuildEmoji(guild.id, { name: 'emoji1' }, sessionState.botUser.id)
			sessionState.createGuildEmoji(guild.id, { name: 'emoji2' }, sessionState.botUser.id)

			expect(sessionState.emojis.size).toBe(2)

			sessionState.reset()

			expect(sessionState.emojis.size).toBe(0)
		})
	})
})
