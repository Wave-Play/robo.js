/**
 * Voice State Tests
 *
 * Tests for voice channel creation and properties.
 * Note: Event dispatch for VOICE_STATE_UPDATE is not currently supported,
 * so these tests focus on voice channel REST API operations.
 */
import { ChannelType, Client, GatewayIntentBits, VoiceChannel } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Voice States', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guildId: string
	let voiceChannel: VoiceChannel

	beforeAll(async () => {
		session = await createSession({
			name: 'voice-state-tests',
			config: {
				guilds: [
					{
						name: 'Voice Test Guild',
						channels: [
							{ name: 'general', type: ChannelType.GuildText },
							{ name: 'Voice Channel', type: ChannelType.GuildVoice }
						]
					}
				]
			}
		})

		client = createTestClient({
			intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
		})
		await client.login(session.token)
		await waitForReady(client)

		guildId = client.guilds.cache.first()!.id
		voiceChannel = client.guilds.cache.first()!.channels.cache.find((c) => c.type === ChannelType.GuildVoice) as VoiceChannel
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Voice Channel Properties', () => {
		it('should have correct channel type', () => {
			expect(voiceChannel.type).toBe(ChannelType.GuildVoice)
		})

		it('should have guild reference', () => {
			expect(voiceChannel.guild).toBeDefined()
			expect(voiceChannel.guildId).toBe(guildId)
		})

		it('should have channel name', () => {
			expect(voiceChannel.name).toBe('Voice Channel')
		})

		it('should be voice-based', () => {
			expect(voiceChannel.isVoiceBased()).toBe(true)
		})

		it('should be text-based (voice channels support text in Discord.js v14+)', () => {
			// Voice channels in Discord.js v14+ support text chat
			expect(voiceChannel.isTextBased()).toBe(true)
		})
	})

	describe('Voice Channel Fetch', () => {
		it('should fetch voice channel by ID', async () => {
			const fetched = await client!.channels.fetch(voiceChannel.id)
			expect(fetched).toBeDefined()
			expect(fetched?.id).toBe(voiceChannel.id)
			expect(fetched?.type).toBe(ChannelType.GuildVoice)
		})

		it('should find voice channel in guild cache', () => {
			const guild = client!.guilds.cache.get(guildId)!
			const found = guild.channels.cache.find((c) => c.type === ChannelType.GuildVoice)
			expect(found).toBeDefined()
			expect(found?.id).toBe(voiceChannel.id)
		})
	})

	describe('Voice Channel Collection', () => {
		it('should list voice channels in guild', () => {
			const guild = client!.guilds.cache.get(guildId)!
			const voiceChannels = guild.channels.cache.filter((c) => c.type === ChannelType.GuildVoice)
			expect(voiceChannels.size).toBeGreaterThanOrEqual(1)
		})

		it('should have voice channel members collection', () => {
			// VoiceChannel has a members collection (empty when no one is in the channel)
			expect(voiceChannel.members).toBeDefined()
		})
	})

	describe('Voice Channel Permissions', () => {
		it('should have permission overwrites', () => {
			expect(voiceChannel.permissionOverwrites).toBeDefined()
		})

		it('should check bot permissions in voice channel', () => {
			const guild = client!.guilds.cache.get(guildId)!
			const me = guild.members.me
			if (me) {
				const perms = voiceChannel.permissionsFor(me)
				expect(perms).toBeDefined()
			}
		})
	})
})
