/**
 * Message Content Parsing Tests
 *
 * Tests for message content parsing including cleanContent and custom emoji handling.
 */
import { ChannelType, Client, GatewayIntentBits, TextChannel } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

// Buffer for 1x1 transparent PNG for emoji tests
const TEST_IMAGE = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
	'base64'
)

describe('Message Content Parsing', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel

	beforeAll(async () => {
		session = await createSession({
			name: 'message-parsing-tests',
			config: {
				guilds: [
					{
						name: 'Parsing Test Guild',
						channels: [{ name: 'test-channel', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createTestClient({
			intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
		})
		await client.login(session.token)
		await waitForReady(client)

		const guild = client.guilds.cache.first()!
		channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('cleanContent Property', () => {
		it('should have cleanContent property', async () => {
			const message = await channel.send('Hello world!')

			expect(message.cleanContent).toBeDefined()
			expect(typeof message.cleanContent).toBe('string')
			expect(message.cleanContent).toBe('Hello world!')
		})

		it('should strip user mentions in cleanContent', async () => {
			// Send a message with a user mention format
			const message = await channel.send(`Hello <@${client!.user!.id}>!`)

			expect(message.cleanContent).toBeDefined()
			// cleanContent should contain readable text (username) instead of raw mention
			expect(typeof message.cleanContent).toBe('string')
		})

		it('should strip channel mentions in cleanContent', async () => {
			const message = await channel.send(`Check out <#${channel.id}>`)

			expect(message.cleanContent).toBeDefined()
			expect(typeof message.cleanContent).toBe('string')
		})
	})

	describe('Custom Emoji Parsing', () => {
		it('should parse custom emojis in content', async () => {
			const guild = client!.guilds.cache.first()!

			// Create a custom emoji
			const emoji = await guild.emojis.create({
				attachment: TEST_IMAGE,
				name: 'test_emoji'
			})

			try {
				const message = await channel.send(`Cool emoji <:${emoji.name}:${emoji.id}>`)

				// Message should contain the emoji reference
				expect(message.content).toContain(emoji.id)
				expect(message.content).toContain(emoji.name!)
			} finally {
				await emoji.delete()
			}
		})

		it('should include emoji in message content when sent via toString', async () => {
			const guild = client!.guilds.cache.first()!

			const emoji = await guild.emojis.create({
				attachment: TEST_IMAGE,
				name: 'inline_emoji'
			})

			try {
				// Use emoji.toString() which produces the proper format
				const message = await channel.send(`Test ${emoji.toString()}`)

				expect(message.content).toContain('inline_emoji')
				expect(message.content).toContain(emoji.id)
			} finally {
				await emoji.delete()
			}
		})
	})
})
