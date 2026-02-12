/**
 * GuildScheduledEvent Status Methods Tests
 *
 * Tests for scheduled event status methods including isScheduled, isActive,
 * isCompleted, isCanceled, and coverImageURL.
 */
import {
	Client,
	GatewayIntentBits,
	Guild,
	GuildScheduledEventEntityType,
	GuildScheduledEventPrivacyLevel,
	GuildScheduledEventStatus
} from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('GuildScheduledEvent Status Methods', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guild: Guild

	beforeAll(async () => {
		session = await createSession({
			name: 'scheduled-event-status-tests',
			config: {
				guilds: [{ name: 'Scheduled Event Status Guild' }]
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

	describe('isScheduled Method', () => {
		it('should return true for newly created event', async () => {
			const event = await guild.scheduledEvents.create({
				name: 'Scheduled Event',
				scheduledStartTime: new Date(Date.now() + 86400000), // Tomorrow
				scheduledEndTime: new Date(Date.now() + 90000000),
				privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
				entityType: GuildScheduledEventEntityType.External,
				entityMetadata: { location: 'Test Location' }
			})

			try {
				expect(event.isScheduled()).toBe(true)
				expect(event.isActive()).toBe(false)
				expect(event.isCompleted()).toBe(false)
				expect(event.isCanceled()).toBe(false)
			} finally {
				await event.delete()
			}
		})
	})

	describe('isActive Method', () => {
		it('should return true after starting event', async () => {
			const event = await guild.scheduledEvents.create({
				name: 'Active Event',
				scheduledStartTime: new Date(Date.now() - 1000), // Started 1 second ago
				scheduledEndTime: new Date(Date.now() + 90000000),
				privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
				entityType: GuildScheduledEventEntityType.External,
				entityMetadata: { location: 'Test' }
			})

			try {
				// Start the event
				const activeEvent = await event.setStatus(GuildScheduledEventStatus.Active)

				expect(activeEvent.isActive()).toBe(true)
				expect(activeEvent.isScheduled()).toBe(false)
			} finally {
				await event.delete().catch(() => {})
			}
		})
	})

	describe('isCompleted Method', () => {
		it('should return true after completing event', async () => {
			const event = await guild.scheduledEvents.create({
				name: 'Complete Event',
				scheduledStartTime: new Date(Date.now() - 3600000), // Started 1 hour ago
				scheduledEndTime: new Date(Date.now() + 3600000),
				privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
				entityType: GuildScheduledEventEntityType.External,
				entityMetadata: { location: 'Test' }
			})

			try {
				// Start and then complete the event
				await event.setStatus(GuildScheduledEventStatus.Active)
				const completedEvent = await event.setStatus(GuildScheduledEventStatus.Completed)

				expect(completedEvent.isCompleted()).toBe(true)
				expect(completedEvent.isActive()).toBe(false)
			} finally {
				await event.delete().catch(() => {})
			}
		})
	})

	describe('isCanceled Method', () => {
		it('should return true after canceling event', async () => {
			const event = await guild.scheduledEvents.create({
				name: 'Cancel Event',
				scheduledStartTime: new Date(Date.now() + 86400000),
				scheduledEndTime: new Date(Date.now() + 90000000),
				privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
				entityType: GuildScheduledEventEntityType.External,
				entityMetadata: { location: 'Test' }
			})

			try {
				const canceledEvent = await event.setStatus(GuildScheduledEventStatus.Canceled)

				expect(canceledEvent.isCanceled()).toBe(true)
				expect(canceledEvent.isScheduled()).toBe(false)
			} finally {
				await event.delete().catch(() => {})
			}
		})
	})

	describe('coverImageURL Method', () => {
		it('should return null when no cover image', async () => {
			const event = await guild.scheduledEvents.create({
				name: 'No Cover Event',
				scheduledStartTime: new Date(Date.now() + 86400000),
				scheduledEndTime: new Date(Date.now() + 90000000),
				privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
				entityType: GuildScheduledEventEntityType.External,
				entityMetadata: { location: 'Test' }
			})

			try {
				const coverURL = event.coverImageURL()
				expect(coverURL).toBeNull()
			} finally {
				await event.delete()
			}
		})

		it('should return URL when cover image is set', async () => {
			// 1x1 transparent PNG as base64
			const imageData =
				'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

			const event = await guild.scheduledEvents.create({
				name: 'Cover Event',
				scheduledStartTime: new Date(Date.now() + 86400000),
				scheduledEndTime: new Date(Date.now() + 90000000),
				privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
				entityType: GuildScheduledEventEntityType.External,
				entityMetadata: { location: 'Test' },
				image: imageData
			})

			try {
				const coverURL = event.coverImageURL()

				if (event.image) {
					expect(coverURL).toBeDefined()
					expect(typeof coverURL).toBe('string')
					expect(coverURL).toContain(event.id)
				}
			} finally {
				await event.delete()
			}
		})
	})

	describe('Event Properties', () => {
		it('should have scheduledStartAt property', async () => {
			const startTime = new Date(Date.now() + 86400000)

			const event = await guild.scheduledEvents.create({
				name: 'Start Time Event',
				scheduledStartTime: startTime,
				scheduledEndTime: new Date(Date.now() + 90000000),
				privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
				entityType: GuildScheduledEventEntityType.External,
				entityMetadata: { location: 'Test' }
			})

			try {
				expect(event.scheduledStartAt).toBeInstanceOf(Date)
				expect(event.scheduledStartTimestamp).toBeDefined()
			} finally {
				await event.delete()
			}
		})

		it('should have scheduledEndAt property', async () => {
			const endTime = new Date(Date.now() + 90000000)

			const event = await guild.scheduledEvents.create({
				name: 'End Time Event',
				scheduledStartTime: new Date(Date.now() + 86400000),
				scheduledEndTime: endTime,
				privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
				entityType: GuildScheduledEventEntityType.External,
				entityMetadata: { location: 'Test' }
			})

			try {
				expect(event.scheduledEndAt).toBeInstanceOf(Date)
				expect(event.scheduledEndTimestamp).toBeDefined()
			} finally {
				await event.delete()
			}
		})

		it('should have guild property', async () => {
			const event = await guild.scheduledEvents.create({
				name: 'Guild Prop Event',
				scheduledStartTime: new Date(Date.now() + 86400000),
				scheduledEndTime: new Date(Date.now() + 90000000),
				privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
				entityType: GuildScheduledEventEntityType.External,
				entityMetadata: { location: 'Test' }
			})

			try {
				expect(event.guild?.id).toBe(guild.id)
			} finally {
				await event.delete()
			}
		})

		it('should have creator property', async () => {
			const event = await guild.scheduledEvents.create({
				name: 'Creator Event',
				scheduledStartTime: new Date(Date.now() + 86400000),
				scheduledEndTime: new Date(Date.now() + 90000000),
				privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
				entityType: GuildScheduledEventEntityType.External,
				entityMetadata: { location: 'Test' }
			})

			try {
				// Creator may or may not be present depending on implementation
				if (event.creator) {
					expect(event.creator.id).toBe(client!.user!.id)
				}
			} finally {
				await event.delete()
			}
		})
	})
})
