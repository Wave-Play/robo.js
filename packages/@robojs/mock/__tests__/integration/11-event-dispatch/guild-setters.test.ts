/**
 * Guild Direct Setters Tests
 *
 * Tests for guild direct setter methods like setName, setDescription, etc.
 */
import {
	ChannelType,
	Client,
	GatewayIntentBits,
	GuildDefaultMessageNotifications,
	GuildExplicitContentFilter,
	GuildSystemChannelFlags,
	GuildVerificationLevel,
	Locale,
	TextChannel,
	VoiceChannel
} from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Guild Direct Setters', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guildId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'guild-setters-tests',
			config: {
				guilds: [
					{
						name: 'Setters Test Guild',
						channels: [
							{ name: 'text-channel', type: ChannelType.GuildText },
							{ name: 'voice-channel', type: ChannelType.GuildVoice }
						]
					}
				]
			}
		})

		client = createTestClient({
			intents: [GatewayIntentBits.Guilds]
		})
		await client.login(session.token)
		await waitForReady(client)

		guildId = client.guilds.cache.first()!.id
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Basic Setters', () => {
		it('should set guild name via setName()', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const originalName = guild.name

			await guild.setName('New Guild Name')
			expect(guild.name).toBe('New Guild Name')

			// Reset
			await guild.setName(originalName)
		})

		it('should set guild description via edit()', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			await guild.edit({ description: 'A test guild description' })
			expect(guild.description).toBe('A test guild description')

			// Clear description
			await guild.edit({ description: null })
		})
	})

	describe('AFK Settings', () => {
		it('should set AFK channel via setAFKChannel()', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const voiceChannel = guild.channels.cache.find((c) => c.type === ChannelType.GuildVoice) as VoiceChannel

			if (voiceChannel) {
				await guild.setAFKChannel(voiceChannel)
				expect(guild.afkChannelId).toBe(voiceChannel.id)
			}
		})

		it('should set AFK timeout via setAFKTimeout()', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			await guild.setAFKTimeout(600) // 10 minutes
			expect(guild.afkTimeout).toBe(600)
		})
	})

	describe('System Channel Settings', () => {
		it('should set system channel via setSystemChannel()', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const textChannel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel

			await guild.setSystemChannel(textChannel)
			expect(guild.systemChannelId).toBe(textChannel.id)
		})

		it('should set system channel flags', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			await guild.setSystemChannelFlags([
				GuildSystemChannelFlags.SuppressJoinNotifications,
				GuildSystemChannelFlags.SuppressPremiumSubscriptions
			])

			expect(guild.systemChannelFlags.has(GuildSystemChannelFlags.SuppressJoinNotifications)).toBe(true)
			expect(guild.systemChannelFlags.has(GuildSystemChannelFlags.SuppressPremiumSubscriptions)).toBe(true)
		})
	})

	describe('Moderation Settings', () => {
		it('should set verification level', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			await guild.setVerificationLevel(GuildVerificationLevel.Medium)
			expect(guild.verificationLevel).toBe(GuildVerificationLevel.Medium)
		})

		it('should set explicit content filter', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			await guild.setExplicitContentFilter(GuildExplicitContentFilter.AllMembers)
			expect(guild.explicitContentFilter).toBe(GuildExplicitContentFilter.AllMembers)
		})

		it('should set default message notifications', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			await guild.setDefaultMessageNotifications(GuildDefaultMessageNotifications.OnlyMentions)
			expect(guild.defaultMessageNotifications).toBe(GuildDefaultMessageNotifications.OnlyMentions)
		})
	})

	describe('Locale and Premium Settings', () => {
		it('should set preferred locale', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			await guild.setPreferredLocale(Locale.EnglishUS)
			expect(guild.preferredLocale).toBe(Locale.EnglishUS)
		})

		it('should set premium progress bar enabled via edit()', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			await guild.edit({ premiumProgressBarEnabled: true })
			expect(guild.premiumProgressBarEnabled).toBe(true)
		})
	})
})
