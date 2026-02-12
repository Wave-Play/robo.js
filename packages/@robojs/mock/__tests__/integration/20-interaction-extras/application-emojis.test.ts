import { Client } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Application Emojis', () => {
	let client: Client | null = null
	let session: { id: string; token: string }

	// Minimal 1x1 pixel PNG (base64)
	const base64Image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

	beforeAll(async () => {
		session = await createSession({
			name: 'application-emojis',
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

	it('should create and fetch application emoji', async () => {
		const emoji = await client!.application!.emojis.create({
			attachment: base64Image,
			name: 'test_emoji'
		})

		expect(emoji).toBeDefined()
		expect(emoji.name).toBe('test_emoji')
		expect(emoji.id).toBeDefined()

		// Fetch the emoji
		const fetchedEmoji = await client!.application!.emojis.fetch(emoji.id)
		expect(fetchedEmoji).toBeDefined()
		expect(fetchedEmoji!.name).toBe('test_emoji')
		expect(fetchedEmoji!.id).toBe(emoji.id)
	})

	it('should delete application emoji', async () => {
		const emoji = await client!.application!.emojis.create({
			attachment: base64Image,
			name: 'delete_me'
		})

		expect(emoji).toBeDefined()

			// Delete the emoji
		await client!.application!.emojis.delete(emoji.id)

		// Try to fetch with force to bypass cache - should return null or throw
		const fetchedEmoji = await client!.application!.emojis.fetch(emoji.id, { force: true }).catch(() => null)
		expect(fetchedEmoji).toBeNull()
	})
})
