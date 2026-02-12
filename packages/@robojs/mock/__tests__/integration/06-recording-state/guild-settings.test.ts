/**
 * Guild Settings Tests
 *
 * Tests for guild CRUD operations including editing guild name,
 * description, system settings, and verification levels.
 */
import {
	Client,
	Events,
	ChannelType,
	Guild,
	GuildVerificationLevel,
	GuildDefaultMessageNotifications,
	GuildExplicitContentFilter,
	GuildSystemChannelFlags
} from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Guild Settings', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guild: Guild

	beforeAll(async () => {
		session = await createSession({
			name: 'guild-settings-tests',
			config: {
				guilds: [
					{
						name: 'Settings Test Guild',
						channels: [
							{ name: 'general', type: ChannelType.GuildText },
							{ name: 'voice', type: ChannelType.GuildVoice }
						]
					}
				]
			}
		})

		client = createTestClient()
		await client.login(session.token)
		await waitForReady(client)

		guild = client.guilds.cache.first()!
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Getting Guild Info', () => {
		it('should fetch guild by id', async () => {
			const fetched = await guild.fetch()

			expect(fetched.id).toBe(guild.id)
			expect(fetched.name).toBeDefined()
		})

		it('should have correct guild properties', async () => {
			expect(guild.id).toMatch(/^\d{17,19}$/)
			expect(guild.name).toBe('Settings Test Guild')
			expect(guild.ownerId).toBeDefined()
		})

		it('should have default verification level', async () => {
			expect(guild.verificationLevel).toBeDefined()
		})

		it('should have channels', async () => {
			expect(guild.channels.cache.size).toBeGreaterThan(0)
		})

		it('should have roles', async () => {
			// Every guild has at least @everyone role
			expect(guild.roles.cache.size).toBeGreaterThanOrEqual(1)
		})
	})

	describe('Editing Guild Name', () => {
		it('should edit guild name', async () => {
			const originalName = guild.name

			await guild.edit({ name: 'Renamed Guild' })
			expect(guild.name).toBe('Renamed Guild')

			// Restore original name
			await guild.edit({ name: originalName })
			expect(guild.name).toBe(originalName)
		})

		it('should emit guildUpdate event on name change', async () => {
			const originalName = guild.name

			const eventPromise = new Promise<{ oldGuild: Guild; newGuild: Guild }>((resolve) => {
				client!.once(Events.GuildUpdate, (oldGuild, newGuild) => resolve({ oldGuild, newGuild }))
			})

			await guild.edit({ name: 'Event Test Name' })

			const { oldGuild, newGuild } = await eventPromise
			expect(oldGuild.name).toBe(originalName)
			expect(newGuild.name).toBe('Event Test Name')

			// Restore
			await guild.edit({ name: originalName })
		})
	})

	describe('Editing Guild Description', () => {
		it('should set guild description', async () => {
			await guild.edit({ description: 'Test description for the guild' })
			expect(guild.description).toBe('Test description for the guild')
		})

		it('should clear guild description', async () => {
			await guild.edit({ description: null })
			expect(guild.description).toBeNull()
		})
	})

	describe('Editing System Channel', () => {
		it('should set system channel', async () => {
			const textChannel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText)

			if (textChannel) {
				await guild.edit({ systemChannel: textChannel.id })
				expect(guild.systemChannelId).toBe(textChannel.id)
			}
		})

		it('should clear system channel', async () => {
			await guild.edit({ systemChannel: null })
			expect(guild.systemChannelId).toBeNull()
		})
	})

	describe('Editing System Channel Flags', () => {
		it('should set system channel flags', async () => {
			await guild.edit({
				systemChannelFlags: GuildSystemChannelFlags.SuppressJoinNotifications
			})

			expect(guild.systemChannelFlags.has(GuildSystemChannelFlags.SuppressJoinNotifications)).toBe(true)
		})

		it('should set multiple system channel flags', async () => {
			const flags =
				GuildSystemChannelFlags.SuppressJoinNotifications | GuildSystemChannelFlags.SuppressPremiumSubscriptions

			await guild.edit({ systemChannelFlags: flags })

			expect(guild.systemChannelFlags.has(GuildSystemChannelFlags.SuppressJoinNotifications)).toBe(true)
			expect(guild.systemChannelFlags.has(GuildSystemChannelFlags.SuppressPremiumSubscriptions)).toBe(true)
		})

		it('should clear system channel flags', async () => {
			await guild.edit({ systemChannelFlags: 0 })
			expect(guild.systemChannelFlags.bitfield).toBe(0)
		})
	})

	describe('Editing Verification Level', () => {
		it('should set verification level to Low', async () => {
			await guild.edit({ verificationLevel: GuildVerificationLevel.Low })
			expect(guild.verificationLevel).toBe(GuildVerificationLevel.Low)
		})

		it('should set verification level to Medium', async () => {
			await guild.edit({ verificationLevel: GuildVerificationLevel.Medium })
			expect(guild.verificationLevel).toBe(GuildVerificationLevel.Medium)
		})

		it('should set verification level to High', async () => {
			await guild.edit({ verificationLevel: GuildVerificationLevel.High })
			expect(guild.verificationLevel).toBe(GuildVerificationLevel.High)
		})

		it('should reset verification level to None', async () => {
			await guild.edit({ verificationLevel: GuildVerificationLevel.None })
			expect(guild.verificationLevel).toBe(GuildVerificationLevel.None)
		})
	})

	describe('Editing Default Notifications', () => {
		it('should set default notifications to all messages', async () => {
			await guild.edit({ defaultMessageNotifications: GuildDefaultMessageNotifications.AllMessages })
			expect(guild.defaultMessageNotifications).toBe(GuildDefaultMessageNotifications.AllMessages)
		})

		it('should set default notifications to only mentions', async () => {
			await guild.edit({ defaultMessageNotifications: GuildDefaultMessageNotifications.OnlyMentions })
			expect(guild.defaultMessageNotifications).toBe(GuildDefaultMessageNotifications.OnlyMentions)
		})
	})

	describe('Editing Explicit Content Filter', () => {
		it('should disable explicit content filter', async () => {
			await guild.edit({ explicitContentFilter: GuildExplicitContentFilter.Disabled })
			expect(guild.explicitContentFilter).toBe(GuildExplicitContentFilter.Disabled)
		})

		it('should set filter to members without roles', async () => {
			await guild.edit({ explicitContentFilter: GuildExplicitContentFilter.MembersWithoutRoles })
			expect(guild.explicitContentFilter).toBe(GuildExplicitContentFilter.MembersWithoutRoles)
		})

		it('should set filter to all members', async () => {
			await guild.edit({ explicitContentFilter: GuildExplicitContentFilter.AllMembers })
			expect(guild.explicitContentFilter).toBe(GuildExplicitContentFilter.AllMembers)
		})
	})

	describe('Editing AFK Settings', () => {
		it('should set AFK channel', async () => {
			const voiceChannel = guild.channels.cache.find((c) => c.type === ChannelType.GuildVoice)

			if (voiceChannel) {
				await guild.edit({ afkChannel: voiceChannel.id })
				expect(guild.afkChannelId).toBe(voiceChannel.id)
			}
		})

		it('should set AFK timeout', async () => {
			await guild.edit({ afkTimeout: 300 }) // 5 minutes
			expect(guild.afkTimeout).toBe(300)
		})

		it('should set different AFK timeout values', async () => {
			await guild.edit({ afkTimeout: 900 }) // 15 minutes
			expect(guild.afkTimeout).toBe(900)

			await guild.edit({ afkTimeout: 1800 }) // 30 minutes
			expect(guild.afkTimeout).toBe(1800)
		})

		it('should clear AFK channel', async () => {
			await guild.edit({ afkChannel: null })
			expect(guild.afkChannelId).toBeNull()
		})
	})

	describe('Guild Update Events', () => {
		it('should emit event on description change', async () => {
			const eventPromise = new Promise<{ oldGuild: Guild; newGuild: Guild }>((resolve) => {
				client!.once(Events.GuildUpdate, (oldGuild, newGuild) => resolve({ oldGuild, newGuild }))
			})

			await guild.edit({ description: 'New description for event test' })

			const { newGuild } = await eventPromise
			expect(newGuild.description).toBe('New description for event test')
		})

		it('should emit event on verification level change', async () => {
			const eventPromise = new Promise<{ oldGuild: Guild; newGuild: Guild }>((resolve) => {
				client!.once(Events.GuildUpdate, (oldGuild, newGuild) => resolve({ oldGuild, newGuild }))
			})

			await guild.edit({ verificationLevel: GuildVerificationLevel.Medium })

			const { newGuild } = await eventPromise
			expect(newGuild.verificationLevel).toBe(GuildVerificationLevel.Medium)
		})
	})

	describe('Multiple Settings Update', () => {
		it('should update multiple settings at once', async () => {
			const originalName = guild.name

			await guild.edit({
				name: 'Multi Update Test',
				description: 'Updated via multi-update',
				verificationLevel: GuildVerificationLevel.Low,
				defaultMessageNotifications: GuildDefaultMessageNotifications.OnlyMentions
			})

			expect(guild.name).toBe('Multi Update Test')
			expect(guild.description).toBe('Updated via multi-update')
			expect(guild.verificationLevel).toBe(GuildVerificationLevel.Low)
			expect(guild.defaultMessageNotifications).toBe(GuildDefaultMessageNotifications.OnlyMentions)

			// Restore
			await guild.edit({ name: originalName })
		})
	})
})
