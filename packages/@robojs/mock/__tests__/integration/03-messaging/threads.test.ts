/**
 * Thread Tests
 *
 * Covers creation, management, membership, messaging, listings, and events.
 */
import {
	ChannelType,
	Client,
	Events,
	GatewayIntentBits,
	type TextChannel,
	type ThreadChannel
} from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForEvent, waitForReady } from '../utils/helpers.js'

describe('Threads', () => {
	let client: Client | null = null
	let channel: TextChannel
	let session: { id: string; token: string; guildId: string }

	beforeAll(async () => {
		session = await createSession({
			name: 'thread-tests',
			config: {
				guilds: [{ name: 'Thread Guild' }],
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

		const guild = client.guilds.cache.first()
		if (!guild) {
			throw new Error('Guild not found for thread tests')
		}

		const textChannel = guild.channels.cache.find((c) => c?.type === ChannelType.GuildText) as TextChannel | undefined
		if (!textChannel) {
			throw new Error('Text channel not found for thread tests')
		}
		channel = textChannel
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Creating Threads', () => {
		it('should create public thread from message', async () => {
			const message = await channel.send('Thread starter')
			const thread = await message.startThread({
				name: 'Test Thread',
				autoArchiveDuration: 60
			})

			expect(thread.name).toBe('Test Thread')
			expect(thread.type).toBe(ChannelType.PublicThread)
			expect(thread.parentId).toBe(channel.id)

			await thread.delete()
		})

		it('should create standalone thread', async () => {
			const thread = await channel.threads.create({
				name: 'Standalone',
				type: ChannelType.PublicThread
			})

			expect(thread.name).toBe('Standalone')
			await thread.delete()
		})

		it('should create private thread', async () => {
			const thread = await channel.threads.create({
				name: 'Private',
				type: ChannelType.PrivateThread
			})

			expect(thread.type).toBe(ChannelType.PrivateThread)
			await thread.delete()
		})
	})

	describe('Thread Management', () => {
		let thread: ThreadChannel

		beforeEach(async () => {
			const message = await channel.send('Management test')
			thread = await message.startThread({ name: 'Manage' })
		})

		afterEach(async () => {
			if (thread) {
				try {
					await thread.delete()
				} catch {
					// ignore cleanup errors (thread may already be deleted)
				}
			}
		})

		it('should rename thread', async () => {
			await thread.setName('Renamed')
			expect(thread.name).toBe('Renamed')
		})

		it('should archive thread', async () => {
			await thread.setArchived(true)
			expect(thread.archived).toBe(true)
		})

		it('should lock thread', async () => {
			await thread.setLocked(true)
			expect(thread.locked).toBe(true)
		})

		it('should set slowmode', async () => {
			await thread.setRateLimitPerUser(30)
			expect(thread.rateLimitPerUser).toBe(30)
		})
	})

	describe('Thread Membership', () => {
		let thread: ThreadChannel

		beforeAll(async () => {
			const message = await channel.send('Membership test')
			thread = await message.startThread({ name: 'Members' })
		})

		afterAll(async () => {
			if (thread) {
				await thread.delete()
			}
		})

		it('should join thread', async () => {
			await thread.join()
			expect(thread.joined).toBe(true)
		})

		it('should leave thread', async () => {
			// Use direct REST API for reliable testing
			const leaveResponse = await fetch(
				`http://localhost:3000/api/v10/channels/${thread.id}/thread-members/@me`,
				{
					method: 'DELETE',
					headers: { Authorization: `Bot ${session.token}` }
				}
			)
			expect(leaveResponse.status).toBe(204)

			// Verify via direct REST fetch (Discord.js caching can be unreliable)
			const threadResponse = await fetch(
				`http://localhost:3000/api/v10/channels/${thread.id}`,
				{
					headers: { Authorization: `Bot ${session.token}` }
				}
			)
			const threadData = (await threadResponse.json()) as { member?: unknown }
			expect(threadData.member).toBeUndefined()

			// Rejoin for cleanup
			await thread.join()
		})

		it('should add member to thread', async () => {
			await thread.members.add('444')
			const members = await thread.members.fetch()
			expect(members.has('444')).toBe(true)
		})
	})

	describe('Messages in Threads', () => {
		let thread: ThreadChannel

		beforeAll(async () => {
			const message = await channel.send('Thread messages')
			thread = await message.startThread({ name: 'Messages' })
		})

		afterAll(async () => {
			if (thread) {
				await thread.delete()
			}
		})

		it('should send message in thread', async () => {
			const message = await thread.send('Thread message')
			expect(message.channelId).toBe(thread.id)
		})

		it('should fetch messages in thread', async () => {
			await thread.send('Fetch 1')
			await thread.send('Fetch 2')

			const messages = await thread.messages.fetch({ limit: 10 })
			expect(messages.size).toBeGreaterThanOrEqual(2)
		})
	})

	describe('Thread Listing', () => {
		it('should fetch active threads', async () => {
			const seedThread = await channel.threads.create({ name: 'Active Thread', type: ChannelType.PublicThread })
			const guild = client!.guilds.cache.first()!
			const threads = await guild.channels.fetchActiveThreads()

			expect(threads.threads.has(seedThread.id)).toBe(true)
			await seedThread.delete()
		})

		it('should fetch archived threads', async () => {
			const message = await channel.send('Archive test')
			const thread = await message.startThread({ name: 'Archived' })
			await thread.setArchived(true)

			const archived = await channel.threads.fetchArchived()
			expect(archived.threads.some((t) => t.id === thread.id)).toBe(true)
		})
	})

	describe('Thread Events', () => {
		it('should emit threadCreate', async () => {
			const eventPromise = waitForEvent(client!, Events.ThreadCreate)
			const message = await channel.send('Event thread')
			const thread = await message.startThread({ name: 'Event' })

			const received = await eventPromise
			expect(received.id).toBe(thread.id)

			await thread.delete()
		})
	})
})

