/**
 * Rate Limiting Tests (Basic)
 *
 * Tests that the mock server handles rapid requests gracefully.
 * Note: Full rate limit simulation may not be available. These tests
 * verify the server can handle burst traffic without errors.
 */
import { ChannelType, Client, GatewayIntentBits, TextChannel } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Rate Limiting (Basic)', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel

	beforeAll(async () => {
		session = await createSession({
			name: 'rate-limit-tests',
			config: {
				guilds: [
					{
						name: 'Rate Limit Test Guild',
						channels: [{ name: 'rate-test', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createTestClient({
			intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
		})
		await client.login(session.token)
		await waitForReady(client)

		channel = client.guilds.cache.first()!.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Burst Request Handling', () => {
		it('should handle rapid requests without server error', async () => {
			// Send multiple messages in quick succession
			const promises = Array.from({ length: 5 }, (_, i) => channel.send(`Rapid message ${i + 1}`))

			const results = await Promise.all(promises)

			// All messages should be sent successfully
			expect(results.length).toBe(5)
			results.forEach((msg, i) => {
				expect(msg.content).toBe(`Rapid message ${i + 1}`)
			})
		})

		it('should successfully complete burst of messages', async () => {
			// Send a burst of messages
			const messageCount = 10
			const messages: string[] = []

			for (let i = 0; i < messageCount; i++) {
				const msg = await channel.send(`Burst message ${i + 1}`)
				messages.push(msg.content)
			}

			expect(messages.length).toBe(messageCount)
		})

		it('should handle concurrent channel fetches', async () => {
			const promises = Array.from({ length: 5 }, () => client!.channels.fetch(channel.id))

			const results = await Promise.all(promises)

			// All fetches should succeed
			expect(results.length).toBe(5)
			results.forEach((ch) => {
				expect(ch?.id).toBe(channel.id)
			})
		})

		it('should handle concurrent message fetches', async () => {
			// Create some messages first
			const msg1 = await channel.send('Fetch test 1')
			const msg2 = await channel.send('Fetch test 2')
			const msg3 = await channel.send('Fetch test 3')

			// Fetch them concurrently
			const promises = [channel.messages.fetch(msg1.id), channel.messages.fetch(msg2.id), channel.messages.fetch(msg3.id)]

			const results = await Promise.all(promises)

			expect(results.length).toBe(3)
		})
	})

	describe('Sequential Request Handling', () => {
		it('should handle many sequential requests', async () => {
			const guild = client!.guilds.cache.first()!

			// Perform many sequential operations
			for (let i = 0; i < 20; i++) {
				await guild.fetch()
			}

			// If we get here without error, the test passes
			expect(true).toBe(true)
		})

		it('should maintain data consistency under load', async () => {
			// Send messages and verify they persist
			const sentMessages = []
			for (let i = 0; i < 5; i++) {
				const msg = await channel.send(`Consistency test ${i}`)
				sentMessages.push(msg.id)
			}

			// Verify all messages can be fetched
			for (const msgId of sentMessages) {
				const fetched = await channel.messages.fetch(msgId)
				expect(fetched.id).toBe(msgId)
			}
		})
	})

	describe('Mixed Operation Handling', () => {
		it('should handle mixed operations without errors', async () => {
			const guild = client!.guilds.cache.first()!

			// Mix of different operations
			await Promise.all([
				channel.send('Mixed op 1'),
				guild.fetch(),
				channel.messages.fetch({ limit: 10 }),
				channel.send('Mixed op 2')
			])

			// If we get here, all operations completed
			expect(true).toBe(true)
		})

		it('should handle rapid reaction additions', async () => {
			const message = await channel.send('React to me!')

			// Add multiple reactions quickly
			await message.react('\ud83d\udc4d')
			await message.react('\ud83d\udc4e')
			await message.react('\u2764\ufe0f')

			// Fetch and verify
			const fetched = await channel.messages.fetch(message.id)
			expect(fetched.reactions.cache.size).toBeGreaterThanOrEqual(3)
		})
	})

	describe('Error Recovery', () => {
		it('should continue working after an error', async () => {
			// Cause an error
			try {
				await client!.channels.fetch('invalid_channel_id_000')
			} catch {
				// Expected error
			}

			// Verify client still works
			const message = await channel.send('After error')
			expect(message.content).toBe('After error')
		})

		it('should handle multiple errors gracefully', async () => {
			// Cause multiple errors
			const errorPromises = Array.from({ length: 3 }, () =>
				client!.channels.fetch('invalid_000').catch(() => null)
			)

			await Promise.all(errorPromises)

			// Verify client still works
			const guild = await client!.guilds.cache.first()!.fetch()
			expect(guild.id).toBeDefined()
		})
	})
})
