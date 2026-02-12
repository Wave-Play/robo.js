/**
 * Intent Handling & Filtering Tests
 * Tests the intent-based event filtering and MESSAGE_CONTENT stripping
 */
import { GatewayIntentBits } from 'discord-api-types/v10'
import {
	EVENT_INTENTS,
	GUILD_DM_EVENTS,
	PRIVILEGED_INTENTS,
	DEFAULT_APPROVED_PRIVILEGED_INTENTS,
	INTENT_CLOSE_CODES,
	shouldDispatchEvent,
	stripMessageContent,
	hasApprovedPrivilegedIntents
} from '../src/core/intents.js'

describe('Intent Handling & Filtering', () => {
	describe('EVENT_INTENTS mapping', () => {
		it('should have null for events that require no intent', () => {
			expect(EVENT_INTENTS['READY']).toBeNull()
			expect(EVENT_INTENTS['RESUMED']).toBeNull()
			expect(EVENT_INTENTS['INTERACTION_CREATE']).toBeNull()
		})

		it('should map GUILD events to Guilds intent', () => {
			expect(EVENT_INTENTS['GUILD_CREATE']).toBe(GatewayIntentBits.Guilds)
			expect(EVENT_INTENTS['GUILD_UPDATE']).toBe(GatewayIntentBits.Guilds)
			expect(EVENT_INTENTS['GUILD_DELETE']).toBe(GatewayIntentBits.Guilds)
			expect(EVENT_INTENTS['CHANNEL_CREATE']).toBe(GatewayIntentBits.Guilds)
		})

		it('should map GUILD_MEMBER events to GuildMembers privileged intent', () => {
			expect(EVENT_INTENTS['GUILD_MEMBER_ADD']).toBe(GatewayIntentBits.GuildMembers)
			expect(EVENT_INTENTS['GUILD_MEMBER_UPDATE']).toBe(GatewayIntentBits.GuildMembers)
			expect(EVENT_INTENTS['GUILD_MEMBER_REMOVE']).toBe(GatewayIntentBits.GuildMembers)
		})

		it('should map PRESENCE_UPDATE to GuildPresences privileged intent', () => {
			expect(EVENT_INTENTS['PRESENCE_UPDATE']).toBe(GatewayIntentBits.GuildPresences)
		})

		it('should map moderation events to GuildModeration intent', () => {
			expect(EVENT_INTENTS['GUILD_BAN_ADD']).toBe(GatewayIntentBits.GuildModeration)
			expect(EVENT_INTENTS['GUILD_BAN_REMOVE']).toBe(GatewayIntentBits.GuildModeration)
		})

		it('should map scheduled event events to GuildScheduledEvents intent', () => {
			expect(EVENT_INTENTS['GUILD_SCHEDULED_EVENT_CREATE']).toBe(GatewayIntentBits.GuildScheduledEvents)
			expect(EVENT_INTENTS['GUILD_SCHEDULED_EVENT_UPDATE']).toBe(GatewayIntentBits.GuildScheduledEvents)
		})
	})

	describe('GUILD_DM_EVENTS mapping', () => {
		it('should have guild and dm variants for MESSAGE events', () => {
			expect(GUILD_DM_EVENTS['MESSAGE_CREATE']).toEqual({
				guild: GatewayIntentBits.GuildMessages,
				dm: GatewayIntentBits.DirectMessages
			})
			expect(GUILD_DM_EVENTS['MESSAGE_UPDATE']).toEqual({
				guild: GatewayIntentBits.GuildMessages,
				dm: GatewayIntentBits.DirectMessages
			})
		})

		it('should have guild and dm variants for TYPING_START', () => {
			expect(GUILD_DM_EVENTS['TYPING_START']).toEqual({
				guild: GatewayIntentBits.GuildMessageTyping,
				dm: GatewayIntentBits.DirectMessageTyping
			})
		})

		it('should have guild and dm variants for reaction events', () => {
			expect(GUILD_DM_EVENTS['MESSAGE_REACTION_ADD']).toEqual({
				guild: GatewayIntentBits.GuildMessageReactions,
				dm: GatewayIntentBits.DirectMessageReactions
			})
		})

		it('should have guild and dm variants for poll vote events', () => {
			expect(GUILD_DM_EVENTS['MESSAGE_POLL_VOTE_ADD']).toEqual({
				guild: GatewayIntentBits.GuildMessagePolls,
				dm: GatewayIntentBits.DirectMessagePolls
			})
		})
	})

	describe('PRIVILEGED_INTENTS', () => {
		it('should include GuildMembers, GuildPresences, and MessageContent', () => {
			expect((PRIVILEGED_INTENTS & GatewayIntentBits.GuildMembers) !== 0).toBe(true)
			expect((PRIVILEGED_INTENTS & GatewayIntentBits.GuildPresences) !== 0).toBe(true)
			expect((PRIVILEGED_INTENTS & GatewayIntentBits.MessageContent) !== 0).toBe(true)
		})

		it('should not include non-privileged intents', () => {
			expect((PRIVILEGED_INTENTS & GatewayIntentBits.Guilds) !== 0).toBe(false)
			expect((PRIVILEGED_INTENTS & GatewayIntentBits.GuildMessages) !== 0).toBe(false)
		})
	})

	describe('INTENT_CLOSE_CODES', () => {
		it('should have DISALLOWED_INTENTS as 4014', () => {
			expect(INTENT_CLOSE_CODES.DISALLOWED_INTENTS).toBe(4014)
		})
	})

	describe('shouldDispatchEvent', () => {
		it('should always dispatch events that require no intent', () => {
			expect(shouldDispatchEvent('READY', {}, 0)).toBe(true)
			expect(shouldDispatchEvent('RESUMED', {}, 0)).toBe(true)
			expect(shouldDispatchEvent('INTERACTION_CREATE', {}, 0)).toBe(true)
		})

		it('should dispatch GUILD_CREATE when Guilds intent is present', () => {
			expect(shouldDispatchEvent('GUILD_CREATE', {}, GatewayIntentBits.Guilds)).toBe(true)
		})

		it('should not dispatch GUILD_CREATE when Guilds intent is missing', () => {
			expect(shouldDispatchEvent('GUILD_CREATE', {}, 0)).toBe(false)
			expect(shouldDispatchEvent('GUILD_CREATE', {}, GatewayIntentBits.GuildMessages)).toBe(false)
		})

		it('should dispatch guild MESSAGE_CREATE with GuildMessages intent', () => {
			const data = { guild_id: '123' }
			expect(shouldDispatchEvent('MESSAGE_CREATE', data, GatewayIntentBits.GuildMessages)).toBe(true)
		})

		it('should not dispatch guild MESSAGE_CREATE without GuildMessages intent', () => {
			const data = { guild_id: '123' }
			expect(shouldDispatchEvent('MESSAGE_CREATE', data, GatewayIntentBits.DirectMessages)).toBe(false)
		})

		it('should dispatch DM MESSAGE_CREATE with DirectMessages intent', () => {
			const data = {} // No guild_id = DM
			expect(shouldDispatchEvent('MESSAGE_CREATE', data, GatewayIntentBits.DirectMessages)).toBe(true)
		})

		it('should not dispatch DM MESSAGE_CREATE without DirectMessages intent', () => {
			const data = {} // No guild_id = DM
			expect(shouldDispatchEvent('MESSAGE_CREATE', data, GatewayIntentBits.GuildMessages)).toBe(false)
		})

		it('should dispatch GUILD_MEMBER_ADD with GuildMembers privileged intent', () => {
			expect(shouldDispatchEvent('GUILD_MEMBER_ADD', {}, GatewayIntentBits.GuildMembers)).toBe(true)
		})

		it('should not dispatch GUILD_MEMBER_ADD without GuildMembers intent', () => {
			expect(shouldDispatchEvent('GUILD_MEMBER_ADD', {}, GatewayIntentBits.Guilds)).toBe(false)
		})

		it('should allow unknown events by default', () => {
			expect(shouldDispatchEvent('SOME_UNKNOWN_EVENT', {}, 0)).toBe(true)
		})
	})

	describe('stripMessageContent', () => {
		const botId = 'bot123'

		const createMessage = (overrides = {}) => ({
			id: 'msg123',
			channel_id: 'chan123',
			guild_id: 'guild123',
			content: 'Hello world',
			embeds: [{ title: 'Test' }],
			attachments: [{ id: 'att123', filename: 'file.txt', size: 100 }],
			components: [{ type: 1, components: [] }],
			poll: { question: { text: 'Poll?' }, answers: [] },
			author: { id: 'user456', username: 'User' },
			mentions: [],
			...overrides
		})

		it('should not strip content when MESSAGE_CONTENT intent is present', () => {
			const message = createMessage()
			const result = stripMessageContent(message, GatewayIntentBits.MessageContent, botId)

			expect(result.content).toBe('Hello world')
			expect(result.embeds).toHaveLength(1)
			expect(result.attachments).toHaveLength(1)
			expect(result.components).toHaveLength(1)
			expect(result.poll).toBeDefined()
		})

		it('should strip content when MESSAGE_CONTENT intent is missing', () => {
			const message = createMessage()
			const result = stripMessageContent(message, GatewayIntentBits.GuildMessages, botId)

			expect(result.content).toBe('')
			expect(result.embeds).toEqual([])
			expect(result.attachments).toEqual([])
			expect(result.components).toEqual([])
			expect(result.poll).toBeUndefined()
		})

		it('should not strip content for DMs (no guild_id)', () => {
			const message = createMessage({ guild_id: undefined })
			const result = stripMessageContent(message, GatewayIntentBits.DirectMessages, botId)

			expect(result.content).toBe('Hello world')
			expect(result.embeds).toHaveLength(1)
		})

		it('should not strip content when message is from the bot', () => {
			const message = createMessage({ author: { id: botId, username: 'Bot' } })
			const result = stripMessageContent(message, GatewayIntentBits.GuildMessages, botId)

			expect(result.content).toBe('Hello world')
			expect(result.embeds).toHaveLength(1)
		})

		it('should not strip content when message mentions the bot', () => {
			const message = createMessage({ mentions: [{ id: botId }] })
			const result = stripMessageContent(message, GatewayIntentBits.GuildMessages, botId)

			expect(result.content).toBe('Hello world')
			expect(result.embeds).toHaveLength(1)
		})

		it('should preserve other message fields when stripping', () => {
			const message = createMessage()
			const result = stripMessageContent(message, GatewayIntentBits.GuildMessages, botId)

			expect(result.id).toBe('msg123')
			expect(result.channel_id).toBe('chan123')
			expect(result.guild_id).toBe('guild123')
			expect(result.author).toEqual({ id: 'user456', username: 'User' })
		})
	})

	describe('hasApprovedPrivilegedIntents', () => {
		it('should return true when no privileged intents are declared', () => {
			expect(hasApprovedPrivilegedIntents(GatewayIntentBits.Guilds, DEFAULT_APPROVED_PRIVILEGED_INTENTS)).toBe(
				true
			)
		})

		it('should return true when declared privileged intents are approved', () => {
			const declared = GatewayIntentBits.Guilds | GatewayIntentBits.GuildMembers
			expect(hasApprovedPrivilegedIntents(declared, DEFAULT_APPROVED_PRIVILEGED_INTENTS)).toBe(true)
		})

		it('should return false when declared privileged intent is not approved', () => {
			const declared = GatewayIntentBits.Guilds | GatewayIntentBits.GuildMembers
			const approved = BigInt(GatewayIntentBits.MessageContent) // Only MessageContent approved
			expect(hasApprovedPrivilegedIntents(declared, approved)).toBe(false)
		})

		it('should return true when all declared privileged intents are approved', () => {
			const declared =
				GatewayIntentBits.Guilds | GatewayIntentBits.GuildMembers | GatewayIntentBits.GuildPresences
			const approved = BigInt(GatewayIntentBits.GuildMembers | GatewayIntentBits.GuildPresences)
			expect(hasApprovedPrivilegedIntents(declared, approved)).toBe(true)
		})

		it('should handle all privileged intents being declared and approved', () => {
			const declared =
				GatewayIntentBits.GuildMembers | GatewayIntentBits.GuildPresences | GatewayIntentBits.MessageContent
			expect(hasApprovedPrivilegedIntents(declared, BigInt(PRIVILEGED_INTENTS))).toBe(true)
		})

		it('should handle zero approved privileged intents', () => {
			const declared = GatewayIntentBits.GuildMembers
			const approved = 0n
			expect(hasApprovedPrivilegedIntents(declared, approved)).toBe(false)
		})

		it('should return true for non-privileged intents with zero approval', () => {
			const declared = GatewayIntentBits.Guilds | GatewayIntentBits.GuildMessages
			const approved = 0n
			expect(hasApprovedPrivilegedIntents(declared, approved)).toBe(true)
		})
	})

	describe('Requirements Verification', () => {
		it('Task 1: EVENT_INTENTS mapping covers all major event categories', () => {
			// Verify presence of key events
			expect(EVENT_INTENTS).toHaveProperty('GUILD_CREATE')
			expect(EVENT_INTENTS).toHaveProperty('GUILD_MEMBER_ADD')
			expect(EVENT_INTENTS).toHaveProperty('PRESENCE_UPDATE')
			expect(EVENT_INTENTS).toHaveProperty('GUILD_BAN_ADD')
			expect(EVENT_INTENTS).toHaveProperty('GUILD_SCHEDULED_EVENT_CREATE')
		})

		it('Task 2: shouldDispatchEvent correctly filters by intent', () => {
			// With intent - passes
			expect(shouldDispatchEvent('GUILD_CREATE', {}, GatewayIntentBits.Guilds)).toBe(true)
			// Without intent - fails
			expect(shouldDispatchEvent('GUILD_CREATE', {}, 0)).toBe(false)
		})

		it('Task 3: stripMessageContent respects exemptions', () => {
			const botId = 'bot123'
			const dmMessage = { content: 'test', embeds: [], attachments: [], components: [] }
			const result = stripMessageContent(dmMessage, 0, botId)
			// DM exempt - content preserved
			expect(result.content).toBe('test')
		})

		it('Task 4: hasApprovedPrivilegedIntents validates privileged intents', () => {
			// Approved intent passes
			expect(hasApprovedPrivilegedIntents(GatewayIntentBits.GuildMembers, BigInt(PRIVILEGED_INTENTS))).toBe(true)
			// Unapproved intent fails
			expect(hasApprovedPrivilegedIntents(GatewayIntentBits.GuildMembers, 0n)).toBe(false)
		})

		it('Task 5: GUILD_DM_EVENTS correctly maps context-dependent events', () => {
			expect(GUILD_DM_EVENTS['MESSAGE_CREATE']).toBeDefined()
			expect(GUILD_DM_EVENTS['TYPING_START']).toBeDefined()
			expect(GUILD_DM_EVENTS['MESSAGE_REACTION_ADD']).toBeDefined()
		})

		it('Task 6: Close code 4014 is defined for disallowed intents', () => {
			expect(INTENT_CLOSE_CODES.DISALLOWED_INTENTS).toBe(4014)
		})

		it('Task 7: EVENT_INTENTS includes thread events', () => {
			expect(EVENT_INTENTS['THREAD_CREATE']).toBe(GatewayIntentBits.Guilds)
			expect(EVENT_INTENTS['THREAD_UPDATE']).toBe(GatewayIntentBits.Guilds)
			expect(EVENT_INTENTS['THREAD_DELETE']).toBe(GatewayIntentBits.Guilds)
			expect(EVENT_INTENTS['THREAD_MEMBERS_UPDATE']).toBe(GatewayIntentBits.GuildMembers)
		})

		it('Task 8: EVENT_INTENTS includes auto-moderation events', () => {
			expect(EVENT_INTENTS['AUTO_MODERATION_RULE_CREATE']).toBe(GatewayIntentBits.AutoModerationConfiguration)
			expect(EVENT_INTENTS['AUTO_MODERATION_ACTION_EXECUTION']).toBe(GatewayIntentBits.AutoModerationExecution)
		})

		it('Task 9: EVENT_INTENTS includes emoji and sticker events', () => {
			expect(EVENT_INTENTS['GUILD_EMOJIS_UPDATE']).toBe(GatewayIntentBits.GuildEmojisAndStickers)
			expect(EVENT_INTENTS['GUILD_STICKERS_UPDATE']).toBe(GatewayIntentBits.GuildEmojisAndStickers)
		})

		it('Task 10: EVENT_INTENTS includes webhook and invite events', () => {
			expect(EVENT_INTENTS['WEBHOOKS_UPDATE']).toBe(GatewayIntentBits.GuildWebhooks)
			expect(EVENT_INTENTS['INVITE_CREATE']).toBe(GatewayIntentBits.GuildInvites)
			expect(EVENT_INTENTS['INVITE_DELETE']).toBe(GatewayIntentBits.GuildInvites)
		})

		it('Task 11: EVENT_INTENTS includes voice state and stage instance events', () => {
			expect(EVENT_INTENTS['VOICE_STATE_UPDATE']).toBe(GatewayIntentBits.GuildVoiceStates)
			expect(EVENT_INTENTS['STAGE_INSTANCE_CREATE']).toBe(GatewayIntentBits.Guilds)
			expect(EVENT_INTENTS['STAGE_INSTANCE_UPDATE']).toBe(GatewayIntentBits.Guilds)
		})

		it('Task 12: GUILD_DM_EVENTS covers all message-related events', () => {
			expect(GUILD_DM_EVENTS['MESSAGE_CREATE']).toBeDefined()
			expect(GUILD_DM_EVENTS['MESSAGE_UPDATE']).toBeDefined()
			expect(GUILD_DM_EVENTS['MESSAGE_DELETE']).toBeDefined()
			expect(GUILD_DM_EVENTS['MESSAGE_DELETE_BULK']).toBeDefined()
			expect(GUILD_DM_EVENTS['MESSAGE_REACTION_ADD']).toBeDefined()
			expect(GUILD_DM_EVENTS['MESSAGE_REACTION_REMOVE']).toBeDefined()
			expect(GUILD_DM_EVENTS['MESSAGE_REACTION_REMOVE_ALL']).toBeDefined()
			expect(GUILD_DM_EVENTS['MESSAGE_REACTION_REMOVE_EMOJI']).toBeDefined()
		})
	})
})
