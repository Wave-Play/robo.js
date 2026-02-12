/**
 * GUILD_CREATE Event Tests
 * Tests the GUILD_CREATE payload builder and guild/channel management helpers
 */
import { GatewayOpcodes, ChannelType } from 'discord-api-types/v10'
import {
	buildGuildCreatePayload,
	mockChannelToAPIChannel,
	buildEveryoneRole,
	buildGuildMember
} from '../src/discord/payloads.js'
import {
	createSessionState,
	createMockUser,
	createMockGuild,
	createMockChannel,
	createDefaultGuildWithChannel
} from '../src/session/state.js'
import type { MockChannel, SessionState } from '../src/types/index.js'

describe('GUILD_CREATE Event', () => {
	describe('mockChannelToAPIChannel', () => {
		it('should convert MockChannel to APIChannel format', () => {
			const mockChannel: MockChannel = {
				id: '111222333',
				guildId: '444555666',
				name: 'test-channel',
				type: 0,
				parentId: null
			}

			const apiChannel = mockChannelToAPIChannel(mockChannel) as unknown as Record<string, unknown>

			expect(apiChannel.id).toBe('111222333')
			expect(apiChannel.guild_id).toBe('444555666')
			expect(apiChannel.name).toBe('test-channel')
			expect(apiChannel.type).toBe(ChannelType.GuildText)
		})

		it('should handle channels with parent_id', () => {
			const mockChannel: MockChannel = {
				id: '111222333',
				guildId: '444555666',
				name: 'sub-channel',
				type: 0,
				parentId: '999888777'
			}

			const apiChannel = mockChannelToAPIChannel(mockChannel) as unknown as Record<string, unknown>

			expect(apiChannel.parent_id).toBe('999888777')
		})

		it('should include required APIChannel fields', () => {
			const mockChannel = createMockChannel({ name: 'general' })
			const apiChannel = mockChannelToAPIChannel(mockChannel)

			expect(apiChannel).toHaveProperty('id')
			expect(apiChannel).toHaveProperty('type')
			expect(apiChannel).toHaveProperty('name')
			expect(apiChannel).toHaveProperty('position')
			expect(apiChannel).toHaveProperty('permission_overwrites')
		})
	})

	describe('buildEveryoneRole', () => {
		it('should create @everyone role with guild ID', () => {
			const guildId = '123456789'
			const role = buildEveryoneRole(guildId)

			expect(role.id).toBe(guildId)
			expect(role.name).toBe('@everyone')
			expect(role.position).toBe(0)
			expect(role.hoist).toBe(false)
		})

		it('should include default permissions', () => {
			const role = buildEveryoneRole('123')
			expect(role.permissions).toBeDefined()
			expect(typeof role.permissions).toBe('string')
		})
	})

	describe('buildGuildMember', () => {
		it('should create guild member from user', () => {
			const user = createMockUser({ username: 'TestUser', bot: false })
			const joinedAt = '2024-01-01T00:00:00.000Z'

			const member = buildGuildMember(user, joinedAt)

			expect(member.user?.username).toBe('TestUser')
			expect(member.joined_at).toBe(joinedAt)
			expect(member.roles).toEqual([])
			expect(member.deaf).toBe(false)
			expect(member.mute).toBe(false)
		})

		it('should handle bot users', () => {
			const botUser = createMockUser({ username: 'BotUser', bot: true })
			const member = buildGuildMember(botUser, new Date().toISOString())

			expect(member.user?.bot).toBe(true)
		})
	})

	describe('Guild/Channel Management Helpers', () => {
		let sessionState: SessionState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		describe('addGuild', () => {
			it('should add guild to session state', () => {
				const guild = createMockGuild({ name: 'My Guild' })
				sessionState.addGuild(guild)

				expect(sessionState.guilds.get(guild.id)).toBe(guild)
			})

			it('should add bot user as member automatically', () => {
				const guild = createMockGuild({ name: 'My Guild' })
				guild.members = [] // Start with empty members

				sessionState.addGuild(guild)

				expect(guild.members).toContain(sessionState.botUser.id)
			})

			it('should not duplicate bot user if already member', () => {
				const guild = createMockGuild({ name: 'My Guild' })
				guild.members = [sessionState.botUser.id]

				sessionState.addGuild(guild)

				const botUserCount = guild.members.filter((id) => id === sessionState.botUser.id).length
				expect(botUserCount).toBe(1)
			})
		})

		describe('addChannelToGuild', () => {
			it('should add channel to session state', () => {
				const guild = createMockGuild({ name: 'My Guild' })
				sessionState.addGuild(guild)

				const channel = createMockChannel({ name: 'new-channel' })
				sessionState.addChannelToGuild(guild.id, channel)

				expect(sessionState.channels.get(channel.id)).toBe(channel)
			})

			it('should set guild ID on channel', () => {
				const guild = createMockGuild({ name: 'My Guild' })
				sessionState.addGuild(guild)

				const channel = createMockChannel({ name: 'new-channel' })
				sessionState.addChannelToGuild(guild.id, channel)

				expect(channel.guildId).toBe(guild.id)
			})

			it('should add channel ID to guild channels list', () => {
				const guild = createMockGuild({ name: 'My Guild' })
				sessionState.addGuild(guild)

				const channel = createMockChannel({ name: 'new-channel' })
				sessionState.addChannelToGuild(guild.id, channel)

				expect(guild.channels).toContain(channel.id)
			})
		})

		describe('createDefaultGuildWithChannel', () => {
			it('should create guild with default name', () => {
				const guild = createDefaultGuildWithChannel(sessionState)

				expect(guild.name).toBe('Test Guild')
			})

			it('should create guild with custom name', () => {
				const guild = createDefaultGuildWithChannel(sessionState, { guildName: 'Custom Guild' })

				expect(guild.name).toBe('Custom Guild')
			})

			it('should add guild to session state', () => {
				const guild = createDefaultGuildWithChannel(sessionState)

				expect(sessionState.guilds.get(guild.id)).toBe(guild)
			})

			it('should create a general channel', () => {
				const guild = createDefaultGuildWithChannel(sessionState)

				expect(guild.channels.length).toBeGreaterThan(0)
				const channelId = guild.channels[0]
				const channel = sessionState.channels.get(channelId)
				expect(channel).toBeDefined()
				expect(channel?.name).toBe('general')
			})

			it('should create channel with custom name', () => {
				const guild = createDefaultGuildWithChannel(sessionState, { channelName: 'lobby' })

				const channelId = guild.channels[0]
				const channel = sessionState.channels.get(channelId)
				expect(channel?.name).toBe('lobby')
			})

			it('should include bot user as member', () => {
				const guild = createDefaultGuildWithChannel(sessionState)

				expect(guild.members).toContain(sessionState.botUser.id)
			})

			it('should set bot user as owner', () => {
				const guild = createDefaultGuildWithChannel(sessionState)

				expect(guild.ownerId).toBe(sessionState.botUser.id)
			})
		})
	})

	describe('buildGuildCreatePayload', () => {
		let sessionState: SessionState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should return op: 0 (DISPATCH)', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const payload = buildGuildCreatePayload({
				guild,
				sessionState,
				sequence: 2
			})

			expect(payload.op).toBe(GatewayOpcodes.Dispatch)
			expect(payload.op).toBe(0)
		})

		it('should return specified sequence number', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const payload = buildGuildCreatePayload({
				guild,
				sessionState,
				sequence: 5
			})

			expect(payload.s).toBe(5)
		})

		it('should return t: "GUILD_CREATE"', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const payload = buildGuildCreatePayload({
				guild,
				sessionState,
				sequence: 2
			})

			expect(payload.t).toBe('GUILD_CREATE')
		})

		it('should include guild id and name', () => {
			const guild = createDefaultGuildWithChannel(sessionState, { guildName: 'My Awesome Guild' })
			const payload = buildGuildCreatePayload({
				guild,
				sessionState,
				sequence: 2
			})

			const data = payload.d as Record<string, unknown>
			expect(data.id).toBe(guild.id)
			expect(data.name).toBe('My Awesome Guild')
		})

		it('should include channels array', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const payload = buildGuildCreatePayload({
				guild,
				sessionState,
				sequence: 2
			})

			const data = payload.d as Record<string, unknown>
			expect(Array.isArray(data.channels)).toBe(true)
			expect((data.channels as unknown[]).length).toBe(1)
		})

		it('should include roles array with @everyone', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const payload = buildGuildCreatePayload({
				guild,
				sessionState,
				sequence: 2
			})

			const data = payload.d as Record<string, unknown>
			expect(Array.isArray(data.roles)).toBe(true)

			const roles = data.roles as Array<{ id: string; name: string }>
			expect(roles.length).toBeGreaterThanOrEqual(1)
			expect(roles.some((r) => r.name === '@everyone')).toBe(true)
			expect(roles.some((r) => r.id === guild.id)).toBe(true)
		})

		it('should include members array with bot user', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const payload = buildGuildCreatePayload({
				guild,
				sessionState,
				sequence: 2
			})

			const data = payload.d as Record<string, unknown>
			expect(Array.isArray(data.members)).toBe(true)

			const members = data.members as Array<{ user: { id: string; bot?: boolean } }>
			expect(members.length).toBeGreaterThanOrEqual(1)
			expect(members.some((m) => m.user.id === sessionState.botUser.id)).toBe(true)
			expect(members.some((m) => m.user.bot === true)).toBe(true)
		})

		it('should include GUILD_CREATE specific fields', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const payload = buildGuildCreatePayload({
				guild,
				sessionState,
				sequence: 2
			})

			const data = payload.d as Record<string, unknown>

			// Required GUILD_CREATE specific fields
			expect(data.joined_at).toBeDefined()
			expect(typeof data.joined_at).toBe('string')
			expect(data.large).toBe(false)
			expect(data.unavailable).toBe(false)
			expect(data.member_count).toBeDefined()
			expect(typeof data.member_count).toBe('number')
			expect(Array.isArray(data.voice_states)).toBe(true)
			expect(Array.isArray(data.threads)).toBe(true)
			expect(Array.isArray(data.presences)).toBe(true)
			expect(Array.isArray(data.stage_instances)).toBe(true)
			expect(Array.isArray(data.guild_scheduled_events)).toBe(true)
		})

		it('should include required APIGuild fields', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const payload = buildGuildCreatePayload({
				guild,
				sessionState,
				sequence: 2
			})

			const data = payload.d as Record<string, unknown>

			// Core APIGuild fields
			expect(data.id).toBeDefined()
			expect(data.name).toBeDefined()
			expect(data.owner_id).toBeDefined()
			expect(data.verification_level).toBeDefined()
			expect(data.default_message_notifications).toBeDefined()
			expect(data.explicit_content_filter).toBeDefined()
			expect(data.roles).toBeDefined()
			expect(data.emojis).toBeDefined()
			expect(data.features).toBeDefined()
			expect(data.mfa_level).toBeDefined()
			expect(data.premium_tier).toBeDefined()
			expect(data.preferred_locale).toBeDefined()
			expect(data.nsfw_level).toBeDefined()
		})

		it('should match expected payload structure', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const payload = buildGuildCreatePayload({
				guild,
				sessionState,
				sequence: 2
			})

			expect(payload).toMatchObject({
				op: 0,
				s: 2,
				t: 'GUILD_CREATE',
				d: expect.objectContaining({
					id: guild.id,
					name: expect.any(String),
					owner_id: expect.any(String),
					channels: expect.any(Array),
					roles: expect.any(Array),
					members: expect.any(Array),
					joined_at: expect.any(String),
					large: false,
					member_count: expect.any(Number)
				})
			})
		})
	})

	describe('Requirements Verification', () => {
		let sessionState: SessionState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('Task 1: MockGuild interface exists and can be created', () => {
			const guild = createMockGuild({ name: 'Test Guild' })

			expect(guild).toBeDefined()
			expect(guild.id).toBeDefined()
			expect(guild.name).toBe('Test Guild')
			expect(guild.channels).toBeDefined()
			expect(guild.roles).toBeDefined()
		})

		it('Task 2: Default test guild with channels and roles can be created', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			// Has at least one channel
			expect(guild.channels.length).toBeGreaterThanOrEqual(1)

			// Has @everyone role (same ID as guild)
			expect(guild.roles).toContain(guild.id)

			// Channel exists in session state
			const channelId = guild.channels[0]
			const channel = sessionState.channels.get(channelId)
			expect(channel).toBeDefined()
			expect(channel?.type).toBe(0) // GUILD_TEXT
		})

		it('Task 3: GUILD_CREATE payload can be built', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const payload = buildGuildCreatePayload({
				guild,
				sessionState,
				sequence: 2
			})

			expect(payload).toBeDefined()
			expect(payload.t).toBe('GUILD_CREATE')
		})

		it('Task 4: GUILD_CREATE has correct sequence (s: 2 after READY)', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const payload = buildGuildCreatePayload({
				guild,
				sessionState,
				sequence: 2
			})

			// READY is s: 1, GUILD_CREATE should be s: 2
			expect(payload.s).toBe(2)
		})

		it('Task 5: GUILD_CREATE includes at least one text channel', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const payload = buildGuildCreatePayload({
				guild,
				sessionState,
				sequence: 2
			})

			const data = payload.d as Record<string, unknown>
			const channels = data.channels as Array<{ type: number; name: string }>

			expect(channels.length).toBeGreaterThanOrEqual(1)
			expect(channels.some((c) => c.type === 0)).toBe(true) // GUILD_TEXT = 0
			expect(channels.some((c) => c.name === 'general')).toBe(true)
		})

		it('Multiple guilds get sequential sequence numbers', () => {
			// Create two guilds
			const guild1 = createDefaultGuildWithChannel(sessionState, { guildName: 'Guild 1' })
			const guild2 = createDefaultGuildWithChannel(sessionState, { guildName: 'Guild 2' })

			const payload1 = buildGuildCreatePayload({
				guild: guild1,
				sessionState,
				sequence: 2 // After READY (s: 1)
			})

			const payload2 = buildGuildCreatePayload({
				guild: guild2,
				sessionState,
				sequence: 3 // After first GUILD_CREATE
			})

			expect(payload1.s).toBe(2)
			expect(payload2.s).toBe(3)
		})
	})
})
