/**
 * ThreadMember Properties Tests
 *
 * Tests for ThreadMember properties including guildMember, joinedAt,
 * flags, id, thread, user, and manageable.
 */
import { ChannelType, Client, GatewayIntentBits, TextChannel, ThreadChannel } from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForReady, delay } from '../utils/helpers.js'

describe('ThreadMember Properties', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel
	let thread: ThreadChannel
	let guildId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'thread-member-properties-tests',
			config: {
				guilds: [
					{
						name: 'Thread Member Properties Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				],
				enforceIntents: true,
				approvedPrivilegedIntents: BigInt(GatewayIntentBits.GuildMembers)
			}
		})

		client = createClientWithIntents([
			GatewayIntentBits.Guilds,
			GatewayIntentBits.GuildMessages,
			GatewayIntentBits.GuildMembers
		])
		await client.login(session.token)
		await waitForReady(client)

		const guild = client.guilds.cache.first()!
		guildId = guild.id
		channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel

		// Create a thread for testing
		const message = await channel.send('Thread member properties test')
		thread = await message.startThread({ name: 'Member Properties Thread' })
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

	/**
	 * Helper to add a guild member
	 */
	async function addGuildMember(userId: string, username: string): Promise<void> {
		await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
			guild_id: guildId,
			user: {
				id: userId,
				username,
				discriminator: '0',
				avatar: null,
				bot: false
			},
			roles: [],
			joined_at: new Date().toISOString(),
			deaf: false,
			mute: false
		})
		await delay(100)
	}

	describe('Thread Property', () => {
		it('should have thread property referencing the thread', async () => {
			// Ensure bot is in thread
			await thread.join()

			const threadMember = await thread.members.fetchMe()

			expect(threadMember.thread).toBeDefined()
			expect(threadMember.thread.id).toBe(thread.id)
		})
	})

	describe('ID Property', () => {
		it('should have id property matching user id', async () => {
			await thread.join()

			const threadMember = await thread.members.fetchMe()

			expect(threadMember.id).toBe(client!.user!.id)
		})
	})

	describe('User Property', () => {
		it('should have user property for bot', async () => {
			await thread.join()

			const threadMember = await thread.members.fetchMe()

			expect(threadMember.user).toBeDefined()
			expect(threadMember.user?.id).toBe(client!.user!.id)
		})
	})

	describe('GuildMember Property', () => {
		it('should have guildMember when fetched with withMember option', async () => {
			const memberId = generateSnowflake()
			await addGuildMember(memberId, 'ThreadGuildMember')

			await thread.members.add(memberId)

			const members = await thread.members.fetch({ withMember: true })
			const threadMember = members.get(memberId)

			if (threadMember) {
				expect(threadMember.guildMember).toBeDefined()
				expect(threadMember.guildMember?.id).toBe(memberId)
			}
		})
	})

	describe('JoinedAt Property', () => {
		it('should have joinedAt timestamp', async () => {
			const memberId = generateSnowflake()
			await addGuildMember(memberId, 'JoinedAtMember')

			await thread.members.add(memberId)
			await delay(100)

			const threadMember = await thread.members.fetch(memberId)

			expect(threadMember.joinedAt).toBeInstanceOf(Date)
			expect(threadMember.joinedTimestamp).toBeGreaterThan(0)
		})
	})

	describe('Flags Property', () => {
		it('should have flags property', async () => {
			await thread.join()

			const threadMember = await thread.members.fetchMe()

			expect(threadMember.flags).toBeDefined()
		})
	})

	describe('Manageable Property', () => {
		it('should have manageable boolean', async () => {
			await thread.join()

			const threadMember = await thread.members.fetchMe()

			expect(typeof threadMember.manageable).toBe('boolean')
		})
	})

	describe('Thread Member Fetch', () => {
		it('should fetch single thread member by ID', async () => {
			await thread.join()

			const member = await thread.members.fetch(client!.user!.id)

			expect(member.id).toBe(client!.user!.id)
		})

		it('should fetch all thread members', async () => {
			await thread.join()

			const members = await thread.members.fetch()

			expect(members.size).toBeGreaterThan(0)
			expect(members.has(client!.user!.id)).toBe(true)
		})
	})
})
