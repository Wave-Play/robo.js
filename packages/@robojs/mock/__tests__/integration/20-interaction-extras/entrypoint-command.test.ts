import { Client } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('EntryPoint Command', () => {
	let client: Client | null = null
	let session: { id: string; token: string }

	beforeAll(async () => {
		session = await createSession({
			name: 'entrypoint',
			config: {
				guilds: [
					{
						name: 'Test Guild'
					}
				]
			}
		})

		client = createTestClient()
		await client.login(session.token)
		await waitForReady(client)
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	it('should create PrimaryEntryPoint command', async () => {
		const guild = client!.guilds.cache.first()!

		// Type 4 = PrimaryEntryPoint (Discord Activities)
		// handler 1 = AppHandler
		const command = await guild.commands.create({
			name: 'start',
			type: 4 as any, // PrimaryEntryPoint
			handler: 1 as any // AppHandler
		} as any)

		expect(command).toBeDefined()
		expect(command.name).toBe('start')
		expect(command.type).toBe(4)

		// Verify the handler is stored (may be in raw data)
		const fetchedCommand = await guild.commands.fetch(command.id)
		expect(fetchedCommand).toBeDefined()
		expect(fetchedCommand!.type).toBe(4)
	})
})
