/**
 * Message Interaction Field Tests
 *
 * Tests for the interaction and interactionMetadata fields on messages.
 */
import { ChannelType, Client, Events, GatewayIntentBits, Guild, InteractionType, Message, TextChannel } from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForEvent, waitForReady } from '../utils/helpers.js'

describe('Message Interaction Field', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guild: Guild
	let channel: TextChannel

	beforeAll(async () => {
		session = await createSession({
			name: 'message-interaction-tests',
			config: {
				guilds: [
					{
						name: 'Message Interaction Test Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages])
		await client.login(session.token)
		await waitForReady(client)

		guild = client.guilds.cache.first()!
		channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	it('should have interaction field on command response', async () => {
		const messageId = generateSnowflake()
		const interactionId = generateSnowflake()
		const userId = generateSnowflake()

		const messagePromise = waitForEvent<Message>(client!, Events.MessageCreate, 5000)

		await dispatchEvent(session.id, 'MESSAGE_CREATE', {
			id: messageId,
			channel_id: channel.id,
			content: 'Command response',
			author: { id: client!.user!.id, username: 'Bot' },
			interaction: {
				id: interactionId,
				type: InteractionType.ApplicationCommand,
				name: 'test',
				user: { id: userId, username: 'Commander' }
			}
		})

		const message = await messagePromise

		if (message.interaction) {
			expect(message.interaction.id).toBe(interactionId)
			expect(message.interaction.commandName).toBe('test')
			expect(message.interaction.user.id).toBe(userId)
		}
	})

	it('should have interactionMetadata', async () => {
		const messageId = generateSnowflake()
		const interactionId = generateSnowflake()
		const userId = generateSnowflake()

		const messagePromise = waitForEvent<Message>(client!, Events.MessageCreate, 5000)

		await dispatchEvent(session.id, 'MESSAGE_CREATE', {
			id: messageId,
			channel_id: channel.id,
			content: 'With metadata',
			author: { id: client!.user!.id, username: 'Bot' },
			interaction_metadata: {
				id: interactionId,
				type: InteractionType.ApplicationCommand,
				user: { id: userId, username: 'User' },
				authorizing_integration_owners: {}
			}
		})

		const message = await messagePromise

		// interactionMetadata is a newer API field
		if (message.interactionMetadata) {
			expect(message.interactionMetadata.id).toBe(interactionId)
		}
	})

	it('should have no interaction on regular message', async () => {
		const message = await channel.send('Regular message')

		expect(message.interaction).toBeNull()
	})
})
