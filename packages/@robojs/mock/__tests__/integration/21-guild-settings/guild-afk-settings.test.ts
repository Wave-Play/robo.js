/**
 * Guild AFK Settings Tests
 *
 * Tests for guild AFK channel and timeout settings.
 * Covers setting AFK channel, AFK timeout, valid timeout values, and null AFK channel.
 */
import { ChannelType, Client, VoiceChannel } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Guild AFK Settings', () => {
	let client: Client | null = null
	let session: { id: string; token: string }

	beforeAll(async () => {
		session = await createSession({
			name: 'guild-afk-settings',
			config: {
				guilds: [
					{
						name: 'AFK Settings Test Guild',
						channels: [
							{ name: 'general', type: ChannelType.GuildText },
							{ name: 'afk-voice', type: ChannelType.GuildVoice }
						]
					}
				]
			}
		})

		client = createTestClient()
		await client.login(session.token)
		await waitForReady(client)
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	it('should have afkChannel', async () => {
		const guild = client!.guilds.cache.first()!
		const voiceChannel = (await guild.channels.create({
			name: 'afk-channel',
			type: ChannelType.GuildVoice
		})) as VoiceChannel

		try {
			await guild.setAFKChannel(voiceChannel)

			expect(guild.afkChannel?.id).toBe(voiceChannel.id)
			expect(guild.afkChannelId).toBe(voiceChannel.id)
		} finally {
			await voiceChannel.delete().catch(() => {})
		}
	})

	it('should have afkTimeout', async () => {
		const guild = client!.guilds.cache.first()!

		await guild.setAFKTimeout(300) // 5 minutes

		expect(guild.afkTimeout).toBe(300)
	})

	it('should set afkTimeout to valid values', async () => {
		const guild = client!.guilds.cache.first()!
		const validTimeouts = [60, 300, 900, 1800, 3600] // 1, 5, 15, 30, 60 minutes

		for (const timeout of validTimeouts) {
			await guild.setAFKTimeout(timeout)
			expect(guild.afkTimeout).toBe(timeout)
		}
	})

	it('should set null afk channel', async () => {
		const guild = client!.guilds.cache.first()!

		await guild.setAFKChannel(null)

		expect(guild.afkChannelId).toBeNull()
	})
})
