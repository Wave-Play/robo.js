/**
 * Unit tests for Session Recording Export functionality
 * Fixture Recording
 */

import { Session } from '../src/session/session.js'
import { createDefaultGuildWithChannel } from '../src/session/state.js'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'

describe('Session Recording Export', () => {
	describe('exportRecording()', () => {
		it('should export recording with correct version', () => {
			const session = new Session({ name: 'test-session' })
			const recording = session.exportRecording()

			expect(recording.version).toBe(1)
		})

		it('should export recording with session metadata', () => {
			const session = new Session({ name: 'test-session' })
			const recording = session.exportRecording()

			expect(recording.metadata.sessionId).toBe(session.id)
			expect(recording.metadata.sessionName).toBe('test-session')
			expect(recording.metadata.startTime).toBe(session.createdAt)
			expect(recording.metadata.endTime).toBeGreaterThanOrEqual(session.createdAt)
			expect(recording.metadata.duration).toBeGreaterThanOrEqual(0)
			expect(recording.metadata.recordedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
		})

		it('should export recording with bot user info', () => {
			const session = new Session({
				config: {
					botUser: { username: 'TestBot', id: '123456789' }
				}
			})
			const recording = session.exportRecording()

			expect(recording.metadata.botUser.id).toBe('123456789')
			expect(recording.metadata.botUser.username).toBe('TestBot')
		})

		it('should export recording with application ID', () => {
			const session = new Session({
				config: {
					applicationId: '987654321'
				}
			})
			const recording = session.exportRecording()

			expect(recording.metadata.applicationId).toBe('987654321')
		})

		it('should export recording with action count', () => {
			const session = new Session()

			// Record some actions
			session.recordAction('message_sent', { content: 'Hello' })
			session.recordAction('message_sent', { content: 'World' })

			const recording = session.exportRecording()

			expect(recording.metadata.actionCount).toBe(2)
		})

		it('should export recording with all actions', () => {
			const session = new Session()

			session.recordAction('message_sent', { content: 'Hello' })
			session.recordAction('dispatch', { event: 'MESSAGE_CREATE' })
			session.recordAction('gateway_heartbeat', { seq: 1 })

			const recording = session.exportRecording()

			expect(recording.actions).toHaveLength(3)
			expect(recording.actions[0].type).toBe('message_sent')
			expect(recording.actions[1].type).toBe('dispatch')
			expect(recording.actions[2].type).toBe('gateway_heartbeat')
		})

		it('should export recording with initial config', () => {
			const session = new Session()

			const recording = session.exportRecording()

			expect(recording.initialConfig).toBeDefined()
			expect(recording.initialConfig.botUser).toBeDefined()
			expect(recording.initialConfig.applicationId).toBeDefined()
		})

		it('should export recording with guilds in initial config', () => {
			const session = new Session({ config: { guilds: [] } })
			createDefaultGuildWithChannel(session.state, {
				guildName: 'Test Guild',
				channelName: 'general'
			})

			const recording = session.exportRecording()

			expect(recording.initialConfig.guilds).toHaveLength(1)
			expect(recording.initialConfig.guilds![0].name).toBe('Test Guild')
		})

		it('should export recording with channels in initial config', () => {
			const session = new Session({ config: { guilds: [] } })
			createDefaultGuildWithChannel(session.state, {
				guildName: 'Test Guild',
				channelName: 'test-channel'
			})

			const recording = session.exportRecording()

			const guild = recording.initialConfig.guilds![0]
			expect(guild.channels).toHaveLength(1)
			expect(guild.channels![0].name).toBe('test-channel')
		})

		it('should export recording with maxActions in initial config', () => {
			const session = new Session({ config: { maxActions: 500 } })
			const recording = session.exportRecording()

			expect(recording.initialConfig.maxActions).toBe(500)
		})

		it('should be JSON serializable', () => {
			const session = new Session({ name: 'test' })
			session.recordAction('message_sent', { content: 'test' })

			const recording = session.exportRecording()
			const serialized = JSON.stringify(recording)
			const parsed = JSON.parse(serialized)

			expect(parsed.version).toBe(1)
			expect(parsed.metadata.sessionName).toBe('test')
			expect(parsed.actions).toHaveLength(1)
		})
	})

	describe('saveRecording()', () => {
		let tempDir: string

		beforeEach(async () => {
			tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mock-recording-'))
		})

		afterEach(async () => {
			try {
				await fs.rm(tempDir, { recursive: true })
			} catch {
				// Ignore cleanup errors
			}
		})

		it('should save recording to file', async () => {
			const session = new Session({ name: 'save-test' })
			session.recordAction('message_sent', { content: 'Hello' })

			const filePath = path.join(tempDir, 'recording.json')
			await session.saveRecording(filePath)

			const fileContent = await fs.readFile(filePath, 'utf-8')
			const recording = JSON.parse(fileContent)

			expect(recording.version).toBe(1)
			expect(recording.metadata.sessionName).toBe('save-test')
			expect(recording.actions).toHaveLength(1)
		})

		it('should save recording with pretty JSON', async () => {
			const session = new Session()

			const filePath = path.join(tempDir, 'recording.json')
			await session.saveRecording(filePath)

			const fileContent = await fs.readFile(filePath, 'utf-8')

			// Pretty JSON should have newlines and indentation
			expect(fileContent).toContain('\n')
			expect(fileContent).toContain('  ')
		})

		it('should overwrite existing file', async () => {
			const filePath = path.join(tempDir, 'recording.json')

			// Create first session and save
			const session1 = new Session({ name: 'first' })
			await session1.saveRecording(filePath)

			// Create second session and save to same path
			const session2 = new Session({ name: 'second' })
			await session2.saveRecording(filePath)

			const fileContent = await fs.readFile(filePath, 'utf-8')
			const recording = JSON.parse(fileContent)

			expect(recording.metadata.sessionName).toBe('second')
		})
	})

	describe('recording duration', () => {
		it('should calculate duration from creation to export time', async () => {
			const session = new Session()

			// Wait a bit
			await new Promise((resolve) => setTimeout(resolve, 50))

			const recording = session.exportRecording()

			expect(recording.metadata.duration).toBeGreaterThanOrEqual(50)
			expect(recording.metadata.duration).toBeLessThan(1000) // Should not be too long
		})

		it('should have endTime >= startTime', () => {
			const session = new Session()
			const recording = session.exportRecording()

			expect(recording.metadata.endTime).toBeGreaterThanOrEqual(recording.metadata.startTime)
		})

		it('should have consistent duration calculation', () => {
			const session = new Session()
			const recording = session.exportRecording()

			const expectedDuration = recording.metadata.endTime - recording.metadata.startTime
			expect(recording.metadata.duration).toBe(expectedDuration)
		})
	})

	describe('action preservation', () => {
		it('should preserve action order', () => {
			const session = new Session()

			for (let i = 0; i < 10; i++) {
				session.recordAction('message_sent', { index: i })
			}

			const recording = session.exportRecording()

			for (let i = 0; i < 10; i++) {
				expect((recording.actions[i].data as { index: number }).index).toBe(i)
			}
		})

		it('should preserve action timestamps', async () => {
			const session = new Session()

			session.recordAction('message_sent', { first: true })
			await new Promise((resolve) => setTimeout(resolve, 10))
			session.recordAction('message_sent', { second: true })

			const recording = session.exportRecording()

			expect(recording.actions[0].timestamp).toBeLessThan(recording.actions[1].timestamp)
		})

		it('should preserve action metadata', () => {
			const session = new Session()

			session.recordAction('interaction_response', { type: 4 }, {
				interactionId: '123',
				responseType: 4,
				triggeredBy: 'event_abc'
			})

			const recording = session.exportRecording()
			const action = recording.actions[0]

			expect(action.interactionId).toBe('123')
			expect(action.responseType).toBe(4)
			expect(action.triggeredBy).toBe('event_abc')
		})
	})
})
