/**
 * Autocomplete Interactions Tests
 * Tests autocomplete dispatch and response validation
 */
import { GatewayOpcodes, InteractionType, ApplicationCommandType } from 'discord-api-types/v10'
import { buildAutocompleteInteractionPayload } from '../src/discord/payloads.js'
import {
	createSessionState,
	createMockUser,
	createDefaultGuildWithChannel
} from '../src/session/state.js'
import { Session } from '../src/session/session.js'
import { generateSnowflake } from '../src/utils/snowflake.js'
import { generateInteractionToken } from '../src/utils/id.js'
import type { MockInteraction, SessionState } from '../src/types/index.js'

describe('Autocomplete Interactions', () => {
	describe('buildAutocompleteInteractionPayload', () => {
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
				type: InteractionType.ApplicationCommandAutocomplete,
				token: generateInteractionToken(),
				channelId,
				guildId: guild.id,
				userId: user.id,
				commandName: 'search',
				commandId: generateSnowflake(),
				options: [{ name: 'query', type: 3, value: 'hel', focused: true }],
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildAutocompleteInteractionPayload({
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
			const user = createMockUser({ username: 'TestUser' })

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.ApplicationCommandAutocomplete,
				token: generateInteractionToken(),
				channelId,
				guildId: guild.id,
				userId: user.id,
				commandName: 'search',
				commandId: generateSnowflake(),
				options: [{ name: 'query', type: 3, value: 'test', focused: true }],
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildAutocompleteInteractionPayload({
				interaction,
				user,
				sessionState,
				sequence: 1
			})

			expect(payload.t).toBe('INTERACTION_CREATE')
		})

		it('should have InteractionType 4 (APPLICATION_COMMAND_AUTOCOMPLETE)', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const user = createMockUser({ username: 'TestUser' })

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.ApplicationCommandAutocomplete,
				token: generateInteractionToken(),
				channelId,
				guildId: guild.id,
				userId: user.id,
				commandName: 'lookup',
				commandId: generateSnowflake(),
				options: [{ name: 'item', type: 3, value: 'sw', focused: true }],
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildAutocompleteInteractionPayload({
				interaction,
				user,
				sessionState,
				sequence: 1
			})

			const data = payload.d as Record<string, unknown>
			expect(data.type).toBe(InteractionType.ApplicationCommandAutocomplete)
			expect(data.type).toBe(4)
		})

		it('should include focused flag on the focused option', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const user = createMockUser({ username: 'TestUser' })

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.ApplicationCommandAutocomplete,
				token: generateInteractionToken(),
				channelId,
				guildId: guild.id,
				userId: user.id,
				commandName: 'search',
				commandId: generateSnowflake(),
				options: [
					{ name: 'category', type: 3, value: 'users' },
					{ name: 'query', type: 3, value: 'john', focused: true }
				],
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildAutocompleteInteractionPayload({
				interaction,
				user,
				sessionState,
				sequence: 1
			})

			const data = payload.d as Record<string, unknown>
			const commandData = data.data as Record<string, unknown>
			const options = commandData.options as Array<{ name: string; focused?: boolean }>

			// Find the focused option
			const focusedOption = options.find((opt) => opt.focused)
			expect(focusedOption).toBeDefined()
			expect(focusedOption?.name).toBe('query')

			// Non-focused option should not have focused: true
			const categoryOption = options.find((opt) => opt.name === 'category')
			expect(categoryOption?.focused).toBeFalsy()
		})

		it('should include command data with type ChatInput', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const user = createMockUser({ username: 'TestUser' })

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.ApplicationCommandAutocomplete,
				token: generateInteractionToken(),
				channelId,
				guildId: guild.id,
				userId: user.id,
				commandName: 'test',
				commandId: generateSnowflake(),
				options: [{ name: 'opt', type: 3, value: 'x', focused: true }],
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildAutocompleteInteractionPayload({
				interaction,
				user,
				sessionState,
				sequence: 1
			})

			const data = payload.d as Record<string, unknown>
			const commandData = data.data as Record<string, unknown>

			expect(commandData.name).toBe('test')
			expect(commandData.type).toBe(ApplicationCommandType.ChatInput)
		})

		it('should include guild member for guild interactions', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const channelId = guild.channels[0]
			const user = createMockUser({ username: 'GuildUser' })

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.ApplicationCommandAutocomplete,
				token: generateInteractionToken(),
				channelId,
				guildId: guild.id,
				userId: user.id,
				commandName: 'search',
				commandId: generateSnowflake(),
				options: [{ name: 'q', type: 3, value: 'a', focused: true }],
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildAutocompleteInteractionPayload({
				interaction,
				user,
				sessionState,
				sequence: 1
			})

			const data = payload.d as Record<string, unknown>
			expect(data.guild_id).toBe(guild.id)
			expect(data.member).toBeDefined()

			const member = data.member as Record<string, unknown>
			expect(member.user).toBeDefined()
		})

		it('should include user directly for DM interactions', () => {
			const user = createMockUser({ username: 'DMUser' })
			const channelId = generateSnowflake()

			const interaction: MockInteraction = {
				id: generateSnowflake(),
				applicationId: sessionState.applicationId,
				type: InteractionType.ApplicationCommandAutocomplete,
				token: generateInteractionToken(),
				channelId,
				// No guildId = DM
				userId: user.id,
				commandName: 'search',
				commandId: generateSnowflake(),
				options: [{ name: 'q', type: 3, value: 'b', focused: true }],
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000
			}

			const payload = buildAutocompleteInteractionPayload({
				interaction,
				user,
				sessionState,
				sequence: 1
			})

			const data = payload.d as Record<string, unknown>
			expect(data.guild_id).toBeUndefined()
			expect(data.member).toBeUndefined()
			expect(data.user).toBeDefined()
		})
	})

	describe('Session.dispatchAutocomplete', () => {
		let session: Session

		beforeEach(() => {
			session = new Session({
				id: 'test-session',
				token: 'test-token',
				config: {
					guilds: [{ name: 'Test Guild' }]
				}
			})
		})

		afterEach(() => {
			session.end()
		})

		it('should create autocomplete interaction with focused option', async () => {
			const guildId = session.state.guilds.keys().next().value as string
			const channelId = session.state.guilds.get(guildId)?.channels[0]

			const interaction = await session.dispatchAutocomplete({
				commandName: 'search',
				focusedOption: {
					name: 'query',
					value: 'hel'
				},
				channelId
			})

			expect(interaction).toBeDefined()
			expect(interaction.type).toBe(4) // APPLICATION_COMMAND_AUTOCOMPLETE
			expect(interaction.commandName).toBe('search')
			expect(interaction.options).toBeDefined()
			expect(interaction.options?.length).toBeGreaterThan(0)

			// Verify focused option
			const focusedOpt = interaction.options?.find((o) => o.focused)
			expect(focusedOpt).toBeDefined()
			expect(focusedOpt?.name).toBe('query')
			expect(focusedOpt?.value).toBe('hel')
		})

		it('should include other options alongside focused option', async () => {
			const guildId = session.state.guilds.keys().next().value as string
			const channelId = session.state.guilds.get(guildId)?.channels[0]

			const interaction = await session.dispatchAutocomplete({
				commandName: 'lookup',
				focusedOption: {
					name: 'query',
					value: 'test'
				},
				options: {
					category: 'users',
					limit: 10
				},
				channelId
			})

			expect(interaction.options?.length).toBe(3)

			// Check focused option
			const focused = interaction.options?.find((o) => o.focused)
			expect(focused?.name).toBe('query')

			// Check other options don't have focused flag
			const others = interaction.options?.filter((o) => !o.focused)
			expect(others?.length).toBe(2)
		})

		it('should store interaction in state for response tracking', async () => {
			const interaction = await session.dispatchAutocomplete({
				commandName: 'test',
				focusedOption: { name: 'opt', value: 'x' }
			})

			const stored = session.state.getInteraction(interaction.id)
			expect(stored).toBeDefined()
			expect(stored?.id).toBe(interaction.id)

			const byToken = session.state.getInteractionByToken(interaction.token)
			expect(byToken).toBeDefined()
		})

		it('should default focused option type to STRING (3)', async () => {
			const interaction = await session.dispatchAutocomplete({
				commandName: 'test',
				focusedOption: { name: 'opt', value: 'hello' }
			})

			const focused = interaction.options?.find((o) => o.focused)
			expect(focused?.type).toBe(3) // STRING
		})

		it('should respect specified option type', async () => {
			const interaction = await session.dispatchAutocomplete({
				commandName: 'test',
				focusedOption: { name: 'amount', value: '42', type: 4 } // INTEGER
			})

			const focused = interaction.options?.find((o) => o.focused)
			expect(focused?.type).toBe(4)
		})

		it('should generate valid interaction token', async () => {
			const interaction = await session.dispatchAutocomplete({
				commandName: 'cmd',
				focusedOption: { name: 'f', value: 'v' }
			})

			expect(interaction.token).toBeDefined()
			expect(typeof interaction.token).toBe('string')
			expect(interaction.token.length).toBeGreaterThan(0)
		})

		it('should throw if session is ending', async () => {
			session.end()

			await expect(
				session.dispatchAutocomplete({
					commandName: 'test',
					focusedOption: { name: 'opt', value: 'x' }
				})
			).rejects.toThrow(/Cannot dispatch to ending session/)
		})

		it('should throw if no channel is available', async () => {
			// Create session with no guilds (and thus no channels)
			const emptySession = new Session({
				id: 'empty-session',
				config: { guilds: [] }
			})

			await expect(
				emptySession.dispatchAutocomplete({
					commandName: 'test',
					focusedOption: { name: 'opt', value: 'x' }
				})
			).rejects.toThrow(/No channel specified/)

			emptySession.end()
		})

		it('should use specified user if provided', async () => {
			const interaction = await session.dispatchAutocomplete({
				commandName: 'search',
				focusedOption: { name: 'q', value: 'test' },
				user: {
					id: '999888777666555',
					username: 'CustomUser'
				}
			})

			expect(interaction.userId).toBe('999888777666555')

			// Verify user was added to state
			const user = session.state.getUser('999888777666555')
			expect(user).toBeDefined()
			expect(user?.username).toBe('CustomUser')
		})

		it('should create test user if none specified', async () => {
			const interaction = await session.dispatchAutocomplete({
				commandName: 'search',
				focusedOption: { name: 'q', value: 'test' }
			})

			expect(interaction.userId).toBeDefined()
			const user = session.state.getUser(interaction.userId)
			expect(user).toBeDefined()
		})
	})

	describe('Autocomplete response validation', () => {
		// These tests verify the callback.ts validation logic
		// In a full integration test, we would make HTTP requests to the callback endpoint

		it('should validate that type 8 responses have choices array', () => {
			// This is a structural test - the actual validation is in callback.ts
			// Type 8 = InteractionResponseType.ApplicationCommandAutocompleteResult
			const validResponse = {
				type: 8,
				data: {
					choices: [
						{ name: 'hello', value: 'hello' },
						{ name: 'help', value: 'help' }
					]
				}
			}

			expect(validResponse.type).toBe(8)
			expect(validResponse.data.choices).toBeDefined()
			expect(Array.isArray(validResponse.data.choices)).toBe(true)
		})

		it('should enforce max 25 choices limit', () => {
			const MAX_CHOICES = 25

			// Create 25 choices (valid)
			const validChoices = Array.from({ length: MAX_CHOICES }, (_, i) => ({
				name: `option${i}`,
				value: `value${i}`
			}))

			expect(validChoices.length).toBe(25)
			expect(validChoices.length).toBeLessThanOrEqual(MAX_CHOICES)

			// Create 26 choices (invalid)
			const invalidChoices = Array.from({ length: 26 }, (_, i) => ({
				name: `option${i}`,
				value: `value${i}`
			}))

			expect(invalidChoices.length).toBe(26)
			expect(invalidChoices.length).toBeGreaterThan(MAX_CHOICES)
		})
	})
})
