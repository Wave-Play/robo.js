/**
 * Unit tests for MockServerState class and state management functions
 * State Management Foundation
 */

import {
	MockServerState,
	createSessionState,
	createMockUser,
	createMockGuild,
	createMockChannel,
	createMockMessage,
	serializeMockMessage,
	serializeSessionState
} from '../src/session/state.js'
import type { MockMessageConfig } from '../src/types/index.js'

describe('MockServerState', () => {
	describe('instantiation', () => {
		it('should create state with default values', () => {
			const state = new MockServerState()

			expect(state.guilds.size).toBe(0)
			expect(state.channels.size).toBe(0)
			expect(state.dmChannels.size).toBe(0)
			expect(state.users.size).toBe(1) // Bot user
			expect(state.messages.size).toBe(0)
			expect(state.sequence).toBe(0)
			expect(state.botUser).toBeDefined()
			expect(state.botUser.bot).toBe(true)
			expect(state.botUser.username).toBe('MockBot')
			expect(state.applicationId).toBe(state.botUser.id)
		})

		it('should create state with custom bot user', () => {
			const state = new MockServerState({
				botUser: {
					username: 'CustomBot',
					id: '123456789'
				}
			})

			expect(state.botUser.username).toBe('CustomBot')
			expect(state.botUser.id).toBe('123456789')
			expect(state.botUser.bot).toBe(true)
		})

		it('should create state with custom application ID', () => {
			const state = new MockServerState({
				applicationId: '987654321'
			})

			expect(state.applicationId).toBe('987654321')
		})

		it('should have bot user in users map', () => {
			const state = new MockServerState()

			expect(state.users.has(state.botUser.id)).toBe(true)
			expect(state.users.get(state.botUser.id)).toBe(state.botUser)
		})
	})

	describe('sequence management', () => {
		it('should start with sequence 0', () => {
			const state = new MockServerState()
			expect(state.sequence).toBe(0)
		})

		it('should increment sequence with nextSequence()', () => {
			const state = new MockServerState()

			expect(state.nextSequence()).toBe(1)
			expect(state.nextSequence()).toBe(2)
			expect(state.nextSequence()).toBe(3)
			expect(state.sequence).toBe(3)
		})

		it('should allow setting sequence directly', () => {
			const state = new MockServerState()
			state.sequence = 100
			expect(state.sequence).toBe(100)
		})
	})

	describe('guild operations', () => {
		it('should add and get a guild', () => {
			const state = new MockServerState()
			const guild = createMockGuild({ name: 'Test Guild' })

			state.addGuild(guild)

			expect(state.guilds.size).toBe(1)
			expect(state.getGuild(guild.id)).toBe(guild)
		})

		it('should automatically add bot user as member when adding guild', () => {
			const state = new MockServerState()
			const guild = createMockGuild({ name: 'Test Guild' })

			state.addGuild(guild)

			expect(guild.members).toContain(state.botUser.id)
		})

		it('should not duplicate bot user in members', () => {
			const state = new MockServerState()
			const guild = createMockGuild({ name: 'Test Guild' })
			guild.members.push(state.botUser.id)

			state.addGuild(guild)

			const botUserCount = guild.members.filter((id) => id === state.botUser.id).length
			expect(botUserCount).toBe(1)
		})

		it('should remove a guild', () => {
			const state = new MockServerState()
			const guild = createMockGuild({ name: 'Test Guild' })

			state.addGuild(guild)
			expect(state.guilds.size).toBe(1)

			const removed = state.removeGuild(guild.id)
			expect(removed).toBe(true)
			expect(state.guilds.size).toBe(0)
			expect(state.getGuild(guild.id)).toBeUndefined()
		})

		it('should return false when removing non-existent guild', () => {
			const state = new MockServerState()
			const removed = state.removeGuild('non-existent')
			expect(removed).toBe(false)
		})

		it('should remove guild channels when removing guild', () => {
			const state = new MockServerState()
			const guild = createMockGuild({ name: 'Test Guild' })
			const channel = createMockChannel({ name: 'general' })

			state.addGuild(guild)
			state.addChannelToGuild(guild.id, channel)

			expect(state.channels.size).toBe(1)

			state.removeGuild(guild.id)

			expect(state.channels.size).toBe(0)
		})

		it('should remove guild messages when removing guild', () => {
			const state = new MockServerState()
			const guild = createMockGuild({ name: 'Test Guild' })
			const channel = createMockChannel({ name: 'general' })

			state.addGuild(guild)
			state.addChannelToGuild(guild.id, channel)
			state.createMessage({
				channelId: channel.id,
				guildId: guild.id,
				authorId: state.botUser.id,
				content: 'Hello'
			})

			expect(state.messages.size).toBe(1)

			state.removeGuild(guild.id)

			expect(state.messages.size).toBe(0)
		})
	})

	describe('channel operations', () => {
		it('should add and get a channel', () => {
			const state = new MockServerState()
			const channel = createMockChannel({ name: 'general' })

			state.addChannel(channel)

			expect(state.channels.size).toBe(1)
			expect(state.getChannel(channel.id)).toBe(channel)
		})

		it('should add channel to guild', () => {
			const state = new MockServerState()
			const guild = createMockGuild({ name: 'Test Guild' })
			const channel = createMockChannel({ name: 'general' })

			state.addGuild(guild)
			state.addChannelToGuild(guild.id, channel)

			expect(channel.guildId).toBe(guild.id)
			expect(guild.channels).toContain(channel.id)
			expect(state.getChannel(channel.id)).toBe(channel)
		})

		it('should get channels for guild', () => {
			const state = new MockServerState()
			const guild = createMockGuild({ name: 'Test Guild' })
			const channel1 = createMockChannel({ name: 'general' })
			const channel2 = createMockChannel({ name: 'random' })
			const channel3 = createMockChannel({ name: 'other-guild' })

			state.addGuild(guild)
			state.addChannelToGuild(guild.id, channel1)
			state.addChannelToGuild(guild.id, channel2)
			state.addChannel(channel3) // Not in guild

			const guildChannels = state.getChannelsForGuild(guild.id)

			expect(guildChannels.length).toBe(2)
			expect(guildChannels).toContain(channel1)
			expect(guildChannels).toContain(channel2)
			expect(guildChannels).not.toContain(channel3)
		})

		it('should remove a channel', () => {
			const state = new MockServerState()
			const channel = createMockChannel({ name: 'general' })

			state.addChannel(channel)
			const removed = state.removeChannel(channel.id)

			expect(removed).toBe(true)
			expect(state.channels.size).toBe(0)
		})

		it('should remove channel from guild channel list', () => {
			const state = new MockServerState()
			const guild = createMockGuild({ name: 'Test Guild' })
			const channel = createMockChannel({ name: 'general' })

			state.addGuild(guild)
			state.addChannelToGuild(guild.id, channel)

			expect(guild.channels).toContain(channel.id)

			state.removeChannel(channel.id)

			expect(guild.channels).not.toContain(channel.id)
		})

		it('should remove channel messages when removing channel', () => {
			const state = new MockServerState()
			const channel = createMockChannel({ name: 'general' })

			state.addChannel(channel)
			state.createMessage({
				channelId: channel.id,
				authorId: state.botUser.id,
				content: 'Hello'
			})

			expect(state.messages.size).toBe(1)

			state.removeChannel(channel.id)

			expect(state.messages.size).toBe(0)
		})
	})

	describe('user operations', () => {
		it('should add and get a user', () => {
			const state = new MockServerState()
			const user = createMockUser({ username: 'TestUser' })

			state.addUser(user)

			expect(state.users.size).toBe(2) // Bot user + new user
			expect(state.getUser(user.id)).toBe(user)
		})

		it('should remove a user', () => {
			const state = new MockServerState()
			const user = createMockUser({ username: 'TestUser' })

			state.addUser(user)
			const removed = state.removeUser(user.id)

			expect(removed).toBe(true)
			expect(state.users.size).toBe(1) // Only bot user
		})

		it('should not remove bot user', () => {
			const state = new MockServerState()
			const removed = state.removeUser(state.botUser.id)

			expect(removed).toBe(false)
			expect(state.users.has(state.botUser.id)).toBe(true)
		})
	})

	describe('message operations', () => {
		it('should create and get a message', () => {
			const state = new MockServerState()
			const channel = createMockChannel({ name: 'general' })
			state.addChannel(channel)

			const message = state.createMessage({
				channelId: channel.id,
				authorId: state.botUser.id,
				content: 'Hello, world!'
			})

			expect(message.id).toBeDefined()
			expect(message.content).toBe('Hello, world!')
			expect(message.channelId).toBe(channel.id)
			expect(message.authorId).toBe(state.botUser.id)
			expect(state.getMessage(message.id)).toBe(message)
		})

		it('should set timestamp on message creation', () => {
			const state = new MockServerState()
			const channel = createMockChannel({ name: 'general' })
			state.addChannel(channel)

			const before = new Date().toISOString()
			const message = state.createMessage({
				channelId: channel.id,
				authorId: state.botUser.id,
				content: 'Hello'
			})
			const after = new Date().toISOString()

			expect(message.timestamp >= before).toBe(true)
			expect(message.timestamp <= after).toBe(true)
			expect(message.editedTimestamp).toBeNull()
		})

		it('should detect @everyone mention', () => {
			const state = new MockServerState()
			const channel = createMockChannel({ name: 'general' })
			state.addChannel(channel)

			const message1 = state.createMessage({
				channelId: channel.id,
				authorId: state.botUser.id,
				content: 'Hello @everyone!'
			})

			const message2 = state.createMessage({
				channelId: channel.id,
				authorId: state.botUser.id,
				content: 'Hello world'
			})

			expect(message1.mentionEveryone).toBe(true)
			expect(message2.mentionEveryone).toBe(false)
		})

		it('should get messages for channel', () => {
			const state = new MockServerState()
			const channel1 = createMockChannel({ name: 'general' })
			const channel2 = createMockChannel({ name: 'random' })
			state.addChannel(channel1)
			state.addChannel(channel2)

			state.createMessage({ channelId: channel1.id, authorId: state.botUser.id, content: 'msg1' })
			state.createMessage({ channelId: channel1.id, authorId: state.botUser.id, content: 'msg2' })
			state.createMessage({ channelId: channel2.id, authorId: state.botUser.id, content: 'msg3' })

			const channel1Messages = state.getMessagesForChannel(channel1.id)
			const channel2Messages = state.getMessagesForChannel(channel2.id)

			expect(channel1Messages.length).toBe(2)
			expect(channel2Messages.length).toBe(1)
		})

		it('should get messages with limit', () => {
			const state = new MockServerState()
			const channel = createMockChannel({ name: 'general' })
			state.addChannel(channel)

			for (let i = 0; i < 10; i++) {
				state.createMessage({ channelId: channel.id, authorId: state.botUser.id, content: `msg${i}` })
			}

			const messages = state.getMessagesForChannel(channel.id, 5)
			expect(messages.length).toBe(5)
		})

		it('should update a message', () => {
			const state = new MockServerState()
			const channel = createMockChannel({ name: 'general' })
			state.addChannel(channel)

			const message = state.createMessage({
				channelId: channel.id,
				authorId: state.botUser.id,
				content: 'Original'
			})

			const updated = state.updateMessage(message.id, { content: 'Updated' })

			expect(updated).toBeDefined()
			expect(updated!.content).toBe('Updated')
			expect(updated!.editedTimestamp).not.toBeNull()
			expect(updated!.id).toBe(message.id)
			expect(updated!.channelId).toBe(message.channelId)
			expect(updated!.authorId).toBe(message.authorId)
		})

		it('should not update immutable message fields', () => {
			const state = new MockServerState()
			const channel = createMockChannel({ name: 'general' })
			state.addChannel(channel)

			const message = state.createMessage({
				channelId: channel.id,
				authorId: state.botUser.id,
				content: 'Original'
			})

			const updated = state.updateMessage(message.id, {
				id: 'new-id' as any,
				channelId: 'new-channel' as any,
				authorId: 'new-author' as any
			})

			expect(updated!.id).toBe(message.id)
			expect(updated!.channelId).toBe(message.channelId)
			expect(updated!.authorId).toBe(message.authorId)
		})

		it('should return undefined when updating non-existent message', () => {
			const state = new MockServerState()
			const result = state.updateMessage('non-existent', { content: 'Updated' })
			expect(result).toBeUndefined()
		})

		it('should delete a message', () => {
			const state = new MockServerState()
			const channel = createMockChannel({ name: 'general' })
			state.addChannel(channel)

			const message = state.createMessage({
				channelId: channel.id,
				authorId: state.botUser.id,
				content: 'Hello'
			})

			const deleted = state.deleteMessage(message.id)

			expect(deleted).toBe(true)
			expect(state.getMessage(message.id)).toBeUndefined()
		})

		it('should enforce message limit (LRU)', () => {
			const state = new MockServerState({ maxMessages: 5 })
			const channel = createMockChannel({ name: 'general' })
			state.addChannel(channel)

			const messageIds: string[] = []
			for (let i = 0; i < 7; i++) {
				const msg = state.createMessage({
					channelId: channel.id,
					authorId: state.botUser.id,
					content: `msg${i}`
				})
				messageIds.push(msg.id)
			}

			// Should have exactly 5 messages
			expect(state.messages.size).toBe(5)

			// First 2 messages should be removed
			expect(state.getMessage(messageIds[0])).toBeUndefined()
			expect(state.getMessage(messageIds[1])).toBeUndefined()

			// Last 5 messages should exist
			expect(state.getMessage(messageIds[2])).toBeDefined()
			expect(state.getMessage(messageIds[6])).toBeDefined()
		})
	})

	describe('DM channel operations', () => {
		it('should get or create DM channel', () => {
			const state = new MockServerState()
			const recipientId = '123456789'

			const dmChannel = state.getOrCreateDMChannel(recipientId)

			expect(dmChannel).toBeDefined()
			expect(dmChannel.type).toBe(1) // DM channel type
			// DM channels are keyed by composite key (currentUser.id:recipientId)
			expect(state.dmChannels.size).toBe(1)
		})

		it('should return existing DM channel', () => {
			const state = new MockServerState()
			const recipientId = '123456789'

			const dmChannel1 = state.getOrCreateDMChannel(recipientId)
			const dmChannel2 = state.getOrCreateDMChannel(recipientId)

			expect(dmChannel1).toBe(dmChannel2)
			expect(state.dmChannels.size).toBe(1)
		})

		it('should get DM channel by recipient ID', () => {
			const state = new MockServerState()
			const recipientId = '123456789'

			state.getOrCreateDMChannel(recipientId)
			const dmChannel = state.getDMChannel(recipientId)

			expect(dmChannel).toBeDefined()
		})

		it('should return undefined for non-existent DM channel', () => {
			const state = new MockServerState()
			const dmChannel = state.getDMChannel('non-existent')
			expect(dmChannel).toBeUndefined()
		})

		it('should find DM channel via getChannel', () => {
			const state = new MockServerState()
			const recipientId = '123456789'

			const dmChannel = state.getOrCreateDMChannel(recipientId)
			const foundChannel = state.getChannel(dmChannel.id)

			expect(foundChannel).toBe(dmChannel)
		})
	})

	describe('state reset', () => {
		it('should clear all entities except bot user', () => {
			const state = new MockServerState()
			const guild = createMockGuild({ name: 'Test Guild' })
			const channel = createMockChannel({ name: 'general' })
			const user = createMockUser({ username: 'TestUser' })

			state.addGuild(guild)
			state.addChannelToGuild(guild.id, channel)
			state.addUser(user)
			state.createMessage({ channelId: channel.id, authorId: state.botUser.id, content: 'Hello' })
			state.getOrCreateDMChannel('123')
			state.sequence = 100

			state.reset()

			expect(state.guilds.size).toBe(0)
			expect(state.channels.size).toBe(0)
			expect(state.dmChannels.size).toBe(0)
			expect(state.messages.size).toBe(0)
			expect(state.users.size).toBe(1)
			expect(state.users.has(state.botUser.id)).toBe(true)
			expect(state.sequence).toBe(0)
		})

		it('should preserve bot user after reset', () => {
			const state = new MockServerState({
				botUser: { username: 'CustomBot', id: '123' }
			})

			state.reset()

			expect(state.botUser.username).toBe('CustomBot')
			expect(state.botUser.id).toBe('123')
			expect(state.users.get('123')).toBe(state.botUser)
		})
	})

	describe('serialization', () => {
		it('should serialize state', () => {
			const state = new MockServerState()
			const guild = createMockGuild({ name: 'Test Guild' })
			const channel = createMockChannel({ name: 'general' })

			state.addGuild(guild)
			state.addChannelToGuild(guild.id, channel)
			state.createMessage({ channelId: channel.id, authorId: state.botUser.id, content: 'Hello' })
			state.getOrCreateDMChannel('123')
			state.sequence = 5

			const serialized = state.serialize()

			expect(serialized.guilds.length).toBe(1)
			// channels includes both guild channels (1) and DM channels (1)
			// DM channels are stored in both maps for O(1) lookup by channel ID
			expect(serialized.channels.length).toBe(2)
			expect(serialized.dmChannels.length).toBe(1)
			// users includes botUser and currentUser (lazy-created on first access)
			expect(serialized.users.length).toBe(2)
			expect(serialized.messages.length).toBe(1)
			expect(serialized.botUser.username).toBe('MockBot')
			expect(serialized.applicationId).toBe(state.applicationId)
			expect(serialized.sequence).toBe(5)
		})

		it('should serialize messages with all fields', () => {
			const state = new MockServerState()
			const channel = createMockChannel({ name: 'general' })
			state.addChannel(channel)

			const message = state.createMessage({
				channelId: channel.id,
				authorId: state.botUser.id,
				content: 'Hello @everyone!',
				embeds: [{ title: 'Test' }]
			})

			const serialized = serializeMockMessage(message)

			expect(serialized.id).toBe(message.id)
			expect(serialized.channelId).toBe(message.channelId)
			expect(serialized.authorId).toBe(message.authorId)
			expect(serialized.content).toBe('Hello @everyone!')
			expect(serialized.mentionEveryone).toBe(true)
			expect(serialized.embeds).toHaveLength(1)
			expect(serialized.timestamp).toBeDefined()
			expect(serialized.editedTimestamp).toBeNull()
		})
	})
})

describe('createSessionState', () => {
	it('should create MockServerState instance', () => {
		const state = createSessionState()
		expect(state).toBeInstanceOf(MockServerState)
	})

	it('should pass options to MockServerState', () => {
		const state = createSessionState({
			botUser: { username: 'CustomBot' },
			applicationId: '123'
		})

		expect(state.botUser.username).toBe('CustomBot')
		expect(state.applicationId).toBe('123')
	})
})

describe('createMockMessage', () => {
	it('should create message with required fields', () => {
		const config: MockMessageConfig = {
			channelId: '123',
			authorId: '456',
			content: 'Hello'
		}

		const message = createMockMessage(config)

		expect(message.id).toBeDefined()
		expect(message.channelId).toBe('123')
		expect(message.authorId).toBe('456')
		expect(message.content).toBe('Hello')
		expect(message.timestamp).toBeDefined()
		expect(message.editedTimestamp).toBeNull()
		expect(message.tts).toBe(false)
		expect(message.pinned).toBe(false)
		expect(message.type).toBe(0)
	})

	it('should use provided ID', () => {
		const message = createMockMessage({
			id: 'custom-id',
			channelId: '123',
			authorId: '456'
		})

		expect(message.id).toBe('custom-id')
	})

	it('should default content to empty string', () => {
		const message = createMockMessage({
			channelId: '123',
			authorId: '456'
		})

		expect(message.content).toBe('')
	})

	it('should set optional fields', () => {
		const message = createMockMessage({
			channelId: '123',
			authorId: '456',
			guildId: '789',
			embeds: [{ title: 'Test' }],
			attachments: [{ id: 'att1', filename: 'test.txt', size: 100, url: 'http://example.com/test.txt', proxy_url: 'http://example.com/proxy/test.txt' }],
			tts: true,
			type: 1
		})

		expect(message.guildId).toBe('789')
		expect(message.embeds).toHaveLength(1)
		expect(message.attachments).toHaveLength(1)
		expect(message.tts).toBe(true)
		expect(message.type).toBe(1)
	})
})

describe('serializeSessionState', () => {
	it('should serialize state using standalone function', () => {
		const state = new MockServerState()
		const guild = createMockGuild({ name: 'Test Guild' })
		state.addGuild(guild)

		const serialized = serializeSessionState(state)

		expect(serialized.guilds.length).toBe(1)
		expect(serialized.guilds[0].name).toBe('Test Guild')
	})
})
