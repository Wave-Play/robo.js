/**
 * Application Flags Tests
 *
 * Tests for client.application.flags including individual flag checks
 * and serialization.
 */
import { ApplicationFlags, Client, GatewayIntentBits } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Application Flags', () => {
	let client: Client | null = null
	let session: { id: string; token: string }

	beforeAll(async () => {
		session = await createSession({
			name: 'application-flags',
			config: {
				botUser: { username: 'FlagsTestBot' },
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

	it('should have application flags', async () => {
		const app = await client!.application!.fetch()

		// Flags should be defined (even if 0/empty)
		expect(app.flags).toBeDefined()
	})

	it('should check individual flags', async () => {
		const app = await client!.application!.fetch()

		if (app.flags) {
			// has() method should work for checking individual flags
			expect(typeof app.flags.has(ApplicationFlags.GatewayPresence)).toBe('boolean')
			expect(typeof app.flags.has(ApplicationFlags.GatewayGuildMembers)).toBe('boolean')
			expect(typeof app.flags.has(ApplicationFlags.GatewayMessageContent)).toBe('boolean')
		}
	})

	it('should serialize flags', async () => {
		const app = await client!.application!.fetch()

		if (app.flags) {
			// serialize() should return an object mapping flag names to booleans
			const serialized = app.flags.serialize()
			expect(typeof serialized).toBe('object')
			expect(serialized !== null).toBe(true)
		}
	})
})
