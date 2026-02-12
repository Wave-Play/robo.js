/**
 * Message Call Field Tests
 *
 * Tests for the message.call property on call messages in DM channels.
 */
import { Client, DMChannel, GatewayIntentBits, MessageType } from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { MOCK_CONFIG } from '../setup/constants.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForReady } from '../utils/helpers.js'

describe('Message Call Field', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let dmChannel: DMChannel

	beforeAll(async () => {
		session = await createSession({
			name: 'message-call-tests',
			config: {
				guilds: [{ name: 'Call Test Guild' }]
			}
		})

		client = createTestClient({
			intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages]
		})
		await client.login(session.token)
		await waitForReady(client)

		// Create a DM channel
		const recipientId = generateSnowflake()
		const response = await fetch(`${MOCK_CONFIG.REST_URL}/v10/users/@me/channels`, {
			method: 'POST',
			headers: {
				Authorization: `Bot ${session.token}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ recipient_id: recipientId })
		})

		const dmData = (await response.json()) as { id: string }
		const channel = await client.channels.fetch(dmData.id)
		dmChannel = channel as DMChannel
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	it('should have call field on call message', async () => {
		const messageId = generateSnowflake()
		const callEndTime = new Date().toISOString()
		const participantId = generateSnowflake()

		// Dispatch a call message
		await dispatchEvent(session.id, 'MESSAGE_CREATE', {
			id: messageId,
			channel_id: dmChannel.id,
			content: '',
			author: { id: participantId, username: 'CallUser', discriminator: '0', avatar: null },
			timestamp: new Date().toISOString(),
			edited_timestamp: null,
			tts: false,
			mention_everyone: false,
			mentions: [],
			mention_roles: [],
			attachments: [],
			embeds: [],
			pinned: false,
			type: MessageType.Call,
			call: {
				participants: [participantId, client!.user!.id],
				ended_timestamp: callEndTime
			}
		})

		// Fetch the message
		const messages = await dmChannel.messages.fetch({ limit: 1 })
		const message = messages.first()!

		expect(message.type).toBe(MessageType.Call)
		expect(message.call).toBeDefined()
		expect(message.call?.participants).toContain(participantId)
		expect(message.call?.endedTimestamp).toBeDefined()
	})

	it('should have null call for non-call messages', async () => {
		const regularMessage = await dmChannel.send('Regular message')

		expect(regularMessage.call).toBeNull()
	})
})
