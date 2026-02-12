/**
 * Gateway Events via Discord.js Tests
 *
 * Tests for various Discord.js events like guildMemberAdd, roleCreate,
 * channelCreate, messageCreate, etc.
 */
import {
	ChannelType,
	Client,
	Collection,
	Events,
	GatewayIntentBits,
	Guild,
	GuildBan,
	GuildChannel,
	GuildMember,
	Invite,
	Message,
	MessageReaction,
	PartialGuildMember,
	PartialMessage,
	Role,
	TextChannel,
	ThreadChannel,
	VoiceChannel,
	VoiceState
} from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForEvent, waitForReady } from '../utils/helpers.js'

describe('Gateway Events via Discord.js', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guild: Guild
	let guildId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'gateway-events-tests',
			config: {
				guilds: [
					{
						name: 'Gateway Events Test Guild',
						channels: [
							{ name: 'general', type: ChannelType.GuildText },
							{ name: 'voice', type: ChannelType.GuildVoice }
						]
					}
				]
			}
		})

		client = createClientWithIntents([
			GatewayIntentBits.Guilds,
			GatewayIntentBits.GuildMembers,
			GatewayIntentBits.GuildMessages,
			GatewayIntentBits.GuildMessageReactions,
			GatewayIntentBits.GuildBans,
			GatewayIntentBits.GuildEmojisAndStickers,
			GatewayIntentBits.GuildInvites,
			GatewayIntentBits.GuildVoiceStates,
			GatewayIntentBits.GuildPresences,
			GatewayIntentBits.MessageContent
		])
		await client.login(session.token)
		await waitForReady(client)

		guild = client.guilds.cache.first()!
		guildId = guild.id
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Guild Member Events', () => {
		it('should emit guildMemberAdd', async () => {
			const eventPromise = waitForEvent<GuildMember>(client!, Events.GuildMemberAdd)

			await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
				guild_id: guildId,
				user: { id: generateSnowflake(), username: 'NewMember', discriminator: '0', avatar: null },
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			})

			const member = await eventPromise
			expect(member.user.username).toBe('NewMember')
		})

		it('should emit guildMemberRemove', async () => {
			const memberId = generateSnowflake()

			// First add the member
			await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
				guild_id: guildId,
				user: { id: memberId, username: 'LeavingMember', discriminator: '0', avatar: null },
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			})

			const eventPromise = waitForEvent<GuildMember | PartialGuildMember>(client!, Events.GuildMemberRemove)

			await dispatchEvent(session.id, 'GUILD_MEMBER_REMOVE', {
				guild_id: guildId,
				user: { id: memberId, username: 'LeavingMember', discriminator: '0', avatar: null }
			})

			const member = await eventPromise
			expect(member.id).toBe(memberId)
		})

		it('should emit guildMemberUpdate', async () => {
			const memberId = generateSnowflake()

			// First add the member
			await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
				guild_id: guildId,
				user: { id: memberId, username: 'UpdateMember', discriminator: '0', avatar: null },
				nick: 'OldNick',
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			})

			// Wait a bit for the member to be cached
			await new Promise((resolve) => setTimeout(resolve, 100))

			const eventPromise = new Promise<[GuildMember | PartialGuildMember, GuildMember]>((resolve) => {
				client!.once(Events.GuildMemberUpdate, (oldMember, newMember) => {
					resolve([oldMember, newMember])
				})
			})

			await dispatchEvent(session.id, 'GUILD_MEMBER_UPDATE', {
				guild_id: guildId,
				user: { id: memberId, username: 'UpdateMember', discriminator: '0', avatar: null },
				nick: 'NewNick',
				roles: []
			})

			const [, newMember] = await eventPromise
			expect(newMember.nickname).toBe('NewNick')
		})
	})

	describe('Role Events', () => {
		it('should emit roleCreate', async () => {
			const eventPromise = waitForEvent<Role>(client!, Events.GuildRoleCreate)

			const role = await guild.roles.create({ name: 'Event Role' })

			const emittedRole = await eventPromise
			expect(emittedRole.name).toBe('Event Role')

			await role.delete()
		})

		it('should emit roleUpdate', async () => {
			const role = await guild.roles.create({ name: 'Update Role' })

			const eventPromise = new Promise<[Role, Role]>((resolve) => {
				client!.once(Events.GuildRoleUpdate, (oldRole, newRole) => {
					resolve([oldRole, newRole])
				})
			})

			await role.setName('Updated Role')

			const [, newRole] = await eventPromise
			expect(newRole.name).toBe('Updated Role')

			await role.delete()
		})

		it('should emit roleDelete', async () => {
			const role = await guild.roles.create({ name: 'Delete Role' })
			const roleId = role.id

			const eventPromise = waitForEvent<Role>(client!, Events.GuildRoleDelete)

			await role.delete()

			const deletedRole = await eventPromise
			expect(deletedRole.id).toBe(roleId)
		})
	})

	describe('Channel Events', () => {
		it('should emit channelCreate', async () => {
			const eventPromise = waitForEvent<GuildChannel>(client!, Events.ChannelCreate)

			const channel = await guild.channels.create({
				name: 'event-channel',
				type: ChannelType.GuildText
			})

			const emittedChannel = await eventPromise
			expect(emittedChannel.name).toBe('event-channel')

			await channel.delete()
		})

		it('should emit channelUpdate', async () => {
			const channel = (await guild.channels.create({
				name: 'update-channel',
				type: ChannelType.GuildText
			})) as TextChannel

			const eventPromise = new Promise<[GuildChannel, GuildChannel]>((resolve) => {
				client!.once(Events.ChannelUpdate, (oldChannel, newChannel) => {
					resolve([oldChannel as GuildChannel, newChannel as GuildChannel])
				})
			})

			await channel.setName('updated-channel')

			const [, newChannel] = await eventPromise
			expect(newChannel.name).toBe('updated-channel')

			await channel.delete()
		})

		it('should emit channelDelete', async () => {
			const channel = await guild.channels.create({
				name: 'delete-channel',
				type: ChannelType.GuildText
			})
			const channelId = channel.id

			const eventPromise = waitForEvent<GuildChannel>(client!, Events.ChannelDelete)

			await channel.delete()

			const deletedChannel = await eventPromise
			expect(deletedChannel.id).toBe(channelId)
		})
	})

	describe('Ban Events', () => {
		it('should emit guildBanAdd', async () => {
			const userId = generateSnowflake()

			// Add user as member first
			await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
				guild_id: guildId,
				user: { id: userId, username: 'BanMe', discriminator: '0', avatar: null },
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			})

			const eventPromise = waitForEvent<GuildBan>(client!, Events.GuildBanAdd)

			await guild.bans.create(userId, { reason: 'Test ban' })

			const ban = await eventPromise
			expect(ban.user.id).toBe(userId)
		})

		it('should emit guildBanRemove', async () => {
			const userId = generateSnowflake()

			// Add user and ban them first
			await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
				guild_id: guildId,
				user: { id: userId, username: 'UnbanMe', discriminator: '0', avatar: null },
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			})

			await guild.bans.create(userId)

			const eventPromise = waitForEvent<GuildBan>(client!, Events.GuildBanRemove)

			await guild.bans.remove(userId)

			const ban = await eventPromise
			expect(ban.user.id).toBe(userId)
		})
	})

	describe('Message Events', () => {
		it('should emit messageCreate', async () => {
			const channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel

			const eventPromise = waitForEvent<Message>(client!, Events.MessageCreate)

			await channel.send('Event message')

			const message = await eventPromise
			expect(message.content).toBe('Event message')
		})

		it('should emit messageUpdate', async () => {
			const channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel

			const message = await channel.send('Original')

			const eventPromise = new Promise<[Message | PartialMessage, Message | PartialMessage]>((resolve) => {
				client!.once(Events.MessageUpdate, (oldMessage, newMessage) => {
					resolve([oldMessage, newMessage])
				})
			})

			await message.edit('Edited')

			const [, newMessage] = await eventPromise
			expect(newMessage.content).toBe('Edited')
		})

		it('should emit messageDelete', async () => {
			const channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel

			const message = await channel.send('Delete me')
			const messageId = message.id

			const eventPromise = waitForEvent<Message | PartialMessage>(client!, Events.MessageDelete)

			await message.delete()

			const deletedMessage = await eventPromise
			expect(deletedMessage.id).toBe(messageId)
		})

		it('should emit messageDeleteBulk', async () => {
			const channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel

			const msg1 = await channel.send('Bulk 1')
			const msg2 = await channel.send('Bulk 2')

			const eventPromise = waitForEvent<Collection<string, Message | PartialMessage>>(
				client!,
				Events.MessageBulkDelete
			)

			await channel.bulkDelete([msg1.id, msg2.id])

			const deleted = await eventPromise
			expect(deleted.size).toBe(2)
		})
	})

	describe('Reaction Events', () => {
		it('should emit messageReactionAdd', async () => {
			const channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel

			const message = await channel.send('React to me')

			const eventPromise = waitForEvent<MessageReaction>(client!, Events.MessageReactionAdd)

			await message.react('\uD83D\uDC4D')

			const reaction = await eventPromise
			expect(reaction.emoji.name).toBe('\uD83D\uDC4D')
		})

		it('should emit messageReactionRemove', async () => {
			const channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel

			const message = await channel.send('Remove reaction')
			await message.react('\u274C')

			const eventPromise = waitForEvent<MessageReaction>(client!, Events.MessageReactionRemove)

			const reaction = message.reactions.cache.get('\u274C')!
			await reaction.users.remove(client!.user!.id)

			const removedReaction = await eventPromise
			expect(removedReaction.emoji.name).toBe('\u274C')
		})

		it('should emit messageReactionRemoveAll', async () => {
			const channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel

			const message = await channel.send('Remove all')
			await message.react('\u0031\uFE0F\u20E3')
			await message.react('\u0032\uFE0F\u20E3')

			const eventPromise = waitForEvent<Message | PartialMessage>(client!, Events.MessageReactionRemoveAll)

			await message.reactions.removeAll()

			const clearedMessage = await eventPromise
			expect(clearedMessage.id).toBe(message.id)
		})
	})

	describe('Thread Events', () => {
		it('should emit threadCreate', async () => {
			const channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel

			const eventPromise = waitForEvent<ThreadChannel>(client!, Events.ThreadCreate)

			const message = await channel.send('Thread parent')
			const thread = await message.startThread({ name: 'Event Thread' })

			const emittedThread = await eventPromise
			expect(emittedThread.name).toBe('Event Thread')

			await thread.delete()
		})

		it('should emit threadDelete', async () => {
			const channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel

			const message = await channel.send('Thread parent')
			const thread = await message.startThread({ name: 'Delete Thread' })
			const threadId = thread.id

			const eventPromise = waitForEvent<ThreadChannel>(client!, Events.ThreadDelete)

			await thread.delete()

			const deletedThread = await eventPromise
			expect(deletedThread.id).toBe(threadId)
		})

		it('should emit threadUpdate', async () => {
			const channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel

			const message = await channel.send('Thread parent')
			const thread = await message.startThread({ name: 'Update Thread' })

			const eventPromise = new Promise<[ThreadChannel, ThreadChannel]>((resolve) => {
				client!.once(Events.ThreadUpdate, (oldThread, newThread) => {
					resolve([oldThread as ThreadChannel, newThread as ThreadChannel])
				})
			})

			await thread.setName('Updated Thread')

			const [, newThread] = await eventPromise
			expect(newThread.name).toBe('Updated Thread')

			await thread.delete()
		})
	})

	describe('Invite Events', () => {
		it('should emit inviteCreate', async () => {
			const channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel

			const eventPromise = waitForEvent<Invite>(client!, Events.InviteCreate)

			const invite = await channel.createInvite({ maxAge: 3600 })

			const emittedInvite = await eventPromise
			expect(emittedInvite.code).toBe(invite.code)
		})

		it('should emit inviteDelete', async () => {
			const channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel

			const invite = await channel.createInvite()

			const eventPromise = waitForEvent<Invite>(client!, Events.InviteDelete)

			await invite.delete()

			const deletedInvite = await eventPromise
			expect(deletedInvite.code).toBe(invite.code)
		})
	})

	describe('Voice State Events', () => {
		it('should emit voiceStateUpdate', async () => {
			const voiceChannel = guild.channels.cache.find((c) => c.type === ChannelType.GuildVoice) as VoiceChannel

			const memberId = generateSnowflake()

			// Add user as member first
			await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
				guild_id: guildId,
				user: { id: memberId, username: 'VoiceUser', discriminator: '0', avatar: null },
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			})

			const eventPromise = new Promise<[VoiceState, VoiceState]>((resolve) => {
				client!.once(Events.VoiceStateUpdate, (oldState, newState) => {
					resolve([oldState, newState])
				})
			})

			await dispatchEvent(session.id, 'VOICE_STATE_UPDATE', {
				guild_id: guildId,
				channel_id: voiceChannel.id,
				user_id: memberId,
				session_id: 'test-session',
				deaf: false,
				mute: false,
				self_deaf: false,
				self_mute: false
			})

			const [, newState] = await eventPromise
			expect(newState.channelId).toBe(voiceChannel.id)
		})
	})
})
