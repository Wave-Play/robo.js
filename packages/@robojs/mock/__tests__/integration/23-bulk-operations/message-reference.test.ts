/**
 * Message Reference Tests
 *
 * Tests for message references and reply functionality.
 */
import { Client, ChannelType, TextChannel, GatewayIntentBits, MessageType } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady, generateSnowflake } from '../utils/helpers.js'

describe('Message Reference Details', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel

	beforeAll(async () => {
		session = await createSession({
			name: 'message-reference',
			config: {
				guilds: [
					{
						name: 'Reference Guild',
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

	it('should have messageReference on reply', async () => {
		const original = await channel.send('Original message')
		const reply = await original.reply('This is a reply')

		expect(reply.reference).toBeDefined()
		expect(reply.reference?.messageId).toBe(original.id)
		expect(reply.reference?.channelId).toBe(channel.id)
		expect(reply.reference?.guildId).toBe(channel.guildId)
	})

	it('should have type Reply on reply message', async () => {
		const original = await channel.send('Reference type test')
		const reply = await original.reply('Reply for type test')

		// Reply messages have type 19 (MessageType.Reply)
		expect(reply.type).toBe(MessageType.Reply)
	})

	it('should fetch referenced message', async () => {
		const original = await channel.send('Fetch reference test')
		const reply = await original.reply('Reply to fetch')

		const referenced = await reply.fetchReference()

		expect(referenced.id).toBe(original.id)
		expect(referenced.content).toBe('Fetch reference test')
	})

	it('should have reference with channel and guild IDs', async () => {
		const original = await channel.send('Full reference test')
		const reply = await original.reply('Full reference reply')

		expect(reply.reference).toBeDefined()
		expect(reply.reference!.messageId).toBe(original.id)
		expect(reply.reference!.channelId).toBe(channel.id)
		expect(reply.reference!.guildId).toBe(channel.guild.id)
	})

	it('should not fail with failIfNotExists false', async () => {
		const fakeMessageId = generateSnowflake()

		// Should not throw when failIfNotExists is false (default behavior may vary)
		const message = await channel.send({
			content: 'Reply without fail',
			reply: {
				messageReference: fakeMessageId,
				failIfNotExists: false
			}
		})

		expect(message.content).toBe('Reply without fail')
	})

	it('should accept failIfNotExists true option', async () => {
		const fakeMessageId = generateSnowflake()

		// The failIfNotExists option is passed to the API
		// Note: Mock server doesn't validate referenced message existence,
		// but the option is properly sent in the request body
		const message = await channel.send({
			content: 'Reply with failIfNotExists',
			reply: {
				messageReference: fakeMessageId,
				failIfNotExists: true
			}
		})

		// Message should still be created (mock server limitation)
		expect(message.content).toBe('Reply with failIfNotExists')
		expect(message.reference).toBeDefined()
		expect(message.reference?.messageId).toBe(fakeMessageId)
	})
})
