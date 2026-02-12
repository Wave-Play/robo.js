/**
 * Member Voice Methods Tests
 *
 * Tests for member voice state manipulation including setMute, setDeaf,
 * setChannel, and disconnect.
 *
 * Note: These tests require control API support for managing voice states.
 */
import { ChannelType, Client, GatewayIntentBits, GuildMember, VoiceChannel } from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForReady, delay } from '../utils/helpers.js'

describe('Member Voice Methods', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guildId: string
	let voiceChannel: VoiceChannel
	let voiceChannel2: VoiceChannel
	let testMemberId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'member-voice-tests',
			config: {
				guilds: [
					{
						name: 'Voice Test Guild',
						channels: [
							{ name: 'general', type: ChannelType.GuildText },
							{ name: 'Voice Channel', type: ChannelType.GuildVoice },
							{ name: 'Voice Channel 2', type: ChannelType.GuildVoice }
						]
					}
				]
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates])
		await client.login(session.token)
		await waitForReady(client)

		const guild = client.guilds.cache.first()!
		guildId = guild.id

		const voiceChannels = guild.channels.cache.filter((c) => c.type === ChannelType.GuildVoice)
		voiceChannel = voiceChannels.first() as VoiceChannel
		voiceChannel2 = voiceChannels.last() as VoiceChannel

		// Create a test member
		testMemberId = generateSnowflake()
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	/**
	 * Helper to add a member to the guild and put them in a voice channel
	 */
	async function setupMemberInVoice(userId: string, channelId: string): Promise<void> {
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

		// Put member in voice channel
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
			request_to_speak_timestamp: null
		})

		// Wait for cache update
		await delay(100)
	}

	describe('Voice State Manipulation', () => {
		let testMember: GuildMember

		beforeAll(async () => {
			await setupMemberInVoice(testMemberId, voiceChannel.id)
			const guild = client!.guilds.cache.get(guildId)!
			testMember = await guild.members.fetch(testMemberId)
		})

		it('should server mute member', async () => {
			await testMember.voice.setMute(true)

			// Refetch to verify
			const updated = await client!.guilds.cache.get(guildId)!.members.fetch(testMemberId)
			expect(updated.voice.serverMute).toBe(true)
		})

		it('should server unmute member', async () => {
			await testMember.voice.setMute(false)

			const updated = await client!.guilds.cache.get(guildId)!.members.fetch(testMemberId)
			expect(updated.voice.serverMute).toBe(false)
		})

		it('should server deafen member', async () => {
			await testMember.voice.setDeaf(true)

			const updated = await client!.guilds.cache.get(guildId)!.members.fetch(testMemberId)
			expect(updated.voice.serverDeaf).toBe(true)
		})

		it('should server undeafen member', async () => {
			await testMember.voice.setDeaf(false)

			const updated = await client!.guilds.cache.get(guildId)!.members.fetch(testMemberId)
			expect(updated.voice.serverDeaf).toBe(false)
		})

		it('should move member to different channel', async () => {
			await testMember.voice.setChannel(voiceChannel2)

			const updated = await client!.guilds.cache.get(guildId)!.members.fetch(testMemberId)
			expect(updated.voice.channelId).toBe(voiceChannel2.id)

			// Move back
			await testMember.voice.setChannel(voiceChannel)
		})

		it('should disconnect member from voice', async () => {
			await testMember.voice.disconnect()

			const updated = await client!.guilds.cache.get(guildId)!.members.fetch(testMemberId)
			expect(updated.voice.channelId).toBeNull()
		})

		it('should set mute with reason', async () => {
			// Reconnect member to voice first
			await dispatchEvent(session.id, 'VOICE_STATE_UPDATE', {
				guild_id: guildId,
				channel_id: voiceChannel.id,
				user_id: testMemberId,
				session_id: generateSnowflake(),
				deaf: false,
				mute: false,
				self_deaf: false,
				self_mute: false,
				self_video: false,
				self_stream: false,
				suppress: false,
				request_to_speak_timestamp: null
			})
			await delay(100)

			await testMember.voice.setMute(true, 'Breaking rules')

			const updated = await client!.guilds.cache.get(guildId)!.members.fetch(testMemberId)
			expect(updated.voice.serverMute).toBe(true)
		})
	})
})
