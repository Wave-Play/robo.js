/**
 * All Client Events Tests
 *
 * Tests for various client event emissions including
 * channel, role, emoji, ban, and invite events.
 */
import {
	ChannelType,
	Client,
	Events,
	GatewayIntentBits,
	GuildChannel,
	Role,
	GuildEmoji,
	GuildBan,
	Invite,
	TextChannel
} from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForEvent, waitForReady } from '../utils/helpers.js'

describe('All Client Events', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guildId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'all-client-events',
			config: {
				guilds: [
					{
						name: 'Client Events Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createClientWithIntents([
			GatewayIntentBits.Guilds,
			GatewayIntentBits.GuildMembers,
			GatewayIntentBits.GuildMessages,
			GatewayIntentBits.MessageContent,
			GatewayIntentBits.GuildMessageReactions,
			GatewayIntentBits.GuildPresences,
			GatewayIntentBits.GuildVoiceStates,
			GatewayIntentBits.GuildScheduledEvents,
			GatewayIntentBits.GuildInvites,
			GatewayIntentBits.GuildModeration,
			GatewayIntentBits.GuildEmojisAndStickers
		])
		await client.login(session.token)
		await waitForReady(client)

		const guild = client.guilds.cache.first()!
		guildId = guild.id
	}, 30000)

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Channel Events', () => {
		it('should emit channelCreate', async () => {
			const eventPromise = waitForEvent(client!, Events.ChannelCreate, 5000)

			await client!.guilds.cache.first()!.channels.create({
				name: 'event-channel',
				type: ChannelType.GuildText
			})

			const channel = (await eventPromise) as GuildChannel

			expect(channel.name).toBe('event-channel')

			// Cleanup
			await channel.delete().catch(() => {})
		})

		it('should emit channelDelete', async () => {
			const channel = await client!.guilds.cache.first()!.channels.create({
				name: 'delete-channel',
				type: ChannelType.GuildText
			})

			const eventPromise = waitForEvent(client!, Events.ChannelDelete, 5000)

			await channel.delete()

			const deleted = (await eventPromise) as GuildChannel

			expect(deleted.name).toBe('delete-channel')
		})

		it('should emit channelUpdate', async () => {
			const channel = (await client!.guilds.cache.first()!.channels.create({
				name: 'update-channel',
				type: ChannelType.GuildText
			})) as TextChannel

			const eventPromise = waitForEvent(client!, Events.ChannelUpdate, 5000)

			await channel.setName('updated-channel')

			const oldChannel = (await eventPromise) as GuildChannel
			const newChannel = client!.channels.cache.get(oldChannel.id) as GuildChannel

			expect(newChannel.name).toBe('updated-channel')

			// Cleanup
			await newChannel.delete().catch(() => {})
		})
	})

	describe('Role Events', () => {
		it('should emit guildRoleCreate', async () => {
			const eventPromise = waitForEvent(client!, Events.GuildRoleCreate, 5000)

			await client!.guilds.cache.first()!.roles.create({ name: 'event-role' })

			const role = (await eventPromise) as Role

			expect(role.name).toBe('event-role')

			// Cleanup
			await role.delete().catch(() => {})
		})

		it('should emit guildRoleDelete', async () => {
			const role = await client!.guilds.cache.first()!.roles.create({ name: 'delete-role' })

			const eventPromise = waitForEvent(client!, Events.GuildRoleDelete, 5000)

			await role.delete()

			const deleted = (await eventPromise) as Role

			expect(deleted.name).toBe('delete-role')
		})

		it('should emit guildRoleUpdate', async () => {
			const role = await client!.guilds.cache.first()!.roles.create({ name: 'update-role' })

			const eventPromise = waitForEvent(client!, Events.GuildRoleUpdate, 5000)

			await role.setName('updated-role')

			const oldRole = (await eventPromise) as Role
			const newRole = client!.guilds.cache.first()!.roles.cache.get(oldRole.id) as Role

			expect(newRole.name).toBe('updated-role')

			// Cleanup
			await newRole.delete().catch(() => {})
		})
	})

	describe('Emoji Events', () => {
		it('should emit guildEmojiCreate', async () => {
			const eventPromise = waitForEvent(client!, Events.GuildEmojiCreate, 5000)

			// Create emoji with a minimal base64 PNG
			await client!.guilds.cache.first()!.emojis.create({
				attachment:
					'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
				name: 'event_emoji'
			})

			const emoji = (await eventPromise) as GuildEmoji

			expect(emoji.name).toBe('event_emoji')

			// Cleanup
			await emoji.delete().catch(() => {})
		})
	})

	describe('Ban Events', () => {
		it('should emit guildBanAdd', async () => {
			const userId = generateSnowflake()

			// Add user to guild first
			await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
				guild_id: guildId,
				user: {
					id: userId,
					username: 'BanTarget',
					discriminator: '0',
					avatar: null
				},
				roles: [],
				joined_at: new Date().toISOString()
			})

			await new Promise((resolve) => setTimeout(resolve, 100))

			const eventPromise = waitForEvent(client!, Events.GuildBanAdd, 5000)

			await client!.guilds.cache.first()!.bans.create(userId)

			const ban = (await eventPromise) as GuildBan

			expect(ban.user.id).toBe(userId)

			// Cleanup
			await client!.guilds.cache.first()!.bans.remove(userId).catch(() => {})
		})

		it('should emit guildBanRemove', async () => {
			const userId = generateSnowflake()

			// Add user and ban them first
			await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
				guild_id: guildId,
				user: {
					id: userId,
					username: 'UnbanTarget',
					discriminator: '0',
					avatar: null
				},
				roles: [],
				joined_at: new Date().toISOString()
			})

			await new Promise((resolve) => setTimeout(resolve, 100))

			await client!.guilds.cache.first()!.bans.create(userId)

			await new Promise((resolve) => setTimeout(resolve, 100))

			const eventPromise = waitForEvent(client!, Events.GuildBanRemove, 5000)

			await client!.guilds.cache.first()!.bans.remove(userId)

			const ban = (await eventPromise) as GuildBan

			expect(ban.user.id).toBe(userId)
		})
	})

	describe('Invite Events', () => {
		it('should emit inviteCreate', async () => {
			const channel = client!.guilds.cache
				.first()!
				.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel

			const eventPromise = waitForEvent(client!, Events.InviteCreate, 5000)

			await channel.createInvite()

			const invite = (await eventPromise) as Invite

			expect(invite.channel?.id).toBe(channel.id)
		})

		it('should emit inviteDelete', async () => {
			const channel = client!.guilds.cache
				.first()!
				.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel

			const invite = await channel.createInvite()

			const eventPromise = waitForEvent(client!, Events.InviteDelete, 5000)

			await invite.delete()

			const deleted = (await eventPromise) as Invite

			expect(deleted.code).toBe(invite.code)
		})
	})
})
