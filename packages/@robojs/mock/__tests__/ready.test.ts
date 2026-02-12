/**
 * READY Event Tests
 * Tests the READY payload builder and type conversions
 */
import { GatewayOpcodes } from 'discord-api-types/v10'
import { buildReadyPayload, mockUserToAPIUser, mockGuildToUnavailable } from '../src/discord/payloads.js'
import { createSessionState, createMockUser, createMockGuild } from '../src/session/state.js'
import type { MockUser, SessionState } from '../src/types/index.js'

describe('READY Event', () => {
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
		})

		it('should handle bot users correctly', () => {
			const botUser: MockUser = {
				id: '987654321',
				username: 'MockBot',
				discriminator: '0',
				globalName: 'Mock Bot',
				avatar: null,
				bot: true
			}

			const apiUser = mockUserToAPIUser(botUser)

			expect(apiUser.bot).toBe(true)
			expect(apiUser.avatar).toBeNull()
		})

		it('should include all required APIUser fields', () => {
			const mockUser = createMockUser({ username: 'TestBot', bot: true })
			const apiUser = mockUserToAPIUser(mockUser)

			// Required fields per Discord API
			expect(apiUser).toHaveProperty('id')
			expect(apiUser).toHaveProperty('username')
			expect(apiUser).toHaveProperty('discriminator')
			expect(apiUser).toHaveProperty('global_name')
			expect(apiUser).toHaveProperty('avatar')
		})
	})

	describe('mockGuildToUnavailable', () => {
		it('should convert guild ID to APIUnavailableGuild format', () => {
			const guildId = '111222333444'
			const unavailableGuild = mockGuildToUnavailable(guildId)

			expect(unavailableGuild.id).toBe(guildId)
			expect(unavailableGuild.unavailable).toBe(true)
		})

		it('should always set unavailable to true', () => {
			const guild1 = mockGuildToUnavailable('123')
			const guild2 = mockGuildToUnavailable('456')

			expect(guild1.unavailable).toBe(true)
			expect(guild2.unavailable).toBe(true)
		})
	})

	describe('buildReadyPayload', () => {
		let sessionState: SessionState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should return op: 0 (DISPATCH)', () => {
			const payload = buildReadyPayload({
				sessionState,
				connectionSessionId: 'test-session-id'
			})

			expect(payload.op).toBe(GatewayOpcodes.Dispatch)
			expect(payload.op).toBe(0)
		})

		it('should return s: 1 (sequence)', () => {
			const payload = buildReadyPayload({
				sessionState,
				connectionSessionId: 'test-session-id'
			})

			expect(payload.s).toBe(1)
		})

		it('should return t: "READY"', () => {
			const payload = buildReadyPayload({
				sessionState,
				connectionSessionId: 'test-session-id'
			})

			expect(payload.t).toBe('READY')
		})

		it('should include v: 10 in data', () => {
			const payload = buildReadyPayload({
				sessionState,
				connectionSessionId: 'test-session-id'
			})

			const data = payload.d as Record<string, unknown>
			expect(data.v).toBe(10)
		})

		it('should include bot user object', () => {
			const payload = buildReadyPayload({
				sessionState,
				connectionSessionId: 'test-session-id'
			})

			const data = payload.d as Record<string, unknown>
			expect(data.user).toBeDefined()

			const user = data.user as Record<string, unknown>
			expect(user.username).toBe('TestBot')
			expect(user.bot).toBe(true)
		})

		it('should include guilds array', () => {
			const payload = buildReadyPayload({
				sessionState,
				connectionSessionId: 'test-session-id'
			})

			const data = payload.d as Record<string, unknown>
			expect(Array.isArray(data.guilds)).toBe(true)
		})

		it('should include unavailable guilds when guilds exist', () => {
			// Add a guild to the session state
			const guild = createMockGuild({ name: 'Test Guild' })
			sessionState.guilds.set(guild.id, guild)

			const payload = buildReadyPayload({
				sessionState,
				connectionSessionId: 'test-session-id'
			})

			const data = payload.d as Record<string, unknown>
			const guilds = data.guilds as Array<{ id: string; unavailable: boolean }>

			expect(guilds.length).toBe(1)
			expect(guilds[0].id).toBe(guild.id)
			expect(guilds[0].unavailable).toBe(true)
		})

		it('should include session_id', () => {
			const payload = buildReadyPayload({
				sessionState,
				connectionSessionId: 'my-unique-session-id'
			})

			const data = payload.d as Record<string, unknown>
			expect(data.session_id).toBe('my-unique-session-id')
		})

		it('should include resume_gateway_url', () => {
			const payload = buildReadyPayload({
				sessionState,
				connectionSessionId: 'test-session-id',
				gatewayUrl: 'ws://custom:9999'
			})

			const data = payload.d as Record<string, unknown>
			expect(data.resume_gateway_url).toBe('ws://custom:9999')
		})

		it('should use default gateway URL when not specified', () => {
			const payload = buildReadyPayload({
				sessionState,
				connectionSessionId: 'test-session-id'
			})

			const data = payload.d as Record<string, unknown>
			expect(data.resume_gateway_url).toBe('ws://localhost:8765')
		})

		it('should include application object', () => {
			const payload = buildReadyPayload({
				sessionState,
				connectionSessionId: 'test-session-id'
			})

			const data = payload.d as Record<string, unknown>
			expect(data.application).toBeDefined()

			const app = data.application as Record<string, unknown>
			expect(app.id).toBe(sessionState.applicationId)
			expect(app.flags).toBe(0)
		})

		it('should match expected payload structure', () => {
			const payload = buildReadyPayload({
				sessionState,
				connectionSessionId: 'test-session'
			})

			// Verify overall structure
			expect(payload).toMatchObject({
				op: 0,
				s: 1,
				t: 'READY',
				d: expect.objectContaining({
					v: 10,
					user: expect.any(Object),
					guilds: expect.any(Array),
					session_id: 'test-session',
					resume_gateway_url: expect.any(String),
					application: expect.objectContaining({
						id: expect.any(String),
						flags: 0
					})
				})
			})
		})
	})

	describe('Requirements Verification', () => {
		it('Task 1: Snowflake generator utility exists', () => {
			// Verified by createMockUser generating snowflake IDs
			const user = createMockUser()
			expect(user.id).toBeDefined()
			expect(typeof user.id).toBe('string')
			// Snowflakes are numeric strings
			expect(Number.isNaN(Number(user.id))).toBe(false)
		})

		it('Task 2: Mock bot user object can be created', () => {
			const botUser = createMockUser({ username: 'TestBot', bot: true })
			expect(botUser.username).toBe('TestBot')
			expect(botUser.bot).toBe(true)
		})

		it('Task 3: Mock application object is included in READY', () => {
			const sessionState = createSessionState()
			const payload = buildReadyPayload({
				sessionState,
				connectionSessionId: 'test'
			})

			const data = payload.d as Record<string, unknown>
			expect(data.application).toBeDefined()
			expect((data.application as Record<string, unknown>).id).toBe(sessionState.applicationId)
		})

		it('Task 4: READY payload has all required fields', () => {
			const sessionState = createSessionState()
			const payload = buildReadyPayload({
				sessionState,
				connectionSessionId: 'test'
			})

			const data = payload.d as Record<string, unknown>

			// All required fields per Discord Gateway specification
			expect(data.v).toBeDefined()
			expect(data.user).toBeDefined()
			expect(data.guilds).toBeDefined()
			expect(data.session_id).toBeDefined()
			expect(data.resume_gateway_url).toBeDefined()
			expect(data.application).toBeDefined()
		})

		it('Task 5: session_id is unique per connection', () => {
			const sessionState = createSessionState()

			const payload1 = buildReadyPayload({
				sessionState,
				connectionSessionId: 'connection-1'
			})
			const payload2 = buildReadyPayload({
				sessionState,
				connectionSessionId: 'connection-2'
			})

			const data1 = payload1.d as Record<string, unknown>
			const data2 = payload2.d as Record<string, unknown>

			expect(data1.session_id).toBe('connection-1')
			expect(data2.session_id).toBe('connection-2')
			expect(data1.session_id).not.toBe(data2.session_id)
		})

		it('Task 6: READY is sent as dispatch (op 0, s: 1, t: "READY")', () => {
			const sessionState = createSessionState()
			const payload = buildReadyPayload({
				sessionState,
				connectionSessionId: 'test'
			})

			expect(payload.op).toBe(0) // DISPATCH opcode
			expect(payload.s).toBe(1) // First sequence number
			expect(payload.t).toBe('READY') // Event type
		})
	})
})
