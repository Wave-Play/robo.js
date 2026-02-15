/**
 * INTERACTION_CREATE Event Tests
 * Tests the INTERACTION_CREATE payload builder for slash commands, button clicks, select menus, and modals
 */
import { GatewayOpcodes, InteractionType, ApplicationCommandType, ComponentType } from 'discord-api-types/v10'
import { buildInteractionCreatePayload, buildButtonInteractionPayload, buildSelectMenuInteractionPayload, buildModalSubmitInteractionPayload } from '../src/discord/payloads.js'
import {
	createSessionState,
	createMockUser,
	createMockMessage,
	createDefaultGuildWithChannel
} from '../src/session/state.js'
import { Session } from '../src/session/session.js'
import { generateSnowflake } from '../src/utils/snowflake.js'
import { generateInteractionToken } from '../src/utils/id.js'
import type { MockInteraction, SessionState } from '../src/types/index.js'

describe('INTERACTION_CREATE Event', () => {
	describe('buildInteractionCreatePayload', () => {
		let sessionState: SessionState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should return op: 0 (DISPATCH)', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const user = createMockUser({ username: 'TestUser' })

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.ApplicationCommand,
				token: generateInteractionToken(),
				channelId,
				guildId: guild.id,
				userId: user.id,
				commandName: 'ping',
				commandId: generateSnowflake(),
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildInteractionCreatePayload({
				interaction,
				user,
				sessionState,
				sequence: 5
			})

			expect(payload.op).toBe(GatewayOpcodes.Dispatch)
			expect(payload.op).toBe(0)
		})

		it('should return specified sequence number', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const user = createMockUser({ username: 'TestUser' })

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.ApplicationCommand,
				token: generateInteractionToken(),
				channelId,
				guildId: guild.id,
				userId: user.id,
				commandName: 'test',
				commandId: generateSnowflake(),
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildInteractionCreatePayload({
				interaction,
				user,
				sessionState,
				sequence: 10
			})

			expect(payload.s).toBe(10)
		})

		it('should return t: "INTERACTION_CREATE"', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const user = createMockUser({ username: 'TestUser' })

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.ApplicationCommand,
				token: generateInteractionToken(),
				channelId,
				guildId: guild.id,
				userId: user.id,
				commandName: 'help',
				commandId: generateSnowflake(),
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildInteractionCreatePayload({
				interaction,
				user,
				sessionState,
				sequence: 5
			})

			expect(payload.t).toBe('INTERACTION_CREATE')
		})

		it('should include interaction type and command data', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const user = createMockUser({ username: 'CommandUser' })

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.ApplicationCommand,
				token: generateInteractionToken(),
				channelId,
				guildId: guild.id,
				userId: user.id,
				commandName: 'echo',
				commandId: generateSnowflake(),
				options: [{ name: 'message', type: 3, value: 'Hello!' }],
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildInteractionCreatePayload({
				interaction,
				user,
				sessionState,
				sequence: 5
			})

			const data = payload.d as Record<string, unknown>
			expect(data.type).toBe(InteractionType.ApplicationCommand)
			expect(data.token).toBe(interaction.token)

			const commandData = data.data as Record<string, unknown>
			expect(commandData.name).toBe('echo')
			expect(commandData.type).toBe(ApplicationCommandType.ChatInput)
		})

		it('should include guild_id and member for guild interactions', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const user = createMockUser({ username: 'GuildUser' })

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.ApplicationCommand,
				token: generateInteractionToken(),
				channelId,
				guildId: guild.id,
				userId: user.id,
				commandName: 'guild-command',
				commandId: generateSnowflake(),
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildInteractionCreatePayload({
				interaction,
				user,
				sessionState,
				sequence: 5
			})

			const data = payload.d as Record<string, unknown>
			expect(data.guild_id).toBe(guild.id)
			expect(data.member).toBeDefined()

			const member = data.member as Record<string, unknown>
			expect(member.user).toBeDefined()
			expect(member.roles).toEqual([])
		})

		it('should include user (not member) for DM interactions', () => {
			const user = createMockUser({ username: 'DMUser' })
			const dmChannel = sessionState.getOrCreateDMChannel(user.id)

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.ApplicationCommand,
				token: generateInteractionToken(),
				channelId: dmChannel.id,
				// No guildId = DM
				userId: user.id,
				commandName: 'dm-command',
				commandId: generateSnowflake(),
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildInteractionCreatePayload({
				interaction,
				user,
				sessionState,
				sequence: 5
			})

			const data = payload.d as Record<string, unknown>
			expect(data.guild_id).toBeUndefined()
			expect(data.member).toBeUndefined()
			expect(data.user).toBeDefined()

			const payloadUser = data.user as Record<string, unknown>
			expect(payloadUser.id).toBe(user.id)
			expect(payloadUser.username).toBe('DMUser')
		})

		it('should include command options', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const user = createMockUser({ username: 'OptionsUser' })

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.ApplicationCommand,
				token: generateInteractionToken(),
				channelId,
				guildId: guild.id,
				userId: user.id,
				commandName: 'options-test',
				commandId: generateSnowflake(),
				options: [
					{ name: 'text', type: 3, value: 'hello' },
					{ name: 'number', type: 4, value: 42 },
					{ name: 'flag', type: 5, value: true }
				],
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildInteractionCreatePayload({
				interaction,
				user,
				sessionState,
				sequence: 5
			})

			const data = payload.d as Record<string, unknown>
			const commandData = data.data as Record<string, unknown>
			const options = commandData.options as Array<Record<string, unknown>>

			expect(options).toHaveLength(3)
			expect(options[0]).toMatchObject({ name: 'text', type: 3, value: 'hello' })
			expect(options[1]).toMatchObject({ name: 'number', type: 4, value: 42 })
			expect(options[2]).toMatchObject({ name: 'flag', type: 5, value: true })
		})

		it('should match expected payload structure', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const user = createMockUser({ username: 'StructureTest' })

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.ApplicationCommand,
				token: generateInteractionToken(),
				channelId,
				guildId: guild.id,
				userId: user.id,
				commandName: 'complete-test',
				commandId: generateSnowflake(),
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildInteractionCreatePayload({
				interaction,
				user,
				sessionState,
				sequence: 5
			})

			expect(payload).toMatchObject({
				op: 0,
				s: 5,
				t: 'INTERACTION_CREATE',
				d: expect.objectContaining({
					id: interaction.id,
					application_id: sessionState.applicationId,
					type: InteractionType.ApplicationCommand,
					channel_id: channelId,
					guild_id: guild.id,
					token: interaction.token,
					version: 1,
					data: expect.objectContaining({
						name: 'complete-test',
						type: ApplicationCommandType.ChatInput
					}),
					member: expect.objectContaining({
						user: expect.objectContaining({
							id: user.id,
							username: 'StructureTest'
						}),
						roles: []
					})
				})
			})
		})
	})

	describe('MockServerState interaction storage', () => {
		let sessionState: SessionState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should add and retrieve interactions', () => {
			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.ApplicationCommand,
				token: generateInteractionToken(),
				channelId: '123456789',
				guildId: '987654321',
				userId: '111222333',
				commandName: 'test',
				commandId: generateSnowflake(),
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			sessionState.addInteraction(interaction)

			expect(sessionState.getInteraction(interaction.id)).toBe(interaction)
		})

		it('should retrieve interactions by token', () => {
			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.ApplicationCommand,
				token: generateInteractionToken(),
				channelId: '123456789',
				guildId: '987654321',
				userId: '111222333',
				commandName: 'test',
				commandId: generateSnowflake(),
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			sessionState.addInteraction(interaction)

			expect(sessionState.getInteractionByToken(interaction.token)).toBe(interaction)
		})

		it('should remove interactions', () => {
			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.ApplicationCommand,
				token: generateInteractionToken(),
				channelId: '123456789',
				userId: '111222333',
				commandName: 'test',
				commandId: generateSnowflake(),
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			sessionState.addInteraction(interaction)
			expect(sessionState.removeInteraction(interaction.id)).toBe(true)
			expect(sessionState.getInteraction(interaction.id)).toBeUndefined()
			expect(sessionState.getInteractionByToken(interaction.token)).toBeUndefined()
		})

		it('should cleanup expired interactions', () => {
			const expiredInteraction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.ApplicationCommand,
				token: generateInteractionToken(),
				channelId: '123456789',
				userId: '111222333',
				commandName: 'expired',
				commandId: generateSnowflake(),
				createdAt: Date.now() - 20 * 60 * 1000, // 20 minutes ago
				expiresAt: Date.now() - 5 * 60 * 1000 // Expired 5 minutes ago
			}

			const validInteraction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.ApplicationCommand,
				token: generateInteractionToken(),
				channelId: '123456789',
				userId: '111222333',
				commandName: 'valid',
				commandId: generateSnowflake(),
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			sessionState.addInteraction(expiredInteraction)
			sessionState.addInteraction(validInteraction)

			sessionState.cleanupExpiredInteractions()

			expect(sessionState.getInteraction(expiredInteraction.id)).toBeUndefined()
			expect(sessionState.getInteraction(validInteraction.id)).toBe(validInteraction)
		})

		it('should include interactions in serialized state', () => {
			const interaction: MockInteraction = {
				id: '123456789012345678',
				applicationId: sessionState.applicationId,
				type: InteractionType.ApplicationCommand,
				token: 'test-token',
				channelId: '123456789',
				guildId: '987654321',
				userId: '111222333',
				commandName: 'serialize-test',
				commandId: '888777666555444333',
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			sessionState.addInteraction(interaction)

			const serialized = sessionState.serialize()

			expect(serialized.interactions).toHaveLength(1)
			expect(serialized.interactions[0]).toMatchObject({
				id: '123456789012345678',
				commandName: 'serialize-test',
				token: 'test-token'
			})
		})
	})

	describe('Session.dispatchSlashCommand', () => {
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

		it('should create interaction in state', async () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]

			const interaction = await session.dispatchSlashCommand({
				commandName: 'ping',
				channelId
			})

			expect(interaction).toBeDefined()
			expect(interaction.commandName).toBe('ping')
			expect(interaction.channelId).toBe(channelId)
			expect(interaction.guildId).toBe(guild.id)

			// Verify interaction is in state
			const storedInteraction = session.state.getInteraction(interaction.id)
			expect(storedInteraction).toBeDefined()
			expect(storedInteraction?.commandName).toBe('ping')
		})

		it('should use provided user', async () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]

			const interaction = await session.dispatchSlashCommand({
				commandName: 'user-test',
				channelId,
				user: {
					id: '555666777',
					username: 'CustomUser',
					bot: false
				}
			})

			expect(interaction.userId).toBe('555666777')

			// Verify user is in state
			const user = session.state.getUser('555666777')
			expect(user).toBeDefined()
			expect(user?.username).toBe('CustomUser')
		})

		it('should create default test user if no user specified', async () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]

			const interaction = await session.dispatchSlashCommand({
				commandName: 'default-user-test',
				channelId
			})

			expect(interaction.userId).toBeDefined()

			// Verify a user was created
			const user = session.state.getUser(interaction.userId)
			expect(user).toBeDefined()
		})

		it('should convert options to array format', async () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]

			const interaction = await session.dispatchSlashCommand({
				commandName: 'options-test',
				channelId,
				options: {
					message: 'Hello!',
					count: 5,
					enabled: true
				}
			})

			expect(interaction.options).toBeDefined()
			expect(interaction.options).toHaveLength(3)

			// String option (type 3)
			const messageOpt = interaction.options?.find((o) => o.name === 'message')
			expect(messageOpt?.type).toBe(3)
			expect(messageOpt?.value).toBe('Hello!')

			// Integer option (type 4)
			const countOpt = interaction.options?.find((o) => o.name === 'count')
			expect(countOpt?.type).toBe(4)
			expect(countOpt?.value).toBe(5)

			// Boolean option (type 5)
			const enabledOpt = interaction.options?.find((o) => o.name === 'enabled')
			expect(enabledOpt?.type).toBe(5)
			expect(enabledOpt?.value).toBe(true)
		})

		it('should record dispatch action', async () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]

			await session.dispatchSlashCommand({
				commandName: 'recorded-command',
				channelId
			})

			const dispatches = session.getDispatches()
			expect(dispatches.length).toBeGreaterThan(0)

			const lastDispatch = dispatches[dispatches.length - 1]
			expect((lastDispatch.data as Record<string, unknown>).event).toBe('INTERACTION_CREATE')
		})

		it('should throw error when no channel available', async () => {
			// Create a new session without guilds
			const emptySession = new Session({ name: 'empty-session', config: { guilds: [] } })

			try {
				await expect(
					emptySession.dispatchSlashCommand({
						commandName: 'should-fail'
					})
				).rejects.toThrow('No channel specified and no channels available')
			} finally {
				await emptySession.end()
			}
		})

		it('should use first available channel if none specified', async () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const expectedChannelId = guild.channels[0]

			const interaction = await session.dispatchSlashCommand({
				commandName: 'auto-channel'
				// No channelId specified
			})

			expect(interaction.channelId).toBe(expectedChannelId)
		})

		it('should generate valid interaction token', async () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]

			const interaction = await session.dispatchSlashCommand({
				commandName: 'token-test',
				channelId
			})

			expect(interaction.token).toBeDefined()
			expect(typeof interaction.token).toBe('string')
			expect(interaction.token.length).toBeGreaterThan(0)

			// Token should be retrievable
			const retrieved = session.state.getInteractionByToken(interaction.token)
			expect(retrieved?.id).toBe(interaction.id)
		})

		it('should set correct expiration time (15 minutes)', async () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]

			const beforeCreate = Date.now()
			const interaction = await session.dispatchSlashCommand({
				commandName: 'expiry-test',
				channelId
			})
			const afterCreate = Date.now()

			// expiresAt should be approximately 15 minutes from creation
			const expectedMinExpiry = beforeCreate + 15 * 60 * 1000
			const expectedMaxExpiry = afterCreate + 15 * 60 * 1000

			expect(interaction.expiresAt).toBeGreaterThanOrEqual(expectedMinExpiry)
			expect(interaction.expiresAt).toBeLessThanOrEqual(expectedMaxExpiry)
		})
	})

	describe('Requirements Verification', () => {
		let sessionState: SessionState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('Task 1: Interaction payload builder exists and creates valid payload', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const user = createMockUser({ username: 'TestUser' })

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.ApplicationCommand,
				token: generateInteractionToken(),
				channelId,
				guildId: guild.id,
				userId: user.id,
				commandName: 'test-command',
				commandId: generateSnowflake(),
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildInteractionCreatePayload({
				interaction,
				user,
				sessionState,
				sequence: 5
			})

			expect(payload).toBeDefined()
			expect(payload.op).toBe(0)
			expect(payload.t).toBe('INTERACTION_CREATE')
			expect(payload.d).toBeDefined()
		})

		it('Task 2: MockInteraction type exists with correct fields', () => {
			const interaction: MockInteraction = {
				id: '123456789',
				applicationId: '987654321',
				type: 2,
				token: 'test-token',
				channelId: '111222333',
				guildId: '444555666',
				userId: '777888999',
				commandName: 'test',
				commandId: '000111222',
				options: [{ name: 'opt', type: 3, value: 'val' }],
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			expect(interaction.id).toBeDefined()
			expect(interaction.type).toBe(2)
			expect(interaction.commandName).toBe('test')
			expect(interaction.options).toHaveLength(1)
		})

		it('Task 3: Interactions can be stored and retrieved from state', () => {
			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.ApplicationCommand,
				token: generateInteractionToken(),
				channelId: '123',
				userId: '456',
				commandName: 'store-test',
				commandId: generateSnowflake(),
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			sessionState.addInteraction(interaction)

			expect(sessionState.getInteraction(interaction.id)).toBe(interaction)
			expect(sessionState.getInteractionByToken(interaction.token)).toBe(interaction)
		})

		it('Task 4: Session can dispatch slash commands', async () => {
			const session = new Session({
				name: 'test',
				config: { guilds: [{ name: 'Test Guild' }] }
			})

			try {
				const guild = Array.from(session.state.guilds.values())[0]
				const channelId = guild.channels[0]

				const interaction = await session.dispatchSlashCommand({
					commandName: 'dispatch-test',
					channelId
				})

				expect(interaction).toBeDefined()
				expect(interaction.commandName).toBe('dispatch-test')
			} finally {
				await session.end()
			}
		})

		it('Task 5: Dispatched interactions are recorded', async () => {
			const session = new Session({
				name: 'test',
				config: { guilds: [{ name: 'Test Guild' }] }
			})

			try {
				const guild = Array.from(session.state.guilds.values())[0]
				const channelId = guild.channels[0]

				await session.dispatchSlashCommand({
					commandName: 'record-test',
					channelId
				})

				const dispatches = session.getDispatches()
				const interactionDispatch = dispatches.find(
					(d) => (d.data as Record<string, unknown>).event === 'INTERACTION_CREATE'
				)

				expect(interactionDispatch).toBeDefined()
			} finally {
				await session.end()
			}
		})

		it('Task 6: Interaction token can be used for lookup', async () => {
			const session = new Session({
				name: 'test',
				config: { guilds: [{ name: 'Test Guild' }] }
			})

			try {
				const guild = Array.from(session.state.guilds.values())[0]
				const channelId = guild.channels[0]

				const interaction = await session.dispatchSlashCommand({
					commandName: 'token-lookup-test',
					channelId
				})

				const retrieved = session.state.getInteractionByToken(interaction.token)
				expect(retrieved).toBeDefined()
				expect(retrieved?.id).toBe(interaction.id)
				expect(retrieved?.commandName).toBe('token-lookup-test')
			} finally {
				await session.end()
			}
		})
	})
})

describe('Button Interactions', () => {
	describe('buildButtonInteractionPayload', () => {
		let sessionState: SessionState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should return op: 0 (DISPATCH)', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const user = createMockUser({ username: 'ButtonUser' })

			// Create a message to click the button on
			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: 'Click the button!'
			})

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.MessageComponent,
				token: generateInteractionToken(),
				channelId,
				guildId: guild.id,
				userId: user.id,
				customId: 'my-button',
				componentType: ComponentType.Button,
				messageId: message.id,
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildButtonInteractionPayload({
				interaction,
				user,
				message,
				sessionState,
				sequence: 5
			})

			expect(payload.op).toBe(GatewayOpcodes.Dispatch)
			expect(payload.op).toBe(0)
		})

		it('should return t: "INTERACTION_CREATE"', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const user = createMockUser({ username: 'ButtonUser' })

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: 'Click me!'
			})

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.MessageComponent,
				token: generateInteractionToken(),
				channelId,
				guildId: guild.id,
				userId: user.id,
				customId: 'test-button',
				componentType: ComponentType.Button,
				messageId: message.id,
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildButtonInteractionPayload({
				interaction,
				user,
				message,
				sessionState,
				sequence: 5
			})

			expect(payload.t).toBe('INTERACTION_CREATE')
		})

		it('should include type: 3 (MessageComponent)', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const user = createMockUser({ username: 'TestUser' })

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: 'Button message'
			})

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.MessageComponent,
				token: generateInteractionToken(),
				channelId,
				guildId: guild.id,
				userId: user.id,
				customId: 'type-test',
				componentType: ComponentType.Button,
				messageId: message.id,
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildButtonInteractionPayload({
				interaction,
				user,
				message,
				sessionState,
				sequence: 5
			})

			const data = payload.d as Record<string, unknown>
			expect(data.type).toBe(InteractionType.MessageComponent)
			expect(data.type).toBe(3)
		})

		it('should include data.component_type: 2 (Button)', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const user = createMockUser({ username: 'TestUser' })

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: 'Component type test'
			})

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.MessageComponent,
				token: generateInteractionToken(),
				channelId,
				guildId: guild.id,
				userId: user.id,
				customId: 'component-type-test',
				componentType: ComponentType.Button,
				messageId: message.id,
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildButtonInteractionPayload({
				interaction,
				user,
				message,
				sessionState,
				sequence: 5
			})

			const data = payload.d as Record<string, unknown>
			const componentData = data.data as Record<string, unknown>
			expect(componentData.component_type).toBe(ComponentType.Button)
			expect(componentData.component_type).toBe(2)
		})

		it('should include data.custom_id', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const user = createMockUser({ username: 'TestUser' })

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: 'Custom ID test'
			})

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.MessageComponent,
				token: generateInteractionToken(),
				channelId,
				guildId: guild.id,
				userId: user.id,
				customId: 'my-unique-button-id',
				componentType: ComponentType.Button,
				messageId: message.id,
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildButtonInteractionPayload({
				interaction,
				user,
				message,
				sessionState,
				sequence: 5
			})

			const data = payload.d as Record<string, unknown>
			const componentData = data.data as Record<string, unknown>
			expect(componentData.custom_id).toBe('my-unique-button-id')
		})

		it('should include source message reference', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const user = createMockUser({ username: 'TestUser' })

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: 'This message has a button'
			})

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.MessageComponent,
				token: generateInteractionToken(),
				channelId,
				guildId: guild.id,
				userId: user.id,
				customId: 'message-ref-test',
				componentType: ComponentType.Button,
				messageId: message.id,
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildButtonInteractionPayload({
				interaction,
				user,
				message,
				sessionState,
				sequence: 5
			})

			const data = payload.d as Record<string, unknown>
			const payloadMessage = data.message as Record<string, unknown>
			expect(payloadMessage).toBeDefined()
			expect(payloadMessage.id).toBe(message.id)
			expect(payloadMessage.content).toBe('This message has a button')
			expect(payloadMessage.channel_id).toBe(channelId)
		})

		it('should include guild_id and member for guild interactions', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const user = createMockUser({ username: 'GuildUser' })

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: 'Guild button'
			})

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.MessageComponent,
				token: generateInteractionToken(),
				channelId,
				guildId: guild.id,
				userId: user.id,
				customId: 'guild-button',
				componentType: ComponentType.Button,
				messageId: message.id,
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildButtonInteractionPayload({
				interaction,
				user,
				message,
				sessionState,
				sequence: 5
			})

			const data = payload.d as Record<string, unknown>
			expect(data.guild_id).toBe(guild.id)
			expect(data.member).toBeDefined()

			const member = data.member as Record<string, unknown>
			expect(member.user).toBeDefined()
			expect(member.roles).toEqual([])
		})

		it('should include user (not member) for DM interactions', () => {
			const user = createMockUser({ username: 'DMUser' })
			const dmChannel = sessionState.getOrCreateDMChannel(user.id)

			const message = sessionState.createMessage({
				channelId: dmChannel.id,
				authorId: sessionState.botUser.id,
				content: 'DM button'
			})

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.MessageComponent,
				token: generateInteractionToken(),
				channelId: dmChannel.id,
				// No guildId = DM
				userId: user.id,
				customId: 'dm-button',
				componentType: ComponentType.Button,
				messageId: message.id,
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildButtonInteractionPayload({
				interaction,
				user,
				message,
				sessionState,
				sequence: 5
			})

			const data = payload.d as Record<string, unknown>
			expect(data.guild_id).toBeUndefined()
			expect(data.member).toBeUndefined()
			expect(data.user).toBeDefined()

			const payloadUser = data.user as Record<string, unknown>
			expect(payloadUser.id).toBe(user.id)
			expect(payloadUser.username).toBe('DMUser')
		})

		it('should match expected payload structure', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const user = createMockUser({ username: 'StructureTest' })

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: 'Structure test message'
			})

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.MessageComponent,
				token: generateInteractionToken(),
				channelId,
				guildId: guild.id,
				userId: user.id,
				customId: 'structure-test-button',
				componentType: ComponentType.Button,
				messageId: message.id,
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildButtonInteractionPayload({
				interaction,
				user,
				message,
				sessionState,
				sequence: 10
			})

			expect(payload).toMatchObject({
				op: 0,
				s: 10,
				t: 'INTERACTION_CREATE',
				d: expect.objectContaining({
					id: interaction.id,
					application_id: sessionState.applicationId,
					type: InteractionType.MessageComponent,
					channel_id: channelId,
					guild_id: guild.id,
					token: interaction.token,
					version: 1,
					data: expect.objectContaining({
						component_type: ComponentType.Button,
						custom_id: 'structure-test-button'
					}),
					message: expect.objectContaining({
						id: message.id,
						content: 'Structure test message'
					}),
					member: expect.objectContaining({
						user: expect.objectContaining({
							id: user.id,
							username: 'StructureTest'
						}),
						roles: []
					})
				})
			})
		})
	})

	describe('Session.dispatchButtonClick', () => {
		let session: Session

		beforeEach(() => {
			session = new Session({
				name: 'button-test-session',
				config: {
					guilds: [{ name: 'Test Guild' }]
				}
			})
		})

		afterEach(async () => {
			await session.end()
		})

		it('should create interaction in state', async () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]

			// Create a message first
			const message = session.state.createMessage({
				channelId,
				guildId: guild.id,
				authorId: session.state.botUser.id,
				content: 'Button message'
			})

			const interaction = await session.dispatchButtonClick({
				customId: 'test-button',
				messageId: message.id
			})

			expect(interaction).toBeDefined()
			expect(interaction.customId).toBe('test-button')
			expect(interaction.messageId).toBe(message.id)
			expect(interaction.type).toBe(3) // MessageComponent

			// Verify interaction is in state
			const storedInteraction = session.state.getInteraction(interaction.id)
			expect(storedInteraction).toBeDefined()
			expect(storedInteraction?.customId).toBe('test-button')
		})

		it('should require message to exist', async () => {
			await expect(
				session.dispatchButtonClick({
					customId: 'test-button',
					messageId: '999999999999999999' // Non-existent message
				})
			).rejects.toThrow('Message not found')
		})

		it('should derive channel/guild from message', async () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]

			const message = session.state.createMessage({
				channelId,
				guildId: guild.id,
				authorId: session.state.botUser.id,
				content: 'Derive test'
			})

			const interaction = await session.dispatchButtonClick({
				customId: 'derive-test',
				messageId: message.id
				// Not specifying channelId or guildId
			})

			expect(interaction.channelId).toBe(channelId)
			expect(interaction.guildId).toBe(guild.id)
		})

		it('should use provided user', async () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]

			const message = session.state.createMessage({
				channelId,
				guildId: guild.id,
				authorId: session.state.botUser.id,
				content: 'User test'
			})

			const interaction = await session.dispatchButtonClick({
				customId: 'user-test',
				messageId: message.id,
				user: {
					id: '555666777',
					username: 'ButtonClicker',
					bot: false
				}
			})

			expect(interaction.userId).toBe('555666777')

			// Verify user is in state
			const user = session.state.getUser('555666777')
			expect(user).toBeDefined()
			expect(user?.username).toBe('ButtonClicker')
		})

		it('should record dispatch action', async () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]

			const message = session.state.createMessage({
				channelId,
				guildId: guild.id,
				authorId: session.state.botUser.id,
				content: 'Record test'
			})

			await session.dispatchButtonClick({
				customId: 'recorded-button',
				messageId: message.id
			})

			const dispatches = session.getDispatches()
			expect(dispatches.length).toBeGreaterThan(0)

			const lastDispatch = dispatches[dispatches.length - 1]
			expect((lastDispatch.data as Record<string, unknown>).event).toBe('INTERACTION_CREATE')
		})

		it('should generate valid interaction token', async () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]

			const message = session.state.createMessage({
				channelId,
				guildId: guild.id,
				authorId: session.state.botUser.id,
				content: 'Token test'
			})

			const interaction = await session.dispatchButtonClick({
				customId: 'token-test',
				messageId: message.id
			})

			expect(interaction.token).toBeDefined()
			expect(typeof interaction.token).toBe('string')
			expect(interaction.token.length).toBeGreaterThan(0)

			// Token should be retrievable
			const retrieved = session.state.getInteractionByToken(interaction.token)
			expect(retrieved?.id).toBe(interaction.id)
		})

		it('should set correct expiration time (15 minutes)', async () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]

			const message = session.state.createMessage({
				channelId,
				guildId: guild.id,
				authorId: session.state.botUser.id,
				content: 'Expiry test'
			})

			const beforeCreate = Date.now()
			const interaction = await session.dispatchButtonClick({
				customId: 'expiry-test',
				messageId: message.id
			})
			const afterCreate = Date.now()

			// expiresAt should be approximately 15 minutes from creation
			const expectedMinExpiry = beforeCreate + 15 * 60 * 1000
			const expectedMaxExpiry = afterCreate + 15 * 60 * 1000

			expect(interaction.expiresAt).toBeGreaterThanOrEqual(expectedMinExpiry)
			expect(interaction.expiresAt).toBeLessThanOrEqual(expectedMaxExpiry)
		})

		it('should set componentType to 2 (Button)', async () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]

			const message = session.state.createMessage({
				channelId,
				guildId: guild.id,
				authorId: session.state.botUser.id,
				content: 'Component type test'
			})

			const interaction = await session.dispatchButtonClick({
				customId: 'component-test',
				messageId: message.id
			})

			expect(interaction.componentType).toBe(2) // ComponentType.Button
		})
	})

	describe('Requirements Verification', () => {
		let sessionState: SessionState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('Task 1: Creates interaction payload for MESSAGE_COMPONENT (type 3)', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const user = createMockUser({ username: 'TestUser' })

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: 'Verification message'
			})

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.MessageComponent,
				token: generateInteractionToken(),
				channelId,
				guildId: guild.id,
				userId: user.id,
				customId: 'verify-button',
				componentType: ComponentType.Button,
				messageId: message.id,
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildButtonInteractionPayload({
				interaction,
				user,
				message,
				sessionState,
				sequence: 5
			})

			expect(payload).toBeDefined()
			expect(payload.op).toBe(0)
			expect(payload.t).toBe('INTERACTION_CREATE')

			const data = payload.d as Record<string, unknown>
			expect(data.type).toBe(InteractionType.MessageComponent)
			expect(data.type).toBe(3)
		})

		it('Task 2: Includes component_type: 2 (button)', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const user = createMockUser({ username: 'TestUser' })

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: 'Task 2 message'
			})

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.MessageComponent,
				token: generateInteractionToken(),
				channelId,
				guildId: guild.id,
				userId: user.id,
				customId: 'task2-button',
				componentType: ComponentType.Button,
				messageId: message.id,
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildButtonInteractionPayload({
				interaction,
				user,
				message,
				sessionState,
				sequence: 5
			})

			const data = payload.d as Record<string, unknown>
			const componentData = data.data as Record<string, unknown>
			expect(componentData.component_type).toBe(ComponentType.Button)
			expect(componentData.component_type).toBe(2)
		})

		it('Task 3: Includes custom_id', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const user = createMockUser({ username: 'TestUser' })

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: 'Task 3 message'
			})

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.MessageComponent,
				token: generateInteractionToken(),
				channelId,
				guildId: guild.id,
				userId: user.id,
				customId: 'unique-custom-id-12345',
				componentType: ComponentType.Button,
				messageId: message.id,
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildButtonInteractionPayload({
				interaction,
				user,
				message,
				sessionState,
				sequence: 5
			})

			const data = payload.d as Record<string, unknown>
			const componentData = data.data as Record<string, unknown>
			expect(componentData.custom_id).toBe('unique-custom-id-12345')
		})

		it('Task 4: Includes source message reference', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const user = createMockUser({ username: 'TestUser' })

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: 'Source message for task 4'
			})

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.MessageComponent,
				token: generateInteractionToken(),
				channelId,
				guildId: guild.id,
				userId: user.id,
				customId: 'task4-button',
				componentType: ComponentType.Button,
				messageId: message.id,
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildButtonInteractionPayload({
				interaction,
				user,
				message,
				sessionState,
				sequence: 5
			})

			const data = payload.d as Record<string, unknown>
			const payloadMessage = data.message as Record<string, unknown>
			expect(payloadMessage).toBeDefined()
			expect(payloadMessage.id).toBe(message.id)
			expect(payloadMessage.content).toBe('Source message for task 4')
		})
	})
})

// ============================================================================
// INTERACTION_CREATE - Select Menu
// ============================================================================

describe('Select Menu Interactions', () => {
	describe('buildSelectMenuInteractionPayload', () => {
		let sessionState: SessionState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should return op: 0 (DISPATCH)', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const user = createMockUser({ username: 'SelectUser' })

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: 'Select an option!'
			})

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.MessageComponent,
				token: generateInteractionToken(),
				channelId,
				guildId: guild.id,
				userId: user.id,
				customId: 'my-select',
				componentType: ComponentType.StringSelect,
				messageId: message.id,
				values: ['option1'],
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildSelectMenuInteractionPayload({
				interaction,
				user,
				message,
				values: ['option1'],
				sessionState,
				sequence: 5
			})

			expect(payload.op).toBe(GatewayOpcodes.Dispatch)
			expect(payload.op).toBe(0)
		})

		it('should return t: "INTERACTION_CREATE"', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const user = createMockUser({ username: 'SelectUser' })

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: 'Select menu test'
			})

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.MessageComponent,
				token: generateInteractionToken(),
				channelId,
				guildId: guild.id,
				userId: user.id,
				customId: 'test-select',
				componentType: ComponentType.StringSelect,
				messageId: message.id,
				values: ['value1'],
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildSelectMenuInteractionPayload({
				interaction,
				user,
				message,
				values: ['value1'],
				sessionState,
				sequence: 5
			})

			expect(payload.t).toBe('INTERACTION_CREATE')
		})

		it('should include type: 3 (MessageComponent)', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const user = createMockUser({ username: 'TestUser' })

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: 'Component type test'
			})

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.MessageComponent,
				token: generateInteractionToken(),
				channelId,
				guildId: guild.id,
				userId: user.id,
				customId: 'type-test',
				componentType: ComponentType.StringSelect,
				messageId: message.id,
				values: ['test'],
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildSelectMenuInteractionPayload({
				interaction,
				user,
				message,
				values: ['test'],
				sessionState,
				sequence: 5
			})

			const data = payload.d as Record<string, unknown>
			expect(data.type).toBe(InteractionType.MessageComponent)
			expect(data.type).toBe(3)
		})

		it('should include data.component_type: 3 (StringSelect)', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const user = createMockUser({ username: 'TestUser' })

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: 'String select test'
			})

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.MessageComponent,
				token: generateInteractionToken(),
				channelId,
				guildId: guild.id,
				userId: user.id,
				customId: 'string-select',
				componentType: ComponentType.StringSelect,
				messageId: message.id,
				values: ['option1'],
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildSelectMenuInteractionPayload({
				interaction,
				user,
				message,
				values: ['option1'],
				sessionState,
				sequence: 5
			})

			const data = payload.d as Record<string, unknown>
			const componentData = data.data as Record<string, unknown>
			expect(componentData.component_type).toBe(ComponentType.StringSelect)
			expect(componentData.component_type).toBe(3)
		})

		it('should include data.component_type: 5 (UserSelect)', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const user = createMockUser({ username: 'TestUser' })

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: 'User select test'
			})

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.MessageComponent,
				token: generateInteractionToken(),
				channelId,
				guildId: guild.id,
				userId: user.id,
				customId: 'user-select',
				componentType: ComponentType.UserSelect,
				messageId: message.id,
				values: [user.id],
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildSelectMenuInteractionPayload({
				interaction,
				user,
				message,
				values: [user.id],
				sessionState,
				sequence: 5
			})

			const data = payload.d as Record<string, unknown>
			const componentData = data.data as Record<string, unknown>
			expect(componentData.component_type).toBe(ComponentType.UserSelect)
			expect(componentData.component_type).toBe(5)
		})

		it('should include data.custom_id', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const user = createMockUser({ username: 'TestUser' })

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: 'Custom ID test'
			})

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.MessageComponent,
				token: generateInteractionToken(),
				channelId,
				guildId: guild.id,
				userId: user.id,
				customId: 'my-unique-select-id',
				componentType: ComponentType.StringSelect,
				messageId: message.id,
				values: ['selected'],
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildSelectMenuInteractionPayload({
				interaction,
				user,
				message,
				values: ['selected'],
				sessionState,
				sequence: 5
			})

			const data = payload.d as Record<string, unknown>
			const componentData = data.data as Record<string, unknown>
			expect(componentData.custom_id).toBe('my-unique-select-id')
		})

		it('should include data.values array', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const user = createMockUser({ username: 'TestUser' })

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: 'Values test'
			})

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.MessageComponent,
				token: generateInteractionToken(),
				channelId,
				guildId: guild.id,
				userId: user.id,
				customId: 'values-test',
				componentType: ComponentType.StringSelect,
				messageId: message.id,
				values: ['option1', 'option2', 'option3'],
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildSelectMenuInteractionPayload({
				interaction,
				user,
				message,
				values: ['option1', 'option2', 'option3'],
				sessionState,
				sequence: 5
			})

			const data = payload.d as Record<string, unknown>
			const componentData = data.data as Record<string, unknown>
			expect(componentData.values).toEqual(['option1', 'option2', 'option3'])
		})

		it('should include source message reference', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const user = createMockUser({ username: 'TestUser' })

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: 'Message with select menu'
			})

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.MessageComponent,
				token: generateInteractionToken(),
				channelId,
				guildId: guild.id,
				userId: user.id,
				customId: 'message-ref-test',
				componentType: ComponentType.StringSelect,
				messageId: message.id,
				values: ['test'],
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildSelectMenuInteractionPayload({
				interaction,
				user,
				message,
				values: ['test'],
				sessionState,
				sequence: 5
			})

			const data = payload.d as Record<string, unknown>
			const payloadMessage = data.message as Record<string, unknown>
			expect(payloadMessage).toBeDefined()
			expect(payloadMessage.id).toBe(message.id)
			expect(payloadMessage.content).toBe('Message with select menu')
		})

		it('should include guild_id and member for guild interactions', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const user = createMockUser({ username: 'GuildUser' })

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: 'Guild select'
			})

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.MessageComponent,
				token: generateInteractionToken(),
				channelId,
				guildId: guild.id,
				userId: user.id,
				customId: 'guild-select',
				componentType: ComponentType.StringSelect,
				messageId: message.id,
				values: ['guild-value'],
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildSelectMenuInteractionPayload({
				interaction,
				user,
				message,
				values: ['guild-value'],
				sessionState,
				sequence: 5
			})

			const data = payload.d as Record<string, unknown>
			expect(data.guild_id).toBe(guild.id)
			expect(data.member).toBeDefined()

			const member = data.member as Record<string, unknown>
			expect(member.user).toBeDefined()
			expect(member.roles).toEqual([])
		})

		it('should include user (not member) for DM interactions', () => {
			const user = createMockUser({ username: 'DMUser' })
			const dmChannel = sessionState.getOrCreateDMChannel(user.id)

			const message = sessionState.createMessage({
				channelId: dmChannel.id,
				authorId: sessionState.botUser.id,
				content: 'DM select'
			})

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.MessageComponent,
				token: generateInteractionToken(),
				channelId: dmChannel.id,
				// No guildId = DM
				userId: user.id,
				customId: 'dm-select',
				componentType: ComponentType.StringSelect,
				messageId: message.id,
				values: ['dm-value'],
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildSelectMenuInteractionPayload({
				interaction,
				user,
				message,
				values: ['dm-value'],
				sessionState,
				sequence: 5
			})

			const data = payload.d as Record<string, unknown>
			expect(data.guild_id).toBeUndefined()
			expect(data.member).toBeUndefined()
			expect(data.user).toBeDefined()

			const payloadUser = data.user as Record<string, unknown>
			expect(payloadUser.id).toBe(user.id)
			expect(payloadUser.username).toBe('DMUser')
		})

		it('should match expected payload structure', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const user = createMockUser({ username: 'StructureTest' })

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: 'Structure test message'
			})

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.MessageComponent,
				token: generateInteractionToken(),
				channelId,
				guildId: guild.id,
				userId: user.id,
				customId: 'structure-test-select',
				componentType: ComponentType.StringSelect,
				messageId: message.id,
				values: ['selected1', 'selected2'],
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildSelectMenuInteractionPayload({
				interaction,
				user,
				message,
				values: ['selected1', 'selected2'],
				sessionState,
				sequence: 10
			})

			expect(payload).toMatchObject({
				op: 0,
				s: 10,
				t: 'INTERACTION_CREATE',
				d: expect.objectContaining({
					id: interaction.id,
					application_id: sessionState.applicationId,
					type: InteractionType.MessageComponent,
					channel_id: channelId,
					guild_id: guild.id,
					token: interaction.token,
					version: 1,
					data: expect.objectContaining({
						component_type: ComponentType.StringSelect,
						custom_id: 'structure-test-select',
						values: ['selected1', 'selected2']
					}),
					message: expect.objectContaining({
						id: message.id,
						content: 'Structure test message'
					}),
					member: expect.objectContaining({
						user: expect.objectContaining({
							id: user.id,
							username: 'StructureTest'
						}),
						roles: []
					})
				})
			})
		})
	})

	describe('Session.dispatchSelectMenu', () => {
		let session: Session

		beforeEach(() => {
			session = new Session({
				name: 'select-test-session',
				config: {
					guilds: [{ name: 'Test Guild' }]
				}
			})
		})

		afterEach(async () => {
			await session.end()
		})

		it('should create interaction in state', async () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]

			const message = session.state.createMessage({
				channelId,
				guildId: guild.id,
				authorId: session.state.botUser.id,
				content: 'Select menu message'
			})

			const interaction = await session.dispatchSelectMenu({
				customId: 'test-select',
				messageId: message.id,
				values: ['option1', 'option2']
			})

			expect(interaction).toBeDefined()
			expect(interaction.customId).toBe('test-select')
			expect(interaction.messageId).toBe(message.id)
			expect(interaction.values).toEqual(['option1', 'option2'])
			expect(interaction.type).toBe(3) // MessageComponent

			// Verify interaction is in state
			const storedInteraction = session.state.getInteraction(interaction.id)
			expect(storedInteraction).toBeDefined()
			expect(storedInteraction?.customId).toBe('test-select')
			expect(storedInteraction?.values).toEqual(['option1', 'option2'])
		})

		it('should require message to exist', async () => {
			await expect(
				session.dispatchSelectMenu({
					customId: 'test-select',
					messageId: '999999999999999999',
					values: ['option1']
				})
			).rejects.toThrow('Message not found')
		})

		it('should derive channel/guild from message', async () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]

			const message = session.state.createMessage({
				channelId,
				guildId: guild.id,
				authorId: session.state.botUser.id,
				content: 'Derive test'
			})

			const interaction = await session.dispatchSelectMenu({
				customId: 'derive-test',
				messageId: message.id,
				values: ['test']
				// Not specifying channelId or guildId
			})

			expect(interaction.channelId).toBe(channelId)
			expect(interaction.guildId).toBe(guild.id)
		})

		it('should use provided user', async () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]

			const message = session.state.createMessage({
				channelId,
				guildId: guild.id,
				authorId: session.state.botUser.id,
				content: 'User test'
			})

			const interaction = await session.dispatchSelectMenu({
				customId: 'user-test',
				messageId: message.id,
				values: ['test'],
				user: {
					id: '555666777',
					username: 'SelectUser',
					bot: false
				}
			})

			expect(interaction.userId).toBe('555666777')

			// Verify user is in state
			const user = session.state.getUser('555666777')
			expect(user).toBeDefined()
			expect(user?.username).toBe('SelectUser')
		})

		it('should record dispatch action', async () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]

			const message = session.state.createMessage({
				channelId,
				guildId: guild.id,
				authorId: session.state.botUser.id,
				content: 'Record test'
			})

			await session.dispatchSelectMenu({
				customId: 'recorded-select',
				messageId: message.id,
				values: ['test']
			})

			const dispatches = session.getDispatches()
			expect(dispatches.length).toBeGreaterThan(0)

			const lastDispatch = dispatches[dispatches.length - 1]
			expect((lastDispatch.data as Record<string, unknown>).event).toBe('INTERACTION_CREATE')
		})

		it('should default componentType to 3 (StringSelect)', async () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]

			const message = session.state.createMessage({
				channelId,
				guildId: guild.id,
				authorId: session.state.botUser.id,
				content: 'Default type test'
			})

			const interaction = await session.dispatchSelectMenu({
				customId: 'default-type',
				messageId: message.id,
				values: ['test']
				// Not specifying componentType
			})

			expect(interaction.componentType).toBe(3) // ComponentType.StringSelect
		})

		it('should use specified componentType', async () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]

			const message = session.state.createMessage({
				channelId,
				guildId: guild.id,
				authorId: session.state.botUser.id,
				content: 'User select test'
			})

			const interaction = await session.dispatchSelectMenu({
				customId: 'user-select',
				messageId: message.id,
				values: ['123456789'],
				componentType: 5 // UserSelect
			})

			expect(interaction.componentType).toBe(5)
		})

		it('should generate valid interaction token', async () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]

			const message = session.state.createMessage({
				channelId,
				guildId: guild.id,
				authorId: session.state.botUser.id,
				content: 'Token test'
			})

			const interaction = await session.dispatchSelectMenu({
				customId: 'token-test',
				messageId: message.id,
				values: ['test']
			})

			expect(interaction.token).toBeDefined()
			expect(typeof interaction.token).toBe('string')
			expect(interaction.token.length).toBeGreaterThan(0)

			// Token should be retrievable
			const retrieved = session.state.getInteractionByToken(interaction.token)
			expect(retrieved?.id).toBe(interaction.id)
		})

		it('should set correct expiration time (15 minutes)', async () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]

			const message = session.state.createMessage({
				channelId,
				guildId: guild.id,
				authorId: session.state.botUser.id,
				content: 'Expiry test'
			})

			const beforeCreate = Date.now()
			const interaction = await session.dispatchSelectMenu({
				customId: 'expiry-test',
				messageId: message.id,
				values: ['test']
			})
			const afterCreate = Date.now()

			const expectedMinExpiry = beforeCreate + 15 * 60 * 1000
			const expectedMaxExpiry = afterCreate + 15 * 60 * 1000

			expect(interaction.expiresAt).toBeGreaterThanOrEqual(expectedMinExpiry)
			expect(interaction.expiresAt).toBeLessThanOrEqual(expectedMaxExpiry)
		})
	})

	describe('Requirements Verification', () => {
		let sessionState: SessionState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('Task 1: Creates interaction payload for MESSAGE_COMPONENT (type 3) with select menu', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const user = createMockUser({ username: 'TestUser' })

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: 'Verification message'
			})

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.MessageComponent,
				token: generateInteractionToken(),
				channelId,
				guildId: guild.id,
				userId: user.id,
				customId: 'verify-select',
				componentType: ComponentType.StringSelect,
				messageId: message.id,
				values: ['value1'],
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildSelectMenuInteractionPayload({
				interaction,
				user,
				message,
				values: ['value1'],
				sessionState,
				sequence: 5
			})

			expect(payload).toBeDefined()
			expect(payload.op).toBe(0)
			expect(payload.t).toBe('INTERACTION_CREATE')

			const data = payload.d as Record<string, unknown>
			expect(data.type).toBe(InteractionType.MessageComponent)
			expect(data.type).toBe(3)
		})

		it('Task 2: Includes component_type for different select menu types', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const user = createMockUser({ username: 'TestUser' })

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: 'Task 2 message'
			})

			// Test each select menu type
			const selectTypes = [
				{ type: ComponentType.StringSelect, expected: 3 },
				{ type: ComponentType.UserSelect, expected: 5 },
				{ type: ComponentType.RoleSelect, expected: 6 },
				{ type: ComponentType.MentionableSelect, expected: 7 },
				{ type: ComponentType.ChannelSelect, expected: 8 }
			]

			for (const { type, expected } of selectTypes) {
				const interaction: MockInteraction = {
					id: generateSnowflake(),
					applicationId: sessionState.applicationId,
					type: InteractionType.MessageComponent,
					token: generateInteractionToken(),
					channelId,
					guildId: guild.id,
					userId: user.id,
					customId: `type-${expected}-select`,
					componentType: type,
					messageId: message.id,
					values: ['test'],
					createdAt: Date.now(),
					expiresAt: Date.now() + 15 * 60 * 1000
				}

				const payload = buildSelectMenuInteractionPayload({
					interaction,
					user,
					message,
					values: ['test'],
					sessionState,
					sequence: 5
				})

				const data = payload.d as Record<string, unknown>
				const componentData = data.data as Record<string, unknown>
				expect(componentData.component_type).toBe(expected)
			}
		})

		it('Task 3: Includes values array', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const user = createMockUser({ username: 'TestUser' })

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: 'Task 3 message'
			})

			const testValues = ['value1', 'value2', 'value3']

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.MessageComponent,
				token: generateInteractionToken(),
				channelId,
				guildId: guild.id,
				userId: user.id,
				customId: 'values-test',
				componentType: ComponentType.StringSelect,
				messageId: message.id,
				values: testValues,
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildSelectMenuInteractionPayload({
				interaction,
				user,
				message,
				values: testValues,
				sessionState,
				sequence: 5
			})

			const data = payload.d as Record<string, unknown>
			const componentData = data.data as Record<string, unknown>
			expect(componentData.values).toEqual(testValues)
		})

		it('Task 4: Includes source message reference', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const user = createMockUser({ username: 'TestUser' })

			const message = sessionState.createMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: 'Source message for task 4'
			})

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.MessageComponent,
				token: generateInteractionToken(),
				channelId,
				guildId: guild.id,
				userId: user.id,
				customId: 'task4-select',
				componentType: ComponentType.StringSelect,
				messageId: message.id,
				values: ['test'],
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildSelectMenuInteractionPayload({
				interaction,
				user,
				message,
				values: ['test'],
				sessionState,
				sequence: 5
			})

			const data = payload.d as Record<string, unknown>
			const payloadMessage = data.message as Record<string, unknown>
			expect(payloadMessage).toBeDefined()
			expect(payloadMessage.id).toBe(message.id)
			expect(payloadMessage.content).toBe('Source message for task 4')
		})
	})
})

// ============================================================================
// INTERACTION_CREATE - Modal Submit
// ============================================================================

describe('Modal Submit Interactions', () => {
	describe('buildModalSubmitInteractionPayload', () => {
		let sessionState: SessionState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should return op: 0 (DISPATCH)', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const user = createMockUser({ username: 'ModalUser' })

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.ModalSubmit,
				token: generateInteractionToken(),
				channelId,
				guildId: guild.id,
				userId: user.id,
				customId: 'feedback-modal',
				modalFields: { 'name-input': 'John', 'feedback-input': 'Great!' },
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildModalSubmitInteractionPayload({
				interaction,
				user,
				sessionState,
				sequence: 5
			})

			expect(payload.op).toBe(GatewayOpcodes.Dispatch)
			expect(payload.op).toBe(0)
		})

		it('should return t: "INTERACTION_CREATE"', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const user = createMockUser({ username: 'ModalUser' })

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.ModalSubmit,
				token: generateInteractionToken(),
				channelId,
				guildId: guild.id,
				userId: user.id,
				customId: 'test-modal',
				modalFields: { 'input': 'test value' },
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildModalSubmitInteractionPayload({
				interaction,
				user,
				sessionState,
				sequence: 5
			})

			expect(payload.t).toBe('INTERACTION_CREATE')
		})

		it('should include type: 5 (ModalSubmit)', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const user = createMockUser({ username: 'TestUser' })

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.ModalSubmit,
				token: generateInteractionToken(),
				channelId,
				guildId: guild.id,
				userId: user.id,
				customId: 'type-test-modal',
				modalFields: { 'field': 'value' },
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildModalSubmitInteractionPayload({
				interaction,
				user,
				sessionState,
				sequence: 5
			})

			const data = payload.d as Record<string, unknown>
			expect(data.type).toBe(InteractionType.ModalSubmit)
			expect(data.type).toBe(5)
		})

		it('should include data.custom_id', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const user = createMockUser({ username: 'TestUser' })

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.ModalSubmit,
				token: generateInteractionToken(),
				channelId,
				guildId: guild.id,
				userId: user.id,
				customId: 'my-unique-modal-id',
				modalFields: { 'field': 'value' },
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildModalSubmitInteractionPayload({
				interaction,
				user,
				sessionState,
				sequence: 5
			})

			const data = payload.d as Record<string, unknown>
			const modalData = data.data as Record<string, unknown>
			expect(modalData.custom_id).toBe('my-unique-modal-id')
		})

		it('should include data.components with text inputs', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const user = createMockUser({ username: 'TestUser' })

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.ModalSubmit,
				token: generateInteractionToken(),
				channelId,
				guildId: guild.id,
				userId: user.id,
				customId: 'components-test-modal',
				modalFields: {
					'name-input': 'John Doe',
					'email-input': 'john@example.com'
				},
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildModalSubmitInteractionPayload({
				interaction,
				user,
				sessionState,
				sequence: 5
			})

			const data = payload.d as Record<string, unknown>
			const modalData = data.data as Record<string, unknown>
			const components = modalData.components as Array<Record<string, unknown>>

			expect(components).toBeDefined()
			expect(components.length).toBe(2)

			// Each action row should have type 1 and contain a text input
			for (const actionRow of components) {
				expect(actionRow.type).toBe(1) // ActionRow
				const innerComponents = actionRow.components as Array<Record<string, unknown>>
				expect(innerComponents.length).toBe(1)
				expect(innerComponents[0].type).toBe(4) // TextInput
			}
		})

		it('should handle guild context (guild_id, member)', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const user = createMockUser({ username: 'GuildUser' })

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.ModalSubmit,
				token: generateInteractionToken(),
				channelId,
				guildId: guild.id,
				userId: user.id,
				customId: 'guild-modal',
				modalFields: { 'field': 'value' },
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildModalSubmitInteractionPayload({
				interaction,
				user,
				sessionState,
				sequence: 5
			})

			const data = payload.d as Record<string, unknown>
			expect(data.guild_id).toBe(guild.id)
			expect(data.guild_locale).toBe('en-US')
			expect(data.member).toBeDefined()

			const member = data.member as Record<string, unknown>
			expect(member.user).toBeDefined()
		})

		it('should handle DM context (user)', () => {
			const channelId = generateSnowflake()
			const user = createMockUser({ username: 'DMUser' })

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.ModalSubmit,
				token: generateInteractionToken(),
				channelId,
				// No guildId - DM context
				userId: user.id,
				customId: 'dm-modal',
				modalFields: { 'message': 'Hello from DM' },
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildModalSubmitInteractionPayload({
				interaction,
				user,
				sessionState,
				sequence: 5
			})

			const data = payload.d as Record<string, unknown>
			expect(data.guild_id).toBeUndefined()
			expect(data.member).toBeUndefined()
			expect(data.user).toBeDefined()

			const userData = data.user as Record<string, unknown>
			expect(userData.username).toBe('DMUser')
		})

		it('should match expected payload structure', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const user = createMockUser({ username: 'StructureUser' })

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.ModalSubmit,
				token: generateInteractionToken(),
				channelId,
				guildId: guild.id,
				userId: user.id,
				customId: 'structure-modal',
				modalFields: { 'name': 'Test' },
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildModalSubmitInteractionPayload({
				interaction,
				user,
				sessionState,
				sequence: 10
			})

			// Check overall structure
			expect(payload.op).toBe(0)
			expect(payload.s).toBe(10)
			expect(payload.t).toBe('INTERACTION_CREATE')

			const data = payload.d as Record<string, unknown>
			expect(data.id).toBe(interaction.id)
			expect(data.application_id).toBe(interaction.applicationId)
			expect(data.type).toBe(5)
			expect(data.channel_id).toBe(channelId)
			expect(data.token).toBe(interaction.token)
			expect(data.version).toBe(1)
			expect(data.entitlements).toEqual([])
			expect(data.locale).toBe('en-US')
		})
	})

	describe('Session.dispatchModalSubmit', () => {
		let session: Session

		beforeEach(() => {
			session = new Session({
				name: 'modal-test-session',
				config: {
					guilds: [{ name: 'Test Guild' }]
				}
			})
		})

		afterEach(async () => {
			await session.end()
		})

		it('should create interaction in state', async () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]

			const interaction = await session.dispatchModalSubmit({
				customId: 'test-modal',
				fields: { 'input-field': 'test value' },
				channelId
			})

			expect(interaction).toBeDefined()
			expect(interaction.customId).toBe('test-modal')
			expect(interaction.type).toBe(5) // ModalSubmit

			// Verify interaction is in state
			const storedInteraction = session.state.getInteraction(interaction.id)
			expect(storedInteraction).toBeDefined()
			expect(storedInteraction?.customId).toBe('test-modal')
		})

		it('should use provided user', async () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]

			const interaction = await session.dispatchModalSubmit({
				customId: 'user-modal',
				fields: { 'name': 'John' },
				channelId,
				user: {
					id: '123456789',
					username: 'ModalSubmitter',
					bot: false
				}
			})

			expect(interaction.userId).toBe('123456789')

			// Verify user is in state
			const user = session.state.getUser('123456789')
			expect(user).toBeDefined()
			expect(user?.username).toBe('ModalSubmitter')
		})

		it('should create default test user if not specified', async () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]

			const interaction = await session.dispatchModalSubmit({
				customId: 'default-user-modal',
				fields: { 'field': 'value' },
				channelId
			})

			expect(interaction.userId).toBeDefined()
			const user = session.state.getUser(interaction.userId)
			expect(user).toBeDefined()
		})

		it('should record dispatch action', async () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]

			await session.dispatchModalSubmit({
				customId: 'recorded-modal',
				fields: { 'data': 'recorded' },
				channelId
			})

			const dispatches = session.getDispatches()
			expect(dispatches.length).toBeGreaterThan(0)

			const lastDispatch = dispatches[dispatches.length - 1]
			expect((lastDispatch.data as Record<string, unknown>).event).toBe('INTERACTION_CREATE')
		})

		it('should generate valid interaction token', async () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]

			const interaction = await session.dispatchModalSubmit({
				customId: 'token-modal',
				fields: { 'input': 'value' },
				channelId
			})

			expect(interaction.token).toBeDefined()
			expect(typeof interaction.token).toBe('string')
			expect(interaction.token.length).toBeGreaterThan(0)

			// Token should be retrievable
			const retrieved = session.state.getInteractionByToken(interaction.token)
			expect(retrieved?.id).toBe(interaction.id)
		})

		it('should set correct expiration time (15 minutes)', async () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]

			const beforeCreate = Date.now()
			const interaction = await session.dispatchModalSubmit({
				customId: 'expiry-modal',
				fields: { 'field': 'value' },
				channelId
			})
			const afterCreate = Date.now()

			// expiresAt should be approximately 15 minutes from creation
			const expectedMinExpiry = beforeCreate + 15 * 60 * 1000
			const expectedMaxExpiry = afterCreate + 15 * 60 * 1000

			expect(interaction.expiresAt).toBeGreaterThanOrEqual(expectedMinExpiry)
			expect(interaction.expiresAt).toBeLessThanOrEqual(expectedMaxExpiry)
		})

		it('should store modalFields in interaction', async () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]

			const fields = {
				'name-input': 'John Doe',
				'email-input': 'john@example.com',
				'feedback-input': 'Great experience!'
			}

			const interaction = await session.dispatchModalSubmit({
				customId: 'fields-modal',
				fields,
				channelId
			})

			expect(interaction.modalFields).toEqual(fields)
		})

		it('should use first available channel if not specified', async () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const expectedChannelId = guild.channels[0]

			const interaction = await session.dispatchModalSubmit({
				customId: 'auto-channel-modal',
				fields: { 'data': 'test' }
				// Not specifying channelId
			})

			expect(interaction.channelId).toBe(expectedChannelId)
		})

		it('should derive guildId from channel', async () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]

			const interaction = await session.dispatchModalSubmit({
				customId: 'derive-guild-modal',
				fields: { 'input': 'value' },
				channelId
				// Not specifying guildId
			})

			expect(interaction.guildId).toBe(guild.id)
		})
	})

	describe('Requirements Verification', () => {
		let sessionState: SessionState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('Task 1: Creates payload for MODAL_SUBMIT (type 5)', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const user = createMockUser({ username: 'TestUser' })

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.ModalSubmit,
				token: generateInteractionToken(),
				channelId,
				guildId: guild.id,
				userId: user.id,
				customId: 'verify-modal',
				modalFields: { 'field': 'value' },
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildModalSubmitInteractionPayload({
				interaction,
				user,
				sessionState,
				sequence: 5
			})

			expect(payload).toBeDefined()
			expect(payload.op).toBe(0)
			expect(payload.t).toBe('INTERACTION_CREATE')

			const data = payload.d as Record<string, unknown>
			expect(data.type).toBe(InteractionType.ModalSubmit)
			expect(data.type).toBe(5)
		})

		it('Task 2: Handles components array with text inputs', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const user = createMockUser({ username: 'TestUser' })

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.ModalSubmit,
				token: generateInteractionToken(),
				channelId,
				guildId: guild.id,
				userId: user.id,
				customId: 'task2-modal',
				modalFields: {
					'field1': 'value1',
					'field2': 'value2'
				},
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildModalSubmitInteractionPayload({
				interaction,
				user,
				sessionState,
				sequence: 5
			})

			const data = payload.d as Record<string, unknown>
			const modalData = data.data as Record<string, unknown>
			const components = modalData.components as Array<Record<string, unknown>>

			expect(components).toBeDefined()
			expect(Array.isArray(components)).toBe(true)

			// Each component should be an action row with a text input
			for (const actionRow of components) {
				expect(actionRow.type).toBe(1) // ActionRow
				const innerComponents = actionRow.components as Array<Record<string, unknown>>
				expect(innerComponents[0].type).toBe(4) // TextInput
				expect(innerComponents[0].custom_id).toBeDefined()
				expect(innerComponents[0].value).toBeDefined()
			}
		})

		it('Task 3: Includes custom_id in data', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const user = createMockUser({ username: 'TestUser' })

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.ModalSubmit,
				token: generateInteractionToken(),
				channelId,
				guildId: guild.id,
				userId: user.id,
				customId: 'task3-custom-id-test',
				modalFields: { 'field': 'value' },
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildModalSubmitInteractionPayload({
				interaction,
				user,
				sessionState,
				sequence: 5
			})

			const data = payload.d as Record<string, unknown>
			const modalData = data.data as Record<string, unknown>
			expect(modalData.custom_id).toBe('task3-custom-id-test')
		})

		it('Task 4: Links to original interaction via message reference', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const user = createMockUser({ username: 'TestUser' })
			sessionState.users.set(user.id, user)

			// Create a message that would have triggered the modal (e.g., had a button)
			const sourceMessage = createMockMessage({
				channelId,
				guildId: guild.id,
				authorId: sessionState.botUser.id,
				content: 'Click the button to open modal'
			})
			sessionState.messages.set(sourceMessage.id, sourceMessage)

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.ModalSubmit,
				token: generateInteractionToken(),
				channelId,
				guildId: guild.id,
				userId: user.id,
				customId: 'task4-modal-with-message',
				modalFields: { 'input': 'test value' },
				messageId: sourceMessage.id, // Link to original message
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildModalSubmitInteractionPayload({
				interaction,
				user,
				sessionState,
				sequence: 5,
				message: sourceMessage // Pass the source message
			})

			const data = payload.d as Record<string, unknown>

			// Verify message is included in payload
			expect(data.message).toBeDefined()
			const messageData = data.message as Record<string, unknown>
			expect(messageData.id).toBe(sourceMessage.id)
			expect(messageData.channel_id).toBe(channelId)
			expect(messageData.content).toBe('Click the button to open modal')
		})

		it('Task 4: Modal without message reference works correctly', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const user = createMockUser({ username: 'TestUser' })

			// Modal opened from slash command (no message reference)
			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.ModalSubmit,
				token: generateInteractionToken(),
				channelId,
				guildId: guild.id,
				userId: user.id,
				customId: 'slash-command-modal',
				modalFields: { 'input': 'from slash command' },
				// No messageId - modal was triggered from slash command
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildModalSubmitInteractionPayload({
				interaction,
				user,
				sessionState,
				sequence: 5
				// No message - modal was not triggered from message component
			})

			const data = payload.d as Record<string, unknown>

			// Verify message is NOT included (modal from slash command)
			expect(data.message).toBeUndefined()

			// But modal data should still be correct
			const modalData = data.data as Record<string, unknown>
			expect(modalData.custom_id).toBe('slash-command-modal')
		})
	})
})
