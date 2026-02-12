/**
 * Stage Channel & Stage Instance Tests
 *
 * Tests for Stage Channel and Stage Instance operations including create, edit,
 * delete, stageInstance property, requestToSpeak, and setSpeaker.
 */
import {
	ChannelType,
	Client,
	Events,
	GatewayIntentBits,
	Guild,
	StageChannel,
	StageInstance,
	StageInstancePrivacyLevel
} from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForEvent, waitForReady, delay } from '../utils/helpers.js'

describe('Stage Channel & Stage Instance', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guild: Guild
	let stageChannel: StageChannel | null = null
	let guildId: string

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

		guild = client.guilds.cache.first()!
		guildId = guild.id

		// Create a stage channel for testing
		stageChannel = (await guild.channels.create({
			name: 'stage-test',
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

	describe('Stage Instance Create', () => {
		it('should create stage instance', async () => {
			const instance = await stageChannel!.createStageInstance({
				topic: 'Test Stage Topic',
				privacyLevel: StageInstancePrivacyLevel.GuildOnly
			})

			expect(instance.topic).toBe('Test Stage Topic')
			expect(instance.channelId).toBe(stageChannel!.id)

			await instance.delete().catch(() => {})
		})

		it('should create stage instance with default privacy level', async () => {
			const instance = await stageChannel!.createStageInstance({
				topic: 'Default Privacy Topic'
			})

			expect(instance.topic).toBe('Default Privacy Topic')
			expect(instance.privacyLevel).toBe(StageInstancePrivacyLevel.GuildOnly)

			await instance.delete().catch(() => {})
		})
	})

	describe('Stage Instance Edit', () => {
		it('should edit stage instance topic', async () => {
			const instance = await stageChannel!.createStageInstance({
				topic: 'Original Topic'
			})

			await instance.edit({ topic: 'Updated Topic' })

			expect(instance.topic).toBe('Updated Topic')

			await instance.delete().catch(() => {})
		})
	})

	describe('Stage Instance Delete', () => {
		it('should delete stage instance', async () => {
			const instance = await stageChannel!.createStageInstance({
				topic: 'Delete Me'
			})

			await instance.delete()

			expect(stageChannel!.stageInstance).toBeNull()
		})
	})

	describe('Stage Instance Property on Channel', () => {
		it('should have stageInstance property on channel', async () => {
			const instance = await stageChannel!.createStageInstance({
				topic: 'Channel Property Test'
			})

			expect(stageChannel!.stageInstance?.id).toBe(instance.id)

			await instance.delete().catch(() => {})
		})

		it('should have null stageInstance when no instance exists', async () => {
			// Ensure no stage instance exists
			if (stageChannel!.stageInstance) {
				await stageChannel!.stageInstance.delete().catch(() => {})
				await delay(100)
			}

			expect(stageChannel!.stageInstance).toBeNull()
		})
	})

	describe('Stage Instance Events', () => {
		it('should emit stageInstanceCreate', async () => {
			const eventPromise = waitForEvent(client!, Events.StageInstanceCreate, 5000)

			const instance = await stageChannel!.createStageInstance({
				topic: 'Event Stage'
			})

			try {
				const emittedInstance = await eventPromise
				expect(emittedInstance.topic).toBe('Event Stage')
			} finally {
				await instance.delete().catch(() => {})
			}
		})

		it('should emit stageInstanceUpdate', async () => {
			const instance = await stageChannel!.createStageInstance({
				topic: 'Update Event Stage'
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

				await instance.edit({ topic: 'Updated Event Topic' })

				const { oldInstance, newInstance } = await eventPromise

				expect(oldInstance?.topic).toBe('Update Event Stage')
				expect(newInstance.topic).toBe('Updated Event Topic')
			} finally {
				await instance.delete().catch(() => {})
			}
		})

		it('should emit stageInstanceDelete', async () => {
			const instance = await stageChannel!.createStageInstance({
				topic: 'Delete Event Stage'
			})
			const instanceId = instance.id

			const eventPromise = waitForEvent(client!, Events.StageInstanceDelete, 5000)

			await instance.delete()

			const deletedInstance = await eventPromise
			expect(deletedInstance.id).toBe(instanceId)
		})
	})

	describe('Request To Speak', () => {
		it('should track request to speak via voice state update', async () => {
			const instance = await stageChannel!.createStageInstance({
				topic: 'Request Speaking Test'
			})

			try {
				// Add member to guild
				const memberId = generateSnowflake()
				await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
					guild_id: guildId,
					user: {
						id: memberId,
						username: `Audience_${memberId.slice(-4)}`,
						discriminator: '0000',
						avatar: null,
						bot: false
					},
					roles: [],
					joined_at: new Date().toISOString(),
					deaf: false,
					mute: false
				})

				// Join stage as audience (suppressed)
				await dispatchEvent(session.id, 'VOICE_STATE_UPDATE', {
					guild_id: guildId,
					channel_id: stageChannel!.id,
					user_id: memberId,
					session_id: generateSnowflake(),
					suppress: true,
					request_to_speak_timestamp: null
				})

				await delay(100)

				// Request to speak by dispatching voice state update with timestamp
				const requestTime = new Date().toISOString()
				await dispatchEvent(session.id, 'VOICE_STATE_UPDATE', {
					guild_id: guildId,
					channel_id: stageChannel!.id,
					user_id: memberId,
					session_id: generateSnowflake(),
					suppress: true,
					request_to_speak_timestamp: requestTime
				})

				await delay(100)

				// Verify request to speak timestamp is set
				const member = await guild.members.fetch(memberId)
				expect(member.voice.requestToSpeakTimestamp).toBeDefined()
			} finally {
				await instance.delete().catch(() => {})
			}
		})
	})

	describe('Set Speaker', () => {
		it('should track member becoming speaker via voice state update', async () => {
			const instance = await stageChannel!.createStageInstance({
				topic: 'Speaker Test'
			})

			try {
				// Add member to guild
				const memberId = generateSnowflake()
				await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
					guild_id: guildId,
					user: {
						id: memberId,
						username: `NewSpeaker_${memberId.slice(-4)}`,
						discriminator: '0000',
						avatar: null,
						bot: false
					},
					roles: [],
					joined_at: new Date().toISOString(),
					deaf: false,
					mute: false
				})

				// Join stage as audience (suppressed)
				await dispatchEvent(session.id, 'VOICE_STATE_UPDATE', {
					guild_id: guildId,
					channel_id: stageChannel!.id,
					user_id: memberId,
					session_id: generateSnowflake(),
					suppress: true
				})

				await delay(100)

				const member = await guild.members.fetch(memberId)
				expect(member.voice.suppress).toBe(true)

				// Make them a speaker (unsuppress) via voice state update
				await dispatchEvent(session.id, 'VOICE_STATE_UPDATE', {
					guild_id: guildId,
					channel_id: stageChannel!.id,
					user_id: memberId,
					session_id: generateSnowflake(),
					suppress: false
				})

				await delay(100)

				// Refetch to verify
				const updated = await guild.members.fetch(memberId)
				expect(updated.voice.suppress).toBe(false)
			} finally {
				await instance.delete().catch(() => {})
			}
		})

		it('should track member being suppressed back to audience', async () => {
			const instance = await stageChannel!.createStageInstance({
				topic: 'Suppress Test'
			})

			try {
				// Add member to guild
				const memberId = generateSnowflake()
				await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
					guild_id: guildId,
					user: {
						id: memberId,
						username: `ToSuppress_${memberId.slice(-4)}`,
						discriminator: '0000',
						avatar: null,
						bot: false
					},
					roles: [],
					joined_at: new Date().toISOString(),
					deaf: false,
					mute: false
				})

				// Join stage as speaker (not suppressed)
				await dispatchEvent(session.id, 'VOICE_STATE_UPDATE', {
					guild_id: guildId,
					channel_id: stageChannel!.id,
					user_id: memberId,
					session_id: generateSnowflake(),
					suppress: false
				})

				await delay(100)

				const member = await guild.members.fetch(memberId)
				expect(member.voice.suppress).toBe(false)

				// Suppress them back to audience via voice state update
				await dispatchEvent(session.id, 'VOICE_STATE_UPDATE', {
					guild_id: guildId,
					channel_id: stageChannel!.id,
					user_id: memberId,
					session_id: generateSnowflake(),
					suppress: true
				})

				await delay(100)

				// Refetch to verify
				const updated = await guild.members.fetch(memberId)
				expect(updated.voice.suppress).toBe(true)
			} finally {
				await instance.delete().catch(() => {})
			}
		})
	})
})
