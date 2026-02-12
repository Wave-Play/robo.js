/**
 * MESSAGE_CREATE Event Tests
 * Tests the MESSAGE_CREATE payload builder and message dispatch functionality
 */
import { GatewayOpcodes, MessageType } from 'discord-api-types/v10'
import {
	buildMessageCreatePayload,
	mockMessageToAPIMessage,
	buildPartialGuildMember,
	mockUserToAPIUser
} from '../src/discord/payloads.js'
import {
	createSessionState,
	createMockUser,
	createMockMessage,
	createDefaultGuildWithChannel
} from '../src/session/state.js'
import { Session } from '../src/session/session.js'
import type { MockMessage, MockUser, SessionState } from '../src/types/index.js'

describe('MESSAGE_CREATE Event', () => {
	describe('mockUserToAPIUser', () => {
		it('should convert MockUser to APIUser format', () => {
			const mockUser: MockUser = {
				id: '123456789',
				username: 'TestUser',
				discriminator: '0',
				globalName: 'Test User',
				avatar: 'abc123',
				bot: false
			}

			const apiUser = mockUserToAPIUser(mockUser)

			expect(apiUser.id).toBe('123456789')
			expect(apiUser.username).toBe('TestUser')
			expect(apiUser.discriminator).toBe('0')
			expect(apiUser.global_name).toBe('Test User')
			expect(apiUser.avatar).toBe('abc123')
			expect(apiUser.bot).toBeUndefined() // Non-bot users shouldn't have bot field
		})

		it('should include bot field for bot users', () => {
			const botUser = createMockUser({ username: 'BotUser', bot: true })
			const apiUser = mockUserToAPIUser(botUser)

			expect(apiUser.bot).toBe(true)
		})
	})

	describe('buildPartialGuildMember', () => {
		it('should create partial guild member without user field', () => {
			const user = createMockUser({ username: 'TestUser' })
			const member = buildPartialGuildMember(user)

			expect(member).not.toHaveProperty('user')
			expect(member.roles).toEqual([])
			expect(member.deaf).toBe(false)
			expect(member.mute).toBe(false)
			expect(member.joined_at).toBeDefined()
		})

		it('should use provided joinedAt timestamp', () => {
			const user = createMockUser({ username: 'TestUser' })
			const joinedAt = '2024-01-01T00:00:00.000Z'
			const member = buildPartialGuildMember(user, joinedAt)

			expect(member.joined_at).toBe(joinedAt)
		})
	})

	describe('mockMessageToAPIMessage', () => {
		it('should convert MockMessage to APIMessage format', () => {
			const author = createMockUser({ username: 'Author' })
			const mockMessage: MockMessage = {
				id: '999888777',
				channelId: '123456789',
				guildId: '111222333',
				authorId: author.id,
				content: 'Hello, world!',
				timestamp: '2024-01-01T12:00:00.000Z',
				editedTimestamp: null,
				tts: false,
				mentionEveryone: false,
				mentions: [],
				mentionRoles: [],
				attachments: [],
				embeds: [],
				pinned: false,
				type: 0
			}

			const apiMessage = mockMessageToAPIMessage(mockMessage, author)

			expect(apiMessage.id).toBe('999888777')
			expect(apiMessage.channel_id).toBe('123456789')
			expect(apiMessage.content).toBe('Hello, world!')
			expect(apiMessage.author.id).toBe(author.id)
			expect(apiMessage.author.username).toBe('Author')
			expect(apiMessage.timestamp).toBe('2024-01-01T12:00:00.000Z')
			expect(apiMessage.edited_timestamp).toBeNull()
			expect(apiMessage.tts).toBe(false)
			expect(apiMessage.mention_everyone).toBe(false)
			expect(apiMessage.pinned).toBe(false)
			expect(apiMessage.type).toBe(MessageType.Default)
		})

		it('should include embeds and attachments', () => {
			const author = createMockUser({ username: 'Author' })
			const mockMessage = createMockMessage({
				channelId: '123',
				authorId: author.id,
				content: 'Message with embeds',
				embeds: [{ title: 'Test Embed' }],
				attachments: [{ id: '1', filename: 'test.txt', size: 100, url: 'http://example.com/test.txt', proxy_url: 'http://example.com/proxy/test.txt' }]
			})

			const apiMessage = mockMessageToAPIMessage(mockMessage, author)

			expect(apiMessage.embeds).toHaveLength(1)
			expect(apiMessage.attachments).toHaveLength(1)
		})
	})

	describe('buildMessageCreatePayload', () => {
		let sessionState: SessionState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should return op: 0 (DISPATCH)', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const author = createMockUser({ username: 'TestUser' })
			sessionState.addUser(author)

			const message = createMockMessage({
				channelId,
				guildId: guild.id,
				authorId: author.id,
				content: 'Hello!'
			})

			const payload = buildMessageCreatePayload({
				message,
				author,
				sessionState,
				sequence: 5
			})

			expect(payload.op).toBe(GatewayOpcodes.Dispatch)
			expect(payload.op).toBe(0)
		})

		it('should return specified sequence number', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const author = createMockUser({ username: 'TestUser' })

			const message = createMockMessage({
				channelId,
				guildId: guild.id,
				authorId: author.id,
				content: 'Hello!'
			})

			const payload = buildMessageCreatePayload({
				message,
				author,
				sessionState,
				sequence: 10
			})

			expect(payload.s).toBe(10)
		})

		it('should return t: "MESSAGE_CREATE"', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const author = createMockUser({ username: 'TestUser' })

			const message = createMockMessage({
				channelId,
				guildId: guild.id,
				authorId: author.id,
				content: 'Hello!'
			})

			const payload = buildMessageCreatePayload({
				message,
				author,
				sessionState,
				sequence: 5
			})

			expect(payload.t).toBe('MESSAGE_CREATE')
		})

		it('should include message content and author', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const author = createMockUser({ username: 'MessageAuthor' })

			const message = createMockMessage({
				channelId,
				guildId: guild.id,
				authorId: author.id,
				content: 'Test message content'
			})

			const payload = buildMessageCreatePayload({
				message,
				author,
				sessionState,
				sequence: 5
			})

			const data = payload.d as Record<string, unknown>
			expect(data.content).toBe('Test message content')
			expect((data.author as Record<string, unknown>).username).toBe('MessageAuthor')
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

			const payload = buildMessageCreatePayload({
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

			const payload = buildMessageCreatePayload({
				message,
				author,
				sessionState,
				sequence: 5
			})

			const data = payload.d as Record<string, unknown>
			expect(data.member).toBeDefined()

			const member = data.member as Record<string, unknown>
			expect(member).not.toHaveProperty('user') // Partial member doesn't include user
			expect(member.roles).toEqual([])
			expect(member.joined_at).toBeDefined()
		})

		it('should NOT include guild_id or member for DM messages', () => {
			const author = createMockUser({ username: 'TestUser' })
			const dmChannel = sessionState.getOrCreateDMChannel(author.id)

			const message = createMockMessage({
				channelId: dmChannel.id,
				// No guildId = DM
				authorId: author.id,
				content: 'DM message'
			})

			const payload = buildMessageCreatePayload({
				message,
				author,
				sessionState,
				sequence: 5
			})

			const data = payload.d as Record<string, unknown>
			expect(data.guild_id).toBeUndefined()
			expect(data.member).toBeUndefined()
		})

		it('should include mentions with member info for guild messages', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const author = createMockUser({ username: 'Author' })
			const mentionedUser = createMockUser({ id: '888777666', username: 'MentionedUser' })
			sessionState.addUser(mentionedUser)

			const message: MockMessage = {
				id: '123',
				channelId,
				guildId: guild.id,
				authorId: author.id,
				content: 'Hello <@888777666>!',
				timestamp: new Date().toISOString(),
				editedTimestamp: null,
				tts: false,
				mentionEveryone: false,
				mentions: ['888777666'], // User IDs mentioned
				mentionRoles: [],
				attachments: [],
				embeds: [],
				pinned: false,
				type: 0
			}

			const payload = buildMessageCreatePayload({
				message,
				author,
				sessionState,
				sequence: 5
			})

			const data = payload.d as Record<string, unknown>
			const mentions = data.mentions as Array<Record<string, unknown>>

			expect(mentions).toHaveLength(1)
			expect(mentions[0].id).toBe('888777666')
			expect(mentions[0].username).toBe('MentionedUser')
			expect(mentions[0].member).toBeDefined() // Guild messages include member in mentions
		})

		it('should match expected payload structure', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const author = createMockUser({ username: 'TestUser' })

			const message = createMockMessage({
				channelId,
				guildId: guild.id,
				authorId: author.id,
				content: 'Complete test message'
			})

			const payload = buildMessageCreatePayload({
				message,
				author,
				sessionState,
				sequence: 5
			})

			expect(payload).toMatchObject({
				op: 0,
				s: 5,
				t: 'MESSAGE_CREATE',
				d: expect.objectContaining({
					id: message.id,
					channel_id: channelId,
					guild_id: guild.id,
					content: 'Complete test message',
					author: expect.objectContaining({
						id: author.id,
						username: 'TestUser'
					}),
					member: expect.objectContaining({
						roles: [],
						joined_at: expect.any(String)
					}),
					timestamp: expect.any(String),
					tts: false,
					mention_everyone: false,
					pinned: false
				})
			})
		})
	})

	describe('MockServerState.getOrCreateTestUser', () => {
		let sessionState: SessionState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should create a default test user', () => {
			const testUser = sessionState.getOrCreateTestUser()

			expect(testUser).toBeDefined()
			expect(testUser.id).toBeDefined()
			expect(testUser.username).toBe('TestUser')
			expect(testUser.bot).toBe(false)
		})

		it('should return same user on subsequent calls', () => {
			const user1 = sessionState.getOrCreateTestUser()
			const user2 = sessionState.getOrCreateTestUser()

			expect(user1.id).toBe(user2.id)
			expect(user1).toBe(user2)
		})

		it('should use provided user ID', () => {
			const customId = '999888777666555444'
			const testUser = sessionState.getOrCreateTestUser(customId)

			expect(testUser.id).toBe(customId)
		})

		it('should add user to session state', () => {
			const testUser = sessionState.getOrCreateTestUser()

			expect(sessionState.getUser(testUser.id)).toBe(testUser)
		})
	})

	describe('Session.dispatchMessage', () => {
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

		it('should create message in state', async () => {
			// Get the first channel from the guild
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]

			const message = await session.dispatchMessage({
				channelId,
				content: 'Test message'
			})

			expect(message).toBeDefined()
			expect(message.content).toBe('Test message')
			expect(message.channelId).toBe(channelId)

			// Verify message is in state
			const storedMessage = session.state.getMessage(message.id)
			expect(storedMessage).toBeDefined()
			expect(storedMessage?.content).toBe('Test message')
		})

		it('should use provided author', async () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]

			const message = await session.dispatchMessage({
				channelId,
				content: 'Author test',
				author: {
					id: '555666777',
					username: 'CustomAuthor',
					bot: false
				}
			})

			expect(message.authorId).toBe('555666777')

			// Verify author is in state
			const author = session.state.getUser('555666777')
			expect(author).toBeDefined()
			expect(author?.username).toBe('CustomAuthor')
		})

		it('should create default test user if no author specified', async () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]

			const message = await session.dispatchMessage({
				channelId,
				content: 'Default author test'
			})

			expect(message.authorId).toBeDefined()

			// Verify a user was created
			const author = session.state.getUser(message.authorId)
			expect(author).toBeDefined()
		})

		it('should record dispatch action', async () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]

			await session.dispatchMessage({
				channelId,
				content: 'Recorded message'
			})

			const dispatches = session.getDispatches()
			expect(dispatches.length).toBeGreaterThan(0)

			const lastDispatch = dispatches[dispatches.length - 1]
			expect((lastDispatch.data as Record<string, unknown>).event).toBe('MESSAGE_CREATE')
		})

		it('should throw error for non-existent channel', async () => {
			await expect(
				session.dispatchMessage({
					channelId: 'non-existent-channel',
					content: 'Should fail'
				})
			).rejects.toThrow('Channel not found')
		})

		it('should include embeds and attachments', async () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]

			const message = await session.dispatchMessage({
				channelId,
				content: 'Message with extras',
				embeds: [{ title: 'Test Embed', description: 'Test description' }],
				attachments: [{ id: '1', filename: 'test.png', size: 100, url: 'http://example.com/test.png', proxy_url: 'http://example.com/proxy/test.png' }]
			})

			expect(message.embeds).toHaveLength(1)
			expect(message.attachments).toHaveLength(1)
		})

		it('should use guild ID from channel', async () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]

			const message = await session.dispatchMessage({
				channelId,
				content: 'Guild message'
			})

			expect(message.guildId).toBe(guild.id)
		})
	})

	describe('Requirements Verification', () => {
		let sessionState: SessionState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('Task 1: Message payload builder exists and creates valid payload', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const author = createMockUser({ username: 'TestUser' })

			const message = createMockMessage({
				channelId,
				guildId: guild.id,
				authorId: author.id,
				content: 'Test content'
			})

			const payload = buildMessageCreatePayload({
				message,
				author,
				sessionState,
				sequence: 5
			})

			expect(payload).toBeDefined()
			expect(payload.op).toBe(0)
			expect(payload.t).toBe('MESSAGE_CREATE')
			expect(payload.d).toBeDefined()
		})

		it('Task 2: MockUser factory exists and creates users', () => {
			const user = createMockUser({
				username: 'CustomUser',
				bot: false
			})

			expect(user).toBeDefined()
			expect(user.id).toBeDefined()
			expect(user.username).toBe('CustomUser')
			expect(user.bot).toBe(false)
		})

		it('Task 3: Default test user can be created for message dispatch', () => {
			const testUser = sessionState.getOrCreateTestUser()

			expect(testUser).toBeDefined()
			expect(testUser.username).toBe('TestUser')
			expect(testUser.bot).toBe(false)
		})

		it('Task 4: Sequence number is included in payload', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const author = createMockUser({ username: 'TestUser' })

			const message = createMockMessage({
				channelId,
				guildId: guild.id,
				authorId: author.id,
				content: 'Test'
			})

			const payload = buildMessageCreatePayload({
				message,
				author,
				sessionState,
				sequence: 42
			})

			expect(payload.s).toBe(42)
		})

		it('Task 5: External API (session.dispatchMessage) can trigger message dispatch', async () => {
			const session = new Session({
				name: 'test',
				config: { guilds: [{ name: 'Test Guild' }] }
			})

			try {
				const guild = Array.from(session.state.guilds.values())[0]
				const channelId = guild.channels[0]

				const message = await session.dispatchMessage({
					channelId,
					content: 'API triggered message'
				})

				expect(message).toBeDefined()
				expect(message.content).toBe('API triggered message')
			} finally {
				await session.end()
			}
		})
	})

	// ============================================================================
	// APIMessage Completeness Tests
	// ============================================================================

	describe('APIMessage Completeness', () => {
		describe('interaction_metadata field', () => {
			it('should include interaction_metadata for messages from interactions', () => {
				const author = createMockUser({ username: 'Author' })
				const interactionUser = createMockUser({ username: 'CommandUser' })

				const message = createMockMessage({
					channelId: '123',
					authorId: author.id,
					content: 'Interaction response',
					interactionMetadata: {
						id: '999',
						type: 2, // APPLICATION_COMMAND
						user: interactionUser,
						authorizing_integration_owners: {}
					}
				})

				const apiMessage = mockMessageToAPIMessage(message, author)

				expect(apiMessage.interaction_metadata).toBeDefined()
				expect(apiMessage.interaction_metadata?.id).toBe('999')
				expect(apiMessage.interaction_metadata?.type).toBe(2)
				expect(apiMessage.interaction_metadata?.user.username).toBe('CommandUser')
			})

			it('should populate deprecated interaction field alongside interaction_metadata', () => {
				const author = createMockUser({ username: 'Author' })
				const interactionUser = createMockUser({ username: 'CommandUser' })

				const message = createMockMessage({
					channelId: '123',
					authorId: author.id,
					content: 'Response',
					interactionMetadata: {
						id: '888',
						type: 2,
						user: interactionUser
					}
				})

				const apiMessage = mockMessageToAPIMessage(message, author)

				expect(apiMessage.interaction_metadata).toBeDefined()
				expect(apiMessage.interaction).toBeDefined()
				expect(apiMessage.interaction?.id).toBe('888')
			})

			it('should include optional target_user for USER context menu commands', () => {
				const author = createMockUser({ username: 'Author' })
				const interactionUser = createMockUser({ username: 'CommandUser' })
				const targetUser = createMockUser({ id: '777', username: 'TargetUser' })

				const message = createMockMessage({
					channelId: '123',
					authorId: author.id,
					content: 'User info',
					interactionMetadata: {
						id: '999',
						type: 2,
						user: interactionUser,
						target_user: targetUser
					}
				})

				const apiMessage = mockMessageToAPIMessage(message, author)

				// Cast to access context menu specific fields
				const metadata = apiMessage.interaction_metadata as unknown as Record<string, unknown>
				expect(metadata?.target_user).toBeDefined()
				expect((metadata?.target_user as { username: string })?.username).toBe('TargetUser')
			})

			it('should include optional target_message_id for MESSAGE context menu commands', () => {
				const author = createMockUser({ username: 'Author' })
				const interactionUser = createMockUser({ username: 'CommandUser' })

				const message = createMockMessage({
					channelId: '123',
					authorId: author.id,
					content: 'Message info',
					interactionMetadata: {
						id: '999',
						type: 2,
						user: interactionUser,
						target_message_id: '555666777'
					}
				})

				const apiMessage = mockMessageToAPIMessage(message, author)

				// Cast to access context menu specific fields
				const metadata = apiMessage.interaction_metadata as unknown as Record<string, unknown>
				expect(metadata?.target_message_id).toBe('555666777')
			})
		})

		describe('call field', () => {
			it('should include call field for call messages', () => {
				const author = createMockUser({ username: 'Author' })

				const message = createMockMessage({
					channelId: '123',
					authorId: author.id,
					content: '',
					type: 3, // MessageType.Call
					call: {
						participants: ['user1', 'user2'],
						ended_timestamp: null
					}
				})

				const apiMessage = mockMessageToAPIMessage(message, author)

				expect(apiMessage.call).toBeDefined()
				expect(apiMessage.call?.participants).toContain('user1')
				expect(apiMessage.call?.participants).toContain('user2')
				expect(apiMessage.call?.ended_timestamp).toBeNull()
			})

			it('should include ended_timestamp for ended calls', () => {
				const author = createMockUser({ username: 'Author' })
				const endedAt = '2024-01-01T12:00:00.000Z'

				const message = createMockMessage({
					channelId: '123',
					authorId: author.id,
					content: '',
					type: 3,
					call: {
						participants: ['user1'],
						ended_timestamp: endedAt
					}
				})

				const apiMessage = mockMessageToAPIMessage(message, author)

				expect(apiMessage.call?.ended_timestamp).toBe(endedAt)
			})

			it('should not include call field for non-call messages', () => {
				const author = createMockUser({ username: 'Author' })

				const message = createMockMessage({
					channelId: '123',
					authorId: author.id,
					content: 'Regular message',
					type: 0 // DEFAULT
				})

				const apiMessage = mockMessageToAPIMessage(message, author)

				expect(apiMessage.call).toBeUndefined()
			})
		})

		describe('message_snapshots field', () => {
			it('should include message_snapshots for forwarded messages', () => {
				const author = createMockUser({ username: 'Author' })
				const originalAuthor = createMockUser({ username: 'OriginalAuthor' })

				const message = createMockMessage({
					channelId: '123',
					authorId: author.id,
					content: '',
					messageSnapshots: [
						{
							message: {
								type: 0,
								content: 'Original message content',
								embeds: [],
								attachments: [],
								timestamp: '2024-01-01T12:00:00.000Z',
								edited_timestamp: null,
								mentions: [originalAuthor],
								mention_roles: []
							}
						}
					]
				})

				const apiMessage = mockMessageToAPIMessage(message, author)

				expect(apiMessage.message_snapshots).toHaveLength(1)
				expect(apiMessage.message_snapshots?.[0].message.content).toBe('Original message content')
			})

			it('should convert snapshot mentions to API format', () => {
				const author = createMockUser({ username: 'Author' })
				const mentionedUser = createMockUser({ id: '888', username: 'MentionedUser' })

				const message = createMockMessage({
					channelId: '123',
					authorId: author.id,
					content: '',
					messageSnapshots: [
						{
							message: {
								type: 0,
								content: 'Hello <@888>!',
								embeds: [],
								attachments: [],
								timestamp: '2024-01-01T12:00:00.000Z',
								edited_timestamp: null,
								mentions: [mentionedUser],
								mention_roles: []
							}
						}
					]
				})

				const apiMessage = mockMessageToAPIMessage(message, author)

				expect(apiMessage.message_snapshots?.[0].message.mentions).toHaveLength(1)
				expect(apiMessage.message_snapshots?.[0].message.mentions[0].username).toBe('MentionedUser')
			})

			it('should not include message_snapshots for regular messages', () => {
				const author = createMockUser({ username: 'Author' })

				const message = createMockMessage({
					channelId: '123',
					authorId: author.id,
					content: 'Regular message'
				})

				const apiMessage = mockMessageToAPIMessage(message, author)

				expect(apiMessage.message_snapshots).toBeUndefined()
			})
		})

		describe('resolved field', () => {
			it('should include resolved field when present', () => {
				const author = createMockUser({ username: 'Author' })
				const resolvedUser = createMockUser({ id: '777', username: 'ResolvedUser' })

				const message = createMockMessage({
					channelId: '123',
					authorId: author.id,
					content: 'Message with resolved data',
					resolved: {
						users: { '777': mockUserToAPIUser(resolvedUser) }
					}
				})

				const apiMessage = mockMessageToAPIMessage(message, author)

				expect(apiMessage.resolved).toBeDefined()
				expect((apiMessage.resolved as Record<string, unknown>)?.users).toBeDefined()
			})

			it('should not include resolved field when not present', () => {
				const author = createMockUser({ username: 'Author' })

				const message = createMockMessage({
					channelId: '123',
					authorId: author.id,
					content: 'Regular message'
				})

				const apiMessage = mockMessageToAPIMessage(message, author)

				expect(apiMessage.resolved).toBeUndefined()
			})
		})
	})
})
