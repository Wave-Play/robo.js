/**
 * Thread Support Tests
 * Tests thread creation, management, membership, and gateway events
 */
import { APIThreadChannel, ChannelType, GatewayOpcodes } from 'discord-api-types/v10'
import {
	MockServerState,
	createSessionState,
	createMockGuild,
	createMockChannel,
	createMockThread,
	createMockUser,
	serializeMockThread
} from '../src/session/state.js'
import {
	mockThreadToAPIChannel,
	buildThreadCreatePayload,
	buildThreadUpdatePayload,
	buildThreadDeletePayload,
	buildThreadListSyncPayload,
	buildThreadMemberUpdatePayload,
	buildThreadMembersUpdatePayload,
	buildGuildCreatePayload
} from '../src/discord/payloads.js'
import type {
	MockThread,
	SessionState
} from '../src/types/index.js'

describe('Thread Support', () => {
	describe('createMockThread', () => {
		it('should create a public thread with default values', () => {
			const thread = createMockThread({
				name: 'Test Thread',
				type: 11,
				parentId: '123456789'
			})

			expect(thread.id).toBeDefined()
			expect(thread.name).toBe('Test Thread')
			expect(thread.type).toBe(11)
			expect(thread.parentId).toBe('123456789')
			expect(thread.ownerId).toBeDefined()
			expect(thread.memberCount).toBe(1)
			expect(thread.messageCount).toBe(0)
		})

		it('should create a private thread', () => {
			const thread = createMockThread({
				name: 'Private Thread',
				type: 12,
				parentId: '123456789'
			})

			expect(thread.type).toBe(12)
			expect(thread.threadMetadata.invitable).toBe(true)
		})

		it('should create an announcement thread', () => {
			const thread = createMockThread({
				name: 'Announcement Thread',
				type: 10,
				parentId: '123456789'
			})

			expect(thread.type).toBe(10)
		})

		it('should set thread metadata with defaults', () => {
			const thread = createMockThread({
				name: 'Test Thread',
				type: 11,
				parentId: '123456789'
			})

			expect(thread.threadMetadata).toBeDefined()
			expect(thread.threadMetadata.archived).toBe(false)
			expect(thread.threadMetadata.locked).toBe(false)
			expect(thread.threadMetadata.auto_archive_duration).toBe(1440)
			expect(thread.threadMetadata.archive_timestamp).toBeDefined()
			expect(thread.threadMetadata.create_timestamp).toBeDefined()
		})

		it('should use custom auto_archive_duration', () => {
			const thread = createMockThread({
				name: 'Test Thread',
				type: 11,
				parentId: '123456789',
				autoArchiveDuration: 4320
			})

			expect(thread.threadMetadata.auto_archive_duration).toBe(4320)
		})

		it('should use provided ID and ownerId', () => {
			const thread = createMockThread({
				id: 'custom-thread-id',
				name: 'Test Thread',
				type: 11,
				parentId: '123456789',
				ownerId: 'custom-owner-id'
			})

			expect(thread.id).toBe('custom-thread-id')
			expect(thread.ownerId).toBe('custom-owner-id')
		})
	})

	describe('serializeMockThread', () => {
		it('should serialize thread to JSON-safe format', () => {
			const thread = createMockThread({
				name: 'Test Thread',
				type: 11,
				parentId: '123456789',
				ownerId: '987654321'
			})

			const serialized = serializeMockThread(thread)

			expect(serialized.id).toBe(thread.id)
			expect(serialized.name).toBe('Test Thread')
			expect(serialized.type).toBe(11)
			expect(serialized.parentId).toBe('123456789')
			expect(serialized.ownerId).toBe('987654321')
			expect(serialized.threadMetadata).toBeDefined()
			expect(serialized.memberCount).toBe(1)
			expect(serialized.messageCount).toBe(0)
		})
	})

	describe('MockServerState thread operations', () => {
		let state: MockServerState

		beforeEach(() => {
			state = new MockServerState()
			const guild = createMockGuild({ name: 'Test Guild' })
			state.addGuild(guild)
			const channel = createMockChannel({ name: 'general' })
			state.addChannelToGuild(guild.id, channel)
		})

		describe('createThread', () => {
			it('should create a thread and add to channels map', () => {
				const channel = Array.from(state.channels.values())[0]
				const thread = state.createThread({
					name: 'New Thread',
					type: 11,
					parentId: channel.id
				})

				expect(thread).toBeDefined()
				expect(state.channels.has(thread.id)).toBe(true)
				expect(state.getThread(thread.id)).toBe(thread)
			})

			it('should set guild ID from parent channel', () => {
				const channel = Array.from(state.channels.values())[0]
				const thread = state.createThread({
					name: 'New Thread',
					type: 11,
					parentId: channel.id
				})

				expect(thread.guildId).toBe(channel.guildId)
			})

			it('should add thread to guild channels list', () => {
				const guild = Array.from(state.guilds.values())[0]
				const channel = Array.from(state.channels.values())[0]
				const initialChannelCount = guild.channels.length

				const thread = state.createThread({
					name: 'New Thread',
					type: 11,
					parentId: channel.id
				})

				expect(guild.channels.length).toBe(initialChannelCount + 1)
				expect(guild.channels).toContain(thread.id)
			})

			it('should initialize thread members with owner', () => {
				const channel = Array.from(state.channels.values())[0]
				const thread = state.createThread({
					name: 'New Thread',
					type: 11,
					parentId: channel.id,
					ownerId: state.botUser.id
				})

				const members = state.getThreadMembers(thread.id)
				expect(members.length).toBe(1)
				expect(members[0].user_id).toBe(state.botUser.id)
			})
		})

		describe('getThread / isThread', () => {
			it('should return thread by ID', () => {
				const channel = Array.from(state.channels.values())[0]
				const thread = state.createThread({
					name: 'New Thread',
					type: 11,
					parentId: channel.id
				})

				expect(state.getThread(thread.id)).toBe(thread)
			})

			it('should return undefined for non-thread channel', () => {
				const channel = Array.from(state.channels.values())[0]
				expect(state.getThread(channel.id)).toBeUndefined()
			})

			it('should identify thread channels', () => {
				const channel = Array.from(state.channels.values())[0]
				const thread = state.createThread({
					name: 'New Thread',
					type: 11,
					parentId: channel.id
				})

				expect(state.isThread(thread.id)).toBe(true)
				expect(state.isThread(channel.id)).toBe(false)
			})
		})

		describe('getThreadsForChannel', () => {
			it('should return threads for a parent channel', () => {
				const channel = Array.from(state.channels.values())[0]
				state.createThread({ name: 'Thread 1', type: 11, parentId: channel.id })
				state.createThread({ name: 'Thread 2', type: 11, parentId: channel.id })

				const threads = state.getThreadsForChannel(channel.id)

				expect(threads.length).toBe(2)
			})

			it('should filter by archived status', () => {
				const channel = Array.from(state.channels.values())[0]
				state.createThread({ name: 'Active Thread', type: 11, parentId: channel.id })
				const thread2 = state.createThread({ name: 'Archived Thread', type: 11, parentId: channel.id })
				state.updateThread(thread2.id, { archived: true })

				const activeThreads = state.getThreadsForChannel(channel.id, { archived: false })
				const archivedThreads = state.getThreadsForChannel(channel.id, { archived: true })

				expect(activeThreads.length).toBe(1)
				expect(activeThreads[0].name).toBe('Active Thread')
				expect(archivedThreads.length).toBe(1)
				expect(archivedThreads[0].name).toBe('Archived Thread')
			})
		})

		describe('getActiveThreadsForGuild', () => {
			it('should return only active (non-archived) threads', () => {
				const guild = Array.from(state.guilds.values())[0]
				const channel = Array.from(state.channels.values())[0]

				const thread1 = state.createThread({ name: 'Active', type: 11, parentId: channel.id })
				const thread2 = state.createThread({ name: 'Archived', type: 11, parentId: channel.id })
				state.updateThread(thread2.id, { archived: true })

				const activeThreads = state.getActiveThreadsForGuild(guild.id)

				expect(activeThreads.length).toBe(1)
				expect(activeThreads[0].id).toBe(thread1.id)
			})
		})

		describe('updateThread', () => {
			it('should update thread name', () => {
				const channel = Array.from(state.channels.values())[0]
				const thread = state.createThread({ name: 'Original', type: 11, parentId: channel.id })

				const updated = state.updateThread(thread.id, { name: 'Updated' })

				expect(updated?.name).toBe('Updated')
			})

			it('should update archived status', () => {
				const channel = Array.from(state.channels.values())[0]
				const thread = state.createThread({ name: 'Thread', type: 11, parentId: channel.id })

				state.updateThread(thread.id, { archived: true })

				expect(thread.threadMetadata.archived).toBe(true)
				expect(thread.threadMetadata.archive_timestamp).toBeDefined()
			})

			it('should update locked status', () => {
				const channel = Array.from(state.channels.values())[0]
				const thread = state.createThread({ name: 'Thread', type: 11, parentId: channel.id })

				state.updateThread(thread.id, { locked: true })

				expect(thread.threadMetadata.locked).toBe(true)
			})

			it('should update auto_archive_duration', () => {
				const channel = Array.from(state.channels.values())[0]
				const thread = state.createThread({ name: 'Thread', type: 11, parentId: channel.id })

				state.updateThread(thread.id, { auto_archive_duration: 10080 })

				expect(thread.threadMetadata.auto_archive_duration).toBe(10080)
			})

			it('should only update invitable for private threads', () => {
				const channel = Array.from(state.channels.values())[0]
				const publicThread = state.createThread({ name: 'Public', type: 11, parentId: channel.id })
				const privateThread = state.createThread({ name: 'Private', type: 12, parentId: channel.id })

				state.updateThread(publicThread.id, { invitable: false })
				state.updateThread(privateThread.id, { invitable: false })

				// Public thread should not have invitable changed
				expect(publicThread.threadMetadata.invitable).toBeUndefined()
				// Private thread should have invitable changed
				expect(privateThread.threadMetadata.invitable).toBe(false)
			})

			it('should return undefined for non-existent thread', () => {
				const result = state.updateThread('non-existent', { name: 'Test' })
				expect(result).toBeUndefined()
			})
		})

		describe('deleteThread', () => {
			it('should remove thread from channels map', () => {
				const channel = Array.from(state.channels.values())[0]
				const thread = state.createThread({ name: 'Thread', type: 11, parentId: channel.id })

				expect(state.channels.has(thread.id)).toBe(true)

				const result = state.deleteThread(thread.id)

				expect(result).toBe(true)
				expect(state.channels.has(thread.id)).toBe(false)
			})

			it('should remove thread from guild channels list', () => {
				const guild = Array.from(state.guilds.values())[0]
				const channel = Array.from(state.channels.values())[0]
				const thread = state.createThread({ name: 'Thread', type: 11, parentId: channel.id })

				expect(guild.channels).toContain(thread.id)

				state.deleteThread(thread.id)

				expect(guild.channels).not.toContain(thread.id)
			})

			it('should remove thread messages', () => {
				const channel = Array.from(state.channels.values())[0]
				const thread = state.createThread({ name: 'Thread', type: 11, parentId: channel.id })

				state.createMessage({
					channelId: thread.id,
					authorId: state.botUser.id,
					content: 'Thread message'
				})

				expect(state.messages.size).toBe(1)

				state.deleteThread(thread.id)

				expect(state.messages.size).toBe(0)
			})

			it('should remove thread members', () => {
				const channel = Array.from(state.channels.values())[0]
				const thread = state.createThread({ name: 'Thread', type: 11, parentId: channel.id })
				const user = createMockUser({ username: 'User' })
				state.addUser(user)
				state.addThreadMember(thread.id, user.id)

				expect(state.getThreadMembers(thread.id).length).toBe(2)

				state.deleteThread(thread.id)

				expect(state.getThreadMembers(thread.id).length).toBe(0)
			})

			it('should return false for non-existent thread', () => {
				const result = state.deleteThread('non-existent')
				expect(result).toBe(false)
			})
		})

		describe('Thread member operations', () => {
			let thread: MockThread

			beforeEach(() => {
				const channel = Array.from(state.channels.values())[0]
				thread = state.createThread({
					name: 'Thread',
					type: 11,
					parentId: channel.id,
					ownerId: state.botUser.id
				})
			})

			it('should add a member to thread', () => {
				const user = createMockUser({ username: 'NewUser' })
				state.addUser(user)

				const member = state.addThreadMember(thread.id, user.id)

				expect(member).toBeDefined()
				expect(member?.user_id).toBe(user.id)
				expect(member?.id).toBe(thread.id)
				expect(member?.join_timestamp).toBeDefined()
			})

			it('should update member count when adding member', () => {
				const user = createMockUser({ username: 'NewUser' })
				state.addUser(user)

				expect(thread.memberCount).toBe(1) // Owner

				state.addThreadMember(thread.id, user.id)

				expect(thread.memberCount).toBe(2)
			})

			it('should cap member count at 50', () => {
				// Add 60 members
				for (let i = 0; i < 60; i++) {
					const user = createMockUser({ username: `User${i}` })
					state.addUser(user)
					state.addThreadMember(thread.id, user.id)
				}

				expect(thread.memberCount).toBe(50)
			})

			it('should return existing member if already in thread', () => {
				const user = createMockUser({ username: 'User' })
				state.addUser(user)

				const member1 = state.addThreadMember(thread.id, user.id)
				const member2 = state.addThreadMember(thread.id, user.id)

				expect(member1).toBe(member2)
				expect(state.getThreadMembers(thread.id).length).toBe(2) // Owner + user
			})

			it('should remove member from thread', () => {
				const user = createMockUser({ username: 'User' })
				state.addUser(user)
				state.addThreadMember(thread.id, user.id)

				expect(state.getThreadMembers(thread.id).length).toBe(2)

				const result = state.removeThreadMember(thread.id, user.id)

				expect(result).toBe(true)
				expect(state.getThreadMembers(thread.id).length).toBe(1)
			})

			it('should update member count when removing member', () => {
				const user = createMockUser({ username: 'User' })
				state.addUser(user)
				state.addThreadMember(thread.id, user.id)

				expect(thread.memberCount).toBe(2)

				state.removeThreadMember(thread.id, user.id)

				expect(thread.memberCount).toBe(1)
			})

			it('should return false when removing non-member', () => {
				const result = state.removeThreadMember(thread.id, 'non-member-id')
				expect(result).toBe(false)
			})

			it('should get thread member', () => {
				const member = state.getThreadMember(thread.id, state.botUser.id)

				expect(member).toBeDefined()
				expect(member?.user_id).toBe(state.botUser.id)
			})

			it('should return undefined for non-member', () => {
				const member = state.getThreadMember(thread.id, 'non-member-id')
				expect(member).toBeUndefined()
			})

			it('should get all thread members', () => {
				const user = createMockUser({ username: 'User' })
				state.addUser(user)
				state.addThreadMember(thread.id, user.id)

				const members = state.getThreadMembers(thread.id)

				expect(members.length).toBe(2)
				expect(members.some(m => m.user_id === state.botUser.id)).toBe(true)
				expect(members.some(m => m.user_id === user.id)).toBe(true)
			})
		})

		describe('incrementThreadMessageCount', () => {
			it('should increment message count', () => {
				const channel = Array.from(state.channels.values())[0]
				const thread = state.createThread({ name: 'Thread', type: 11, parentId: channel.id })

				expect(thread.messageCount).toBe(0)

				state.incrementThreadMessageCount(thread.id)

				expect(thread.messageCount).toBe(1)
			})

			it('should cap message count at 50', () => {
				const channel = Array.from(state.channels.values())[0]
				const thread = state.createThread({ name: 'Thread', type: 11, parentId: channel.id })

				for (let i = 0; i < 60; i++) {
					state.incrementThreadMessageCount(thread.id)
				}

				expect(thread.messageCount).toBe(50)
			})

			it('should track total messages sent without cap', () => {
				const channel = Array.from(state.channels.values())[0]
				const thread = state.createThread({ name: 'Thread', type: 11, parentId: channel.id })

				for (let i = 0; i < 60; i++) {
					state.incrementThreadMessageCount(thread.id)
				}

				expect(thread.totalMessageSent).toBe(60)
			})
		})
	})

	describe('Thread payload builders', () => {
		let sessionState: SessionState
		let thread: MockThread

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
			const guild = createMockGuild({ name: 'Test Guild' })
			sessionState.guilds.set(guild.id, guild)
			const channel = createMockChannel({ name: 'general', guildId: guild.id })
			sessionState.channels.set(channel.id, channel)
			guild.channels.push(channel.id)

			thread = createMockThread({
				name: 'Test Thread',
				type: 11,
				parentId: channel.id,
				ownerId: sessionState.botUser.id
			})
			thread.guildId = guild.id
			sessionState.channels.set(thread.id, thread)
		})

		describe('mockThreadToAPIChannel', () => {
			it('should convert thread to API format', () => {
				const apiChannel = mockThreadToAPIChannel(thread) as APIThreadChannel

				expect(apiChannel.id).toBe(thread.id)
				expect(apiChannel.type).toBe(ChannelType.PublicThread)
				expect(apiChannel.name).toBe('Test Thread')
				expect(apiChannel.parent_id).toBe(thread.parentId)
				expect(apiChannel.owner_id).toBe(thread.ownerId)
				expect(apiChannel.message_count).toBe(0)
				expect(apiChannel.member_count).toBe(1)
			})

			it('should include thread_metadata', () => {
				const apiChannel = mockThreadToAPIChannel(thread) as any

				expect(apiChannel.thread_metadata).toBeDefined()
				expect(apiChannel.thread_metadata.archived).toBe(false)
				expect(apiChannel.thread_metadata.locked).toBe(false)
				expect(apiChannel.thread_metadata.auto_archive_duration).toBe(1440)
			})

			it('should include member field when currentUserMember is provided', () => {
				const memberData = {
					id: thread.id,
					user_id: sessionState.botUser.id,
					join_timestamp: new Date().toISOString(),
					flags: 0
				}
				const apiChannel = mockThreadToAPIChannel(thread, memberData) as any

				expect(apiChannel.member).toBeDefined()
				expect(apiChannel.member.id).toBe(thread.id)
				expect(apiChannel.member.user_id).toBe(sessionState.botUser.id)
				expect(apiChannel.member.join_timestamp).toBe(memberData.join_timestamp)
				expect(apiChannel.member.flags).toBe(0)
			})

			it('should not include member field when currentUserMember is undefined', () => {
				const apiChannel = mockThreadToAPIChannel(thread) as any

				expect(apiChannel.member).toBeUndefined()
			})
		})

		describe('buildThreadCreatePayload', () => {
			it('should build THREAD_CREATE payload', () => {
				const payload = buildThreadCreatePayload({
					thread,
					sessionState,
					sequence: 5,
					newlyCreated: true
				})

				expect(payload.op).toBe(GatewayOpcodes.Dispatch)
				expect(payload.t).toBe('THREAD_CREATE')
				expect(payload.s).toBe(5)
				expect((payload.d as any).id).toBe(thread.id)
				expect((payload.d as any).newly_created).toBe(true)
			})

			it('should set newly_created to false when not new', () => {
				const payload = buildThreadCreatePayload({
					thread,
					sessionState,
					sequence: 5,
					newlyCreated: false
				})

				expect((payload.d as any).newly_created).toBe(false)
			})
		})

		describe('buildThreadUpdatePayload', () => {
			it('should build THREAD_UPDATE payload', () => {
				const payload = buildThreadUpdatePayload({
					thread,
					sessionState,
					sequence: 6
				})

				expect(payload.op).toBe(GatewayOpcodes.Dispatch)
				expect(payload.t).toBe('THREAD_UPDATE')
				expect(payload.s).toBe(6)
				expect((payload.d as any).id).toBe(thread.id)
			})
		})

		describe('buildThreadDeletePayload', () => {
			it('should build THREAD_DELETE payload', () => {
				const payload = buildThreadDeletePayload({
					threadId: thread.id,
					guildId: thread.guildId!,
					parentId: thread.parentId,
					type: thread.type,
					sequence: 7
				})

				expect(payload.op).toBe(GatewayOpcodes.Dispatch)
				expect(payload.t).toBe('THREAD_DELETE')
				expect(payload.s).toBe(7)
				expect((payload.d as any).id).toBe(thread.id)
				expect((payload.d as any).guild_id).toBe(thread.guildId)
				expect((payload.d as any).parent_id).toBe(thread.parentId)
				expect((payload.d as any).type).toBe(thread.type)
			})
		})

		describe('buildThreadListSyncPayload', () => {
			it('should build THREAD_LIST_SYNC payload', () => {
				const payload = buildThreadListSyncPayload({
					guildId: thread.guildId!,
					threads: [thread],
					members: [],
					sequence: 8
				})

				expect(payload.op).toBe(GatewayOpcodes.Dispatch)
				expect(payload.t).toBe('THREAD_LIST_SYNC')
				expect(payload.s).toBe(8)
				expect((payload.d as any).guild_id).toBe(thread.guildId)
				expect((payload.d as any).threads).toHaveLength(1)
			})

			it('should include channel_ids when provided', () => {
				const payload = buildThreadListSyncPayload({
					guildId: thread.guildId!,
					channelIds: [thread.parentId],
					threads: [thread],
					members: [],
					sequence: 8
				})

				expect((payload.d as any).channel_ids).toEqual([thread.parentId])
			})
		})

		describe('buildThreadMemberUpdatePayload', () => {
			it('should build THREAD_MEMBER_UPDATE payload', () => {
				const member = {
					id: thread.id,
					user_id: sessionState.botUser.id,
					join_timestamp: new Date().toISOString(),
					flags: 0
				}

				const payload = buildThreadMemberUpdatePayload({
					threadId: thread.id,
					member,
					guildId: thread.guildId!,
					sequence: 9
				})

				expect(payload.op).toBe(GatewayOpcodes.Dispatch)
				expect(payload.t).toBe('THREAD_MEMBER_UPDATE')
				expect(payload.s).toBe(9)
				expect((payload.d as any).id).toBe(thread.id)
				expect((payload.d as any).guild_id).toBe(thread.guildId)
			})
		})

		describe('buildThreadMembersUpdatePayload', () => {
			it('should build THREAD_MEMBERS_UPDATE payload for additions', () => {
				const member = {
					id: thread.id,
					user_id: 'new-user-id',
					join_timestamp: new Date().toISOString(),
					flags: 0
				}

				const payload = buildThreadMembersUpdatePayload({
					threadId: thread.id,
					guildId: thread.guildId!,
					memberCount: 2,
					addedMembers: [member],
					removedMemberIds: [],
					sequence: 10
				})

				expect(payload.op).toBe(GatewayOpcodes.Dispatch)
				expect(payload.t).toBe('THREAD_MEMBERS_UPDATE')
				expect(payload.s).toBe(10)
				expect((payload.d as any).id).toBe(thread.id)
				expect((payload.d as any).member_count).toBe(2)
				expect((payload.d as any).added_members).toHaveLength(1)
			})

			it('should build THREAD_MEMBERS_UPDATE payload for removals', () => {
				const payload = buildThreadMembersUpdatePayload({
					threadId: thread.id,
					guildId: thread.guildId!,
					memberCount: 1,
					addedMembers: [],
					removedMemberIds: ['removed-user-id'],
					sequence: 11
				})

				expect((payload.d as any).removed_member_ids).toEqual(['removed-user-id'])
			})
		})
	})

	describe('GUILD_CREATE includes threads', () => {
		it('should include active threads in GUILD_CREATE payload', () => {
			const sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
			const guild = createMockGuild({ name: 'Test Guild' })
			sessionState.guilds.set(guild.id, guild)

			const channel = createMockChannel({ name: 'general', guildId: guild.id })
			sessionState.channels.set(channel.id, channel)
			guild.channels.push(channel.id)

			// Create a thread
			const thread = createMockThread({
				name: 'Active Thread',
				type: 11,
				parentId: channel.id
			})
			thread.guildId = guild.id
			sessionState.channels.set(thread.id, thread)
			guild.channels.push(thread.id)

			const payload = buildGuildCreatePayload({
				guild,
				sessionState,
				sequence: 2
			})

			const data = payload.d as any
			expect(data.threads).toBeDefined()
			expect(Array.isArray(data.threads)).toBe(true)
			expect(data.threads.length).toBe(1)
			expect(data.threads[0].id).toBe(thread.id)
		})

		it('should exclude archived threads from GUILD_CREATE', () => {
			const sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
			const guild = createMockGuild({ name: 'Test Guild' })
			sessionState.guilds.set(guild.id, guild)

			const channel = createMockChannel({ name: 'general', guildId: guild.id })
			sessionState.channels.set(channel.id, channel)
			guild.channels.push(channel.id)

			// Create an archived thread
			const thread = createMockThread({
				name: 'Archived Thread',
				type: 11,
				parentId: channel.id
			})
			thread.guildId = guild.id
			thread.threadMetadata.archived = true
			sessionState.channels.set(thread.id, thread)
			guild.channels.push(thread.id)

			const payload = buildGuildCreatePayload({
				guild,
				sessionState,
				sequence: 2
			})

			const data = payload.d as any
			expect(data.threads.length).toBe(0)
		})

		it('should exclude threads from channels array', () => {
			const sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
			const guild = createMockGuild({ name: 'Test Guild' })
			sessionState.guilds.set(guild.id, guild)

			const channel = createMockChannel({ name: 'general', guildId: guild.id })
			sessionState.channels.set(channel.id, channel)
			guild.channels.push(channel.id)

			const thread = createMockThread({
				name: 'Thread',
				type: 11,
				parentId: channel.id
			})
			thread.guildId = guild.id
			sessionState.channels.set(thread.id, thread)
			guild.channels.push(thread.id)

			const payload = buildGuildCreatePayload({
				guild,
				sessionState,
				sequence: 2
			})

			const data = payload.d as any
			// Channels should only include non-thread channels
			expect(data.channels.length).toBe(1)
			expect(data.channels[0].type).toBe(ChannelType.GuildText)
			// Threads should be in separate array
			expect(data.threads.length).toBe(1)
		})
	})

	describe('Thread type validation', () => {
		it('should identify type 10 as announcement thread', () => {
			const thread = createMockThread({
				name: 'Announcement',
				type: 10,
				parentId: '123'
			})
			expect(thread.type).toBe(10)
		})

		it('should identify type 11 as public thread', () => {
			const thread = createMockThread({
				name: 'Public',
				type: 11,
				parentId: '123'
			})
			expect(thread.type).toBe(11)
		})

		it('should identify type 12 as private thread', () => {
			const thread = createMockThread({
				name: 'Private',
				type: 12,
				parentId: '123'
			})
			expect(thread.type).toBe(12)
		})
	})

	describe('Auto-archive functionality', () => {
		let state: MockServerState

		beforeEach(() => {
			state = new MockServerState()
			const guild = createMockGuild({ name: 'Test Guild' })
			state.addGuild(guild)
			const channel = createMockChannel({ name: 'general' })
			state.addChannelToGuild(guild.id, channel)
		})

		it('should track last_activity_timestamp on thread creation', () => {
			const channel = Array.from(state.channels.values())[0]
			const thread = state.createThread({
				name: 'Thread',
				type: 11,
				parentId: channel.id
			})

			expect(thread.threadMetadata.last_activity_timestamp).toBeDefined()
		})

		it('should update last_activity_timestamp on message count increment', () => {
			const channel = Array.from(state.channels.values())[0]
			const thread = state.createThread({
				name: 'Thread',
				type: 11,
				parentId: channel.id
			})

			const initialTimestamp = thread.threadMetadata.last_activity_timestamp

			// Wait a tiny bit to ensure timestamp changes
			const waitStart = Date.now()
			while (Date.now() - waitStart < 5) {
				// busy wait
			}

			state.incrementThreadMessageCount(thread.id)

			expect(thread.threadMetadata.last_activity_timestamp).not.toBe(initialTimestamp)
		})

		it('should not archive threads within auto_archive_duration', () => {
			const channel = Array.from(state.channels.values())[0]
			state.createThread({
				name: 'Active Thread',
				type: 11,
				parentId: channel.id,
				autoArchiveDuration: 60 // 60 minutes
			})

			const archivedIds = state.checkAutoArchiveThreads()

			expect(archivedIds.length).toBe(0)
		})

		it('should archive threads past auto_archive_duration', () => {
			const channel = Array.from(state.channels.values())[0]
			const thread = state.createThread({
				name: 'Inactive Thread',
				type: 11,
				parentId: channel.id,
				autoArchiveDuration: 60 // 60 minutes
			})

			// Manually set last activity to 61 minutes ago
			const pastTime = new Date(Date.now() - 61 * 60 * 1000).toISOString()
			thread.threadMetadata.last_activity_timestamp = pastTime

			const archivedIds = state.checkAutoArchiveThreads()

			expect(archivedIds.length).toBe(1)
			expect(archivedIds[0]).toBe(thread.id)
			expect(thread.threadMetadata.archived).toBe(true)
		})

		it('should not archive already archived threads', () => {
			const channel = Array.from(state.channels.values())[0]
			const thread = state.createThread({
				name: 'Already Archived',
				type: 11,
				parentId: channel.id,
				autoArchiveDuration: 60
			})

			// Archive it and set old timestamp
			thread.threadMetadata.archived = true
			const pastTime = new Date(Date.now() - 120 * 60 * 1000).toISOString()
			thread.threadMetadata.last_activity_timestamp = pastTime

			const archivedIds = state.checkAutoArchiveThreads()

			expect(archivedIds.length).toBe(0)
		})

		it('should handle different auto_archive_duration values', () => {
			const channel = Array.from(state.channels.values())[0]

			// Thread with 60 minute duration - set to 61 minutes ago
			const thread60 = state.createThread({
				name: 'Thread 60min',
				type: 11,
				parentId: channel.id,
				autoArchiveDuration: 60
			})
			thread60.threadMetadata.last_activity_timestamp = new Date(Date.now() - 61 * 60 * 1000).toISOString()

			// Thread with 1440 minute (24h) duration - set to 25 hours ago
			const thread1440 = state.createThread({
				name: 'Thread 24h',
				type: 11,
				parentId: channel.id,
				autoArchiveDuration: 1440
			})
			thread1440.threadMetadata.last_activity_timestamp = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()

			// Thread with 1440 minute (24h) duration - set to 23 hours ago (should NOT archive)
			const threadActive = state.createThread({
				name: 'Thread Active',
				type: 11,
				parentId: channel.id,
				autoArchiveDuration: 1440
			})
			threadActive.threadMetadata.last_activity_timestamp = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString()

			const archivedIds = state.checkAutoArchiveThreads()

			expect(archivedIds.length).toBe(2)
			expect(archivedIds).toContain(thread60.id)
			expect(archivedIds).toContain(thread1440.id)
			expect(archivedIds).not.toContain(threadActive.id)
			expect(threadActive.threadMetadata.archived).toBe(false)
		})

		it('should include last_activity_timestamp in serialization', () => {
			const thread = createMockThread({
				name: 'Test Thread',
				type: 11,
				parentId: '123'
			})

			const serialized = serializeMockThread(thread)

			expect(serialized.threadMetadata.last_activity_timestamp).toBeDefined()
		})
	})
})
