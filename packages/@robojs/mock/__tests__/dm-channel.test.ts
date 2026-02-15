/**
 * DM Channel Creation Tests
 * Tests the DM channel creation endpoint and related functionality
 */
import { ChannelType } from 'discord-api-types/v10'
import { mockDMChannelToAPIDMChannel } from '../src/discord/payloads.js'
import {
	createSessionState,
	createMockUser,
	createMockChannel
} from '../src/session/state.js'
import { Session } from '../src/session/session.js'
import type { SessionState } from '../src/types/index.js'

describe('DM Channel Creation', () => {
	describe('mockDMChannelToAPIDMChannel', () => {
		it('should convert MockChannel to APIDMChannel format', () => {
			const recipient = createMockUser({ id: '123456789', username: 'TestRecipient' })
			const channel = createMockChannel({
				id: '987654321',
				type: ChannelType.DM,
				name: 'DM-123456789'
			})

			const apiChannel = mockDMChannelToAPIDMChannel(channel, recipient)

			expect(apiChannel.id).toBe('987654321')
			expect(apiChannel.type).toBe(ChannelType.DM)
			expect(apiChannel.recipients).toHaveLength(1)
			expect(apiChannel.recipients![0].id).toBe('123456789')
			expect(apiChannel.recipients![0].username).toBe('TestRecipient')
			expect(apiChannel.last_message_id).toBeNull()
		})

		it('should include full recipient user data', () => {
			const recipient = createMockUser({
				id: '111222333',
				username: 'FullUser',
				discriminator: '1234',
				globalName: 'Full User Display',
				avatar: 'avatar_hash',
				bot: false
			})
			const channel = createMockChannel({ type: ChannelType.DM })

			const apiChannel = mockDMChannelToAPIDMChannel(channel, recipient)

			expect(apiChannel.recipients![0]).toMatchObject({
				id: '111222333',
				username: 'FullUser',
				discriminator: '1234',
				global_name: 'Full User Display',
				avatar: 'avatar_hash'
			})
			// Non-bot users shouldn't have bot field
			expect(apiChannel.recipients![0].bot).toBeUndefined()
		})
	})

	describe('MockServerState DM Channel Operations', () => {
		let sessionState: SessionState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should create DM channel for new recipient', () => {
			const recipientId = '123456789'
			const dmChannel = sessionState.getOrCreateDMChannel(recipientId)

			expect(dmChannel).toBeDefined()
			expect(dmChannel.id).toBeDefined()
			expect(dmChannel.type).toBe(ChannelType.DM)
		})

		it('should return existing DM channel for same recipient', () => {
			const recipientId = '123456789'
			const channel1 = sessionState.getOrCreateDMChannel(recipientId)
			const channel2 = sessionState.getOrCreateDMChannel(recipientId)

			expect(channel1.id).toBe(channel2.id)
			expect(channel1).toBe(channel2)
		})

		it('should create separate channels for different recipients', () => {
			const channel1 = sessionState.getOrCreateDMChannel('111')
			const channel2 = sessionState.getOrCreateDMChannel('222')

			expect(channel1.id).not.toBe(channel2.id)
		})

		it('should get DM channel by recipient ID', () => {
			const recipientId = '123456789'
			const created = sessionState.getOrCreateDMChannel(recipientId)
			const retrieved = sessionState.getDMChannel(recipientId)

			expect(retrieved).toBe(created)
		})

		it('should return undefined for non-existent DM channel', () => {
			const channel = sessionState.getDMChannel('nonexistent')
			expect(channel).toBeUndefined()
		})

		it('getChannel should find DM channels by channel ID', () => {
			const recipientId = '123456789'
			const dmChannel = sessionState.getOrCreateDMChannel(recipientId)

			const found = sessionState.getChannel(dmChannel.id)
			expect(found).toBe(dmChannel)
		})
	})

	describe('Session DM Message Dispatch', () => {
		let session: Session

		beforeEach(() => {
			session = new Session({
				name: 'dm-test-session',
				config: {
					guilds: [{ name: 'Test Guild' }]
				}
			})
		})

		afterEach(async () => {
			await session.end()
		})

		it('should dispatch message to DM channel', async () => {
			// Create a recipient user
			const recipient = createMockUser({ id: '555666777', username: 'DMRecipient' })
			session.state.addUser(recipient)

			// Get or create DM channel
			const dmChannel = session.state.getOrCreateDMChannel(recipient.id)

			// Dispatch message to DM
			const message = await session.dispatchMessage({
				channelId: dmChannel.id,
				content: 'Hello in DM!'
			})

			expect(message).toBeDefined()
			expect(message.channelId).toBe(dmChannel.id)
			expect(message.content).toBe('Hello in DM!')
			// DM messages should NOT have guildId
			expect(message.guildId).toBeUndefined()
		})

		it('DM message should not have guild_id in dispatch', async () => {
			const recipient = createMockUser({ id: '888999000', username: 'DMUser' })
			session.state.addUser(recipient)
			const dmChannel = session.state.getOrCreateDMChannel(recipient.id)

			await session.dispatchMessage({
				channelId: dmChannel.id,
				content: 'DM test'
			})

			const dispatches = session.getDispatches()
			const lastDispatch = dispatches[dispatches.length - 1]
			const dispatchData = lastDispatch.data as Record<string, unknown>
			const payload = dispatchData.payload as Record<string, unknown>

			expect(dispatchData.event).toBe('MESSAGE_CREATE')
			expect(payload.guild_id).toBeUndefined()
			expect(payload.member).toBeUndefined()
		})
	})

	describe('Requirements Verification', () => {
		let sessionState: SessionState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('Task 1: DM channel conversion function exists', () => {
			const recipient = createMockUser({ username: 'Recipient' })
			const channel = createMockChannel({ type: ChannelType.DM })

			const apiChannel = mockDMChannelToAPIDMChannel(channel, recipient)

			expect(apiChannel).toBeDefined()
			expect(apiChannel.type).toBe(ChannelType.DM)
			expect(apiChannel.recipients).toHaveLength(1)
		})

		it('Task 2: getOrCreateDMChannel returns consistent channel', () => {
			const recipientId = '123'
			const channel1 = sessionState.getOrCreateDMChannel(recipientId)
			const channel2 = sessionState.getOrCreateDMChannel(recipientId)

			expect(channel1.id).toBe(channel2.id)
		})

		it('Task 3: DM channel is stored in dmChannels map', () => {
			const recipientId = '123'
			const dmChannel = sessionState.getOrCreateDMChannel(recipientId)

			expect(sessionState.dmChannels.size).toBe(1)
			expect(sessionState.getDMChannel(recipientId)).toBe(dmChannel)
			expect(sessionState.channels.get(dmChannel.id)).toBe(dmChannel)
		})

		it('Task 4: Messages can be sent to DM channels', async () => {
			const session = new Session({
				name: 'dm-test',
				config: { guilds: [] }
			})

			try {
				const recipient = createMockUser({ id: '123', username: 'Recipient' })
				session.state.addUser(recipient)
				const dmChannel = session.state.getOrCreateDMChannel(recipient.id)

				const message = await session.dispatchMessage({
					channelId: dmChannel.id,
					content: 'DM message works!'
				})

				expect(message.channelId).toBe(dmChannel.id)
				expect(message.guildId).toBeUndefined()
			} finally {
				await session.end()
			}
		})
	})
})
