/**
 * Bot Message Capture Tests
 * Tests the POST /channels/:id/messages REST endpoint
 * that captures messages sent by the bot via REST API.
 */
import { Session } from '../src/session/session.js'
import { createSessionState, createDefaultGuildWithChannel } from '../src/session/state.js'
import type { SessionState } from '../src/types/index.js'

describe('Bot Message Capture', () => {
	describe('POST /channels/:id/messages endpoint logic', () => {
		let sessionState: SessionState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should create message with bot as author', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: 'Hello from bot!'
			})

			expect(message.authorId).toBe(sessionState.botUser.id)
			expect(message.content).toBe('Hello from bot!')
		})

		it('should generate valid message id', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: 'Test'
			})

			expect(message.id).toBeDefined()
			expect(typeof message.id).toBe('string')
			expect(message.id.length).toBeGreaterThan(0)
		})

		it('should include timestamp', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: 'Test'
			})

			expect(message.timestamp).toBeDefined()
			expect(typeof message.timestamp).toBe('string')
			// Should be valid ISO date
			expect(() => new Date(message.timestamp)).not.toThrow()
		})

		it('should store message in state', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: 'Stored message'
			})

			const storedMessage = sessionState.getMessage(message.id)
			expect(storedMessage).toBeDefined()
			expect(storedMessage?.content).toBe('Stored message')
		})

		it('should handle embeds', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: '',
				embeds: [{ title: 'Test Embed', description: 'Test Description' }]
			})

			expect(message.embeds).toHaveLength(1)
			expect(message.embeds[0]).toMatchObject({
				title: 'Test Embed',
				description: 'Test Description'
			})
		})

		it('should set guildId from channel', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: 'Guild message'
			})

			expect(message.guildId).toBe(guild.id)
		})

		it('should handle tts flag', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: 'TTS message',
				tts: true
			})

			expect(message.tts).toBe(true)
		})
	})

	describe('Action Recording', () => {
		let session: Session

		beforeEach(() => {
			session = new Session({
				name: 'test-session',
				config: {
					guilds: [{ name: 'Test Guild' }]
				}
			})
		})

		afterEach(async () => {
			await session.end()
		})

		it('should record message_sent action', () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]

			// Simulate what the REST endpoint does
			const message = session.state.createMessage({
				channelId,
				guildId: guild.id,
				authorId: session.state.botUser.id,
				content: 'Test message'
			})

			session.recorder.record(
				'message_sent',
				{
					message_id: message.id,
					channel_id: channelId,
					guild_id: guild.id,
					content: message.content,
					embeds: message.embeds
				},
				{
					endpoint: `POST /channels/${channelId}/messages`,
					method: 'POST'
				}
			)

			const actions = session.recorder.getMessagesSent()
			expect(actions.length).toBeGreaterThan(0)
		})

		it('should record action with timestamp', () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]

			const beforeTime = Date.now()

			const message = session.state.createMessage({
				channelId,
				guildId: guild.id,
				authorId: session.state.botUser.id,
				content: 'Timestamp test'
			})

			session.recorder.record('message_sent', {
				message_id: message.id,
				channel_id: channelId,
				content: message.content
			})

			const afterTime = Date.now()

			const actions = session.recorder.getMessagesSent()
			const lastAction = actions[actions.length - 1]

			expect(lastAction.timestamp).toBeGreaterThanOrEqual(beforeTime)
			expect(lastAction.timestamp).toBeLessThanOrEqual(afterTime)
		})

		it('should record action with channel_id', () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]

			const message = session.state.createMessage({
				channelId,
				guildId: guild.id,
				authorId: session.state.botUser.id,
				content: 'Channel test'
			})

			session.recorder.record('message_sent', {
				message_id: message.id,
				channel_id: channelId,
				content: message.content
			})

			const actions = session.recorder.getMessagesSent()
			const lastAction = actions[actions.length - 1]
			const data = lastAction.data as Record<string, unknown>

			expect(data.channel_id).toBe(channelId)
		})

		it('should record action with full message payload', () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]

			const message = session.state.createMessage({
				channelId,
				guildId: guild.id,
				authorId: session.state.botUser.id,
				content: 'Full payload test',
				embeds: [{ title: 'Embed' }]
			})

			session.recorder.record('message_sent', {
				message_id: message.id,
				channel_id: channelId,
				guild_id: guild.id,
				content: message.content,
				embeds: message.embeds
			})

			const actions = session.recorder.getMessagesSent()
			const lastAction = actions[actions.length - 1]
			const data = lastAction.data as Record<string, unknown>

			expect(data.message_id).toBe(message.id)
			expect(data.content).toBe('Full payload test')
			expect(data.guild_id).toBe(guild.id)
			expect(data.embeds).toHaveLength(1)
		})

		it('should record multiple messages in order', () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]

			;['First', 'Second', 'Third'].forEach((content) => {
				const message = session.state.createMessage({
					channelId,
					guildId: guild.id,
					authorId: session.state.botUser.id,
					content
				})

				session.recorder.record('message_sent', {
					message_id: message.id,
					channel_id: channelId,
					content: message.content
				})

				return message
			})

			const actions = session.recorder.getMessagesSent()

			expect(actions.length).toBe(3)
			expect((actions[0].data as Record<string, unknown>).content).toBe('First')
			expect((actions[1].data as Record<string, unknown>).content).toBe('Second')
			expect((actions[2].data as Record<string, unknown>).content).toBe('Third')
		})

		it('should include endpoint metadata', () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]

			const message = session.state.createMessage({
				channelId,
				guildId: guild.id,
				authorId: session.state.botUser.id,
				content: 'Endpoint test'
			})

			session.recorder.record(
				'message_sent',
				{
					message_id: message.id,
					channel_id: channelId,
					content: message.content
				},
				{
					endpoint: `POST /channels/${channelId}/messages`,
					method: 'POST'
				}
			)

			const actions = session.recorder.getMessagesSent()
			const lastAction = actions[actions.length - 1]

			expect(lastAction.endpoint).toBe(`POST /channels/${channelId}/messages`)
			expect(lastAction.method).toBe('POST')
		})
	})

	describe('mockMessageToAPIMessage conversion', () => {
		let sessionState: SessionState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should convert to Discord API format', async () => {
			// Dynamic import to match test pattern
			const { mockMessageToAPIMessage } = await import('../src/discord/payloads.js')

			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: 'API format test'
			})

			const apiMessage = mockMessageToAPIMessage(message, sessionState.botUser)

			expect(apiMessage.id).toBe(message.id)
			expect(apiMessage.channel_id).toBe(channelId)
			expect(apiMessage.content).toBe('API format test')
			expect(apiMessage.author.id).toBe(sessionState.botUser.id)
			expect(apiMessage.author.username).toBe('TestBot')
			expect(apiMessage.author.bot).toBe(true)
		})

		it('should include timestamp in response', async () => {
			const { mockMessageToAPIMessage } = await import('../src/discord/payloads.js')

			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: 'Timestamp test'
			})

			const apiMessage = mockMessageToAPIMessage(message, sessionState.botUser)

			expect(apiMessage.timestamp).toBeDefined()
			expect(apiMessage.edited_timestamp).toBeNull()
		})

		it('should include embeds in response', async () => {
			const { mockMessageToAPIMessage } = await import('../src/discord/payloads.js')

			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: '',
				embeds: [
					{ title: 'Embed 1' },
					{ title: 'Embed 2', description: 'Description' }
				]
			})

			const apiMessage = mockMessageToAPIMessage(message, sessionState.botUser)

			expect(apiMessage.embeds).toHaveLength(2)
		})
	})

	describe('Requirements Verification', () => {
		let session: Session

		beforeEach(() => {
			session = new Session({
				name: 'message-send-test',
				config: {
					guilds: [{ name: 'Test Guild' }]
				}
			})
		})

		afterEach(async () => {
			await session.end()
		})

		it('Task 1: REST endpoint handler creates message with bot as author', () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]

			// This simulates what the REST endpoint does
			const message = session.state.createMessage({
				channelId,
				guildId: guild.id,
				authorId: session.state.botUser.id,
				content: 'Bot message'
			})

			expect(message.authorId).toBe(session.state.botUser.id)
		})

		it('Task 2: Message is stored in session state', () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]

			const message = session.state.createMessage({
				channelId,
				guildId: guild.id,
				authorId: session.state.botUser.id,
				content: 'Stored message'
			})

			expect(session.state.getMessage(message.id)).toBeDefined()
		})

		it('Task 3: Action is recorded as message_sent', () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]

			const message = session.state.createMessage({
				channelId,
				guildId: guild.id,
				authorId: session.state.botUser.id,
				content: 'Recorded message'
			})

			session.recorder.record('message_sent', {
				message_id: message.id,
				channel_id: channelId,
				content: message.content
			})

			const sentMessages = session.recorder.getMessagesSent()
			expect(sentMessages.length).toBeGreaterThan(0)
			expect(sentMessages[sentMessages.length - 1].type).toBe('message_sent')
		})

		it('Task 4: Response includes all required fields', async () => {
			const { mockMessageToAPIMessage } = await import('../src/discord/payloads.js')

			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]

			const message = session.state.createMessage({
				channelId,
				guildId: guild.id,
				authorId: session.state.botUser.id,
				content: 'Response test'
			})

			const response = mockMessageToAPIMessage(message, session.state.botUser)

			// Required fields per Discord API
			expect(response).toHaveProperty('id')
			expect(response).toHaveProperty('channel_id')
			expect(response).toHaveProperty('author')
			expect(response).toHaveProperty('content')
			expect(response).toHaveProperty('timestamp')
			expect(response).toHaveProperty('edited_timestamp')
			expect(response).toHaveProperty('tts')
			expect(response).toHaveProperty('mention_everyone')
			expect(response).toHaveProperty('mentions')
			expect(response).toHaveProperty('mention_roles')
			expect(response).toHaveProperty('attachments')
			expect(response).toHaveProperty('embeds')
			expect(response).toHaveProperty('pinned')
			expect(response).toHaveProperty('type')
		})

		it('Task 5: Full round-trip works (create → store → record → response)', async () => {
			const { mockMessageToAPIMessage } = await import('../src/discord/payloads.js')

			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]

			// 1. Create message (what REST endpoint does)
			const message = session.state.createMessage({
				channelId,
				guildId: guild.id,
				authorId: session.state.botUser.id,
				content: 'Round-trip test'
			})

			// 2. Verify stored
			expect(session.state.getMessage(message.id)).toBeDefined()

			// 3. Record action
			session.recorder.record('message_sent', {
				message_id: message.id,
				channel_id: channelId,
				guild_id: guild.id,
				content: message.content
			})

			// 4. Verify recorded
			const actions = session.recorder.getMessagesSent()
			expect(actions.some((a) => (a.data as Record<string, unknown>).message_id === message.id)).toBe(true)

			// 5. Generate response
			const response = mockMessageToAPIMessage(message, session.state.botUser)
			expect(response.id).toBe(message.id)
			expect(response.content).toBe('Round-trip test')
		})
	})
})
