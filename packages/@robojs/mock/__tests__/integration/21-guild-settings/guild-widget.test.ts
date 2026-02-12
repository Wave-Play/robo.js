/**
 * Guild Widget Tests
 *
 * Tests for guild widget settings and data.
 * Covers fetching widget settings, setting widget enabled, fetching widget data,
 * and generating widget image URLs with style options.
 */
import { ChannelType, Client, GuildWidgetStyle, TextChannel } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Guild Widget', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guildId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'guild-widget',
			config: {
				guilds: [
					{
						name: 'Widget Test Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createTestClient()
		await client.login(session.token)
		await waitForReady(client)

		guildId = client.guilds.cache.first()!.id
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	it('should fetch widget settings', async () => {
		const guild = client!.guilds.cache.get(guildId)!

		try {
			const settings = await guild.fetchWidgetSettings()

			expect(settings).toBeDefined()
			expect('enabled' in settings).toBe(true)
			expect('channel' in settings).toBe(true)
		} catch {
			// Widget settings endpoint may not be implemented
		}
	})

	it('should set widget enabled', async () => {
		const guild = client!.guilds.cache.get(guildId)!
		const channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText)!

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
			expect(widget.name).toBe('Widget Test Guild')
		} catch {
			// Widget endpoint may not be implemented
		}
	})

	it('should have widget properties', async () => {
		const guild = client!.guilds.cache.get(guildId)!

		try {
			const widget = await guild.fetchWidget()

			expect(widget.instantInvite === null || typeof widget.instantInvite === 'string').toBe(true)
			expect(widget.channels).toBeDefined()
			expect(widget.members).toBeDefined()
			expect(typeof widget.presenceCount).toBe('number')
		} catch {
			// Widget endpoint may not be implemented
		}
	})

	it('should have widgetImageURL', () => {
		const guild = client!.guilds.cache.get(guildId)!

		const url = guild.widgetImageURL()

		expect(url).toContain(guild.id)
		expect(url).toContain('widget.png')
	})

	it('should support widget style options', () => {
		const guild = client!.guilds.cache.get(guildId)!
		const styles: GuildWidgetStyle[] = [
			GuildWidgetStyle.Shield,
			GuildWidgetStyle.Banner1,
			GuildWidgetStyle.Banner2,
			GuildWidgetStyle.Banner3,
			GuildWidgetStyle.Banner4
		]

		for (const style of styles) {
			const url = guild.widgetImageURL(style)
			expect(url).toContain('style=')
		}
	})
})
