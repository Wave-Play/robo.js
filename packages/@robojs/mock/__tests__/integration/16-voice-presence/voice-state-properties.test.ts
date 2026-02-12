/**
 * VoiceState Properties Tests
 *
 * Tests for VoiceState properties including selfMute, selfDeaf, streaming,
 * selfVideo, suppress, requestToSpeakTimestamp, serverMute, and serverDeaf.
 */
import { ChannelType, Client, GatewayIntentBits, Guild, VoiceChannel, StageChannel } from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForReady, delay } from '../utils/helpers.js'

describe('VoiceState Properties', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guild: Guild
	let voiceChannel: VoiceChannel
	let guildId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'voice-state-properties-tests',
			config: {
				guilds: [
					{
						name: 'VoiceState Test Guild',
						channels: [
							{ name: 'general', type: ChannelType.GuildText },
							{ name: 'Voice Channel', type: ChannelType.GuildVoice }
						]
					}
				]
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates])
		await client.login(session.token)
		await waitForReady(client)

		guild = client.guilds.cache.first()!
		guildId = guild.id
		voiceChannel = guild.channels.cache.find((c) => c.type === ChannelType.GuildVoice) as VoiceChannel
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	/**
	 * Helper to add a member to the guild and put them in a voice channel
	 */
	async function setupMemberInVoice(
		userId: string,
		channelId: string,
		voiceStateOptions: Record<string, unknown> = {}
	): Promise<void> {
		// Add member to guild
		await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
			guild_id: guildId,
			user: {
				id: userId,
				username: `VoiceUser_${userId.slice(-4)}`,
				discriminator: '0000',
				avatar: null,
				bot: false
			},
			roles: [],
			joined_at: new Date().toISOString(),
			deaf: false,
			mute: false
		})

		// Put member in voice channel with specified state
		await dispatchEvent(session.id, 'VOICE_STATE_UPDATE', {
			guild_id: guildId,
			channel_id: channelId,
			user_id: userId,
			session_id: generateSnowflake(),
			deaf: false,
			mute: false,
			self_deaf: false,
			self_mute: false,
			self_video: false,
			self_stream: false,
			suppress: false,
			request_to_speak_timestamp: null,
			...voiceStateOptions
		})

		// Wait for cache update
		await delay(100)
	}

	describe('Self Mute', () => {
		it('should have selfMute property set to true', async () => {
			const memberId = generateSnowflake()
			await setupMemberInVoice(memberId, voiceChannel.id, {
				self_mute: true,
				self_deaf: false
			})

			const member = await guild.members.fetch(memberId)
			expect(member.voice.selfMute).toBe(true)
		})

		it('should have selfMute property set to false', async () => {
			const memberId = generateSnowflake()
			await setupMemberInVoice(memberId, voiceChannel.id, {
				self_mute: false
			})

			const member = await guild.members.fetch(memberId)
			expect(member.voice.selfMute).toBe(false)
		})
	})

	describe('Self Deaf', () => {
		it('should have selfDeaf property set to true', async () => {
			const memberId = generateSnowflake()
			await setupMemberInVoice(memberId, voiceChannel.id, {
				self_deaf: true,
				self_mute: false
			})

			const member = await guild.members.fetch(memberId)
			expect(member.voice.selfDeaf).toBe(true)
		})

		it('should have selfDeaf property set to false', async () => {
			const memberId = generateSnowflake()
			await setupMemberInVoice(memberId, voiceChannel.id, {
				self_deaf: false
			})

			const member = await guild.members.fetch(memberId)
			expect(member.voice.selfDeaf).toBe(false)
		})
	})

	describe('Streaming', () => {
		it('should have streaming property set to true', async () => {
			const memberId = generateSnowflake()
			await setupMemberInVoice(memberId, voiceChannel.id, {
				self_stream: true
			})

			const member = await guild.members.fetch(memberId)
			expect(member.voice.streaming).toBe(true)
		})

		it('should have streaming property set to false by default', async () => {
			const memberId = generateSnowflake()
			await setupMemberInVoice(memberId, voiceChannel.id, {
				self_stream: false
			})

			const member = await guild.members.fetch(memberId)
			expect(member.voice.streaming).toBe(false)
		})
	})

	describe('Self Video', () => {
		it('should have selfVideo property set to true', async () => {
			const memberId = generateSnowflake()
			await setupMemberInVoice(memberId, voiceChannel.id, {
				self_video: true
			})

			const member = await guild.members.fetch(memberId)
			expect(member.voice.selfVideo).toBe(true)
		})

		it('should have selfVideo property set to false by default', async () => {
			const memberId = generateSnowflake()
			await setupMemberInVoice(memberId, voiceChannel.id, {
				self_video: false
			})

			const member = await guild.members.fetch(memberId)
			expect(member.voice.selfVideo).toBe(false)
		})
	})

	describe('Suppress', () => {
		it('should have suppress property set to true', async () => {
			const memberId = generateSnowflake()
			await setupMemberInVoice(memberId, voiceChannel.id, {
				suppress: true
			})

			const member = await guild.members.fetch(memberId)
			expect(member.voice.suppress).toBe(true)
		})

		it('should have suppress property set to false by default', async () => {
			const memberId = generateSnowflake()
			await setupMemberInVoice(memberId, voiceChannel.id, {
				suppress: false
			})

			const member = await guild.members.fetch(memberId)
			expect(member.voice.suppress).toBe(false)
		})
	})

	describe('Request To Speak Timestamp', () => {
		let stageChannel: StageChannel | null = null

		beforeAll(async () => {
			// Create stage channel for testing
			stageChannel = (await guild.channels.create({
				name: 'stage-request-test',
				type: ChannelType.GuildStageVoice
			})) as StageChannel
		})

		afterAll(async () => {
			if (stageChannel) {
				await stageChannel.delete().catch(() => {})
			}
		})

		it('should have requestToSpeakTimestamp when set', async () => {
			const memberId = generateSnowflake()
			const requestTime = new Date().toISOString()

			// Add member to guild
			await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
				guild_id: guildId,
				user: {
					id: memberId,
					username: `Speaker_${memberId.slice(-4)}`,
					discriminator: '0000',
					avatar: null,
					bot: false
				},
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			})

			// Put in stage channel with request to speak
			await dispatchEvent(session.id, 'VOICE_STATE_UPDATE', {
				guild_id: guildId,
				channel_id: stageChannel!.id,
				user_id: memberId,
				session_id: generateSnowflake(),
				suppress: true,
				request_to_speak_timestamp: requestTime
			})

			await delay(100)

			const member = await guild.members.fetch(memberId)
			expect(member.voice.requestToSpeakTimestamp).toBeDefined()
		})

		it('should have null requestToSpeakTimestamp when not set', async () => {
			const memberId = generateSnowflake()

			// Add member to guild
			await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
				guild_id: guildId,
				user: {
					id: memberId,
					username: `NoSpeak_${memberId.slice(-4)}`,
					discriminator: '0000',
					avatar: null,
					bot: false
				},
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			})

			// Put in stage channel without request to speak
			await dispatchEvent(session.id, 'VOICE_STATE_UPDATE', {
				guild_id: guildId,
				channel_id: stageChannel!.id,
				user_id: memberId,
				session_id: generateSnowflake(),
				suppress: true,
				request_to_speak_timestamp: null
			})

			await delay(100)

			const member = await guild.members.fetch(memberId)
			expect(member.voice.requestToSpeakTimestamp).toBeNull()
		})
	})

	describe('Server Mute and Server Deaf', () => {
		it('should have serverMute property set to true', async () => {
			const memberId = generateSnowflake()
			await setupMemberInVoice(memberId, voiceChannel.id, {
				mute: true,
				deaf: false
			})

			const member = await guild.members.fetch(memberId)
			expect(member.voice.serverMute).toBe(true)
		})

		it('should have serverDeaf property set to true', async () => {
			const memberId = generateSnowflake()
			await setupMemberInVoice(memberId, voiceChannel.id, {
				mute: false,
				deaf: true
			})

			const member = await guild.members.fetch(memberId)
			expect(member.voice.serverDeaf).toBe(true)
		})

		it('should have both serverMute and serverDeaf set to true', async () => {
			const memberId = generateSnowflake()
			await setupMemberInVoice(memberId, voiceChannel.id, {
				mute: true,
				deaf: true
			})

			const member = await guild.members.fetch(memberId)
			expect(member.voice.serverMute).toBe(true)
			expect(member.voice.serverDeaf).toBe(true)
		})

		it('should have both serverMute and serverDeaf set to false by default', async () => {
			const memberId = generateSnowflake()
			await setupMemberInVoice(memberId, voiceChannel.id, {
				mute: false,
				deaf: false
			})

			const member = await guild.members.fetch(memberId)
			expect(member.voice.serverMute).toBe(false)
			expect(member.voice.serverDeaf).toBe(false)
		})
	})
})
