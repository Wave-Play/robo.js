/**
 * Attachment Spoiler Tests
 *
 * Tests for spoiler attachments with SPOILER_ prefix and spoiler option.
 */
import {
	Client,
	Events,
	ChannelType,
	TextChannel,
	GatewayIntentBits,
	AttachmentBuilder
} from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady, waitForEvent, generateSnowflake } from '../utils/helpers.js'

describe('Attachment Spoiler', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel

	beforeAll(async () => {
		session = await createSession({
			name: 'attachment-spoiler',
			config: {
				guilds: [
					{
						name: 'Spoiler Guild',
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

	it('should send attachment as spoiler with SPOILER_ prefix', async () => {
		const attachment = new AttachmentBuilder(Buffer.from('spoiler content'), {
			name: 'SPOILER_secret.txt'
		})

		const message = await channel.send({ files: [attachment] })

		expect(message.attachments.size).toBe(1)
		const att = message.attachments.first()!
		expect(att.spoiler).toBe(true)
		expect(att.name).toMatch(/^SPOILER_/)
	})

	it('should use spoiler option in AttachmentBuilder', async () => {
		const attachment = new AttachmentBuilder(Buffer.from('spoiler via option'), {
			name: 'secret.txt'
		}).setSpoiler(true)

		const message = await channel.send({ files: [attachment] })

		expect(message.attachments.size).toBe(1)
		const att = message.attachments.first()!
		// When spoiler is set, the filename should have SPOILER_ prefix
		expect(att.name).toMatch(/^SPOILER_/)
	})

	it('should have spoiler property on received attachment', async () => {
		const guild = client!.guilds.cache.first()!
		const messageId = generateSnowflake()
		const attachmentId = generateSnowflake()

		// Set up event listener
		const eventPromise = waitForEvent(client!, Events.MessageCreate, 5000)

		// Dispatch message with spoiler attachment
		await dispatchEvent(session.id, 'MESSAGE_CREATE', {
			id: messageId,
			channel_id: channel.id,
			guild_id: guild.id,
			content: '',
			author: { id: '111', username: 'User', discriminator: '0' },
			timestamp: new Date().toISOString(),
			type: 0,
			attachments: [
				{
					id: attachmentId,
					filename: 'SPOILER_image.png',
					size: 1024,
					url: 'https://cdn.example.com/SPOILER_image.png',
					proxy_url: 'https://cdn.example.com/SPOILER_image.png'
				}
			]
		})

		const message = await eventPromise

		expect(message.attachments.size).toBe(1)
		const attachment = message.attachments.first()!
		expect(attachment.spoiler).toBe(true)
	})
})
