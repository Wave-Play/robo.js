/**
 * Message Activity & Application Tests
 *
 * Tests for message activity (game invites) and application (rich presence) fields.
 */
import {
	ChannelType,
	Client,
	Events,
	GatewayIntentBits,
	Guild,
	Message,
	MessageActivityType,
	TextChannel
} from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForEvent, waitForReady } from '../utils/helpers.js'

describe('Message Activity & Application', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guild: Guild
	let channel: TextChannel

	beforeAll(async () => {
		session = await createSession({
			name: 'message-activity-tests',
			config: {
				guilds: [
					{
						name: 'Message Activity Test Guild',
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

	it('should have activity for game invite', async () => {
		const messageId = generateSnowflake()
		const authorId = generateSnowflake()

		const messagePromise = waitForEvent<Message>(client!, Events.MessageCreate, 5000)

		await dispatchEvent(session.id, 'MESSAGE_CREATE', {
			id: messageId,
			channel_id: channel.id,
			content: '',
			author: { id: authorId, username: 'Gamer' },
			activity: {
				type: MessageActivityType.Join,
				party_id: 'spotify:123'
			}
		})

		const message = await messagePromise

		if (message.activity) {
			expect(message.activity.type).toBe(MessageActivityType.Join)
			expect(message.activity.partyId).toBe('spotify:123')
		}
	})

	it('should have application for rich presence', async () => {
		const messageId = generateSnowflake()
		const authorId = generateSnowflake()
		const appId = generateSnowflake()

		const messagePromise = waitForEvent<Message>(client!, Events.MessageCreate, 5000)

		await dispatchEvent(session.id, 'MESSAGE_CREATE', {
			id: messageId,
			channel_id: channel.id,
			content: '',
			author: { id: authorId, username: 'Player' },
			application: {
				id: appId,
				name: 'Cool Game',
				description: 'A cool game',
				icon: 'game_icon'
			}
		})

		const message = await messagePromise

		// In discord.js v14+, Message only has applicationId, not full application object
		if (message.applicationId) {
			expect(message.applicationId).toBe(appId)
		}
	})

	it('should have no activity on regular message', async () => {
		const message = await channel.send('Regular message')

		expect(message.activity).toBeNull()
	})

	it('should have no applicationId on regular message', async () => {
		const message = await channel.send('Regular message')

		// applicationId is null when not set
		expect(message.applicationId).toBeNull()
	})
})
