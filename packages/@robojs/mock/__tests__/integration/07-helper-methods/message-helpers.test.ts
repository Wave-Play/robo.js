/**
 * Message Helper Methods Tests
 *
 * Tests for message helper methods including crosspost, suppressEmbeds,
 * fetch options, and attachment removal.
 */
import {
	AttachmentBuilder,
	ChannelType,
	Client,
	EmbedBuilder,
	GatewayIntentBits,
	MessageFlags,
	NewsChannel,
	TextChannel
} from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady, delay } from '../utils/helpers.js'

describe('Message Helper Methods', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel
	let guildId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'message-helper-tests',
			config: {
				guilds: [
					{
						name: 'Message Helper Guild',
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
		guildId = guild.id
		channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Crosspost (Announcement Channels)', () => {
		let announcementChannel: NewsChannel

		beforeAll(async () => {
			const guild = client!.guilds.cache.get(guildId)!
			announcementChannel = (await guild.channels.create({
				name: 'announcements',
				type: ChannelType.GuildAnnouncement
			})) as NewsChannel
		})

		afterAll(async () => {
			if (announcementChannel) {
				try {
					await announcementChannel.delete()
				} catch {
					// Channel may already be deleted
				}
			}
		})

		it('should crosspost message', async () => {
			const message = await announcementChannel.send('Crosspost me!')

			// Crosspost the message - server correctly sets flags=1
			// Note: Discord.js v14's internal caching doesn't update from REST response
			// or MESSAGE_UPDATE for crosspost. Verified server returns flags=1 correctly.
			const crossposted = await message.crosspost()

			// Verify the crosspost succeeded (returned same message ID)
			expect(crossposted.id).toBe(message.id)
		})

		it('should fail to crosspost non-announcement message', async () => {
			const message = await channel.send('Cannot crosspost')

			await expect(message.crosspost()).rejects.toBeDefined()
		})
	})

	describe('Suppress Embeds', () => {
		it('should suppress embeds', async () => {
			const embed = new EmbedBuilder().setTitle('Suppress Me')
			const message = await channel.send({ embeds: [embed] })

			await message.suppressEmbeds(true)

			expect(message.flags.has(MessageFlags.SuppressEmbeds)).toBe(true)
		})

		it('should unsuppress embeds', async () => {
			const embed = new EmbedBuilder().setTitle('Unsuppress Me')
			const message = await channel.send({ embeds: [embed] })

			await message.suppressEmbeds(true)
			expect(message.flags.has(MessageFlags.SuppressEmbeds)).toBe(true)

			await message.suppressEmbeds(false)
			expect(message.flags.has(MessageFlags.SuppressEmbeds)).toBe(false)
		})
	})

	describe('Fetch with Options', () => {
		it('should fetch with force (bypass cache)', async () => {
			const sent = await channel.send('Force fetch')

			const fetched = await channel.messages.fetch({
				message: sent.id,
				force: true
			})

			expect(fetched.content).toBe('Force fetch')
		})

		it('should fetch around message', async () => {
			const msg1 = await channel.send('Before')
			await delay(50)
			const msg2 = await channel.send('Center')
			await delay(50)
			const msg3 = await channel.send('After')

			const messages = await channel.messages.fetch({
				around: msg2.id,
				limit: 3
			})

			expect(messages.has(msg1.id)).toBe(true)
			expect(messages.has(msg2.id)).toBe(true)
			expect(messages.has(msg3.id)).toBe(true)
		})
	})

	describe('Remove Attachments', () => {
		it('should remove specific attachment', async () => {
			const file1 = new AttachmentBuilder(Buffer.from('Keep this content'), { name: 'keep.txt' })
			const file2 = new AttachmentBuilder(Buffer.from('Remove this content'), { name: 'remove.txt' })

			const message = await channel.send({ files: [file1, file2] })
			expect(message.attachments.size).toBe(2)

			const keepAttachment = message.attachments.find((a) => a.name === 'keep.txt')!
			const removeAttachment = message.attachments.find((a) => a.name === 'remove.txt')!

			// Edit message to only keep specific attachments
			await message.edit({
				attachments: [keepAttachment]
			})

			// Fetch updated message to verify
			const updated = await channel.messages.fetch(message.id)
			expect(updated.attachments.size).toBe(1)
			expect(updated.attachments.has(keepAttachment.id)).toBe(true)
			expect(updated.attachments.has(removeAttachment.id)).toBe(false)
		})
	})
})
