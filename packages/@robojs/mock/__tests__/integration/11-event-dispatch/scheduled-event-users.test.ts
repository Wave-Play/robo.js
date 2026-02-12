/**
 * Scheduled Event User Events Tests
 *
 * Tests for guildScheduledEventUserAdd and guildScheduledEventUserRemove events.
 */
import {
	Client,
	Events,
	GatewayIntentBits,
	GuildScheduledEventEntityType,
	GuildScheduledEventPrivacyLevel,
	Partials
} from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForReady } from '../utils/helpers.js'

describe('Scheduled Event User Events', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guildId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'scheduled-event-users-tests',
			config: {
				guilds: [{ name: 'Event Users Test Guild' }]
			}
		})

		client = createTestClient({
			intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildScheduledEvents],
			clientOptions: {
				partials: [Partials.User, Partials.GuildScheduledEvent]
			}
		})
		await client.login(session.token)
		await waitForReady(client)

		guildId = client.guilds.cache.first()!.id
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('User Add Event', () => {
		it('should emit guildScheduledEventUserAdd', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			// Create a scheduled event
			const scheduledEvent = await guild.scheduledEvents.create({
				name: 'User Add Test',
				scheduledStartTime: new Date(Date.now() + 86400000),
				scheduledEndTime: new Date(Date.now() + 172800000),
				privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
				entityType: GuildScheduledEventEntityType.External,
				entityMetadata: { location: 'Test Location' }
			})

			try {
				const userId = generateSnowflake()

				const eventPromise = new Promise<{ eventId: string; userId: string }>((resolve, reject) => {
					const timeout = setTimeout(() => reject(new Error('Timeout waiting for event')), 5000)
					client!.once(Events.GuildScheduledEventUserAdd, (event, user) => {
						clearTimeout(timeout)
						resolve({ eventId: event.id, userId: user.id })
					})
				})

				await dispatchEvent(session.id, 'GUILD_SCHEDULED_EVENT_USER_ADD', {
					guild_scheduled_event_id: scheduledEvent.id,
					guild_id: guildId,
					user_id: userId
				})

				const result = await eventPromise

				expect(result.eventId).toBe(scheduledEvent.id)
				expect(result.userId).toBe(userId)
			} finally {
				await scheduledEvent.delete().catch(() => {})
			}
		})
	})

	describe('User Remove Event', () => {
		it('should emit guildScheduledEventUserRemove', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			// Create a scheduled event
			const scheduledEvent = await guild.scheduledEvents.create({
				name: 'User Remove Test',
				scheduledStartTime: new Date(Date.now() + 86400000),
				scheduledEndTime: new Date(Date.now() + 172800000),
				privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
				entityType: GuildScheduledEventEntityType.External,
				entityMetadata: { location: 'Test Location' }
			})

			try {
				const userId = generateSnowflake()

				const eventPromise = new Promise<{ eventId: string; userId: string }>((resolve, reject) => {
					const timeout = setTimeout(() => reject(new Error('Timeout waiting for event')), 5000)
					client!.once(Events.GuildScheduledEventUserRemove, (event, user) => {
						clearTimeout(timeout)
						resolve({ eventId: event.id, userId: user.id })
					})
				})

				await dispatchEvent(session.id, 'GUILD_SCHEDULED_EVENT_USER_REMOVE', {
					guild_scheduled_event_id: scheduledEvent.id,
					guild_id: guildId,
					user_id: userId
				})

				const result = await eventPromise

				expect(result.eventId).toBe(scheduledEvent.id)
				expect(result.userId).toBe(userId)
			} finally {
				await scheduledEvent.delete().catch(() => {})
			}
		})
	})
})
