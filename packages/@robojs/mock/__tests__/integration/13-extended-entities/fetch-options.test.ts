/**
 * Fetch Options Tests
 *
 * Tests for various fetch options including before/after/around,
 * force, cache, query, and user IDs.
 */
import { ChannelType, Client, GatewayIntentBits, Guild, TextChannel } from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForReady } from '../utils/helpers.js'

describe('Fetch Options', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guild: Guild
	let channel: TextChannel

	beforeAll(async () => {
		session = await createSession({
			name: 'fetch-options-tests',
			config: {
				guilds: [
					{
						name: 'Fetch Options Test',
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

		guild = client.guilds.cache.first()!
		channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Message Fetch Options', () => {
		it('should fetch with limit', async () => {
			// Send some messages first
			await channel.send('Message 1')
			await channel.send('Message 2')
			await channel.send('Message 3')

			const messages = await channel.messages.fetch({ limit: 2 })

			expect(messages.size).toBeLessThanOrEqual(2)
		})

		it('should fetch with before', async () => {
			await channel.send('Before First')
			await channel.send('Before Second')
			const msg3 = await channel.send('Before Third')

			const messages = await channel.messages.fetch({
				before: msg3.id,
				limit: 2
			})

			expect(messages.has(msg3.id)).toBe(false)
			expect(messages.size).toBeLessThanOrEqual(2)
		})

		it('should fetch with after', async () => {
			const msg1 = await channel.send('After First')
			await channel.send('After Second')
			await channel.send('After Third')

			const messages = await channel.messages.fetch({
				after: msg1.id,
				limit: 10
			})

			expect(messages.has(msg1.id)).toBe(false)
		})

		it('should fetch with around', async () => {
			await channel.send('Around First')
			const msg2 = await channel.send('Around Center')
			await channel.send('Around Third')

			const messages = await channel.messages.fetch({
				around: msg2.id,
				limit: 3
			})

			// Should include messages around the center
			expect(messages.has(msg2.id)).toBe(true)
		})

		it('should fetch with cache option false', async () => {
			await channel.send('No cache test')

			const messages = await channel.messages.fetch({
				limit: 1,
				cache: false
			})

			// Message should be returned
			expect(messages.size).toBe(1)
		})

		it('should fetch single message by ID', async () => {
			const sent = await channel.send('Single fetch')

			const fetched = await channel.messages.fetch(sent.id)

			expect(fetched.id).toBe(sent.id)
			expect(fetched.content).toBe('Single fetch')
		})
	})

	describe('Member Fetch Options', () => {
		it('should fetch member with force', async () => {
			const me = await guild.members.fetchMe({ force: true })

			expect(me.id).toBe(client!.user!.id)
		})

		it('should fetch member without force (from cache)', async () => {
			const me = await guild.members.fetchMe({ force: false })

			expect(me.id).toBe(client!.user!.id)
		})

		it('should fetch members with query', async () => {
			// Seed members with similar names
			for (let i = 0; i < 5; i++) {
				await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
					guild_id: guild.id,
					user: { id: generateSnowflake(), username: `QueryUser${i}`, discriminator: '0', avatar: null },
					roles: [],
					joined_at: new Date().toISOString(),
					deaf: false,
					mute: false
				})
			}

			const members = await guild.members.fetch({ query: 'QueryUser', limit: 10 })

			expect(members.size).toBeGreaterThan(0)
			members.forEach((m) => {
				expect(m.user.username).toContain('QueryUser')
			})
		})

		it('should fetch specific members by IDs', async () => {
			const id1 = generateSnowflake()
			const id2 = generateSnowflake()

			await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
				guild_id: guild.id,
				user: { id: id1, username: 'Fetch1', discriminator: '0', avatar: null },
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			})
			await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
				guild_id: guild.id,
				user: { id: id2, username: 'Fetch2', discriminator: '0', avatar: null },
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			})

			const members = await guild.members.fetch({ user: [id1, id2] })

			expect(members.has(id1)).toBe(true)
			expect(members.has(id2)).toBe(true)
		})

		it('should fetch member with limit', async () => {
			const members = await guild.members.fetch({ limit: 5 })

			expect(members.size).toBeLessThanOrEqual(5)
		})
	})

	describe('Role Fetch Options', () => {
		it('should fetch roles with cache false', async () => {
			const roles = await guild.roles.fetch(undefined, { cache: false })

			expect(roles.size).toBeGreaterThan(0)
		})

		it('should fetch specific role', async () => {
			const created = await guild.roles.create({ name: 'Fetch Specific' })

			try {
				const fetched = await guild.roles.fetch(created.id)

				expect(fetched?.id).toBe(created.id)
			} finally {
				await created.delete()
			}
		})

		it('should fetch with force', async () => {
			const roles = await guild.roles.fetch(undefined, { force: true })

			expect(roles.size).toBeGreaterThan(0)
		})
	})

	describe('Channel Fetch Options', () => {
		it('should fetch channels with force', async () => {
			const channels = await guild.channels.fetch(undefined, { force: true })

			expect(channels.size).toBeGreaterThan(0)
		})

		it('should fetch specific channel', async () => {
			const fetched = await guild.channels.fetch(channel.id)

			expect(fetched?.id).toBe(channel.id)
		})

		it('should fetch with cache false', async () => {
			const channels = await guild.channels.fetch(undefined, { cache: false })

			expect(channels.size).toBeGreaterThan(0)
		})
	})

	describe('Guild Fetch Options', () => {
		it('should fetch guild with force', async () => {
			const fetched = await client!.guilds.fetch({ guild: guild.id, force: true })

			expect(fetched.id).toBe(guild.id)
		})

		it('should fetch guild without force', async () => {
			const fetched = await client!.guilds.fetch({ guild: guild.id, force: false })

			expect(fetched.id).toBe(guild.id)
		})

		it('should fetch guilds with limit', async () => {
			const guilds = await client!.guilds.fetch({ limit: 10 })

			expect(guilds.size).toBeLessThanOrEqual(10)
		})
	})

	describe('User Fetch Options', () => {
		it('should fetch user with force', async () => {
			const user = await client!.users.fetch(client!.user!.id, { force: true })

			expect(user.id).toBe(client!.user!.id)
		})

		it('should fetch user without force (from cache)', async () => {
			const user = await client!.users.fetch(client!.user!.id, { force: false })

			expect(user.id).toBe(client!.user!.id)
		})

		it('should fetch user with cache false', async () => {
			const userId = generateSnowflake()
			await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
				guild_id: guild.id,
				user: { id: userId, username: 'NoCache', discriminator: '0', avatar: null },
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			})

			const user = await client!.users.fetch(userId, { cache: false })

			expect(user.id).toBe(userId)
		})
	})

	describe('Emoji Fetch Options', () => {
		it('should fetch all emojis', async () => {
			const emojis = await guild.emojis.fetch()

			expect(emojis).toBeDefined()
		})

		it('should fetch emojis with cache false', async () => {
			const emojis = await guild.emojis.fetch(undefined, { cache: false })

			expect(emojis).toBeDefined()
		})
	})

	describe('Ban Fetch Options', () => {
		it('should fetch bans with limit', async () => {
			const bans = await guild.bans.fetch({ limit: 10 })

			expect(bans).toBeDefined()
		})

		it('should fetch bans with cache false', async () => {
			const bans = await guild.bans.fetch({ cache: false })

			expect(bans).toBeDefined()
		})
	})
})
