/**
 * Application Install Params Tests
 *
 * Tests for client.application install params, scopes,
 * permissions, customInstallURL, and roleConnectionsVerificationURL.
 */
import { Client, GatewayIntentBits } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Application Install Params', () => {
	let client: Client | null = null
	let session: { id: string; token: string }

	beforeAll(async () => {
		session = await createSession({
			name: 'application-install-params',
			config: {
				botUser: { username: 'InstallParamsBot' },
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

	it('should have installParams property', async () => {
		const app = await client!.application!.fetch()

		// installParams should be defined (even if null for some apps)
		expect(app.installParams !== undefined).toBe(true)
	})

	it('should have scopes in installParams', async () => {
		const app = await client!.application!.fetch()

		if (app.installParams) {
			expect(Array.isArray(app.installParams.scopes)).toBe(true)
			// Common scopes for bots
			expect(app.installParams.scopes).toContain('bot')
			expect(app.installParams.scopes).toContain('applications.commands')
		}
	})

	it('should have permissions in installParams', async () => {
		const app = await client!.application!.fetch()

		if (app.installParams) {
			expect(app.installParams.permissions).toBeDefined()
			// Permissions should be a Permissions object or similar
			const perms = app.installParams.permissions as unknown as { bitfield?: bigint }
			expect(typeof app.installParams.permissions === 'object' || typeof perms.bitfield === 'bigint').toBe(true)
		}
	})

	it('should have customInstallURL property', async () => {
		const app = await client!.application!.fetch()

		// customInstallURL may be null or a string
		expect(app.customInstallURL === null || typeof app.customInstallURL === 'string').toBe(true)
	})

	it('should have roleConnectionsVerificationURL property', async () => {
		const app = await client!.application!.fetch()

		// roleConnectionsVerificationURL may be null or a string
		expect(app.roleConnectionsVerificationURL === null || typeof app.roleConnectionsVerificationURL === 'string').toBe(true)
	})
})
