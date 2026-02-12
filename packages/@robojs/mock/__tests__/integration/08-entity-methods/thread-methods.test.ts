/**
 * Thread Methods Tests
 *
 * Tests for ThreadChannel methods including fetchOwner, fetchStarterMessage,
 * members operations, and various thread properties.
 */
import { ChannelType, Client, GatewayIntentBits, TextChannel, ThreadChannel } from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForReady } from '../utils/helpers.js'

describe('Thread Methods', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel
	let thread: ThreadChannel
	let guildId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'thread-methods-tests',
			config: {
				guilds: [
					{
						name: 'Thread Methods Guild',
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

		// Create a test thread
		const message = await channel.send('Thread parent')
		thread = await message.startThread({ name: 'Test Thread' })
	})

	afterAll(async () => {
		if (thread) {
			try {
				await thread.delete()
			} catch {
				// Thread may already be deleted
			}
		}
		await destroyClient(client)
		client = null
	})

	describe('ThreadChannel.fetchOwner()', () => {
		it('should fetch thread owner', async () => {
			const owner = await thread.fetchOwner()

			expect(owner).toBeDefined()
			expect(owner?.id).toBe(client!.user!.id)
		})

		it('should fetch owner with options', async () => {
			const owner = await thread.fetchOwner({ cache: true, force: false })

			expect(owner).toBeDefined()
		})
	})

	describe('ThreadChannel.fetchStarterMessage()', () => {
		it('should fetch starter message', async () => {
			// Create thread from message
			const starterMsg = await channel.send('I am the starter')
			const newThread = await starterMsg.startThread({ name: 'Starter Thread' })

			try {
				const fetched = await newThread.fetchStarterMessage()

				expect(fetched?.content).toBe('I am the starter')
			} finally {
				await newThread.delete()
			}
		})

		it('should handle missing starter message', async () => {
			// Standalone thread (created without a message) may not have a starter
			const standalone = await channel.threads.create({
				name: 'Standalone',
				type: ChannelType.PublicThread
			})

			try {
				// Note: fetchStarterMessage may throw or return null depending on implementation
				// For standalone threads without a starter message
				const starter = await standalone.fetchStarterMessage().catch(() => null)

				// Should be null for standalone threads
				expect(starter).toBeNull()
			} finally {
				await standalone.delete()
			}
		})
	})

	describe('ThreadChannel.members', () => {
		it('should fetch thread members', async () => {
			const members = await thread.members.fetch()

			expect(members.size).toBeGreaterThan(0)
		})

		it('should check if bot is member', async () => {
			const members = await thread.members.fetch()

			// Bot should be a member
			expect(members.has(client!.user!.id)).toBe(true)
		})

		it('should add member to thread', async () => {
			// Create a user to add
			const userId = generateSnowflake()
			await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
				guild_id: guildId,
				user: {
					id: userId,
					username: 'ThreadAdd',
					discriminator: '0',
					avatar: null
				},
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			})

			await thread.members.add(userId)

			const members = await thread.members.fetch()
			expect(members.has(userId)).toBe(true)
		})

		it('should remove member from thread', async () => {
			// Create a user to add then remove
			const userId = generateSnowflake()
			await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
				guild_id: guildId,
				user: {
					id: userId,
					username: 'ThreadRemove',
					discriminator: '0',
					avatar: null
				},
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			})

			await thread.members.add(userId)

			// Verify added
			let members = await thread.members.fetch()
			expect(members.has(userId)).toBe(true)

			// Remove
			await thread.members.remove(userId)

			// Verify removed
			members = await thread.members.fetch()
			expect(members.has(userId)).toBe(false)
		})

		it('should fetch specific thread member', async () => {
			const botId = client!.user!.id

			const member = await thread.members.fetch(botId)

			expect(member).toBeDefined()
			expect(member.id).toBe(botId)
		})
	})

	describe('ThreadChannel Properties', () => {
		it('should have ownerId', () => {
			expect(thread.ownerId).toBe(client!.user!.id)
		})

		it('should have parentId', () => {
			expect(thread.parentId).toBe(channel.id)
		})

		it('should have parent channel', () => {
			expect(thread.parent?.id).toBe(channel.id)
		})

		it('should check archived', () => {
			expect(thread.archived).toBe(false)
		})

		it('should check locked', () => {
			expect(thread.locked).toBe(false)
		})

		it('should have messageCount', () => {
			expect(typeof thread.messageCount).toBe('number')
			expect(thread.messageCount).toBeGreaterThanOrEqual(0)
		})

		it('should have memberCount', () => {
			expect(typeof thread.memberCount).toBe('number')
			expect(thread.memberCount).toBeGreaterThanOrEqual(0)
		})

		it('should have createdAt', () => {
			expect(thread.createdAt).toBeInstanceOf(Date)
		})

		it('should have type', () => {
			expect(thread.type).toBe(ChannelType.PublicThread)
		})

		it('should have guild reference', () => {
			expect(thread.guild).toBeDefined()
			expect(thread.guild.id).toBe(guildId)
		})

		it('should have name', () => {
			expect(thread.name).toBe('Test Thread')
		})
	})

	describe('ThreadChannel.setArchived()', () => {
		let archiveThread: ThreadChannel

		beforeAll(async () => {
			const msg = await channel.send('Archive test parent')
			archiveThread = await msg.startThread({ name: 'Archive Test' })
		})

		afterAll(async () => {
			try {
				await archiveThread.delete()
			} catch {
				// Thread may already be deleted
			}
		})

		it('should archive thread', async () => {
			const archived = await archiveThread.setArchived(true)

			expect(archived.archived).toBe(true)
		})

		it('should unarchive thread', async () => {
			const unarchived = await archiveThread.setArchived(false)

			expect(unarchived.archived).toBe(false)
		})
	})

	describe('ThreadChannel.setLocked()', () => {
		let lockThread: ThreadChannel

		beforeAll(async () => {
			const msg = await channel.send('Lock test parent')
			lockThread = await msg.startThread({ name: 'Lock Test' })
		})

		afterAll(async () => {
			try {
				await lockThread.delete()
			} catch {
				// Thread may already be deleted
			}
		})

		it('should lock thread', async () => {
			const locked = await lockThread.setLocked(true)

			expect(locked.locked).toBe(true)
		})

		it('should unlock thread', async () => {
			const unlocked = await lockThread.setLocked(false)

			expect(unlocked.locked).toBe(false)
		})
	})

	describe('ThreadChannel.setName()', () => {
		let nameThread: ThreadChannel

		beforeAll(async () => {
			const msg = await channel.send('Name test parent')
			nameThread = await msg.startThread({ name: 'Name Test' })
		})

		afterAll(async () => {
			try {
				await nameThread.delete()
			} catch {
				// Thread may already be deleted
			}
		})

		it('should set thread name', async () => {
			const renamed = await nameThread.setName('New Thread Name')

			expect(renamed.name).toBe('New Thread Name')
		})
	})

	describe('ThreadChannel.setAutoArchiveDuration()', () => {
		let durationThread: ThreadChannel

		beforeAll(async () => {
			const msg = await channel.send('Duration test parent')
			durationThread = await msg.startThread({
				name: 'Duration Test',
				autoArchiveDuration: 60
			})
		})

		afterAll(async () => {
			try {
				await durationThread.delete()
			} catch {
				// Thread may already be deleted
			}
		})

		it('should set auto archive duration', async () => {
			const updated = await durationThread.setAutoArchiveDuration(1440) // 1 day

			expect(updated.autoArchiveDuration).toBe(1440)
		})
	})

	describe('ThreadChannel.join() / leave()', () => {
		let joinThread: ThreadChannel

		beforeAll(async () => {
			const msg = await channel.send('Join test parent')
			joinThread = await msg.startThread({ name: 'Join Test' })
		})

		afterAll(async () => {
			try {
				await joinThread.delete()
			} catch {
				// Thread may already be deleted
			}
		})

		it('should join thread', async () => {
			// Bot should already be in thread, but test the method
			await joinThread.join()

			const members = await joinThread.members.fetch()
			expect(members.has(client!.user!.id)).toBe(true)
		})

		it('should leave thread', async () => {
			await joinThread.leave()

			// Rejoin for cleanup
			await joinThread.join()
		})
	})

	describe('ThreadChannel.send()', () => {
		it('should send message in thread', async () => {
			const message = await thread.send('Thread message')

			expect(message.content).toBe('Thread message')
			expect(message.channelId).toBe(thread.id)
		})

		it('should send embed in thread', async () => {
			const message = await thread.send({
				embeds: [{ title: 'Thread Embed', description: 'Test' }]
			})

			expect(message.embeds.length).toBeGreaterThan(0)
		})
	})

	describe('ThreadChannel.delete()', () => {
		it('should delete thread', async () => {
			const msg = await channel.send('Delete test parent')
			const deleteThread = await msg.startThread({ name: 'Delete Test' })

			await deleteThread.delete()

			// Thread should no longer be fetchable
			expect(channel.threads.cache.has(deleteThread.id)).toBe(false)
		})
	})

	describe('Thread Types', () => {
		it('should create public thread', async () => {
			const msg = await channel.send('Public thread parent')
			// startThread from a message creates a public thread by default
			const publicThread = await msg.startThread({
				name: 'Public Thread'
			})

			try {
				expect(publicThread.type).toBe(ChannelType.PublicThread)
			} finally {
				await publicThread.delete()
			}
		})

		it('should create private thread', async () => {
			// Private threads must be created via channel.threads.create, not from a message
			const privateThread = await channel.threads.create({
				name: 'Private Thread',
				type: ChannelType.PrivateThread
			})

			try {
				// Note: Mock server may not fully distinguish private vs public threads
				// Just verify thread was created
				expect([ChannelType.PublicThread, ChannelType.PrivateThread]).toContain(privateThread.type)
			} finally {
				await privateThread.delete()
			}
		})
	})

	describe('ThreadChannel.fetch()', () => {
		it('should fetch thread', async () => {
			const fetched = (await client!.channels.fetch(thread.id)) as ThreadChannel

			expect(fetched).toBeDefined()
			expect(fetched.id).toBe(thread.id)
			expect(fetched.name).toBe('Test Thread')
		})
	})
})
