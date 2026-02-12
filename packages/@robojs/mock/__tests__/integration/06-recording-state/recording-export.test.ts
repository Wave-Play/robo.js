/**
 * Recording Export Tests
 *
 * Tests for exporting session recordings that capture all events,
 * REST calls, and metadata during a test session.
 */
import { Client, ChannelType, TextChannel } from 'discord.js'
import { createSession, getSessionRecording, getSessionActions } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForReady, delay } from '../utils/helpers.js'

describe('Recording Export', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channelId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'recording-export-tests',
			config: {
				guilds: [
					{
						name: 'Recording Test Guild',
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

	describe('Recording Sessions', () => {
		it('should export recording with metadata', async () => {
			const recording = await getSessionRecording(session.id)

			expect(recording.version).toBe(1)
			expect(recording.metadata).toBeDefined()
			expect(recording.metadata.sessionId).toBe(session.id)
			expect(recording.metadata.botUser).toBeDefined()
			expect(recording.metadata.recordedAt).toBeDefined()
		})

		it('should include session name in metadata', async () => {
			const recording = await getSessionRecording(session.id)

			expect(recording.metadata.sessionName).toBe('recording-export-tests')
		})

		it('should include bot user info in metadata', async () => {
			const recording = await getSessionRecording(session.id)

			expect(recording.metadata.botUser.id).toBe(client!.user!.id)
			expect(recording.metadata.botUser.username).toBeDefined()
		})

		it('should include action count in metadata', async () => {
			const recording = await getSessionRecording(session.id)

			expect(typeof recording.metadata.actionCount).toBe('number')
			expect(recording.metadata.actionCount).toBeGreaterThanOrEqual(0)
		})
	})

	describe('Recording Events', () => {
		it('should record dispatched events', async () => {
			const channel = client!.channels.cache.get(channelId) as TextChannel

			await channel.send('Recording test message 1')
			await channel.send('Recording test message 2')

			// Small delay to ensure actions are recorded
			await delay(100)

			const recording = await getSessionRecording(session.id)

			// Should have MESSAGE_CREATE actions
			const messageActions = recording.actions.filter((a) => a.type === 'MESSAGE_CREATE')
			expect(messageActions.length).toBeGreaterThanOrEqual(2)
		})

		it('should record client REST calls', async () => {
			const channel = client!.channels.cache.get(channelId) as TextChannel

			await channel.send('REST call test')
			await delay(100)

			const recording = await getSessionRecording(session.id)

			// Recording should include actions from REST calls
			expect(recording.actions.length).toBeGreaterThan(0)
		})

		it('should record events with timestamps', async () => {
			const channel = client!.channels.cache.get(channelId) as TextChannel

			const beforeTime = Date.now()
			await channel.send('Timestamp test first')
			await delay(50)
			await channel.send('Timestamp test second')
			const afterTime = Date.now()

			await delay(100)

			const recording = await getSessionRecording(session.id)

			// Find the latest MESSAGE_CREATE actions
			const messageActions = recording.actions
				.filter((a) => a.type === 'MESSAGE_CREATE')
				.sort((a, b) => a.timestamp - b.timestamp)

			// Last two actions should have been after beforeTime
			const recentActions = messageActions.slice(-2)
			expect(recentActions.length).toBe(2)
			expect(recentActions[0].timestamp).toBeGreaterThanOrEqual(beforeTime)
			expect(recentActions[1].timestamp).toBeLessThanOrEqual(afterTime + 1000) // Allow some tolerance
		})

		it('should record events in chronological order', async () => {
			const channel = client!.channels.cache.get(channelId) as TextChannel

			await channel.send('Order test 1')
			await delay(50)
			await channel.send('Order test 2')
			await delay(50)
			await channel.send('Order test 3')

			await delay(100)

			const recording = await getSessionRecording(session.id)

			// Verify timestamps are in order
			for (let i = 1; i < recording.actions.length; i++) {
				expect(recording.actions[i].timestamp).toBeGreaterThanOrEqual(recording.actions[i - 1].timestamp)
			}
		})
	})

	describe('Recording Duration', () => {
		it('should calculate duration from start to end time', async () => {
			const recording = await getSessionRecording(session.id)

			expect(recording.metadata.startTime).toBeDefined()
			expect(recording.metadata.endTime).toBeDefined()
			expect(recording.metadata.duration).toBeDefined()

			// Duration should roughly match end - start
			const calculatedDuration = recording.metadata.endTime - recording.metadata.startTime
			expect(recording.metadata.duration).toBeCloseTo(calculatedDuration, -2) // Allow 100ms tolerance
		})

		it('should have positive duration', async () => {
			const recording = await getSessionRecording(session.id)

			expect(recording.metadata.duration).toBeGreaterThan(0)
		})
	})

	describe('Recording Initial Config', () => {
		it('should include initial config', async () => {
			const recording = await getSessionRecording(session.id)

			expect(recording.initialConfig).toBeDefined()
		})
	})

	describe('Recording Actions via Control API', () => {
		it('should get actions via separate actions endpoint', async () => {
			const result = await getSessionActions(session.id)

			expect(result.actions).toBeDefined()
			expect(Array.isArray(result.actions)).toBe(true)
		})

		it('should filter actions by type', async () => {
			const result = await getSessionActions(session.id, { type: 'MESSAGE_CREATE' })

			result.actions.forEach((action) => {
				expect(action.type).toBe('MESSAGE_CREATE')
			})
		})

		it('should limit action count', async () => {
			const result = await getSessionActions(session.id, { limit: 5 })

			expect(result.actions.length).toBeLessThanOrEqual(5)
		})

		it('should return actions with required fields', async () => {
			const result = await getSessionActions(session.id, { limit: 5 })

			result.actions.forEach((action) => {
				expect(action.id).toBeDefined()
				expect(action.type).toBeDefined()
				expect(action.timestamp).toBeDefined()
			})
		})
	})
})
