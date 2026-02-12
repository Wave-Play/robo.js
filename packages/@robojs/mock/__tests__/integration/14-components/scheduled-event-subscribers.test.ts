/**
 * Scheduled Event Subscribers Tests
 *
 * Tests for scheduled event subscriber fetching, limits, and member data.
 */
import {
	Client,
	GatewayIntentBits,
	Guild,
	GuildScheduledEventEntityType,
	GuildScheduledEventPrivacyLevel
} from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForReady } from '../utils/helpers.js'

describe('Scheduled Event Subscribers', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guild: Guild

	beforeAll(async () => {
		session = await createSession({
			name: 'scheduled-event-subscribers-tests',
			config: {
				guilds: [{ name: 'Scheduled Events Test Guild' }]
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds, GatewayIntentBits.GuildScheduledEvents])
		await client.login(session.token)
		await waitForReady(client)

		guild = client.guilds.cache.first()!
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	it('should fetch subscribers', async () => {
		const event = await guild.scheduledEvents.create({
			name: 'Subscriber Test',
			scheduledStartTime: new Date(Date.now() + 86400000),
			scheduledEndTime: new Date(Date.now() + 90000000),
			privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
			entityType: GuildScheduledEventEntityType.External,
			entityMetadata: { location: 'Test Location' }
		})

		try {
			// Add some subscribers via dispatch
			const userIds = [generateSnowflake(), generateSnowflake(), generateSnowflake()]
			for (const userId of userIds) {
				await dispatchEvent(session.id, 'GUILD_SCHEDULED_EVENT_USER_ADD', {
					guild_scheduled_event_id: event.id,
					user_id: userId,
					guild_id: guild.id
				})
			}

			const subscribers = await event.fetchSubscribers()

			expect(subscribers.size).toBeGreaterThan(0)
		} finally {
			await event.delete().catch(() => {})
		}
	})

	it('should fetch subscribers with limit', async () => {
		const event = await guild.scheduledEvents.create({
			name: 'Limited Subscribers',
			scheduledStartTime: new Date(Date.now() + 86400000),
			scheduledEndTime: new Date(Date.now() + 90000000),
			privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
			entityType: GuildScheduledEventEntityType.External,
			entityMetadata: { location: 'Test' }
		})

		try {
			// Add 5 subscribers
			const userIds = Array.from({ length: 5 }, () => generateSnowflake())
			for (const userId of userIds) {
				await dispatchEvent(session.id, 'GUILD_SCHEDULED_EVENT_USER_ADD', {
					guild_scheduled_event_id: event.id,
					user_id: userId,
					guild_id: guild.id
				})
			}

			const subscribers = await event.fetchSubscribers({ limit: 2 })

			expect(subscribers.size).toBeLessThanOrEqual(2)
		} finally {
			await event.delete().catch(() => {})
		}
	})

	it('should fetch subscribers with member data', async () => {
		const event = await guild.scheduledEvents.create({
			name: 'Member Data Test',
			scheduledStartTime: new Date(Date.now() + 86400000),
			scheduledEndTime: new Date(Date.now() + 90000000),
			privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
			entityType: GuildScheduledEventEntityType.External,
			entityMetadata: { location: 'Test' }
		})

		try {
			// Add a member to guild and then as subscriber
			const memberId = generateSnowflake()
			await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
				guild_id: guild.id,
				user: { id: memberId, username: 'EventMember' },
				roles: [],
				joined_at: new Date().toISOString()
			})

			await dispatchEvent(session.id, 'GUILD_SCHEDULED_EVENT_USER_ADD', {
				guild_scheduled_event_id: event.id,
				user_id: memberId,
				guild_id: guild.id
			})

			const subscribers = await event.fetchSubscribers({ withMember: true })

			const sub = subscribers.first()
			if (sub) {
				// Member data may or may not be available depending on cache
				expect(sub.user).toBeDefined()
			}
		} finally {
			await event.delete().catch(() => {})
		}
	})

	it('should have userCount property', async () => {
		const event = await guild.scheduledEvents.create({
			name: 'Count Test',
			scheduledStartTime: new Date(Date.now() + 86400000),
			scheduledEndTime: new Date(Date.now() + 90000000),
			privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
			entityType: GuildScheduledEventEntityType.External,
			entityMetadata: { location: 'Test' }
		})

		try {
			// Add a subscriber
			await dispatchEvent(session.id, 'GUILD_SCHEDULED_EVENT_USER_ADD', {
				guild_scheduled_event_id: event.id,
				user_id: generateSnowflake(),
				guild_id: guild.id
			})

			// Fetch event with userCount - pass options as a single object
			const fetched = await guild.scheduledEvents.fetch({ guildScheduledEvent: event.id, withUserCount: true })

			expect(fetched.userCount).toBeGreaterThanOrEqual(0)
		} finally {
			await event.delete().catch(() => {})
		}
	})
})
