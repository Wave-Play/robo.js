/**
 * Thread Member Management Tests
 *
 * Tests for thread member operations including join/leave,
 * member fetch with options, and withMember option.
 */
import { ChannelType, Client, GatewayIntentBits, TextChannel, ThreadChannel } from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForReady } from '../utils/helpers.js'

describe('Thread Member Management', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel
	let thread: ThreadChannel
	let guildId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'thread-members-tests',
			config: {
				guilds: [
					{
						name: 'Thread Members Guild',
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

		const message = await channel.send('Thread for members')
		thread = await message.startThread({ name: 'Member Thread' })
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

	describe('Thread Join/Leave', () => {
		it('should join thread', async () => {
			await thread.join()

			const members = await thread.members.fetch()
			expect(members.has(client!.user!.id)).toBe(true)
		})

		it('should leave thread', async () => {
			await thread.join()
			await thread.leave()

			// Bot may still be auto-added, but leave should work without error
		})
	})

	describe('Thread Member Add/Remove', () => {
		it('should add member to thread', async () => {
			const memberId = generateSnowflake()
			await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
				guild_id: guildId,
				user: { id: memberId, username: 'ThreadMember', discriminator: '0', avatar: null },
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			})

			await thread.members.add(memberId)

			const members = await thread.members.fetch()
			expect(members.has(memberId)).toBe(true)
		})

		it('should remove member from thread', async () => {
			const memberId = generateSnowflake()
			await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
				guild_id: guildId,
				user: { id: memberId, username: 'RemoveMe', discriminator: '0', avatar: null },
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			})

			await thread.members.add(memberId)
			await thread.members.remove(memberId)

			const members = await thread.members.fetch()
			expect(members.has(memberId)).toBe(false)
		})
	})

	describe('Thread Member Fetch Options', () => {
		it('should fetch single thread member', async () => {
			await thread.join()

			const member = await thread.members.fetch(client!.user!.id)

			expect(member.id).toBe(client!.user!.id)
			expect(member.thread?.id).toBe(thread.id)
		})

		it('should fetch thread member with withMember option', async () => {
			await thread.join()

			const member = await thread.members.fetch({
				member: client!.user!.id,
				withMember: true
			})

			expect(member.guildMember).toBeDefined()
		})
	})
})
