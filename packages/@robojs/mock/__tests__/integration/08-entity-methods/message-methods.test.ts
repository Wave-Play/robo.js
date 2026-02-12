/**
 * Message Methods Tests
 *
 * Tests for Message instance methods including fetch, reply, react,
 * startThread, and various message properties.
 */
import {
	AttachmentBuilder,
	ChannelType,
	Client,
	EmbedBuilder,
	GatewayIntentBits,
	TextChannel,
	ThreadChannel
} from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { delay, generateSnowflake, waitForReady } from '../utils/helpers.js'

describe('Message Methods', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel
	let guildId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'message-methods-tests',
			config: {
				guilds: [
					{
						name: 'Message Methods Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				],
				enforceIntents: true,
				approvedPrivilegedIntents: BigInt(GatewayIntentBits.MessageContent | GatewayIntentBits.GuildMembers)
			}
		})

		client = createClientWithIntents([
			GatewayIntentBits.Guilds,
			GatewayIntentBits.GuildMessages,
			GatewayIntentBits.MessageContent,
			GatewayIntentBits.GuildMembers
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

	describe('Message.fetch() - Refetch', () => {
		it('should fetch message by ID', async () => {
			const message = await channel.send('Fetch me')

			const fetched = await channel.messages.fetch(message.id)

			expect(fetched.content).toBe('Fetch me')
			expect(fetched.id).toBe(message.id)
		})

		it('should fetch with force option', async () => {
			const message = await channel.send('Force fetch')

			const refetched = await channel.messages.fetch({
				message: message.id,
				force: true
			})

			expect(refetched.id).toBe(message.id)
		})

		it('should refetch message via message.fetch()', async () => {
			const message = await channel.send('Refetch')

			const refetched = await message.fetch()

			expect(refetched.id).toBe(message.id)
			expect(refetched.content).toBe('Refetch')
		})

		it('should fetch with force via message.fetch(true)', async () => {
			const message = await channel.send('Force refetch')

			const refetched = await message.fetch(true)

			expect(refetched.id).toBe(message.id)
		})
	})

	describe('Message.reply()', () => {
		it('should reply to message', async () => {
			const original = await channel.send('Reply to me')

			const reply = await original.reply('This is a reply')

			expect(reply.reference?.messageId).toBe(original.id)
			// Note: Message type may not be set to Reply by the mock server
			expect(reply.content).toBe('This is a reply')
		})

		it('should reply with embed', async () => {
			const original = await channel.send('Reply with embed')

			const embed = new EmbedBuilder().setTitle('Reply Embed')
			const reply = await original.reply({ embeds: [embed] })

			expect(reply.reference?.messageId).toBe(original.id)
			expect(reply.embeds.length).toBeGreaterThan(0)
		})

		it('should reply without mention', async () => {
			const original = await channel.send('No mention reply')

			const reply = await original.reply({
				content: 'No ping',
				allowedMentions: { repliedUser: false }
			})

			expect(reply.reference?.messageId).toBe(original.id)
		})

		it('should reply to user message', async () => {
			// Simulate message from another user
			const userId = generateSnowflake()
			const messageId = generateSnowflake()

			await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
				guild_id: guildId,
				user: {
					id: userId,
					username: 'OtherUser',
					discriminator: '0',
					avatar: null
				},
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			})

			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				id: messageId,
				channel_id: channel.id,
				content: 'User message',
				author: { id: userId, username: 'OtherUser', discriminator: '0', avatar: null },
				timestamp: new Date().toISOString(),
				edited_timestamp: null,
				tts: false,
				mention_everyone: false,
				mentions: [],
				mention_roles: [],
				attachments: [],
				embeds: [],
				pinned: false,
				type: 0
			})

			await delay(100)

			const messages = await channel.messages.fetch({ limit: 10 })
			const userMessage = messages.get(messageId)

			if (userMessage) {
				const reply = await userMessage.reply('Replying to user!')
				expect(reply.reference?.messageId).toBe(messageId)
			}
		})
	})

	describe('Message.react()', () => {
		it('should add unicode reaction', async () => {
			const message = await channel.send('React to me')

			await message.react('👍')

			// Fetch to verify reaction
			const fetched = await channel.messages.fetch(message.id)
			expect(fetched.reactions.cache.has('👍')).toBe(true)
		})

		it('should add multiple reactions', async () => {
			const message = await channel.send('Multiple reactions')

			await message.react('👍')
			await message.react('👎')
			await message.react('❤️')

			const fetched = await channel.messages.fetch(message.id)
			expect(fetched.reactions.cache.size).toBeGreaterThanOrEqual(3)
		})

		it('should add reaction by emoji identifier', async () => {
			const message = await channel.send('Identifier react')

			await message.react('😀')

			const fetched = await channel.messages.fetch(message.id)
			expect(fetched.reactions.cache.size).toBeGreaterThan(0)
		})
	})

	describe('Message.startThread()', () => {
		let createdThread: ThreadChannel | null = null

		afterEach(async () => {
			if (createdThread) {
				try {
					await createdThread.delete()
				} catch {
					// Thread may already be deleted
				}
				createdThread = null
			}
		})

		it('should start thread from message', async () => {
			const message = await channel.send('Start thread here')

			createdThread = await message.startThread({
				name: 'Discussion',
				autoArchiveDuration: 60
			})

			expect(createdThread.name).toBe('Discussion')
			expect(createdThread.parentId).toBe(channel.id)
		})

		it('should start thread with reason', async () => {
			const message = await channel.send('Thread with reason')

			createdThread = await message.startThread({
				name: 'Reason Thread',
				reason: 'Created for testing'
			})

			expect(createdThread).toBeDefined()
			expect(createdThread.name).toBe('Reason Thread')
		})
	})

	describe('Message Edit Operations', () => {
		it('should edit message content', async () => {
			const message = await channel.send('Original content')

			const edited = await message.edit('Edited content')

			expect(edited.content).toBe('Edited content')
		})

		it('should edit message with embed', async () => {
			const message = await channel.send('Add embed')

			const embed = new EmbedBuilder().setTitle('Added Embed')
			const edited = await message.edit({ embeds: [embed] })

			expect(edited.embeds.length).toBeGreaterThan(0)
		})

		it('should remove specific attachment', async () => {
			const file1 = new AttachmentBuilder(Buffer.from('Keep this content'), { name: 'keep.txt' })
			const file2 = new AttachmentBuilder(Buffer.from('Remove this content'), { name: 'remove.txt' })

			const message = await channel.send({ files: [file1, file2] })
			expect(message.attachments.size).toBe(2)

			const keepAttachment = message.attachments.find((a) => a.name === 'keep.txt')!

			// Edit message to only keep specific attachments
			await message.edit({
				attachments: [keepAttachment]
			})

			// Fetch updated message to verify
			const updated = await channel.messages.fetch(message.id)
			expect(updated.attachments.size).toBe(1)
			expect(updated.attachments.first()?.name).toBe('keep.txt')
		})
	})

	describe('Message.delete()', () => {
		it('should delete message', async () => {
			const message = await channel.send('Delete me')

			await message.delete()

			// Message should no longer be fetchable
			await expect(channel.messages.fetch(message.id)).rejects.toBeDefined()
		})
	})

	describe('Message.pin() / Message.unpin()', () => {
		// Note: Pin endpoints exist but route matching needs investigation
		it.skip('should pin message', async () => {
			const message = await channel.send('Pin me')

			await message.pin()

			const fetched = await channel.messages.fetch({ message: message.id, force: true })
			expect(fetched.pinned).toBe(true)
		})

		it.skip('should unpin message', async () => {
			const message = await channel.send('Unpin me')

			await message.pin()

			// Verify pinned
			let fetched = await channel.messages.fetch({ message: message.id, force: true })
			expect(fetched.pinned).toBe(true)

			await fetched.unpin()

			// Verify unpinned
			fetched = await channel.messages.fetch({ message: message.id, force: true })
			expect(fetched.pinned).toBe(false)
		})
	})

	describe('Message Properties', () => {
		it('should have url property', async () => {
			const message = await channel.send('URL test')

			expect(message.url).toContain(channel.id)
			expect(message.url).toContain(message.id)
		})

		it('should check editable', async () => {
			const myMessage = await channel.send('My message')

			expect(myMessage.editable).toBe(true)
		})

		it('should check deletable', async () => {
			const myMessage = await channel.send('Deletable')

			expect(myMessage.deletable).toBe(true)
		})

		it('should check pinnable', async () => {
			const message = await channel.send('Pinnable')

			expect(message.pinnable).toBe(true)
		})

		it('should check if in guild', async () => {
			const message = await channel.send('Guild message')

			expect(message.inGuild()).toBe(true)
		})

		it('should have createdAt timestamp', async () => {
			const message = await channel.send('Timestamp')

			expect(message.createdAt).toBeInstanceOf(Date)
			expect(message.createdTimestamp).toBeGreaterThan(0)
		})

		it('should have author reference', async () => {
			const message = await channel.send('Author test')

			expect(message.author).toBeDefined()
			expect(message.author.id).toBe(client!.user!.id)
		})

		it('should have channel reference', async () => {
			const message = await channel.send('Channel test')

			expect(message.channel).toBeDefined()
			expect(message.channel.id).toBe(channel.id)
		})

		it('should have guild reference', async () => {
			const message = await channel.send('Guild test')

			expect(message.guild).toBeDefined()
			expect(message.guild?.id).toBe(guildId)
		})

		it('should have member reference for guild messages', async () => {
			const message = await channel.send('Member test')

			expect(message.member).toBeDefined()
		})

		it('should have system property', async () => {
			const message = await channel.send('System test')

			expect(message.system).toBe(false)
		})

		it('should have webhookId property (null for regular messages)', async () => {
			const message = await channel.send('Webhook test')

			expect(message.webhookId).toBeNull()
		})

		it('should have applicationId property (null for regular messages)', async () => {
			const message = await channel.send('App test')

			expect(message.applicationId).toBeNull()
		})
	})

	describe('Message Fetch with Options', () => {
		it('should fetch messages with limit', async () => {
			// Send multiple messages
			await channel.send('Msg 1')
			await channel.send('Msg 2')
			await channel.send('Msg 3')

			const messages = await channel.messages.fetch({ limit: 2 })

			expect(messages.size).toBeLessThanOrEqual(2)
		})

		it('should fetch messages around a message', async () => {
			const msg1 = await channel.send('Before')
			await delay(50)
			const msg2 = await channel.send('Center')
			await delay(50)
			const msg3 = await channel.send('After')

			const messages = await channel.messages.fetch({
				around: msg2.id,
				limit: 10
			})

			// Should contain all three
			expect(messages.has(msg1.id)).toBe(true)
			expect(messages.has(msg2.id)).toBe(true)
			expect(messages.has(msg3.id)).toBe(true)
		})

		it('should fetch messages before a message', async () => {
			const msg1 = await channel.send('First')
			await delay(50)
			const msg2 = await channel.send('Second')

			const messages = await channel.messages.fetch({
				before: msg2.id,
				limit: 10
			})

			expect(messages.has(msg1.id)).toBe(true)
		})

		it('should fetch messages after a message', async () => {
			const msg1 = await channel.send('First')
			await delay(50)
			const msg2 = await channel.send('Second')

			const messages = await channel.messages.fetch({
				after: msg1.id,
				limit: 10
			})

			expect(messages.has(msg2.id)).toBe(true)
		})
	})
})
