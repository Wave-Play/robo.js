/**
 * Scheduled Events Tests
 *
 * Tests for scheduled event creation, management, and events.
 */
import {
	ChannelType,
	Client,
	Events,
	GuildScheduledEvent,
	GuildScheduledEventEntityType,
	GuildScheduledEventPrivacyLevel,
	GuildScheduledEventStatus
} from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForEvent, waitForReady } from '../utils/helpers.js'

describe('Scheduled Events', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guildId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'scheduled-event-tests',
			config: {
				guilds: [
					{
						name: 'Event Test Guild',
						channels: [{ name: 'voice-channel', type: ChannelType.GuildVoice }]
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

	describe('Creating Events', () => {
		it('should create external event', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const startTime = new Date(Date.now() + 86400000) // Tomorrow
			const endTime = new Date(Date.now() + 90000000)

			const event = await guild.scheduledEvents.create({
				name: 'Test External Event',
				scheduledStartTime: startTime,
				scheduledEndTime: endTime,
				privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
				entityType: GuildScheduledEventEntityType.External,
				entityMetadata: { location: 'Test Location' },
				description: 'Test description'
			})

			expect(event.name).toBe('Test External Event')
			expect(event.entityType).toBe(GuildScheduledEventEntityType.External)
			expect(event.entityMetadata?.location).toBe('Test Location')

			await event.delete()
		})

		it('should create voice channel event', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const voiceChannel = guild.channels.cache.find((c) => c.type === ChannelType.GuildVoice)!

			const event = await guild.scheduledEvents.create({
				name: 'Voice Event',
				scheduledStartTime: new Date(Date.now() + 86400000),
				privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
				entityType: GuildScheduledEventEntityType.Voice,
				channel: voiceChannel.id
			})

			expect(event.channelId).toBe(voiceChannel.id)
			expect(event.entityType).toBe(GuildScheduledEventEntityType.Voice)

			await event.delete()
		})

		it('should create stage event', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			// Create a stage channel
			const stageChannel = await guild.channels.create({
				name: 'Event Stage',
				type: ChannelType.GuildStageVoice
			})

			const event = await guild.scheduledEvents.create({
				name: 'Stage Event',
				scheduledStartTime: new Date(Date.now() + 86400000),
				privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
				entityType: GuildScheduledEventEntityType.StageInstance,
				channel: stageChannel.id
			})

			expect(event.entityType).toBe(GuildScheduledEventEntityType.StageInstance)

			await event.delete()
			await stageChannel.delete()
		})
	})

	describe('Managing Events', () => {
		let event: GuildScheduledEvent

		beforeEach(async () => {
			const guild = client!.guilds.cache.get(guildId)!
			event = await guild.scheduledEvents.create({
				name: 'Manage Event',
				scheduledStartTime: new Date(Date.now() + 86400000),
				scheduledEndTime: new Date(Date.now() + 90000000),
				privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
				entityType: GuildScheduledEventEntityType.External,
				entityMetadata: { location: 'Location' }
			})
		})

		afterEach(async () => {
			if (event) {
				try {
					await event.delete()
				} catch {
					// Event may already be deleted
				}
			}
		})

		it('should edit event name', async () => {
			await event.edit({ name: 'Renamed Event' })
			expect(event.name).toBe('Renamed Event')
		})

		it('should edit event description', async () => {
			await event.edit({ description: 'Updated description' })
			expect(event.description).toBe('Updated description')
		})

		it('should edit event location', async () => {
			await event.edit({
				entityMetadata: { location: 'New Location' }
			})
			expect(event.entityMetadata?.location).toBe('New Location')
		})

		it('should start event', async () => {
			// Set start time to now and activate
			await event.edit({
				scheduledStartTime: new Date(),
				status: GuildScheduledEventStatus.Active
			})

			expect(event.status).toBe(GuildScheduledEventStatus.Active)
		})

		it('should complete event', async () => {
			// First activate
			await event.edit({
				scheduledStartTime: new Date(),
				status: GuildScheduledEventStatus.Active
			})

			// Then complete
			await event.edit({
				status: GuildScheduledEventStatus.Completed
			})

			expect(event.status).toBe(GuildScheduledEventStatus.Completed)
		})

		it('should cancel event', async () => {
			await event.edit({
				status: GuildScheduledEventStatus.Canceled
			})

			expect(event.status).toBe(GuildScheduledEventStatus.Canceled)
		})
	})

	describe('Fetching Events', () => {
		let event: GuildScheduledEvent

		beforeAll(async () => {
			const guild = client!.guilds.cache.get(guildId)!
			event = await guild.scheduledEvents.create({
				name: 'Fetch Event',
				scheduledStartTime: new Date(Date.now() + 86400000),
				scheduledEndTime: new Date(Date.now() + 90000000),
				privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
				entityType: GuildScheduledEventEntityType.External,
				entityMetadata: { location: 'Location' }
			})
		})

		afterAll(async () => {
			if (event) {
				await event.delete()
			}
		})

		it('should fetch all guild events', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const events = await guild.scheduledEvents.fetch()

			expect(events.has(event.id)).toBe(true)
		})

		it('should fetch specific event', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const fetched = await guild.scheduledEvents.fetch(event.id)

			expect(fetched.id).toBe(event.id)
			expect(fetched.name).toBe('Fetch Event')
		})

		it('should fetch events with user count', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const events = await guild.scheduledEvents.fetch({ withUserCount: true })
			const fetchedEvent = events.get(event.id)

			expect(fetchedEvent?.userCount).toBeDefined()
		})
	})

	describe('Event Subscribers', () => {
		let event: GuildScheduledEvent

		beforeAll(async () => {
			const guild = client!.guilds.cache.get(guildId)!
			event = await guild.scheduledEvents.create({
				name: 'Subscriber Event',
				scheduledStartTime: new Date(Date.now() + 86400000),
				scheduledEndTime: new Date(Date.now() + 90000000),
				privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
				entityType: GuildScheduledEventEntityType.External,
				entityMetadata: { location: 'Location' }
			})
		})

		afterAll(async () => {
			if (event) {
				await event.delete()
			}
		})

		it('should fetch subscribers', async () => {
			const subscribers = await event.fetchSubscribers()
			expect(subscribers).toBeDefined()
		})

		it('should fetch subscribers with limit', async () => {
			const subscribers = await event.fetchSubscribers({ limit: 10 })
			expect(subscribers.size).toBeLessThanOrEqual(10)
		})
	})

	describe('Event Events', () => {
		it('should emit scheduledEventCreate', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const eventPromise = waitForEvent(client!, Events.GuildScheduledEventCreate)

			const event = await guild.scheduledEvents.create({
				name: 'Create Event',
				scheduledStartTime: new Date(Date.now() + 86400000),
				scheduledEndTime: new Date(Date.now() + 90000000),
				privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
				entityType: GuildScheduledEventEntityType.External,
				entityMetadata: { location: 'Location' }
			})

			const created = await eventPromise
			expect(created.id).toBe(event.id)

			await event.delete()
		})

		it('should emit scheduledEventUpdate', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const event = await guild.scheduledEvents.create({
				name: 'Update Event',
				scheduledStartTime: new Date(Date.now() + 86400000),
				scheduledEndTime: new Date(Date.now() + 90000000),
				privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
				entityType: GuildScheduledEventEntityType.External,
				entityMetadata: { location: 'Location' }
			})

			const eventPromise = new Promise<{
				old: GuildScheduledEvent | Partial<GuildScheduledEvent> | null
				updated: GuildScheduledEvent
			}>((resolve) => {
				client!.once(Events.GuildScheduledEventUpdate, (old, updated) =>
					resolve({ old: old as GuildScheduledEvent | null, updated })
				)
			})

			await event.edit({ name: 'Updated Event' })
			const { old, updated } = await eventPromise

			expect(old?.name).toBe('Update Event')
			expect(updated.name).toBe('Updated Event')

			await event.delete()
		})

		it('should emit scheduledEventDelete', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const event = await guild.scheduledEvents.create({
				name: 'Delete Event',
				scheduledStartTime: new Date(Date.now() + 86400000),
				scheduledEndTime: new Date(Date.now() + 90000000),
				privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
				entityType: GuildScheduledEventEntityType.External,
				entityMetadata: { location: 'Location' }
			})
			const eventId = event.id

			const eventPromise = waitForEvent(client!, Events.GuildScheduledEventDelete)
			await event.delete()

			const deleted = await eventPromise
			expect(deleted.id).toBe(eventId)
		})
	})

	describe('Event Properties', () => {
		it('should have correct timestamps', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const startTime = new Date(Date.now() + 86400000)
			const endTime = new Date(Date.now() + 90000000)

			const event = await guild.scheduledEvents.create({
				name: 'Timestamp Event',
				scheduledStartTime: startTime,
				scheduledEndTime: endTime,
				privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
				entityType: GuildScheduledEventEntityType.External,
				entityMetadata: { location: 'Location' }
			})

			expect(event.scheduledStartAt).toBeDefined()
			expect(event.scheduledStartTimestamp).toBeDefined()
			expect(event.scheduledEndAt).toBeDefined()
			expect(event.scheduledEndTimestamp).toBeDefined()

			await event.delete()
		})

		it('should have guild reference', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			const event = await guild.scheduledEvents.create({
				name: 'Guild Ref Event',
				scheduledStartTime: new Date(Date.now() + 86400000),
				scheduledEndTime: new Date(Date.now() + 90000000),
				privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
				entityType: GuildScheduledEventEntityType.External,
				entityMetadata: { location: 'Location' }
			})

			expect(event.guildId).toBe(guildId)
			expect(event.guild?.id).toBe(guildId)

			await event.delete()
		})

		it('should have creator reference', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			const event = await guild.scheduledEvents.create({
				name: 'Creator Event',
				scheduledStartTime: new Date(Date.now() + 86400000),
				scheduledEndTime: new Date(Date.now() + 90000000),
				privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
				entityType: GuildScheduledEventEntityType.External,
				entityMetadata: { location: 'Location' }
			})

			expect(event.creatorId).toBe(client!.user!.id)

			await event.delete()
		})
	})
})
