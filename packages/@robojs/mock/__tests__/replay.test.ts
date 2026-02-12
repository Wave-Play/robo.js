/**
 * Unit tests for Session Replay functionality
 * Fixture Replay
 */

import { Session } from '../src/session/session.js'
import { RecordingPlayer } from '../src/session/player.js'
import { createDefaultGuildWithChannel } from '../src/session/state.js'
import type { SessionRecording, RecordedAction, ReplayState } from '../src/types/index.js'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'

// Helper to create a minimal valid recording
function createMockRecording(overrides?: Partial<SessionRecording>): SessionRecording {
	const startTime = Date.now() - 1000
	const endTime = Date.now()

	return {
		version: 1,
		metadata: {
			sessionId: 'test-session-id',
			sessionName: 'test-recording',
			startTime,
			endTime,
			duration: endTime - startTime,
			actionCount: 0,
			botUser: { id: '123456789', username: 'TestBot' },
			applicationId: '123456789',
			recordedAt: new Date().toISOString()
		},
		initialConfig: {
			botUser: { id: '123456789', username: 'TestBot', bot: true },
			applicationId: '123456789',
			guilds: [
				{
					name: 'Test Guild',
					channels: [{ name: 'general', type: 0 }]
				}
			]
		},
		actions: [],
		...overrides
	}
}

// Helper to create a dispatch action
function createDispatchAction(
	event: string,
	payload: unknown,
	timestamp: number,
	id?: string
): RecordedAction {
	return {
		id: id ?? `action-${timestamp}`,
		timestamp,
		type: 'dispatch',
		data: { event, payload }
	}
}

describe('RecordingPlayer', () => {
	describe('constructor', () => {
		it('should create player with valid recording', () => {
			const recording = createMockRecording()
			const player = new RecordingPlayer(recording)

			expect(player).toBeDefined()
		})

		it('should initialize state correctly', () => {
			const recording = createMockRecording({
				actions: [
					createDispatchAction('MESSAGE_CREATE', { content: 'Hello' }, 1000)
				]
			})
			recording.metadata.duration = 5000

			const player = new RecordingPlayer(recording)
			const state = player.getState()

			expect(state.mode).toBe('idle')
			expect(state.currentTime).toBe(0)
			expect(state.duration).toBe(5000)
			expect(state.currentIndex).toBe(0)
			expect(state.totalActions).toBe(1)
			expect(state.speed).toBe(1)
		})
	})

	describe('loadFromFile', () => {
		let tempDir: string

		beforeEach(async () => {
			tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mock-replay-'))
		})

		afterEach(async () => {
			try {
				await fs.rm(tempDir, { recursive: true })
			} catch {
				// Ignore cleanup errors
			}
		})

		it('should load recording from file', async () => {
			const recording = createMockRecording()
			const filePath = path.join(tempDir, 'recording.json')
			await fs.writeFile(filePath, JSON.stringify(recording))

			const loaded = await RecordingPlayer.loadFromFile(filePath)

			expect(loaded.version).toBe(1)
			expect(loaded.metadata.sessionName).toBe('test-recording')
		})

		it('should reject invalid recording version', async () => {
			const recording = { ...createMockRecording(), version: 2 }
			const filePath = path.join(tempDir, 'recording.json')
			await fs.writeFile(filePath, JSON.stringify(recording))

			await expect(RecordingPlayer.loadFromFile(filePath)).rejects.toThrow(
				'Unsupported recording version: 2'
			)
		})

		it('should reject malformed recording', async () => {
			const filePath = path.join(tempDir, 'recording.json')
			await fs.writeFile(filePath, JSON.stringify({ version: 1 }))

			await expect(RecordingPlayer.loadFromFile(filePath)).rejects.toThrow(
				'Invalid recording format'
			)
		})
	})

	describe('play()', () => {
		it('should replay empty recording', async () => {
			const recording = createMockRecording()
			const player = new RecordingPlayer(recording)
			const session = new Session()

			const result = await player.play(session, { speed: 0 })

			expect(result.success).toBe(true)
			expect(result.actionsReplayed).toBe(0)
		})

		it('should replay actions in order', async () => {
			const startTime = 1000
			const recording = createMockRecording({
				actions: [
					createDispatchAction('EVENT_1', { order: 1 }, startTime),
					createDispatchAction('EVENT_2', { order: 2 }, startTime + 100),
					createDispatchAction('EVENT_3', { order: 3 }, startTime + 200)
				]
			})
			recording.metadata.startTime = startTime
			recording.metadata.endTime = startTime + 200
			recording.metadata.duration = 200
			recording.metadata.actionCount = 3

			const player = new RecordingPlayer(recording)
			const session = new Session()

			const dispatched: string[] = []
			const originalDispatch = session.dispatch.bind(session)
			session.dispatch = async (event: string, data: unknown) => {
				dispatched.push(event)
				return originalDispatch(event, data)
			}

			const result = await player.play(session, { speed: 0 })

			expect(result.success).toBe(true)
			expect(result.actionsReplayed).toBe(3)
			expect(dispatched).toEqual(['EVENT_1', 'EVENT_2', 'EVENT_3'])
		})

		it('should reset session state before replay', async () => {
			const recording = createMockRecording({
				initialConfig: {
					botUser: { id: '999', username: 'RecordedBot', bot: true },
					guilds: [{ name: 'Recorded Guild', channels: [{ name: 'recorded-channel' }] }]
				}
			})

			const player = new RecordingPlayer(recording)
			const session = new Session()

			// Add some state that should be cleared
			createDefaultGuildWithChannel(session.state, { guildName: 'Pre-existing Guild' })

			await player.play(session, { speed: 0 })

			// Should have the guild from recording, not pre-existing
			const guilds = Array.from(session.state.guilds.values())
			expect(guilds.length).toBe(1)
			expect(guilds[0].name).toBe('Recorded Guild')
		})

		it('should fire progress callbacks', async () => {
			const startTime = 1000
			const recording = createMockRecording({
				actions: [
					createDispatchAction('EVENT_1', {}, startTime),
					createDispatchAction('EVENT_2', {}, startTime + 50)
				]
			})
			recording.metadata.startTime = startTime
			recording.metadata.duration = 50

			const player = new RecordingPlayer(recording)
			const session = new Session()

			const progressStates: ReplayState[] = []
			await player.play(session, {
				speed: 0,
				onProgress: (state) => progressStates.push({ ...state })
			})

			// Should have progress updates (initial + per action + final)
			expect(progressStates.length).toBeGreaterThanOrEqual(3)

			// Final state should be completed
			const finalState = progressStates[progressStates.length - 1]
			expect(finalState.mode).toBe('completed')
		})

		it('should call onComplete callback', async () => {
			const recording = createMockRecording()
			const player = new RecordingPlayer(recording)
			const session = new Session()

			let completedResult: unknown = null
			await player.play(session, {
				speed: 0,
				onComplete: (result) => {
					completedResult = result
				}
			})

			expect(completedResult).not.toBeNull()
			expect((completedResult as { success: boolean }).success).toBe(true)
		})
	})

	describe('speed control', () => {
		it('should replay instantly with speed=0', async () => {
			const startTime = 1000
			const recording = createMockRecording({
				actions: [
					createDispatchAction('EVENT_1', {}, startTime),
					createDispatchAction('EVENT_2', {}, startTime + 10000) // 10 seconds later
				]
			})
			recording.metadata.startTime = startTime
			recording.metadata.duration = 10000

			const player = new RecordingPlayer(recording)
			const session = new Session()

			const start = Date.now()
			await player.play(session, { speed: 0 })
			const elapsed = Date.now() - start

			// Should complete almost instantly (< 500ms for safety margin)
			expect(elapsed).toBeLessThan(500)
		})

		it('should allow changing speed mid-replay', () => {
			const recording = createMockRecording()
			const player = new RecordingPlayer(recording)

			player.setSpeed(2)
			expect(player.getState().speed).toBe(2)

			player.setSpeed(0.5)
			expect(player.getState().speed).toBe(0.5)
		})
	})

	describe('pause/resume/stop', () => {
		it('should pause and resume', async () => {
			const startTime = 1000
			const recording = createMockRecording({
				actions: [
					createDispatchAction('EVENT_1', {}, startTime),
					createDispatchAction('EVENT_2', {}, startTime + 100),
					createDispatchAction('EVENT_3', {}, startTime + 200)
				]
			})
			recording.metadata.startTime = startTime
			recording.metadata.duration = 200

			const player = new RecordingPlayer(recording)
			const session = new Session()

			let actionsBeforePause = 0
			const originalDispatch = session.dispatch.bind(session)
			session.dispatch = async (event: string, data: unknown) => {
				actionsBeforePause++
				if (actionsBeforePause === 1) {
					player.pause()
					// Resume after a brief delay
					setTimeout(() => player.resume(), 50)
				}
				return originalDispatch(event, data)
			}

			const result = await player.play(session, { speed: 0 })

			// All actions should complete after resume
			expect(result.actionsReplayed).toBe(3)
		})

		it('should stop mid-replay', async () => {
			const startTime = 1000
			const recording = createMockRecording({
				actions: [
					createDispatchAction('EVENT_1', {}, startTime),
					createDispatchAction('EVENT_2', {}, startTime + 100),
					createDispatchAction('EVENT_3', {}, startTime + 200)
				]
			})
			recording.metadata.startTime = startTime
			recording.metadata.duration = 200

			const player = new RecordingPlayer(recording)
			const session = new Session()

			let actionCount = 0
			const originalDispatch = session.dispatch.bind(session)
			session.dispatch = async (event: string, data: unknown) => {
				actionCount++
				if (actionCount === 2) {
					player.stop()
				}
				return originalDispatch(event, data)
			}

			const result = await player.play(session, { speed: 0 })

			expect(result.success).toBe(false) // Stopped = not successful
			expect(result.actionsReplayed).toBe(2) // Only 2 before stop
		})
	})

	describe('seek', () => {
		it('should update currentTime when seeking', () => {
			const recording = createMockRecording()
			recording.metadata.duration = 10000

			const player = new RecordingPlayer(recording)

			player.seek(5000)
			expect(player.getState().currentTime).toBe(5000)
		})

		it('should clamp seek to valid range', () => {
			const recording = createMockRecording()
			recording.metadata.duration = 10000

			const player = new RecordingPlayer(recording)

			player.seek(-1000)
			expect(player.getState().currentTime).toBe(0)

			player.seek(20000)
			expect(player.getState().currentTime).toBe(10000)
		})

		it('should update currentIndex when seeking', () => {
			const startTime = 1000
			const recording = createMockRecording({
				actions: [
					createDispatchAction('EVENT_1', {}, startTime),
					createDispatchAction('EVENT_2', {}, startTime + 100),
					createDispatchAction('EVENT_3', {}, startTime + 200)
				]
			})
			recording.metadata.startTime = startTime
			recording.metadata.duration = 200

			const player = new RecordingPlayer(recording)

			player.seek(150) // Between EVENT_2 and EVENT_3
			expect(player.getState().currentIndex).toBe(1) // Should be at index 1 (EVENT_2)
		})
	})

	describe('validation', () => {
		it('should skip validation when validate=false', async () => {
			const recording = createMockRecording()
			const player = new RecordingPlayer(recording)
			const session = new Session()

			const result = await player.play(session, { speed: 0, validate: false })

			expect(result.validation).toBeUndefined()
		})

		it('should include validation when validate=true', async () => {
			const recording = createMockRecording()
			const player = new RecordingPlayer(recording)
			const session = new Session()

			const result = await player.play(session, { speed: 0, validate: true })

			expect(result.validation).toBeDefined()
			expect(result.validation?.passed).toBe(true)
		})

		it('should pass validation with type-only mode', async () => {
			const startTime = 1000
			const recording = createMockRecording({
				actions: [
					createDispatchAction('MESSAGE_CREATE', { content: 'test' }, startTime),
					{
						id: 'response-1',
						timestamp: startTime + 10,
						type: 'message_sent',
						data: { content: 'response' },
						triggeredBy: `action-${startTime}`
					}
				]
			})
			recording.metadata.startTime = startTime

			const player = new RecordingPlayer(recording)
			const session = new Session()

			// Mock bot response during replay by hooking into dispatch
			const originalDispatch = session.dispatch.bind(session)
			session.dispatch = async (event: string, data: unknown) => {
				await originalDispatch(event, data)
				// Simulate bot responding after dispatch
				session.recordAction('message_sent', { content: 'different response' })
			}

			const result = await player.play(session, {
				speed: 0,
				validate: true,
				validationMode: 'type-only'
			})

			// type-only should pass as long as we got a message_sent back
			expect(result.validation?.passed).toBe(true)
		})
	})

	describe('getState', () => {
		it('should return copy of state', () => {
			const recording = createMockRecording()
			const player = new RecordingPlayer(recording)

			const state1 = player.getState()
			const state2 = player.getState()

			expect(state1).not.toBe(state2) // Different objects
			expect(state1).toEqual(state2) // Same values
		})
	})

	describe('result', () => {
		it('should include duration in result', async () => {
			const recording = createMockRecording()
			const player = new RecordingPlayer(recording)
			const session = new Session()

			const result = await player.play(session, { speed: 0 })

			expect(result.duration).toBeGreaterThanOrEqual(0)
			expect(typeof result.duration).toBe('number')
		})

		it('should count actions correctly', async () => {
			const startTime = 1000
			const recording = createMockRecording({
				actions: [
					createDispatchAction('EVENT_1', {}, startTime),
					createDispatchAction('EVENT_2', {}, startTime + 50),
					// Non-dispatch action should not be counted in replay
					{
						id: 'response-1',
						timestamp: startTime + 60,
						type: 'message_sent',
						data: {}
					}
				]
			})
			recording.metadata.startTime = startTime

			const player = new RecordingPlayer(recording)
			const session = new Session()

			const result = await player.play(session, { speed: 0 })

			expect(result.actionsReplayed).toBe(2) // Only dispatch actions
		})
	})
})
