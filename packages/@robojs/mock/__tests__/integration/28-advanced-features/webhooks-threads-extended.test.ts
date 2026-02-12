/**
 * Webhooks in Threads Extended Tests
 *
 * Extended tests for webhook operations in threads including
 * sending to threads, embeds, threadName for forum posts, and CRUD.
 */
import {
	ChannelType,
	Client,
	EmbedBuilder,
	ForumChannel,
	GatewayIntentBits,
	TextChannel,
	ThreadChannel,
	Webhook
} from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Webhooks in Threads Extended', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel
	let webhook: Webhook
	let thread: ThreadChannel
	let guildId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'webhooks-threads-extended',
			config: {
				guilds: [
					{
						name: 'Webhooks Threads Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages])
		await client.login(session.token)
		await waitForReady(client)

		const guild = client.guilds.cache.first()!
		guildId = guild.id
		channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel

		// Create webhook for testing
		webhook = await channel.createWebhook({ name: 'Thread Extended Webhook' })

		// Create a thread for testing
		const parentMessage = await channel.send('Thread parent message for webhooks')
		thread = await parentMessage.startThread({ name: 'Webhook Extended Thread' })
	})

	afterAll(async () => {
		if (thread) {
			try {
				await thread.delete()
			} catch {
				// Thread may already be deleted
			}
		}
		if (webhook) {
			try {
				await webhook.delete()
			} catch {
				// Webhook may already be deleted
			}
		}
		await destroyClient(client)
		client = null
	})

	describe('Sending to Threads', () => {
		it('should send message to thread via webhook', async () => {
			const message = await webhook.send({
				content: 'Message in thread via webhook',
				threadId: thread.id
			})

			expect(message.channelId).toBe(thread.id)
			expect(message.content).toBe('Message in thread via webhook')
		})

		it('should send embed to thread via webhook', async () => {
			const embed = new EmbedBuilder().setTitle('Thread Embed').setDescription('Sent via webhook to thread')

			const message = await webhook.send({
				embeds: [embed],
				threadId: thread.id
			})

			expect(message.embeds[0].title).toBe('Thread Embed')
			expect(message.embeds[0].description).toBe('Sent via webhook to thread')
		})

		it('should send multiple embeds to thread', async () => {
			const embed1 = new EmbedBuilder().setTitle('First Embed').setDescription('First description')

			const embed2 = new EmbedBuilder().setTitle('Second Embed').setDescription('Second description')

			const message = await webhook.send({
				embeds: [embed1, embed2],
				threadId: thread.id
			})

			expect(message.embeds.length).toBe(2)
			expect(message.embeds[0].title).toBe('First Embed')
			expect(message.embeds[1].title).toBe('Second Embed')
		})

		it('should send content with embed to thread', async () => {
			const embed = new EmbedBuilder().setTitle('Content + Embed').setDescription('Combined message')

			const message = await webhook.send({
				content: 'Check out this embed:',
				embeds: [embed],
				threadId: thread.id
			})

			expect(message.content).toBe('Check out this embed:')
			expect(message.embeds.length).toBe(1)
		})
	})

	describe('Forum Thread Creation', () => {
		it('should use threadName to create new thread in forum', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			// Create a forum channel
			let forum: ForumChannel | null = null
			try {
				forum = (await guild.channels.create({
					name: 'webhook-forum-extended',
					type: ChannelType.GuildForum
				})) as ForumChannel

				// Create webhook for forum
				const forumWebhook = await forum.createWebhook({ name: 'Forum Webhook' })

				// Send with threadName to create a new thread
				const message = await forumWebhook.send({
					content: 'New forum post content',
					threadName: 'Webhook Created Thread Extended'
				})

				// Message should be in a thread
				expect(message.channel).toBeDefined()
				expect(message.content).toBe('New forum post content')

				// Cleanup webhook
				await forumWebhook.delete().catch(() => {})
			} finally {
				if (forum) {
					await forum.delete().catch(() => {})
				}
			}
		})

		it('should create forum thread with embed', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			let forum: ForumChannel | null = null
			try {
				forum = (await guild.channels.create({
					name: 'webhook-forum-embed',
					type: ChannelType.GuildForum
				})) as ForumChannel

				const forumWebhook = await forum.createWebhook({ name: 'Forum Embed Webhook' })

				const embed = new EmbedBuilder().setTitle('Forum Thread Embed').setDescription('Created via webhook')

				const message = await forumWebhook.send({
					embeds: [embed],
					threadName: 'Forum Thread with Embed'
				})

				expect(message.embeds[0].title).toBe('Forum Thread Embed')

				await forumWebhook.delete().catch(() => {})
			} finally {
				if (forum) {
					await forum.delete().catch(() => {})
				}
			}
		})
	})

	describe('Editing Messages in Threads', () => {
		it('should edit message in thread via webhook', async () => {
			const original = await webhook.send({
				content: 'Original content in thread',
				threadId: thread.id
			})

			const edited = await webhook.editMessage(original.id, {
				content: 'Edited content in thread',
				threadId: thread.id
			})

			expect(edited.content).toBe('Edited content in thread')
		})

		it('should edit embed in thread via webhook', async () => {
			const originalEmbed = new EmbedBuilder().setTitle('Original Title').setDescription('Original description')

			const original = await webhook.send({
				embeds: [originalEmbed],
				threadId: thread.id
			})

			const editedEmbed = new EmbedBuilder().setTitle('Edited Title').setDescription('Edited description')

			const edited = await webhook.editMessage(original.id, {
				embeds: [editedEmbed],
				threadId: thread.id
			})

			expect(edited.embeds[0].title).toBe('Edited Title')
			expect(edited.embeds[0].description).toBe('Edited description')
		})

		it('should clear content but keep embed', async () => {
			const embed = new EmbedBuilder().setTitle('Keep This Embed')

			const original = await webhook.send({
				content: 'Remove this content',
				embeds: [embed],
				threadId: thread.id
			})

			const edited = await webhook.editMessage(original.id, {
				content: '',
				embeds: [embed],
				threadId: thread.id
			})

			expect(edited.content).toBe('')
			expect(edited.embeds[0].title).toBe('Keep This Embed')
		})
	})

	describe('Deleting Messages in Threads', () => {
		it('should delete message in thread via webhook', async () => {
			const message = await webhook.send({
				content: 'Delete me in thread',
				threadId: thread.id
			})

			// Delete the message
			await webhook.deleteMessage(message.id, thread.id)

			// Verify message is deleted - fetch should fail
			await expect(thread.messages.fetch(message.id)).rejects.toBeDefined()
		})

		it('should delete embed message in thread', async () => {
			const embed = new EmbedBuilder().setTitle('Delete This Embed')

			const message = await webhook.send({
				embeds: [embed],
				threadId: thread.id
			})

			await webhook.deleteMessage(message.id, thread.id)

			await expect(thread.messages.fetch(message.id)).rejects.toBeDefined()
		})
	})

	describe('Webhook Username and Avatar in Threads', () => {
		it('should use custom username when sending to thread', async () => {
			const message = await webhook.send({
				content: 'Custom username message',
				username: 'Custom Bot Name',
				threadId: thread.id
			})

			// Webhook message should use custom username
			expect(message.author.username).toBe('Custom Bot Name')
		})

		it('should use custom avatar when sending to thread', async () => {
			const message = await webhook.send({
				content: 'Custom avatar message',
				avatarURL: 'https://cdn.discordapp.com/embed/avatars/0.png',
				threadId: thread.id
			})

			// Message should be sent successfully
			expect(message.content).toBe('Custom avatar message')
		})
	})
})
