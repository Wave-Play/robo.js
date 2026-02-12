/**
 * Direct Messages Tests
 *
 * Tests for DM channel creation, messaging, reactions, and typing.
 */
import { ChannelType, Client, DMChannel, EmbedBuilder, GatewayIntentBits } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { MOCK_CONFIG } from '../setup/constants.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForReady } from '../utils/helpers.js'

describe('Direct Messages', () => {
	let client: Client | null = null
	let session: { id: string; token: string }

	beforeAll(async () => {
		session = await createSession({
			name: 'dm-tests',
			config: {
				guilds: [{ name: 'DM Test Guild' }]
			}
		})

		client = createTestClient({
			intents: [
				GatewayIntentBits.Guilds,
				GatewayIntentBits.DirectMessages,
				GatewayIntentBits.DirectMessageReactions,
				GatewayIntentBits.DirectMessageTyping
			]
		})
		await client.login(session.token)
		await waitForReady(client)
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	/**
	 * Helper to create a DM channel via REST API
	 */
	async function createDMChannel(recipientId: string): Promise<{ id: string; type: number }> {
		const response = await fetch(`${MOCK_CONFIG.REST_URL}/v10/users/@me/channels`, {
			method: 'POST',
			headers: {
				Authorization: `Bot ${session.token}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ recipient_id: recipientId })
		})

		if (!response.ok) {
			throw new Error(`Failed to create DM channel: ${response.status}`)
		}

		return response.json()
	}

	describe('DM Channel Creation', () => {
		it('should create DM channel with user', async () => {
			const recipientId = generateSnowflake()
			const dmChannelData = await createDMChannel(recipientId)

			expect(dmChannelData.id).toBeDefined()
			expect(dmChannelData.type).toBe(ChannelType.DM)
		})

		it('should reuse existing DM channel', async () => {
			const recipientId = generateSnowflake()
			const dmChannel1 = await createDMChannel(recipientId)
			const dmChannel2 = await createDMChannel(recipientId)

			expect(dmChannel1.id).toBe(dmChannel2.id)
		})

		it('should fetch DM channel after creation', async () => {
			const recipientId = generateSnowflake()
			const dmChannelData = await createDMChannel(recipientId)

			const channel = await client!.channels.fetch(dmChannelData.id)
			expect(channel).toBeDefined()
			expect(channel?.type).toBe(ChannelType.DM)
		})
	})

	describe('Sending DMs', () => {
		let dmChannel: DMChannel

		beforeAll(async () => {
			const recipientId = generateSnowflake()
			const dmChannelData = await createDMChannel(recipientId)
			const channel = await client!.channels.fetch(dmChannelData.id)
			dmChannel = channel as DMChannel
		})

		it('should send message to DM', async () => {
			const message = await dmChannel.send('Hello DM!')

			expect(message.content).toBe('Hello DM!')
			expect(message.channelId).toBe(dmChannel.id)
			expect(message.channel.type).toBe(ChannelType.DM)
		})

		it('should send embed to DM', async () => {
			const embed = new EmbedBuilder().setTitle('DM Embed').setDescription('Test embed in DM')

			const message = await dmChannel.send({ embeds: [embed] })

			expect(message.embeds.length).toBe(1)
			expect(message.embeds[0].title).toBe('DM Embed')
		})

		it('should fetch sent DM message', async () => {
			const message = await dmChannel.send('Fetchable DM message')

			// Fetch the message back
			const fetched = await dmChannel.messages.fetch(message.id)
			expect(fetched.content).toBe('Fetchable DM message')
			expect(fetched.channel.type).toBe(ChannelType.DM)
		})
	})

	describe('DM Reactions', () => {
		let dmChannel: DMChannel

		beforeAll(async () => {
			const recipientId = generateSnowflake()
			const dmChannelData = await createDMChannel(recipientId)
			const channel = await client!.channels.fetch(dmChannelData.id)
			dmChannel = channel as DMChannel
		})

		it('should add reaction in DM', async () => {
			const message = await dmChannel.send('React to DM')
			await message.react('\u2764\ufe0f')

			const fetched = await dmChannel.messages.fetch(message.id)
			expect(fetched.reactions.cache.has('\u2764\ufe0f')).toBe(true)
		})

		it('should have multiple reactions in DM', async () => {
			const message = await dmChannel.send('Multiple reactions DM')
			await message.react('\ud83d\udc4d')
			await message.react('\ud83d\udc4e')

			const fetched = await dmChannel.messages.fetch(message.id)
			expect(fetched.reactions.cache.size).toBeGreaterThanOrEqual(2)
		})
	})

	describe('DM Message Operations', () => {
		let dmChannel: DMChannel

		beforeAll(async () => {
			const recipientId = generateSnowflake()
			const dmChannelData = await createDMChannel(recipientId)
			const channel = await client!.channels.fetch(dmChannelData.id)
			dmChannel = channel as DMChannel
		})

		it('should fetch messages from DM', async () => {
			await dmChannel.send('Message 1')
			await dmChannel.send('Message 2')
			await dmChannel.send('Message 3')

			const messages = await dmChannel.messages.fetch({ limit: 10 })
			expect(messages.size).toBeGreaterThanOrEqual(3)
		})

		it('should edit DM message', async () => {
			const message = await dmChannel.send('Before edit')
			const edited = await message.edit('After edit')
			expect(edited.content).toBe('After edit')
		})

		it('should delete DM message', async () => {
			const message = await dmChannel.send('To be deleted')
			await message.delete()

			await expect(dmChannel.messages.fetch(message.id)).rejects.toMatchObject({
				code: 10008 // Unknown Message
			})
		})
	})

	describe('DM Channel Properties', () => {
		it('should have correct DM channel type', async () => {
			const recipientId = generateSnowflake()
			const dmChannelData = await createDMChannel(recipientId)
			const channel = await client!.channels.fetch(dmChannelData.id)

			expect(channel?.type).toBe(ChannelType.DM)
			expect(channel?.isDMBased()).toBe(true)
		})

		it('should be sendable', async () => {
			const recipientId = generateSnowflake()
			const dmChannelData = await createDMChannel(recipientId)
			const channel = await client!.channels.fetch(dmChannelData.id)

			expect(channel?.isSendable()).toBe(true)
		})
	})
})
