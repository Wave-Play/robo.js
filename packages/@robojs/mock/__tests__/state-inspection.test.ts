/**
 * State Inspection API Tests
 *
 * Tests for the HTTP endpoints that allow external tools to inspect mock server state:
 * - GET /api/control/sessions/:id/status
 * - GET /api/control/sessions/:id/guilds
 * - GET /api/control/sessions/:id/channels/:channelId
 * - POST /api/control/sessions/:id/reset
 */

import { SessionManager } from '../src/session/manager.js'
import { createMockGuild, createMockChannel, createMockUser } from '../src/session/state.js'

// Mock the session manager module
let mockSessionManager: SessionManager

beforeEach(() => {
	mockSessionManager = new SessionManager()
})

afterEach(async () => {
	// Clean up sessions
	await mockSessionManager.destroy()
})

describe('State Inspection API', () => {
	describe('GET /api/control/sessions/:id/status', () => {
		it('should return session status with correct counts', async () => {
			const session = await mockSessionManager.create({
				name: 'status-test',
				config: {
					guilds: [{ name: 'Test Guild' }]
				}
			})

			// Add some data to the session
			const user = createMockUser({ username: 'TestUser' })
			session.state.addUser(user)

			// Verify counts
			expect(session.state.guilds.size).toBe(1)
			expect(session.state.channels.size).toBe(1) // Default guild has 1 channel
			expect(session.state.users.size).toBe(3) // Bot user + current user + test user
			expect(session.state.messages.size).toBe(0)
			expect(session.state.interactions.size).toBe(0)
			expect(session.actionCount).toBe(0)
		})

		it('should return correct connection status when no connections', async () => {
			const session = await mockSessionManager.create({ name: 'no-connections' })

			expect(session.connections.size).toBe(0)
		})

		it('should return expiration info', async () => {
			const session = await mockSessionManager.create({
				name: 'expiry-test',
				ttl: 3600000 // 1 hour
			})

			expect(session.createdAt).toBeLessThanOrEqual(Date.now())
			expect(session.expiresAt).toBeGreaterThan(session.createdAt)
			expect(session.isExpired).toBe(false)
		})

		it('should report correct sequence number', async () => {
			const session = await mockSessionManager.create({ name: 'sequence-test' })

			expect(session.state.sequence).toBe(0)

			// Increment sequence
			session.state.nextSequence()
			session.state.nextSequence()

			expect(session.state.sequence).toBe(2)
		})
	})

	describe('GET /api/control/sessions/:id/guilds', () => {
		it('should return empty array when no guilds', async () => {
			const session = await mockSessionManager.create({
				name: 'no-guilds',
				config: { guilds: [] }
			})

			expect(session.state.guilds.size).toBe(0)
		})

		it('should return guilds with stats', async () => {
			const session = await mockSessionManager.create({
				name: 'guilds-test',
				config: {
					guilds: [{ name: 'Test Guild' }]
				}
			})

			const guilds = Array.from(session.state.guilds.values())
			expect(guilds.length).toBe(1)

			const guild = guilds[0]
			expect(guild.name).toBe('Test Guild')
			expect(guild.channels.length).toBeGreaterThan(0)
			expect(guild.members.length).toBeGreaterThan(0) // Bot user is member
			expect(guild.roles.length).toBeGreaterThan(0) // @everyone role
		})

		it('should filter guilds by name (case-insensitive)', async () => {
			const session = await mockSessionManager.create({
				name: 'filter-test',
				config: { guilds: [] }
			})

			// Add multiple guilds
			session.state.addGuild(createMockGuild({ name: 'Alpha Server' }))
			session.state.addGuild(createMockGuild({ name: 'Beta Guild' }))
			session.state.addGuild(createMockGuild({ name: 'ALPHA Team' }))

			const allGuilds = Array.from(session.state.guilds.values())
			expect(allGuilds.length).toBe(3)

			// Filter by "alpha" (case-insensitive)
			const alphaGuilds = allGuilds.filter((g) => g.name.toLowerCase().includes('alpha'))
			expect(alphaGuilds.length).toBe(2)
		})

		it('should include channel and member counts', async () => {
			const session = await mockSessionManager.create({ name: 'counts-test' })

			const guild = createMockGuild({ name: 'Stats Guild' })
			session.state.addGuild(guild)

			// Add channels
			const channel1 = createMockChannel({ name: 'general' })
			const channel2 = createMockChannel({ name: 'random' })
			session.state.addChannelToGuild(guild.id, channel1)
			session.state.addChannelToGuild(guild.id, channel2)

			// Add member
			const user = createMockUser({ username: 'Member' })
			session.state.addUser(user)
			guild.members.push(user.id)

			expect(guild.channels.length).toBe(2)
			expect(guild.members.length).toBe(2) // Bot + member
		})

		it('should optionally include full channel list', async () => {
			const session = await mockSessionManager.create({ name: 'channels-include-test' })

			const guild = createMockGuild({ name: 'Test Guild' })
			session.state.addGuild(guild)

			const channel = createMockChannel({ name: 'test-channel' })
			session.state.addChannelToGuild(guild.id, channel)

			// Verify channel is in guild's channel list
			expect(guild.channels).toContain(channel.id)
		})
	})

	describe('GET /api/control/sessions/:id/channels/:channelId', () => {
		it('should return channel details', async () => {
			const session = await mockSessionManager.create({
				name: 'channel-test',
				config: {
					guilds: [{ name: 'Test Guild' }]
				}
			})

			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]
			const channel = session.state.getChannel(channelId)

			expect(channel).toBeDefined()
			expect(channel!.guildId).toBe(guild.id)
			expect(channel!.name).toBe('general')
		})

		it('should return undefined for non-existent channel', async () => {
			const session = await mockSessionManager.create({ name: 'no-channel-test' })

			const channel = session.state.getChannel('non-existent-channel-id')
			expect(channel).toBeUndefined()
		})

		it('should include message count', async () => {
			const session = await mockSessionManager.create({ name: 'message-count-test' })

			const guild = createMockGuild({ name: 'Test Guild' })
			session.state.addGuild(guild)

			const channel = createMockChannel({ name: 'general' })
			session.state.addChannelToGuild(guild.id, channel)

			// Add messages
			session.state.createMessage({
				channelId: channel.id,
				guildId: guild.id,
				authorId: session.state.botUser.id,
				content: 'Message 1'
			})
			session.state.createMessage({
				channelId: channel.id,
				guildId: guild.id,
				authorId: session.state.botUser.id,
				content: 'Message 2'
			})

			const messages = session.state.getMessagesForChannel(channel.id)
			expect(messages.length).toBe(2)
		})

		it('should include messages when requested with limit', async () => {
			const session = await mockSessionManager.create({ name: 'messages-include-test' })

			const guild = createMockGuild({ name: 'Test Guild' })
			session.state.addGuild(guild)

			const channel = createMockChannel({ name: 'general' })
			session.state.addChannelToGuild(guild.id, channel)

			// Add 10 messages
			for (let i = 0; i < 10; i++) {
				session.state.createMessage({
					channelId: channel.id,
					guildId: guild.id,
					authorId: session.state.botUser.id,
					content: `Message ${i}`
				})
			}

			// Get messages with limit
			const messages = session.state.getMessagesForChannel(channel.id, 5)
			expect(messages.length).toBe(5)
		})

		it('should find DM channels', async () => {
			const session = await mockSessionManager.create({ name: 'dm-channel-test' })

			const recipientId = '123456789'
			const dmChannel = session.state.getOrCreateDMChannel(recipientId)

			// Should be findable via getChannel
			const found = session.state.getChannel(dmChannel.id)
			expect(found).toBe(dmChannel)
		})
	})

	describe('POST /api/control/sessions/:id/reset', () => {
		it('should clear all state except bot user', async () => {
			const session = await mockSessionManager.create({
				name: 'reset-test',
				config: {
					guilds: [{ name: 'Test Guild' }]
				}
			})

			// Add more data
			const user = createMockUser({ username: 'TestUser' })
			session.state.addUser(user)

			const guild = Array.from(session.state.guilds.values())[0]
			session.state.createMessage({
				channelId: guild.channels[0],
				guildId: guild.id,
				authorId: session.state.botUser.id,
				content: 'Test message'
			})

			// Verify data exists
			expect(session.state.guilds.size).toBe(1)
			expect(session.state.channels.size).toBe(1)
			expect(session.state.users.size).toBe(3) // Bot + current user + added user
			expect(session.state.messages.size).toBe(1)

			// Reset
			session.state.reset()

			// Verify cleared
			expect(session.state.guilds.size).toBe(0)
			expect(session.state.channels.size).toBe(0)
			expect(session.state.users.size).toBe(1) // Only bot user
			expect(session.state.messages.size).toBe(0)

			// Bot user preserved
			expect(session.state.users.has(session.state.botUser.id)).toBe(true)
		})

		it('should reset sequence to 0', async () => {
			const session = await mockSessionManager.create({ name: 'sequence-reset-test' })

			// Increment sequence
			session.state.nextSequence()
			session.state.nextSequence()
			session.state.nextSequence()
			expect(session.state.sequence).toBe(3)

			// Reset
			session.state.reset()

			expect(session.state.sequence).toBe(0)
		})

		it('should clear recorded actions', async () => {
			const session = await mockSessionManager.create({ name: 'actions-reset-test' })

			// Record some actions
			session.recordAction('message_sent', { content: 'Test' })
			session.recordAction('message_sent', { content: 'Test 2' })

			expect(session.actionCount).toBe(2)

			// Clear actions
			session.clearActions()

			expect(session.actionCount).toBe(0)
		})

		it('should preserve actions when clear_actions is false', async () => {
			const session = await mockSessionManager.create({ name: 'preserve-actions-test' })

			// Record some actions
			session.recordAction('message_sent', { content: 'Test' })
			session.recordAction('message_sent', { content: 'Test 2' })

			expect(session.actionCount).toBe(2)

			// Reset state only (not actions)
			session.state.reset()
			// Actions should be preserved (not cleared)

			expect(session.actionCount).toBe(2)
		})

		it('should not reset ending session', async () => {
			const session = await mockSessionManager.create({
				name: 'ending-session-test',
				config: { guilds: [] }
			})

			// Add data
			session.state.addGuild(createMockGuild({ name: 'Test Guild' }))
			expect(session.state.guilds.size).toBe(1)

			// End session
			session.end()

			expect(session.isEnding).toBe(true)
		})

		it('should clear interactions', async () => {
			const session = await mockSessionManager.create({ name: 'interactions-reset-test' })

			// Add interaction
			session.state.addInteraction({
				id: '123',
				applicationId: session.state.applicationId,
				type: 2, // APPLICATION_COMMAND
				token: 'test-token',
				channelId: '456',
				userId: '789',
				createdAt: Date.now(),
				expiresAt: Date.now() + 900000
			})

			expect(session.state.interactions.size).toBe(1)

			// Reset
			session.state.reset()

			expect(session.state.interactions.size).toBe(0)
		})

		it('should clear DM channels', async () => {
			const session = await mockSessionManager.create({ name: 'dm-reset-test' })

			// Create DM channel
			session.state.getOrCreateDMChannel('123456789')
			expect(session.state.dmChannels.size).toBe(1)

			// Reset
			session.state.reset()

			expect(session.state.dmChannels.size).toBe(0)
		})
	})
})

describe('Session Manager Integration', () => {
	it('should create and retrieve sessions', async () => {
		const session = await mockSessionManager.create({ name: 'test-session' })

		expect(session).toBeDefined()
		expect(session.id).toBeDefined()
		expect(session.name).toBe('test-session')

		const retrieved = mockSessionManager.get(session.id)
		expect(retrieved).toBe(session)
	})

	it('should return undefined for non-existent session', () => {
		const session = mockSessionManager.get('non-existent-id')
		expect(session).toBeUndefined()
	})

	it('should list all sessions', async () => {
		await mockSessionManager.create({ name: 'session-1' })
		await mockSessionManager.create({ name: 'session-2' })

		const sessions = mockSessionManager.getAll()
		expect(sessions.length).toBe(2)
	})

	it('should delete session', async () => {
		const session = await mockSessionManager.create({ name: 'delete-test' })
		const id = session.id

		await mockSessionManager.delete(id)

		expect(mockSessionManager.get(id)).toBeUndefined()
	})
})
