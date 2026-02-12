/**
 * Unit tests for context menu interactions
 * Context Menu Commands
 */

import {
	buildContextMenuInteractionPayload,
	createMockUser,
	createSessionState,
	createDefaultGuildWithChannel,
	generateSnowflake
} from '../src/index.js'
import { Session } from '../src/session/session.js'
import type { MockInteraction } from '../src/types/index.js'

describe('Context Menu Interactions', () => {
	describe('buildContextMenuInteractionPayload', () => {
		it('should build USER context menu payload with resolved user', () => {
			const state = createSessionState()
			createDefaultGuildWithChannel(state)

			const targetUser = createMockUser({ username: 'TargetUser' })
			state.addUser(targetUser)

			const user = state.getOrCreateTestUser()
			const firstGuild = state.guilds.values().next().value!
			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: state.applicationId,
				type: 2,
				token: 'test-token',
				channelId: firstGuild.channels[0],
				guildId: firstGuild.id,
				userId: user.id,
				commandName: 'Get Info',
				targetId: targetUser.id,
				contextMenuType: 2,
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildContextMenuInteractionPayload({
				interaction,
				user,
				targetUser,
				sessionState: state,
				sequence: 1
			})

			expect(payload.op).toBe(0)
			expect(payload.t).toBe('INTERACTION_CREATE')

			const data = payload.d as Record<string, unknown>
			expect(data.type).toBe(2) // ApplicationCommand

			const commandData = data.data as Record<string, unknown>
			expect(commandData.type).toBe(2) // USER command
			expect(commandData.target_id).toBe(targetUser.id)

			const resolved = commandData.resolved as Record<string, Record<string, unknown>>
			expect(resolved.users[targetUser.id]).toBeDefined()
			expect(resolved.members[targetUser.id]).toBeDefined()
		})

		it('should build MESSAGE context menu payload with resolved message', () => {
			const state = createSessionState()
			createDefaultGuildWithChannel(state)

			const user = state.getOrCreateTestUser()
			const firstGuild = state.guilds.values().next().value!
			const channelId = firstGuild.channels[0]
			const guildId = firstGuild.id

			// Create target message using state.createMessage
			const targetMessage = state.createMessage({
				channelId,
				guildId,
				authorId: user.id,
				content: 'Target message content'
			})

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: state.applicationId,
				type: 2,
				token: 'test-token',
				channelId,
				guildId,
				userId: user.id,
				commandName: 'Report Message',
				targetId: targetMessage.id,
				contextMenuType: 3,
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildContextMenuInteractionPayload({
				interaction,
				user,
				targetMessage,
				sessionState: state,
				sequence: 1
			})

			expect(payload.op).toBe(0)
			expect(payload.t).toBe('INTERACTION_CREATE')

			const data = payload.d as Record<string, unknown>
			expect(data.type).toBe(2) // ApplicationCommand

			const commandData = data.data as Record<string, unknown>
			expect(commandData.type).toBe(3) // MESSAGE command
			expect(commandData.target_id).toBe(targetMessage.id)

			const resolved = commandData.resolved as Record<string, Record<string, unknown>>
			expect(resolved.messages[targetMessage.id]).toBeDefined()
		})

		it('should build USER context menu in DM context (no member)', () => {
			const state = createSessionState()
			const targetUser = createMockUser({ username: 'DMTarget' })
			state.addUser(targetUser)

			const user = state.getOrCreateTestUser()
			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: state.applicationId,
				type: 2,
				token: 'test-token',
				channelId: generateSnowflake(),
				// No guildId - DM context
				userId: user.id,
				commandName: 'Get Info',
				targetId: targetUser.id,
				contextMenuType: 2,
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildContextMenuInteractionPayload({
				interaction,
				user,
				targetUser,
				sessionState: state,
				sequence: 1
			})

			const data = payload.d as Record<string, unknown>
			expect(data.guild_id).toBeUndefined()
			expect(data.user).toBeDefined()
			expect(data.member).toBeUndefined()

			const commandData = data.data as Record<string, unknown>
			const resolved = commandData.resolved as Record<string, Record<string, unknown>>
			expect(resolved.users).toBeDefined()
			expect(resolved.members).toBeUndefined()
		})

		it('should include command name in payload', () => {
			const state = createSessionState()
			createDefaultGuildWithChannel(state)

			const targetUser = createMockUser({ username: 'TargetUser' })
			state.addUser(targetUser)

			const user = state.getOrCreateTestUser()
			const firstGuild = state.guilds.values().next().value!
			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: state.applicationId,
				type: 2,
				token: 'test-token',
				channelId: firstGuild.channels[0],
				guildId: firstGuild.id,
				userId: user.id,
				commandName: 'Custom Command Name',
				targetId: targetUser.id,
				contextMenuType: 2,
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildContextMenuInteractionPayload({
				interaction,
				user,
				targetUser,
				sessionState: state,
				sequence: 1
			})

			const data = payload.d as Record<string, unknown>
			const commandData = data.data as Record<string, unknown>
			expect(commandData.name).toBe('Custom Command Name')
		})

		it('should include correct sequence number', () => {
			const state = createSessionState()
			createDefaultGuildWithChannel(state)

			const targetUser = createMockUser({ username: 'TargetUser' })
			state.addUser(targetUser)

			const user = state.getOrCreateTestUser()
			const firstGuild = state.guilds.values().next().value!
			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: state.applicationId,
				type: 2,
				token: 'test-token',
				channelId: firstGuild.channels[0],
				guildId: firstGuild.id,
				userId: user.id,
				commandName: 'Test Command',
				targetId: targetUser.id,
				contextMenuType: 2,
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildContextMenuInteractionPayload({
				interaction,
				user,
				targetUser,
				sessionState: state,
				sequence: 42
			})

			expect(payload.s).toBe(42)
		})
	})

	describe('Session.dispatchContextMenu', () => {
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

		it('should create USER context menu interaction in state', async () => {
			// Create a target user
			const targetUser = createMockUser({ username: 'TargetUser' })
			session.state.addUser(targetUser)

			const interaction = await session.dispatchContextMenu({
				commandName: 'Get Info',
				targetId: targetUser.id,
				contextMenuType: 2
			})

			expect(interaction.id).toBeDefined()
			expect(interaction.commandName).toBe('Get Info')
			expect(interaction.targetId).toBe(targetUser.id)
			expect(interaction.contextMenuType).toBe(2)
			expect(interaction.type).toBe(2) // ApplicationCommand

			// Verify interaction is stored in state
			const storedInteraction = session.state.getInteraction(interaction.id)
			expect(storedInteraction).toBeDefined()
			expect(storedInteraction?.targetId).toBe(targetUser.id)
		})

		it('should create MESSAGE context menu interaction in state', async () => {
			// Create a target message
			const user = session.state.getOrCreateTestUser()
			const firstGuild = session.state.guilds.values().next().value!
			const channelId = firstGuild.channels[0]

			const message = session.state.createMessage({
				channelId,
				guildId: firstGuild.id,
				authorId: user.id,
				content: 'Target message'
			})

			const interaction = await session.dispatchContextMenu({
				commandName: 'Report Message',
				targetId: message.id,
				contextMenuType: 3
			})

			expect(interaction.id).toBeDefined()
			expect(interaction.commandName).toBe('Report Message')
			expect(interaction.targetId).toBe(message.id)
			expect(interaction.contextMenuType).toBe(3)
			expect(interaction.channelId).toBe(channelId)
		})

		it('should throw error for MESSAGE context menu with non-existent message', async () => {
			await expect(
				session.dispatchContextMenu({
					commandName: 'Report Message',
					targetId: '999999999999999999',
					contextMenuType: 3
				})
			).rejects.toThrow('Target message not found')
		})

		it('should auto-create target user for USER context menu if not found', async () => {
			const fakeUserId = generateSnowflake()

			const interaction = await session.dispatchContextMenu({
				commandName: 'Get Info',
				targetId: fakeUserId,
				contextMenuType: 2
			})

			expect(interaction.targetId).toBe(fakeUserId)

			// User should have been auto-created
			const createdUser = session.state.getUser(fakeUserId)
			expect(createdUser).toBeDefined()
			expect(createdUser?.username).toBe('TargetUser')
		})

		it('should record dispatch action', async () => {
			const targetUser = createMockUser({ username: 'TargetUser' })
			session.state.addUser(targetUser)

			await session.dispatchContextMenu({
				commandName: 'Get Info',
				targetId: targetUser.id,
				contextMenuType: 2
			})

			const dispatches = session.recorder.getDispatches()
			expect(dispatches.length).toBeGreaterThan(0)
		})

		it('should generate valid interaction token', async () => {
			const targetUser = createMockUser({ username: 'TargetUser' })
			session.state.addUser(targetUser)

			const interaction = await session.dispatchContextMenu({
				commandName: 'Get Info',
				targetId: targetUser.id,
				contextMenuType: 2
			})

			expect(interaction.token).toBeDefined()
			expect(typeof interaction.token).toBe('string')
			expect(interaction.token.length).toBeGreaterThan(0)
		})

		it('should throw if session is ending', async () => {
			// Create a separate session for this test
			const endingSession = new Session({
				name: 'ending-session',
				config: { guilds: [{ name: 'Test Guild' }] }
			})

			// End the session
			await endingSession.end()

			await expect(
				endingSession.dispatchContextMenu({
					commandName: 'Get Info',
					targetId: '123456789',
					contextMenuType: 2
				})
			).rejects.toThrow('Cannot dispatch to ending session')
		})
	})
})
