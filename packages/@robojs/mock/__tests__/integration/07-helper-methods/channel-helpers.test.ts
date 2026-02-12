/**
 * Channel Helper Methods Tests
 *
 * Tests for channel helper methods including clone, setPosition, setParent,
 * setNSFW, setRateLimitPerUser, setTopic, and voice channel settings.
 */
import {
	ChannelType,
	Client,
	GatewayIntentBits,
	TextChannel,
	VoiceChannel,
	CategoryChannel,
	VideoQualityMode
} from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Channel Helper Methods', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guildId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'channel-helper-tests',
			config: {
				guilds: [
					{
						name: 'Channel Helper Guild',
						channels: [
							{ name: 'general', type: ChannelType.GuildText },
							{ name: 'voice-test', type: ChannelType.GuildVoice }
						]
					}
				]
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds])
		await client.login(session.token)
		await waitForReady(client)

		guildId = client.guilds.cache.first()!.id
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('TextChannel Methods', () => {
		let channel: TextChannel

		beforeAll(async () => {
			const guild = client!.guilds.cache.get(guildId)!
			channel = (await guild.channels.create({
				name: 'helper-test',
				type: ChannelType.GuildText
			})) as TextChannel
		})

		afterAll(async () => {
			if (channel) {
				try {
					await channel.delete()
				} catch {
					// Channel may already be deleted
				}
			}
		})

		it('should clone channel', async () => {
			const clone = await channel.clone()

			expect(clone.name).toBe(channel.name)
			expect(clone.type).toBe(channel.type)
			expect(clone.id).not.toBe(channel.id)

			await clone.delete()
		})

		it('should clone with new name', async () => {
			const clone = await channel.clone({ name: 'cloned-channel' })

			expect(clone.name).toBe('cloned-channel')

			await clone.delete()
		})

		it('should set channel position', async () => {
			const originalPosition = channel.position

			await channel.setPosition(0)
			expect(channel.position).toBe(0)

			// Restore
			await channel.setPosition(originalPosition)
		})

		it('should set channel parent', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const category = (await guild.channels.create({
				name: 'Test Category',
				type: ChannelType.GuildCategory
			})) as CategoryChannel

			await channel.setParent(category.id)
			expect(channel.parentId).toBe(category.id)

			await channel.setParent(null)
			expect(channel.parentId).toBeNull()

			await category.delete()
		})

		it('should set NSFW', async () => {
			await channel.setNSFW(true)
			expect(channel.nsfw).toBe(true)

			await channel.setNSFW(false)
			expect(channel.nsfw).toBe(false)
		})

		it('should set rate limit (slowmode)', async () => {
			await channel.setRateLimitPerUser(10)
			expect(channel.rateLimitPerUser).toBe(10)

			await channel.setRateLimitPerUser(0)
			expect(channel.rateLimitPerUser).toBe(0)
		})

		it('should set topic', async () => {
			await channel.setTopic('Test topic')
			expect(channel.topic).toBe('Test topic')

			await channel.setTopic(null)
			expect(channel.topic).toBeNull()
		})

		it('should set default auto archive duration', async () => {
			await channel.setDefaultAutoArchiveDuration(1440) // 1 day
			expect(channel.defaultAutoArchiveDuration).toBe(1440)
		})
	})

	describe('VoiceChannel Methods', () => {
		let voiceChannel: VoiceChannel

		beforeAll(async () => {
			const guild = client!.guilds.cache.get(guildId)!
			voiceChannel = (await guild.channels.create({
				name: 'voice-helper-test',
				type: ChannelType.GuildVoice
			})) as VoiceChannel
		})

		afterAll(async () => {
			if (voiceChannel) {
				try {
					await voiceChannel.delete()
				} catch {
					// Channel may already be deleted
				}
			}
		})

		it('should set bitrate', async () => {
			await voiceChannel.setBitrate(96000)
			expect(voiceChannel.bitrate).toBe(96000)
		})

		it('should set user limit', async () => {
			await voiceChannel.setUserLimit(10)
			expect(voiceChannel.userLimit).toBe(10)

			await voiceChannel.setUserLimit(0)
			expect(voiceChannel.userLimit).toBe(0)
		})

		it('should set RTC region', async () => {
			await voiceChannel.setRTCRegion('us-east')
			expect(voiceChannel.rtcRegion).toBe('us-east')

			await voiceChannel.setRTCRegion(null)
			expect(voiceChannel.rtcRegion).toBeNull()
		})

		it('should set video quality mode', async () => {
			await voiceChannel.setVideoQualityMode(VideoQualityMode.Full)
			expect(voiceChannel.videoQualityMode).toBe(VideoQualityMode.Full)
		})
	})
})
