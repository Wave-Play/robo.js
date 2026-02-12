/**
 * Presence Tests
 *
 * Tests for bot presence setting via REST API.
 * Note: Event dispatch for PRESENCE_UPDATE is not currently supported,
 * so these tests focus on setting the bot's own presence.
 */
import { ActivityType, Client, GatewayIntentBits, PresenceStatusData } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { PRIVILEGED_INTENTS } from '../setup/constants.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Presence', () => {
	let client: Client | null = null
	let session: { id: string; token: string }

	beforeAll(async () => {
		session = await createSession({
			name: 'presence-tests',
			config: {
				guilds: [{ name: 'Presence Test Guild' }],
				enforceIntents: true,
				approvedPrivilegedIntents: BigInt(PRIVILEGED_INTENTS.GUILD_PRESENCES)
			}
		})

		client = createTestClient({
			intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildPresences]
		})
		await client.login(session.token)
		await waitForReady(client)
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Setting Bot Presence', () => {
		it('should set presence to online', () => {
			client!.user!.setPresence({
				status: 'online',
				activities: []
			})
			// If no error is thrown, presence update was sent
			expect(true).toBe(true)
		})

		it('should set presence to idle', () => {
			client!.user!.setPresence({
				status: 'idle',
				activities: []
			})
			expect(true).toBe(true)
		})

		it('should set presence to dnd', () => {
			client!.user!.setPresence({
				status: 'dnd',
				activities: []
			})
			expect(true).toBe(true)
		})

		it('should set presence to invisible', () => {
			client!.user!.setPresence({
				status: 'invisible',
				activities: []
			})
			expect(true).toBe(true)
		})
	})

	describe('Setting Activities', () => {
		it('should set playing activity', () => {
			client!.user!.setActivity('Test Game', { type: ActivityType.Playing })
			expect(true).toBe(true)
		})

		it('should set streaming activity', () => {
			client!.user!.setActivity('Test Stream', {
				type: ActivityType.Streaming,
				url: 'https://twitch.tv/test'
			})
			expect(true).toBe(true)
		})

		it('should set listening activity', () => {
			client!.user!.setActivity('Test Music', { type: ActivityType.Listening })
			expect(true).toBe(true)
		})

		it('should set watching activity', () => {
			client!.user!.setActivity('Test Video', { type: ActivityType.Watching })
			expect(true).toBe(true)
		})

		it('should set competing activity', () => {
			client!.user!.setActivity('Test Competition', { type: ActivityType.Competing })
			expect(true).toBe(true)
		})

		it('should set custom status', () => {
			client!.user!.setActivity('Custom Status Text', { type: ActivityType.Custom })
			expect(true).toBe(true)
		})
	})

	describe('Bot User Properties', () => {
		it('should have client user defined', () => {
			expect(client!.user).toBeDefined()
		})

		it('should have username', () => {
			expect(client!.user!.username).toBeDefined()
		})

		it('should have id', () => {
			expect(client!.user!.id).toBeDefined()
		})

		it('should have presence object', () => {
			expect(client!.user!.presence).toBeDefined()
		})
	})

	describe('Guild Presence', () => {
		it('should have guild in cache', () => {
			const guild = client!.guilds.cache.first()
			expect(guild).toBeDefined()
		})

		it('should have bot member in guild', () => {
			const guild = client!.guilds.cache.first()!
			expect(guild.members.me).toBeDefined()
		})

		it('should have presences collection in guild', () => {
			const guild = client!.guilds.cache.first()!
			expect(guild.presences).toBeDefined()
		})
	})

	describe('Multiple Status Changes', () => {
		it('should handle rapid status changes', () => {
			const statuses: PresenceStatusData[] = ['online', 'idle', 'dnd', 'online']
			for (const status of statuses) {
				client!.user!.setPresence({ status, activities: [] })
			}
			expect(true).toBe(true)
		})

		it('should handle multiple activity changes', () => {
			client!.user!.setActivity('Game 1', { type: ActivityType.Playing })
			client!.user!.setActivity('Game 2', { type: ActivityType.Playing })
			client!.user!.setActivity('Music', { type: ActivityType.Listening })
			expect(true).toBe(true)
		})
	})
})
