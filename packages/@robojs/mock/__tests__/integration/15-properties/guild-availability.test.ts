/**
 * Guild Available/Unavailable Tests
 *
 * Tests for guild availability events and the available property.
 */
import { ChannelType, Client, Events, GatewayIntentBits, Guild } from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForEvent, waitForReady } from '../utils/helpers.js'

describe('Guild Available/Unavailable', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guild: Guild

	beforeAll(async () => {
		session = await createSession({
			name: 'guild-availability-tests',
			config: {
				guilds: [
					{
						name: 'Availability Test Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds])
		await client.login(session.token)
		await waitForReady(client)

		guild = client.guilds.cache.first()!
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	it('should have available property', () => {
		expect(guild.available).toBe(true)
	})

	it('should emit guildUnavailable event', async () => {
		const eventPromise = waitForEvent<Guild>(client!, Events.GuildUnavailable, 5000)

		await dispatchEvent(session.id, 'GUILD_DELETE', {
			id: guild.id,
			unavailable: true
		})

		const unavailableGuild = await eventPromise

		expect(unavailableGuild.id).toBe(guild.id)
		expect(unavailableGuild.available).toBe(false)
	})

	it('should emit guildAvailable when restored', async () => {
		// The guild should be unavailable from the previous test
		// Now restore it with GUILD_CREATE

		// Listen for either GuildAvailable (when restoring unavailable guild)
		// or GuildCreate (when adding new guild)
		const eventPromise = new Promise<Guild>((resolve, reject) => {
			const timeout = setTimeout(() => reject(new Error('Timeout waiting for guild event')), 5000)

			const onAvailable = (g: Guild) => {
				if (g.id === guild.id) {
					clearTimeout(timeout)
					cleanup()
					resolve(g)
				}
			}

			const onCreate = (g: Guild) => {
				if (g.id === guild.id) {
					clearTimeout(timeout)
					cleanup()
					resolve(g)
				}
			}

			const cleanup = () => {
				client!.off(Events.GuildAvailable, onAvailable)
				client!.off(Events.GuildCreate, onCreate)
			}

			client!.on(Events.GuildAvailable, onAvailable)
			client!.on(Events.GuildCreate, onCreate)
		})

		// Restore the guild
		await dispatchEvent(session.id, 'GUILD_CREATE', {
			id: guild.id,
			name: guild.name,
			unavailable: false,
			owner_id: guild.ownerId,
			region: 'us-west',
			afk_channel_id: null,
			afk_timeout: 300,
			verification_level: 0,
			default_message_notifications: 0,
			explicit_content_filter: 0,
			roles: [],
			emojis: [],
			features: [],
			mfa_level: 0,
			system_channel_id: null,
			system_channel_flags: 0,
			rules_channel_id: null,
			max_members: 100000,
			vanity_url_code: null,
			description: null,
			banner: null,
			premium_tier: 0,
			premium_subscription_count: 0,
			preferred_locale: 'en-US',
			public_updates_channel_id: null,
			nsfw_level: 0,
			stickers: [],
			premium_progress_bar_enabled: false
		})

		const restoredGuild = await eventPromise

		expect(restoredGuild.id).toBe(guild.id)
		expect(restoredGuild.available).toBe(true)
	})
})
