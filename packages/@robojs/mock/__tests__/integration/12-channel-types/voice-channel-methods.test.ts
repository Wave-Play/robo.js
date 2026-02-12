/**
 * VoiceChannel-Specific Methods Tests
 *
 * Tests for voice channel specific properties and methods
 * including members, full, and joinable properties.
 */
import { ChannelType, Client, GatewayIntentBits, VideoQualityMode, VoiceChannel } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('VoiceChannel-Specific Methods', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guildId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'voice-channel-methods-tests',
			config: {
				guilds: [
					{
						name: 'VoiceChannel Methods Guild',
						channels: [
							{ name: 'general', type: ChannelType.GuildText },
							{ name: 'voice', type: ChannelType.GuildVoice }
						]
					}
				]
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates])
		await client.login(session.token)
		await waitForReady(client)

		guildId = client.guilds.cache.first()!.id
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Creating Voice Channels', () => {
		it('should create voice channel with all options', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			const channel = (await guild.channels.create({
				name: 'full-voice',
				type: ChannelType.GuildVoice,
				bitrate: 64000,
				userLimit: 10,
				rtcRegion: 'us-east',
				videoQualityMode: VideoQualityMode.Full
			})) as VoiceChannel

			try {
				expect(channel.bitrate).toBe(64000)
				expect(channel.userLimit).toBe(10)
				expect(channel.rtcRegion).toBe('us-east')
				expect(channel.videoQualityMode).toBe(VideoQualityMode.Full)
			} finally {
				await channel.delete().catch(() => {})
			}
		})
	})

	describe('Voice Channel Members', () => {
		it('should fetch voice channel members', () => {
			const guild = client!.guilds.cache.get(guildId)!
			const voiceChannel = guild.channels.cache.find((c) => c.type === ChannelType.GuildVoice) as VoiceChannel

			if (voiceChannel) {
				expect(voiceChannel.members).toBeDefined()
				expect(voiceChannel.members.size).toBeGreaterThanOrEqual(0)
			}
		})
	})

	describe('Voice Channel Properties', () => {
		it('should check if voice channel is full', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			const channel = (await guild.channels.create({
				name: 'limited-voice',
				type: ChannelType.GuildVoice,
				userLimit: 2
			})) as VoiceChannel

			try {
				expect(channel.full).toBe(false)
				expect(channel.userLimit).toBe(2)
			} finally {
				await channel.delete().catch(() => {})
			}
		})

		it('should check if channel is joinable', () => {
			const guild = client!.guilds.cache.get(guildId)!
			const voiceChannel = guild.channels.cache.find((c) => c.type === ChannelType.GuildVoice) as VoiceChannel

			if (voiceChannel) {
				expect(typeof voiceChannel.joinable).toBe('boolean')
			}
		})
	})
})
