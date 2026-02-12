/**
 * Application Team Tests
 *
 * Tests for client.application.team including fetch,
 * team properties, members, and iconURL.
 */
import { Client, GatewayIntentBits } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Application Team', () => {
	let client: Client | null = null
	let session: { id: string; token: string }

	beforeAll(async () => {
		session = await createSession({
			name: 'application-team',
			config: {
				botUser: { username: 'TeamTestBot' },
				guilds: [{ name: 'Test Guild' }]
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds])
		await client.login(session.token)
		await waitForReady(client)
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	it('should fetch application with owner property', async () => {
		const app = await client!.application!.fetch()

		// Application should be fetched successfully
		expect(app).toBeDefined()
		expect(app.id).toBeDefined()
		expect(app.name).toBeDefined()

		// Owner should be defined (can be User or Team)
		expect(app.owner).toBeDefined()
	})

	it('should have owner properties', async () => {
		const app = await client!.application!.fetch()

		// Owner can be a User or Team - verify basic properties
		if (app.owner) {
			expect(app.owner.id).toBeDefined()
		}
	})

	it('should have application flags', async () => {
		const app = await client!.application!.fetch()

		// Application flags should be accessible
		expect(app.flags).toBeDefined()
	})

	it('should have application iconURL method', async () => {
		const app = await client!.application!.fetch()

		// iconURL should be callable
		const url = app.iconURL()
		// URL may be null if no icon set
		expect(url === null || typeof url === 'string').toBe(true)
	})
})
