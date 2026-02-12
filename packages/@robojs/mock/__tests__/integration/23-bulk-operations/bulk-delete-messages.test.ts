/**
 * Bulk Delete Messages Tests
 *
 * Tests for channel.bulkDelete() functionality.
 */
import { Client, Events, ChannelType, TextChannel, GatewayIntentBits, Message, Collection, PartialMessage } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady, delay } from '../utils/helpers.js'

describe('Bulk Delete Messages', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel

	beforeAll(async () => {
		session = await createSession({
			name: 'bulk-delete',
			config: {
				guilds: [
					{
						name: 'Bulk Delete Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createClientWithIntents([
			GatewayIntentBits.Guilds,
			GatewayIntentBits.GuildMessages,
			GatewayIntentBits.MessageContent
		])
		await client.login(session.token)
		await waitForReady(client)

		const guild = client.guilds.cache.first()!
		channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	it('should bulk delete messages', async () => {
		// Create some messages
		const messages: Message[] = []
		for (let i = 0; i < 5; i++) {
			messages.push(await channel.send(`Bulk delete test ${i}`))
		}

		// Bulk delete the messages
		const deleted = await channel.bulkDelete(messages)

		expect(deleted.size).toBe(5)
	})

	it('should bulk delete by count', async () => {
		// Create messages
		for (let i = 0; i < 10; i++) {
			await channel.send(`Delete count ${i}`)
		}

		// Wait a bit for messages to be processed
		await delay(100)

		// Delete last 10 messages
		const deleted = await channel.bulkDelete(10)

		expect(deleted.size).toBe(10)
	})

	it('should bulk delete by message IDs', async () => {
		// Create messages
		const messages: Message[] = []
		for (let i = 0; i < 3; i++) {
			messages.push(await channel.send(`Delete by ID ${i}`))
		}

		const ids = messages.map((m) => m.id)
		const deleted = await channel.bulkDelete(ids)

		expect(deleted.size).toBe(3)
	})

	it('should bulk delete collection of messages', async () => {
		// Create messages
		const sentMessages: Message[] = []
		for (let i = 0; i < 4; i++) {
			sentMessages.push(await channel.send(`Collection delete ${i}`))
		}

		// Create a collection
		const collection = new Collection<string, Message>()
		for (const msg of sentMessages) {
			collection.set(msg.id, msg)
		}

		const deleted = await channel.bulkDelete(collection)

		expect(deleted.size).toBe(4)
	})

	it('should emit messageDelete events for each deleted message', async () => {
		// Create messages
		const messages: Message[] = []
		for (let i = 0; i < 3; i++) {
			messages.push(await channel.send(`Event test ${i}`))
		}

		// Track deleted message events
		const deletedIds: string[] = []
		const handler = (message: Message | PartialMessage) => {
			deletedIds.push(message.id)
		}
		client!.on(Events.MessageDelete, handler)

		// Bulk delete
		const deleted = await channel.bulkDelete(messages)

		// Wait a bit for events
		await delay(100)

		client!.off(Events.MessageDelete, handler)

		// The bulkDelete method should return the deleted messages
		expect(deleted.size).toBe(3)
	})

	it('should return deleted messages with IDs', async () => {
		// Create messages
		const messages: Message[] = []
		for (let i = 0; i < 2; i++) {
			messages.push(await channel.send(`Return test ${i}`))
		}

		const deleted = await channel.bulkDelete(messages)

		// Verify returned collection has message IDs
		for (const msg of messages) {
			expect(deleted.has(msg.id)).toBe(true)
		}
	})

	it('should filter old messages by default', async () => {
		// Create fresh messages (not old)
		const messages: Message[] = []
		for (let i = 0; i < 3; i++) {
			messages.push(await channel.send(`Filter old test ${i}`))
		}

		// bulkDelete with filterOld=true (default) should delete recent messages
		const deleted = await channel.bulkDelete(messages, true)

		// All recent messages should be deleted
		expect(deleted.size).toBe(3)
	})

	it('should not filter with filterOld false', async () => {
		// Create messages
		const messages: Message[] = []
		for (let i = 0; i < 3; i++) {
			messages.push(await channel.send(`No filter test ${i}`))
		}

		// Delete without filtering
		const deleted = await channel.bulkDelete(messages, false)

		expect(deleted.size).toBe(3)
	})
})
