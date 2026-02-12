/**
 * Message Edit & Delete Tests
 * Tests the MESSAGE_UPDATE and MESSAGE_DELETE payload builders and state operations
 */
import { GatewayOpcodes } from 'discord-api-types/v10'
import { buildMessageUpdatePayload, buildMessageDeletePayload } from '../src/discord/payloads.js'
import {
	createSessionState,
	createMockUser,
	createMockMessage,
	createDefaultGuildWithChannel
} from '../src/session/state.js'
import { Session } from '../src/session/session.js'
import type { SessionState } from '../src/types/index.js'

describe('Message Edit & Delete', () => {
	describe('buildMessageUpdatePayload', () => {
		let sessionState: SessionState

		beforeEach(() => {
			sessionState = createSessionState({ botUser: { username: 'TestBot', bot: true } })
		})

		it('should return op: 0 (DISPATCH)', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const author = createMockUser({ username: 'TestUser' })
			const message = createMockMessage({
				channelId,
				guildId: guild.id,
				authorId: author.id,
				content: 'Edited content'
			})

			const payload = buildMessageUpdatePayload({
				message,
				author,
				sessionState,
				sequence: 5
			})

			expect(payload.op).toBe(GatewayOpcodes.Dispatch)
			expect(payload.op).toBe(0)
		})

		it('should return t: "MESSAGE_UPDATE"', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const author = createMockUser({ username: 'TestUser' })
			const message = createMockMessage({
				channelId,
				guildId: guild.id,
				authorId: author.id,
				content: 'Edited'
			})

			const payload = buildMessageUpdatePayload({
				message,
				author,
				sessionState,
				sequence: 5
			})

			expect(payload.t).toBe('MESSAGE_UPDATE')
		})

		it('should return specified sequence number', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const author = createMockUser({ username: 'TestUser' })
			const message = createMockMessage({
				channelId,
				guildId: guild.id,
				authorId: author.id,
				content: 'Edited'
			})

			const payload = buildMessageUpdatePayload({
				message,
				author,
				sessionState,
				sequence: 15
			})

			expect(payload.s).toBe(15)
		})

		it('should include updated content', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const author = createMockUser({ username: 'TestUser' })
			const message = createMockMessage({
				channelId,
				guildId: guild.id,
				authorId: author.id,
				content: 'Updated content here'
			})

			const payload = buildMessageUpdatePayload({
				message,
				author,
				sessionState,
				sequence: 5
			})

			const data = payload.d as Record<string, unknown>
			expect(data.content).toBe('Updated content here')
		})

		it('should include guild_id for guild messages', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const author = createMockUser({ username: 'TestUser' })
			const message = createMockMessage({
				channelId,
				guildId: guild.id,
				authorId: author.id,
				content: 'Guild message'
			})

			const payload = buildMessageUpdatePayload({
				message,
				author,
				sessionState,
				sequence: 5
			})

			const data = payload.d as Record<string, unknown>
			expect(data.guild_id).toBe(guild.id)
		})

		it('should include partial member for guild messages', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const author = createMockUser({ username: 'TestUser' })
			const message = createMockMessage({
				channelId,
				guildId: guild.id,
				authorId: author.id,
				content: 'Guild message'
			})

			const payload = buildMessageUpdatePayload({
				message,
				author,
				sessionState,
				sequence: 5
			})

			const data = payload.d as Record<string, unknown>
			expect(data.member).toBeDefined()

			const member = data.member as Record<string, unknown>
			expect(member).not.toHaveProperty('user')
			expect(member.roles).toEqual([])
		})

		it('should NOT include guild_id or member for DM messages', () => {
			const author = createMockUser({ username: 'TestUser' })
			const dmChannel = sessionState.getOrCreateDMChannel(author.id)

			const message = createMockMessage({
				channelId: dmChannel.id,
				authorId: author.id,
				content: 'DM message edited'
			})

			const payload = buildMessageUpdatePayload({
				message,
				author,
				sessionState,
				sequence: 5
			})

			const data = payload.d as Record<string, unknown>
			expect(data.guild_id).toBeUndefined()
			expect(data.member).toBeUndefined()
		})
	})

	describe('buildMessageDeletePayload', () => {
		it('should return op: 0 (DISPATCH)', () => {
			const payload = buildMessageDeletePayload({
				messageId: '123',
				channelId: '456',
				guildId: '789',
				sequence: 5
			})

			expect(payload.op).toBe(GatewayOpcodes.Dispatch)
			expect(payload.op).toBe(0)
		})

		it('should return t: "MESSAGE_DELETE"', () => {
			const payload = buildMessageDeletePayload({
				messageId: '123',
				channelId: '456',
				sequence: 5
			})

			expect(payload.t).toBe('MESSAGE_DELETE')
		})

		it('should return specified sequence number', () => {
			const payload = buildMessageDeletePayload({
				messageId: '123',
				channelId: '456',
				sequence: 20
			})

			expect(payload.s).toBe(20)
		})

		it('should include message and channel IDs', () => {
			const payload = buildMessageDeletePayload({
				messageId: '111',
				channelId: '222',
				sequence: 5
			})

			const data = payload.d as Record<string, unknown>
			expect(data.id).toBe('111')
			expect(data.channel_id).toBe('222')
		})

		it('should include guild_id when provided', () => {
			const payload = buildMessageDeletePayload({
				messageId: '111',
				channelId: '222',
				guildId: '333',
				sequence: 5
			})

			const data = payload.d as Record<string, unknown>
			expect(data.guild_id).toBe('333')
		})

		it('should NOT include guild_id for DM messages', () => {
			const payload = buildMessageDeletePayload({
				messageId: '111',
				channelId: '222',
				sequence: 5
			})

			const data = payload.d as Record<string, unknown>
			expect(data.guild_id).toBeUndefined()
		})
	})

	describe('State Operations', () => {
		let sessionState: SessionState

		beforeEach(() => {
			sessionState = createSessionState({ botUser: { username: 'TestBot', bot: true } })
		})

		it('updateMessage should update content', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: 'Original'
			})

			const updated = sessionState.updateMessage(message.id, { content: 'Edited' })

			expect(updated).toBeDefined()
			expect(updated!.content).toBe('Edited')
		})

		it('updateMessage should set editedTimestamp', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: 'Original'
			})

			expect(message.editedTimestamp).toBeNull()

			const updated = sessionState.updateMessage(message.id, { content: 'Edited' })

			expect(updated!.editedTimestamp).not.toBeNull()
			expect(typeof updated!.editedTimestamp).toBe('string')
		})

		it('updateMessage should preserve immutable fields', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: 'Original'
			})

			const originalId = message.id
			const originalChannelId = message.channelId
			const originalAuthorId = message.authorId

			const updated = sessionState.updateMessage(message.id, {
				content: 'Edited',
				// Attempting to change immutable fields
				id: 'new-id',
				channelId: 'new-channel',
				authorId: 'new-author'
			} as any)

			expect(updated!.id).toBe(originalId)
			expect(updated!.channelId).toBe(originalChannelId)
			expect(updated!.authorId).toBe(originalAuthorId)
		})

		it('updateMessage should return undefined for non-existent message', () => {
			const updated = sessionState.updateMessage('non-existent', { content: 'Edited' })
			expect(updated).toBeUndefined()
		})

		it('deleteMessage should remove message from state', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: 'To be deleted'
			})

			expect(sessionState.getMessage(message.id)).toBeDefined()

			const deleted = sessionState.deleteMessage(message.id)

			expect(deleted).toBe(true)
			expect(sessionState.getMessage(message.id)).toBeUndefined()
		})

		it('deleteMessage should return false for non-existent message', () => {
			const deleted = sessionState.deleteMessage('non-existent')
			expect(deleted).toBe(false)
		})

		it('updateMessage should update embeds', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: 'Original',
				embeds: [{ title: 'Original Embed' }]
			})

			const updated = sessionState.updateMessage(message.id, {
				embeds: [{ title: 'Updated Embed' }]
			})

			expect(updated!.embeds).toHaveLength(1)
			expect((updated!.embeds[0] as Record<string, unknown>).title).toBe('Updated Embed')
		})
	})

	describe('Action Recording', () => {
		let session: Session

		beforeEach(() => {
			session = new Session({
				name: 'test-session',
				config: { guilds: [{ name: 'Test Guild' }] }
			})
		})

		afterEach(async () => {
			await session.end()
		})

		it('should record message_edited action', () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]

			const message = session.state.createMessage({
				channelId,
				guildId: guild.id,
				authorId: session.state.botUser.id,
				content: 'Original'
			})

			session.recorder.record(
				'message_edited',
				{
					message_id: message.id,
					channel_id: channelId,
					content: 'Edited'
				},
				{ method: 'PATCH' }
			)

			const edited = session.recorder.getMessagesEdited()
			expect(edited.length).toBe(1)
			expect(edited[0].data).toEqual(
				expect.objectContaining({
					message_id: message.id,
					content: 'Edited'
				})
			)
		})

		it('should record message_deleted action', () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]

			const message = session.state.createMessage({
				channelId,
				guildId: guild.id,
				authorId: session.state.botUser.id,
				content: 'To delete'
			})

			session.recorder.record(
				'message_deleted',
				{
					message_id: message.id,
					channel_id: channelId
				},
				{ method: 'DELETE' }
			)

			const deleted = session.recorder.getMessagesDeleted()
			expect(deleted.length).toBe(1)
			expect(deleted[0].data).toEqual(
				expect.objectContaining({
					message_id: message.id,
					channel_id: channelId
				})
			)
		})

		it('getMessagesEdited should filter by action type', () => {
			// Record different action types
			session.recorder.record('message_sent', { content: 'Sent' }, {})
			session.recorder.record('message_edited', { content: 'Edited' }, {})
			session.recorder.record('message_deleted', { message_id: '123' }, {})

			const edited = session.recorder.getMessagesEdited()
			expect(edited.length).toBe(1)
			expect((edited[0].data as Record<string, unknown>).content).toBe('Edited')
		})

		it('getMessagesDeleted should filter by action type', () => {
			// Record different action types
			session.recorder.record('message_sent', { content: 'Sent' }, {})
			session.recorder.record('message_edited', { content: 'Edited' }, {})
			session.recorder.record('message_deleted', { message_id: '123' }, {})

			const deleted = session.recorder.getMessagesDeleted()
			expect(deleted.length).toBe(1)
			expect((deleted[0].data as Record<string, unknown>).message_id).toBe('123')
		})
	})

	describe('Requirements Verification', () => {
		let sessionState: SessionState

		beforeEach(() => {
			sessionState = createSessionState({ botUser: { username: 'TestBot', bot: true } })
		})

		it('Task 1: MESSAGE_UPDATE payload builder creates valid payload', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const author = createMockUser({ username: 'TestUser' })

			const message = createMockMessage({
				channelId,
				guildId: guild.id,
				authorId: author.id,
				content: 'Edited content'
			})

			const payload = buildMessageUpdatePayload({
				message,
				author,
				sessionState,
				sequence: 5
			})

			expect(payload).toBeDefined()
			expect(payload.op).toBe(0)
			expect(payload.t).toBe('MESSAGE_UPDATE')
			expect(payload.d).toBeDefined()

			const data = payload.d as Record<string, unknown>
			expect(data.id).toBe(message.id)
			expect(data.content).toBe('Edited content')
		})

		it('Task 2: MESSAGE_DELETE payload builder creates valid payload', () => {
			const payload = buildMessageDeletePayload({
				messageId: '123456789',
				channelId: '987654321',
				guildId: '111222333',
				sequence: 10
			})

			expect(payload).toBeDefined()
			expect(payload.op).toBe(0)
			expect(payload.t).toBe('MESSAGE_DELETE')
			expect(payload.d).toBeDefined()

			const data = payload.d as Record<string, unknown>
			expect(data.id).toBe('123456789')
			expect(data.channel_id).toBe('987654321')
			expect(data.guild_id).toBe('111222333')
		})

		it('Task 3: State updateMessage works correctly', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: 'Original'
			})

			const updated = sessionState.updateMessage(message.id, { content: 'Updated' })

			expect(updated).toBeDefined()
			expect(updated!.content).toBe('Updated')
			expect(updated!.editedTimestamp).not.toBeNull()

			// Verify state is updated
			const fromState = sessionState.getMessage(message.id)
			expect(fromState!.content).toBe('Updated')
		})

		it('Task 4: State deleteMessage works correctly', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: 'To delete'
			})

			const result = sessionState.deleteMessage(message.id)

			expect(result).toBe(true)
			expect(sessionState.getMessage(message.id)).toBeUndefined()
		})

		it('Task 5: Recorder has getMessagesEdited helper', () => {
			const session = new Session({
				name: 'test',
				config: { guilds: [{ name: 'Test Guild' }] }
			})

			try {
				session.recorder.record('message_edited', { content: 'Test' }, {})

				const edited = session.recorder.getMessagesEdited()
				expect(edited).toHaveLength(1)
			} finally {
				session.end()
			}
		})

		it('Task 6: Recorder has getMessagesDeleted helper', () => {
			const session = new Session({
				name: 'test',
				config: { guilds: [{ name: 'Test Guild' }] }
			})

			try {
				session.recorder.record('message_deleted', { message_id: '123' }, {})

				const deleted = session.recorder.getMessagesDeleted()
				expect(deleted).toHaveLength(1)
			} finally {
				session.end()
			}
		})
	})
})
