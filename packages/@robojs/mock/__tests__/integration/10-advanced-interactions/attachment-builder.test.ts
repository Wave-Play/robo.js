/**
 * AttachmentBuilder Options Tests
 *
 * Tests for AttachmentBuilder options like description, spoiler, and name.
 */
import { AttachmentBuilder, ChannelType, Client, GatewayIntentBits, TextChannel } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('AttachmentBuilder Options', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel

	beforeAll(async () => {
		session = await createSession({
			name: 'attachment-builder-tests',
			config: {
				guilds: [
					{
						name: 'Attachment Builder Test Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages])
		await client.login(session.token)
		await waitForReady(client)

		const guild = client.guilds.cache.first()!
		channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	it('should send attachment with description', async () => {
		const attachment = new AttachmentBuilder(Buffer.from('test')).setName('test.txt').setDescription('This is a text file')

		const message = await channel.send({ files: [attachment] })

		expect(message.attachments.first()?.description).toBe('This is a text file')
	})

	it('should send spoiler attachment', async () => {
		const attachment = new AttachmentBuilder(Buffer.from('spoiler')).setName('secret.txt').setSpoiler(true)

		const message = await channel.send({ files: [attachment] })

		// Spoiler files are prefixed with SPOILER_
		expect(message.attachments.first()?.spoiler).toBe(true)
	})

	it('should set file name via setName', async () => {
		const attachment = new AttachmentBuilder(Buffer.from('renamed')).setName('custom-name.txt')

		const message = await channel.send({ files: [attachment] })

		expect(message.attachments.first()?.name).toBe('custom-name.txt')
	})
})
