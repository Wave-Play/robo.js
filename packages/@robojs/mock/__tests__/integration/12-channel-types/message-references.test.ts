/**
 * Message Reference & Reply Chain Tests
 *
 * Tests for message references including fetchReference(), deleted references,
 * and failIfNotExists option for replies.
 */
import { ChannelType, Client, GatewayIntentBits, TextChannel } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForReady } from '../utils/helpers.js'

describe('Message Reference & Reply Chain', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel

	beforeAll(async () => {
		session = await createSession({
			name: 'message-references-tests',
			config: {
				guilds: [
					{
						name: 'Message Reference Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				],
				enforceIntents: true,
				approvedPrivilegedIntents: BigInt(GatewayIntentBits.MessageContent)
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

	describe('Message Reference Properties', () => {
		it('should have message reference on reply', async () => {
			const original = await channel.send('Original message')
			const reply = await original.reply('Reply message')

			expect(reply.reference).toBeDefined()
			expect(reply.reference?.messageId).toBe(original.id)
			expect(reply.reference?.channelId).toBe(channel.id)
			expect(reply.reference?.guildId).toBe(channel.guildId)
		})
	})

	describe('Fetching Referenced Messages', () => {
		it('should fetch referenced message', async () => {
			const original = await channel.send('Fetch me')
			const reply = await original.reply('I reference you')

			const referenced = await reply.fetchReference()

			expect(referenced.id).toBe(original.id)
			expect(referenced.content).toBe('Fetch me')
		})

		it('should handle deleted reference', async () => {
			const original = await channel.send('Delete me')
			const reply = await original.reply('Reference will break')

			await original.delete()

			// fetchReference should throw for deleted messages
			await expect(reply.fetchReference()).rejects.toBeDefined()
		})
	})

	describe('Reply Options', () => {
		it('should send reply with failIfNotExists false', async () => {
			const fakeMessageId = generateSnowflake()

			// Should not throw even if reference doesn't exist
			const message = await channel.send({
				content: 'Reply to nonexistent',
				reply: {
					messageReference: fakeMessageId,
					failIfNotExists: false
				}
			})

			expect(message.content).toBe('Reply to nonexistent')
		})

		it('should throw with failIfNotExists true for nonexistent message', async () => {
			const fakeMessageId = generateSnowflake()

			// Should throw when reference doesn't exist and failIfNotExists is true (default)
			await expect(
				channel.send({
					content: 'Reply to nonexistent',
					reply: {
						messageReference: fakeMessageId,
						failIfNotExists: true
					}
				})
			).rejects.toBeDefined()
		})
	})
})
