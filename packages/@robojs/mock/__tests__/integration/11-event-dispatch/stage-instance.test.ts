/**
 * Stage Instance Events Tests
 *
 * Tests for stage instance create, update, and delete events.
 */
import { ChannelType, Client, Events, GatewayIntentBits, StageChannel, StageInstance } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForEvent, waitForReady } from '../utils/helpers.js'

describe('Stage Instance Events', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let stageChannel: StageChannel | null = null

	beforeAll(async () => {
		session = await createSession({
			name: 'stage-instance-tests',
			config: {
				guilds: [{ name: 'Stage Test Guild' }]
			}
		})

		client = createTestClient({
			intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
		})
		await client.login(session.token)
		await waitForReady(client)

		const guild = client.guilds.cache.first()!

		// Create a stage channel for testing
		stageChannel = (await guild.channels.create({
			name: 'stage-events',
			type: ChannelType.GuildStageVoice
		})) as StageChannel
	})

	afterAll(async () => {
		if (stageChannel) {
			await stageChannel.delete().catch(() => {})
		}
		await destroyClient(client)
		client = null
	})

	describe('Stage Instance Create Event', () => {
		it('should emit stageInstanceCreate', async () => {
			const eventPromise = waitForEvent(client!, Events.StageInstanceCreate, 5000)

			const stageInstance = await stageChannel!.createStageInstance({
				topic: 'Event Stage'
			})

			try {
				const emittedInstance = await eventPromise
				expect(emittedInstance.topic).toBe('Event Stage')
			} finally {
				await stageInstance.delete().catch(() => {})
			}
		})
	})

	describe('Stage Instance Update Event', () => {
		it('should emit stageInstanceUpdate', async () => {
			const stageInstance = await stageChannel!.createStageInstance({
				topic: 'Update Stage'
			})

			try {
				const eventPromise = new Promise<{ oldInstance: StageInstance | null; newInstance: StageInstance }>(
					(resolve, reject) => {
						const timeout = setTimeout(() => reject(new Error('Timeout waiting for event')), 5000)
						client!.once(Events.StageInstanceUpdate, (oldInstance, newInstance) => {
							clearTimeout(timeout)
							resolve({ oldInstance, newInstance })
						})
					}
				)

				await stageInstance.edit({ topic: 'Updated Topic' })

				const { oldInstance, newInstance } = await eventPromise

				expect(oldInstance?.topic).toBe('Update Stage')
				expect(newInstance.topic).toBe('Updated Topic')
			} finally {
				await stageInstance.delete().catch(() => {})
			}
		})
	})

	describe('Stage Instance Delete Event', () => {
		it('should emit stageInstanceDelete', async () => {
			const stageInstance = await stageChannel!.createStageInstance({
				topic: 'Delete Stage'
			})
			const instanceId = stageInstance.id

			const eventPromise = waitForEvent(client!, Events.StageInstanceDelete, 5000)

			await stageInstance.delete()

			const deletedInstance = await eventPromise
			expect(deletedInstance.id).toBe(instanceId)
		})
	})
})
