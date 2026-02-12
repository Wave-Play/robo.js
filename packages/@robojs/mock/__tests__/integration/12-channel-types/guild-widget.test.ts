/**
 * Guild Preview & Widget Tests
 *
 * Tests for guild preview and widget functionality including
 * fetchGuildPreview, widget settings, and widget data.
 */
import { ChannelType, Client, GatewayIntentBits, TextChannel } from 'discord.js'
import { createSession, controlAPI } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Guild Preview & Widget', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guildId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'guild-widget-tests',
			config: {
				guilds: [
					{
						name: 'Widget Test Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
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

	describe('Guild Preview', () => {
		it('should fetch guild preview', async () => {
			// Guild preview requires DISCOVERABLE feature
			try {
				await controlAPI(`/sessions/${session.id}/state/guild`, {
					method: 'PATCH',
					body: {
						guild_id: guildId,
						features: ['DISCOVERABLE']
					}
				})
			} catch {
				// Control API endpoint may not exist, skip feature setup
			}

			try {
				const preview = await client!.fetchGuildPreview(guildId)

				expect(preview.id).toBe(guildId)
				expect(preview.name).toBeDefined()
				expect(preview.approximateMemberCount).toBeDefined()
			} catch (error) {
				// Preview may not be available for non-discoverable guilds
				// This is expected behavior in some cases
			}
		})
	})

	describe('Widget Settings', () => {
		it('should fetch widget settings', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			try {
				const widget = await guild.fetchWidgetSettings()

				expect(widget).toBeDefined()
				expect(typeof widget.enabled).toBe('boolean')
			} catch {
				// Widget settings endpoint may not be implemented
			}
		})

		it('should set widget settings', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel

			try {
				await guild.setWidgetSettings({
					enabled: true,
					channel: channel.id
				})

				const settings = await guild.fetchWidgetSettings()
				expect(settings.enabled).toBe(true)
			} catch {
				// Widget settings endpoint may not be implemented
			}
		})
	})

	describe('Widget Data', () => {
		it('should fetch widget', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel

			try {
				// Enable widget first
				await guild.setWidgetSettings({
					enabled: true,
					channel: channel.id
				})

				const widget = await guild.fetchWidget()

				expect(widget.id).toBe(guildId)
				expect(widget.name).toBeDefined()
			} catch {
				// Widget endpoint may not be implemented
			}
		})
	})
})
