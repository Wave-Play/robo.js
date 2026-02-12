/**
 * State Inspection API Tests
 *
 * Tests for inspecting the mock server's internal state including
 * guilds, channels, messages, users, and session status.
 */
import { Client, ChannelType, TextChannel } from 'discord.js'
import {
	createSession,
	getSessionStatus,
	getFullSessionState,
	getSessionActions,
	getDetailedSessionStatus,
	controlAPI
} from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForReady, delay } from '../utils/helpers.js'
import { MOCK_CONFIG } from '../setup/constants.js'

describe('State Inspection API', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channelId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'state-api-tests',
			config: {
				guilds: [
					{
						name: 'State Test Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createTestClient()
		await client.login(session.token)
		await waitForReady(client)

		channelId = client.guilds.cache.first()!.channels.cache.find((c) => c.type === ChannelType.GuildText)!.id
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('GET /sessions/:id/status', () => {
		it('should return session status', async () => {
			const status = await getSessionStatus(session.id)

			expect(status).toBeDefined()
			expect(status.id || status.token).toBeDefined()
		})

		it('should return connection count', async () => {
			const status = await getDetailedSessionStatus(session.id)

			expect(status.connection_count).toBeGreaterThanOrEqual(1)
		})

		it('should return guild count', async () => {
			const status = await getDetailedSessionStatus(session.id)

			expect(status.guild_count).toBeGreaterThanOrEqual(1)
		})

		it('should return channel count', async () => {
			const status = await getDetailedSessionStatus(session.id)

			expect(status.channel_count).toBeGreaterThanOrEqual(1)
		})

		it('should return created_at timestamp', async () => {
			const status = await getSessionStatus(session.id)

			expect(status.created_at).toBeDefined()
			expect(typeof status.created_at).toBe('number')
		})

		it('should return expires_at timestamp', async () => {
			const status = await getSessionStatus(session.id)

			expect(status.expires_at).toBeDefined()
			expect(status.expires_at).toBeGreaterThan(Date.now())
		})

		it('should indicate session is not expired', async () => {
			const status = await getSessionStatus(session.id)

			expect(status.is_expired).toBe(false)
		})
	})

	describe('GET /sessions/:id/state', () => {
		it('should return full session state', async () => {
			const state = await getFullSessionState(session.id)

			expect(state).toBeDefined()
			expect(state.botUser).toBeDefined()
			expect(state.guilds).toBeDefined()
			expect(state.channels).toBeDefined()
		})

		it('should include bot user info', async () => {
			const state = await getFullSessionState(session.id)

			expect(state.botUser.id).toBe(client!.user!.id)
			expect(state.botUser.username).toBeDefined()
			expect(state.botUser.bot).toBe(true)
		})

		it('should include all guilds', async () => {
			const state = await getFullSessionState(session.id)

			expect(state.guilds.length).toBeGreaterThanOrEqual(1)
			expect(state.guilds[0].id).toBeDefined()
			expect(state.guilds[0].name).toBeDefined()
		})

		it('should include guild details', async () => {
			const state = await getFullSessionState(session.id)
			const guild = state.guilds[0]

			expect(guild.ownerId).toBeDefined()
			expect(guild.channels).toBeDefined()
			expect(guild.roles).toBeDefined()
		})

		it('should include all channels', async () => {
			const state = await getFullSessionState(session.id)

			expect(state.channels.length).toBeGreaterThanOrEqual(1)
			expect(state.channels[0].id).toBeDefined()
			expect(state.channels[0].name).toBeDefined()
			expect(state.channels[0].type).toBeDefined()
		})
	})

	describe('GET /sessions/:id/actions', () => {
		beforeAll(async () => {
			// Create some actions
			const channel = client!.channels.cache.get(channelId) as TextChannel
			await channel.send('Action test message')
			await delay(100)
		})

		it('should return recorded actions', async () => {
			const result = await getSessionActions(session.id)

			expect(result.actions).toBeDefined()
			expect(Array.isArray(result.actions)).toBe(true)
		})

		it('should record actions from bot activity', async () => {
			const result = await getSessionActions(session.id)

			// Should have at least one MESSAGE_CREATE action
			expect(result.actions.some((a) => a.type === 'MESSAGE_CREATE')).toBe(true)
		})

		it('should filter actions by type', async () => {
			const result = await getSessionActions(session.id, { type: 'MESSAGE_CREATE' })

			result.actions.forEach((action) => {
				expect(action.type).toBe('MESSAGE_CREATE')
			})
		})

		it('should limit action count', async () => {
			const result = await getSessionActions(session.id, { limit: 3 })

			expect(result.actions.length).toBeLessThanOrEqual(3)
		})

		it('should return actions with timestamps', async () => {
			const result = await getSessionActions(session.id, { limit: 5 })

			result.actions.forEach((action) => {
				expect(action.timestamp).toBeDefined()
				expect(typeof action.timestamp).toBe('number')
			})
		})

		it('should return actions with data', async () => {
			const result = await getSessionActions(session.id, { type: 'MESSAGE_CREATE', limit: 1 })

			if (result.actions.length > 0) {
				expect(result.actions[0].data).toBeDefined()
			}
		})
	})

	describe('POST /sessions/:id/reset', () => {
		let resetClient: Client | null = null
		let resetSession: { id: string; token: string }
		let resetChannelId: string

		beforeEach(async () => {
			resetSession = await createSession({
				name: 'reset-test-session',
				config: {
					guilds: [
						{
							name: 'Reset Test Guild',
							channels: [{ name: 'reset-channel', type: ChannelType.GuildText }]
						}
					]
				}
			})

			resetClient = createTestClient()
			await resetClient.login(resetSession.token)
			await waitForReady(resetClient)

			resetChannelId = resetClient.guilds.cache.first()!.channels.cache.find((c) => c.type === ChannelType.GuildText)!
				.id
		})

		afterEach(async () => {
			await destroyClient(resetClient)
			resetClient = null
		})

		it('should reset session state', async () => {
			// Create some state
			const channel = resetClient!.channels.cache.get(resetChannelId) as TextChannel
			await channel.send('Before reset')
			await delay(100)

			// Reset
			await controlAPI(`/sessions/${resetSession.id}/reset`, { method: 'POST' })

			// Verify reset worked (may need to reconnect)
			const result = await getSessionActions(resetSession.id, { type: 'MESSAGE_CREATE' })

			// After reset, actions should be cleared
			expect(result.actions.length).toBe(0)
		})

		it('should preserve session configuration after reset', async () => {
			// Reset
			await controlAPI(`/sessions/${resetSession.id}/reset`, { method: 'POST' })

			// Session should still exist
			const status = await getSessionStatus(resetSession.id)
			expect(status).toBeDefined()
			expect(status.is_expired).toBe(false)
		})
	})

	describe('Session State Counts', () => {
		it('should track message count', async () => {
			const channel = client!.channels.cache.get(channelId) as TextChannel

			// Get initial count
			const initialStatus = await getDetailedSessionStatus(session.id)
			const initialCount = initialStatus.message_count || 0

			// Send a message
			await channel.send('Count test message')
			await delay(100)

			// Get updated count
			const updatedStatus = await getDetailedSessionStatus(session.id)
			expect(updatedStatus.message_count).toBeGreaterThan(initialCount)
		})

		it('should track action count', async () => {
			const channel = client!.channels.cache.get(channelId) as TextChannel

			// Get initial count
			const initialStatus = await getDetailedSessionStatus(session.id)
			const initialCount = initialStatus.action_count || 0

			// Perform an action
			await channel.send('Action count test')
			await delay(100)

			// Get updated count
			const updatedStatus = await getDetailedSessionStatus(session.id)
			expect(updatedStatus.action_count).toBeGreaterThan(initialCount)
		})
	})

	describe('Error Handling', () => {
		it('should return 404 for unknown session status', async () => {
			const response = await fetch(`${MOCK_CONFIG.CONTROL_URL}/sessions/unknown-session-id/status`)
			expect(response.status).toBe(404)
		})

		it('should return 404 for unknown session state', async () => {
			const response = await fetch(`${MOCK_CONFIG.CONTROL_URL}/sessions/unknown-session-id/state`)
			expect(response.status).toBe(404)
		})

		it('should return 404 for unknown session actions', async () => {
			const response = await fetch(`${MOCK_CONFIG.CONTROL_URL}/sessions/unknown-session-id/actions`)
			expect(response.status).toBe(404)
		})
	})
})
