/**
 * MessageManager Additional Methods Tests
 *
 * Tests for channel.messages manager methods including
 * resolve, resolveId, fetch, pin, delete, edit, react, and crosspost.
 */
import { ChannelType, Client, GatewayIntentBits, MessageFlags, NewsChannel, TextChannel } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('MessageManager Additional Methods', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel

	beforeAll(async () => {
		session = await createSession({
			name: 'message-manager',
			config: {
				guilds: [
					{
						name: 'Message Manager Guild',
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

	describe('resolve methods', () => {
		it('should resolve message from cache', async () => {
			const message = await channel.send('Resolve test')

			const resolved = channel.messages.resolve(message.id)

			expect(resolved).not.toBeNull()
			expect(resolved?.id).toBe(message.id)
		})

		it('should resolve message ID', async () => {
			const message = await channel.send('ID resolve')

			const id = channel.messages.resolveId(message)

			expect(id).toBe(message.id)
		})
	})

	describe('fetch methods', () => {
		it('should fetch single message', async () => {
			const sent = await channel.send('Fetch single')

			const fetched = await channel.messages.fetch(sent.id)

			expect(fetched.id).toBe(sent.id)
			expect(fetched.content).toBe('Fetch single')
		})

		it('should fetch messages with options', async () => {
			// Send some messages first
			for (let i = 0; i < 5; i++) {
				await channel.send(`Batch ${i}`)
			}

			const messages = await channel.messages.fetch({ limit: 3 })

			expect(messages.size).toBe(3)
		})
	})

	describe('pin operations', () => {
		it('should pin message via manager', async () => {
			const message = await channel.send('Pin via manager')

			await channel.messages.pin(message.id)

			const pins = await channel.messages.fetchPinned()

			expect(pins.has(message.id)).toBe(true)

			// Cleanup
			await channel.messages.unpin(message.id).catch(() => {})
		})
	})

	describe('modify operations', () => {
		it('should delete message via manager', async () => {
			const message = await channel.send('Delete via manager')
			const messageId = message.id

			await channel.messages.delete(messageId)

			await expect(channel.messages.fetch(messageId)).rejects.toBeDefined()
		})

		it('should edit message via manager', async () => {
			const message = await channel.send('Edit via manager')

			const edited = await channel.messages.edit(message.id, 'Edited via manager')

			expect(edited.content).toBe('Edited via manager')
		})
	})

	describe('reaction operations', () => {
		it('should react via manager', async () => {
			const message = await channel.send('React via manager')

			await channel.messages.react(message.id, '👍')

			const fetched = await channel.messages.fetch(message.id)

			expect(fetched.reactions.cache.has('👍')).toBe(true)
		})
	})

	describe('crosspost operations', () => {
		it('should crosspost message in announcement channel', async () => {
			// Create an announcement channel
			const announcementChannel = (await client!.guilds.cache.first()!.channels.create({
				name: 'announcements',
				type: ChannelType.GuildAnnouncement
			})) as NewsChannel

			const message = await announcementChannel.send('Crosspost this')

			const crossposted = await message.crosspost()

			// Check for crossposted flag
			expect(crossposted.flags.has(MessageFlags.Crossposted)).toBe(true)

			// Cleanup
			await announcementChannel.delete().catch(() => {})
		})
	})
})
