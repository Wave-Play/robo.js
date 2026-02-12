/**
 * Client Presence & Activity Tests
 *
 * Tests for setting bot presence status and activities with verification.
 */
import { ActivityType, Client, GatewayIntentBits, PresenceStatusData } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { PRIVILEGED_INTENTS } from '../setup/constants.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Client Presence & Activity', () => {
	let client: Client | null = null
	let session: { id: string; token: string }

	beforeAll(async () => {
		session = await createSession({
			name: 'presence-activity-tests',
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

	describe('Setting Bot Status', () => {
		it('should set online status', () => {
			client!.user!.setStatus('online')

			expect(client!.user!.presence.status).toBe('online')
		})

		it('should set idle status', () => {
			client!.user!.setStatus('idle')

			expect(client!.user!.presence.status).toBe('idle')
		})

		it('should set dnd status', () => {
			client!.user!.setStatus('dnd')

			expect(client!.user!.presence.status).toBe('dnd')
		})

		it('should set invisible status', () => {
			client!.user!.setStatus('invisible')

			expect(client!.user!.presence.status).toBe('invisible')
		})
	})

	describe('Setting Activities', () => {
		it('should set Playing activity', () => {
			client!.user!.setActivity('a game', { type: ActivityType.Playing })

			expect(client!.user!.presence.activities[0]?.name).toBe('a game')
			expect(client!.user!.presence.activities[0]?.type).toBe(ActivityType.Playing)
		})

		it('should set Streaming activity', () => {
			client!.user!.setActivity('on Twitch', {
				type: ActivityType.Streaming,
				url: 'https://twitch.tv/test'
			})

			expect(client!.user!.presence.activities[0]?.type).toBe(ActivityType.Streaming)
			expect(client!.user!.presence.activities[0]?.url).toBe('https://twitch.tv/test')
		})

		it('should set Listening activity', () => {
			client!.user!.setActivity('Spotify', { type: ActivityType.Listening })

			expect(client!.user!.presence.activities[0]?.type).toBe(ActivityType.Listening)
		})

		it('should set Watching activity', () => {
			client!.user!.setActivity('YouTube', { type: ActivityType.Watching })

			expect(client!.user!.presence.activities[0]?.type).toBe(ActivityType.Watching)
		})

		it('should set Competing activity', () => {
			client!.user!.setActivity('a tournament', { type: ActivityType.Competing })

			expect(client!.user!.presence.activities[0]?.type).toBe(ActivityType.Competing)
		})

		it('should set Custom status', () => {
			client!.user!.setActivity('Custom status text', { type: ActivityType.Custom })

			expect(client!.user!.presence.activities[0]?.type).toBe(ActivityType.Custom)
		})
	})

	describe('setPresence Method', () => {
		it('should set presence with setPresence()', () => {
			client!.user!.setPresence({
				status: 'dnd',
				activities: [{ name: 'Complex presence', type: ActivityType.Playing }],
				afk: false
			})

			expect(client!.user!.presence.status).toBe('dnd')
			expect(client!.user!.presence.activities[0]?.name).toBe('Complex presence')
		})
	})

	describe('Clearing Activity', () => {
		it('should clear activity', () => {
			client!.user!.setActivity('Something')
			expect(client!.user!.presence.activities.length).toBeGreaterThan(0)

			client!.user!.setActivity(undefined)

			expect(client!.user!.presence.activities.length).toBe(0)
		})
	})

	describe('Multiple Status Changes', () => {
		it('should handle rapid status changes', () => {
			const statuses: PresenceStatusData[] = ['online', 'idle', 'dnd', 'online']
			for (const status of statuses) {
				client!.user!.setPresence({ status, activities: [] })
			}

			// Final status should be 'online'
			expect(client!.user!.presence.status).toBe('online')
		})

		it('should handle multiple activity changes', () => {
			client!.user!.setActivity('Game 1', { type: ActivityType.Playing })
			client!.user!.setActivity('Game 2', { type: ActivityType.Playing })
			client!.user!.setActivity('Music', { type: ActivityType.Listening })

			// Final activity should be Listening
			expect(client!.user!.presence.activities[0]?.type).toBe(ActivityType.Listening)
			expect(client!.user!.presence.activities[0]?.name).toBe('Music')
		})
	})
})
