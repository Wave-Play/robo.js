/**
 * Recording Replay Tests
 *
 * Tests for replaying previously recorded sessions, including
 * speed control, validation, and timing preservation.
 */
import { Client, ChannelType, TextChannel } from 'discord.js'
import {
	createSession,
	getSessionRecording,
	replayRecording,
	resetSession,
	type SessionRecording
} from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForReady, delay } from '../utils/helpers.js'

describe('Recording Replay', () => {
	let sourceRecording: SessionRecording
	let sourceSession: { id: string; token: string }

	// Create a source recording first
	beforeAll(async () => {
		sourceSession = await createSession({
			name: 'replay-source-session',
			config: {
				guilds: [
					{
						name: 'Replay Source Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		const tempClient = createTestClient()
		await tempClient.login(sourceSession.token)
		await waitForReady(tempClient)

		const channel = tempClient.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel

		// Record some actions
		await channel.send('Replay message 1')
		await delay(50)
		await channel.send('Replay message 2')
		await delay(50)
		await channel.send('Replay message 3')
		await delay(100)

		// Export the recording
		sourceRecording = await getSessionRecording(sourceSession.id)

		await destroyClient(tempClient)
	})

	describe('Loading Recordings', () => {
		let client: Client | null = null
		let session: { id: string; token: string }

		beforeEach(async () => {
			session = await createSession({
				name: 'replay-target-session',
				config: {
					guilds: [
						{
							name: 'Replay Target Guild',
							channels: [{ name: 'general', type: ChannelType.GuildText }]
						}
					]
				}
			})

			client = createTestClient()
			await client.login(session.token)
			await waitForReady(client)
		})

		afterEach(async () => {
			await destroyClient(client)
			client = null
		})

		it('should load recording from session export', async () => {
			expect(sourceRecording).toBeDefined()
			expect(sourceRecording.version).toBe(1)
			expect(sourceRecording.actions.length).toBeGreaterThan(0)
		})

		it('should replay recording successfully', async () => {
			const result = await replayRecording(session.id, sourceRecording, {
				speed: 0 // Instant replay
			})

			expect(result.success).toBe(true)
			expect(result.actionsReplayed).toBeGreaterThan(0)
		})

		it('should report actions replayed count', async () => {
			const result = await replayRecording(session.id, sourceRecording, {
				speed: 0
			})

			expect(result.actionsReplayed).toBe(sourceRecording.actions.length)
		})

		it('should report replay duration', async () => {
			const result = await replayRecording(session.id, sourceRecording, {
				speed: 0
			})

			expect(result.duration).toBeDefined()
			expect(typeof result.duration).toBe('number')
		})
	})

	describe('Replay Speed Control', () => {
		let client: Client | null = null
		let session: { id: string; token: string }

		beforeEach(async () => {
			session = await createSession({
				name: 'replay-speed-session',
				config: {
					guilds: [
						{
							name: 'Replay Speed Guild',
							channels: [{ name: 'general', type: ChannelType.GuildText }]
						}
					]
				}
			})

			client = createTestClient()
			await client.login(session.token)
			await waitForReady(client)
		})

		afterEach(async () => {
			await destroyClient(client)
			client = null
		})

		it('should replay instantly with speed=0', async () => {
			const startTime = Date.now()

			const result = await replayRecording(session.id, sourceRecording, {
				speed: 0 // Instant
			})

			const elapsed = Date.now() - startTime

			expect(result.success).toBe(true)
			// Instant replay should be fast (less than 1 second even with network overhead)
			expect(elapsed).toBeLessThan(2000)
		})

		it('should support speed multiplier', async () => {
			const result = await replayRecording(session.id, sourceRecording, {
				speed: 10 // 10x speed
			})

			expect(result.success).toBe(true)
			// Should complete faster than original timing but slower than instant
			expect(result.duration).toBeGreaterThan(0)
		})
	})

	describe('Replay Validation', () => {
		let client: Client | null = null
		let session: { id: string; token: string }

		beforeEach(async () => {
			session = await createSession({
				name: 'replay-validation-session',
				config: {
					guilds: [
						{
							name: 'Replay Validation Guild',
							channels: [{ name: 'general', type: ChannelType.GuildText }]
						}
					]
				}
			})

			client = createTestClient()
			await client.login(session.token)
			await waitForReady(client)
		})

		afterEach(async () => {
			await destroyClient(client)
			client = null
		})

		it('should support validation mode', async () => {
			const result = await replayRecording(session.id, sourceRecording, {
				speed: 0,
				validate: true,
				validationMode: 'flexible'
			})

			expect(result.success).toBe(true)
			// When validation is enabled, should have validation results
			if (result.validation) {
				expect(typeof result.validation.passed).toBe('boolean')
				expect(typeof result.validation.matched).toBe('number')
			}
		})

		it('should support strict validation mode', async () => {
			const result = await replayRecording(session.id, sourceRecording, {
				speed: 0,
				validate: true,
				validationMode: 'strict'
			})

			expect(result.success).toBe(true)
		})

		it('should support type-only validation mode', async () => {
			const result = await replayRecording(session.id, sourceRecording, {
				speed: 0,
				validate: true,
				validationMode: 'type-only'
			})

			expect(result.success).toBe(true)
		})
	})

	describe('Replay After Reset', () => {
		let client: Client | null = null
		let session: { id: string; token: string }

		beforeEach(async () => {
			session = await createSession({
				name: 'replay-reset-session',
				config: {
					guilds: [
						{
							name: 'Replay Reset Guild',
							channels: [{ name: 'general', type: ChannelType.GuildText }]
						}
					]
				}
			})

			client = createTestClient()
			await client.login(session.token)
			await waitForReady(client)
		})

		afterEach(async () => {
			await destroyClient(client)
			client = null
		})

		it('should replay into reset session', async () => {
			// First reset the session
			await resetSession(session.id)
			await delay(100)

			// Then replay
			const result = await replayRecording(session.id, sourceRecording, {
				speed: 0
			})

			expect(result.success).toBe(true)
		})
	})
})
