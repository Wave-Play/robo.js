/**
 * Guild Verification & Content Filter Tests
 *
 * Tests for guild verification level, explicit content filter, and default message notifications.
 * Covers all verification levels, all filter levels, and notification settings.
 */
import {
	Client,
	GuildDefaultMessageNotifications,
	GuildExplicitContentFilter,
	GuildVerificationLevel
} from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Guild Verification & Content Filter', () => {
	let client: Client | null = null
	let session: { id: string; token: string }

	beforeAll(async () => {
		session = await createSession({
			name: 'guild-verification',
			config: {
				guilds: [
					{
						name: 'Verification Test Guild'
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

	it('should have verificationLevel', () => {
		const guild = client!.guilds.cache.first()!

		expect(guild.verificationLevel).toBeDefined()
	})

	it('should set verificationLevel', async () => {
		const guild = client!.guilds.cache.first()!

		await guild.setVerificationLevel(GuildVerificationLevel.Medium)

		expect(guild.verificationLevel).toBe(GuildVerificationLevel.Medium)
	})

	it('should support all verification levels', async () => {
		const guild = client!.guilds.cache.first()!
		const levels = [
			GuildVerificationLevel.None,
			GuildVerificationLevel.Low,
			GuildVerificationLevel.Medium,
			GuildVerificationLevel.High,
			GuildVerificationLevel.VeryHigh
		]

		for (const level of levels) {
			await guild.setVerificationLevel(level)
			expect(guild.verificationLevel).toBe(level)
		}
	})

	it('should have explicitContentFilter', () => {
		const guild = client!.guilds.cache.first()!

		expect(guild.explicitContentFilter).toBeDefined()
	})

	it('should set explicitContentFilter', async () => {
		const guild = client!.guilds.cache.first()!

		await guild.setExplicitContentFilter(GuildExplicitContentFilter.AllMembers)

		expect(guild.explicitContentFilter).toBe(GuildExplicitContentFilter.AllMembers)
	})

	it('should support all content filter levels', async () => {
		const guild = client!.guilds.cache.first()!
		const levels = [
			GuildExplicitContentFilter.Disabled,
			GuildExplicitContentFilter.MembersWithoutRoles,
			GuildExplicitContentFilter.AllMembers
		]

		for (const level of levels) {
			await guild.setExplicitContentFilter(level)
			expect(guild.explicitContentFilter).toBe(level)
		}
	})

	it('should have defaultMessageNotifications', () => {
		const guild = client!.guilds.cache.first()!

		expect(guild.defaultMessageNotifications).toBeDefined()
	})

	it('should set defaultMessageNotifications', async () => {
		const guild = client!.guilds.cache.first()!

		await guild.setDefaultMessageNotifications(GuildDefaultMessageNotifications.OnlyMentions)

		expect(guild.defaultMessageNotifications).toBe(GuildDefaultMessageNotifications.OnlyMentions)
	})
})
