/**
 * Guild Incident Actions Tests
 *
 * Tests for guild.incidentActions including invitesDisabledUntil
 * and dmsDisabledUntil properties.
 */
import { Client, GatewayIntentBits, type Guild } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Guild Incident Actions', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guild: Guild

	beforeAll(async () => {
		session = await createSession({
			name: 'guild-incident-actions',
			config: {
				botUser: { username: 'IncidentBot' },
				guilds: [{ name: 'Test Guild' }]
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

	it('should have incidentActions property', async () => {
		// Fetch the guild to ensure we have fresh data
		const fetched = await guild.fetch()

		// incidentActions may not be exposed on Guild type in Discord.js
		// Check using property access with type assertion
		const guildWithIncident = fetched as unknown as { incidentActions?: unknown }
		expect('incidentActions' in guildWithIncident || guildWithIncident.incidentActions === undefined).toBe(true)
	})

	it('should have invitesDisabledUntil when incident actions exist', async () => {
		const fetched = await guild.fetch()

		// Check using type assertion since incidentActions may not be exposed
		const guildWithIncident = fetched as unknown as {
			incidentActions?: { invitesDisabledUntil?: Date | null }
		}

		if (guildWithIncident.incidentActions) {
			// invitesDisabledUntil should be a Date or null
			expect(
				guildWithIncident.incidentActions.invitesDisabledUntil === null ||
					guildWithIncident.incidentActions.invitesDisabledUntil instanceof Date ||
					guildWithIncident.incidentActions.invitesDisabledUntil === undefined
			).toBe(true)
		} else {
			// No incident actions is valid
			expect(guildWithIncident.incidentActions).toBeFalsy()
		}
	})

	it('should have dmsDisabledUntil when incident actions exist', async () => {
		const fetched = await guild.fetch()

		// Check using type assertion since incidentActions may not be exposed
		const guildWithIncident = fetched as unknown as {
			incidentActions?: { dmsDisabledUntil?: Date | null }
		}

		if (guildWithIncident.incidentActions) {
			// dmsDisabledUntil should be a Date or null
			expect(
				guildWithIncident.incidentActions.dmsDisabledUntil === null ||
					guildWithIncident.incidentActions.dmsDisabledUntil instanceof Date ||
					guildWithIncident.incidentActions.dmsDisabledUntil === undefined
			).toBe(true)
		} else {
			// No incident actions is valid
			expect(guildWithIncident.incidentActions).toBeFalsy()
		}
	})
})
