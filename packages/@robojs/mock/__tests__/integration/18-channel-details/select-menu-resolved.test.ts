/**
 * SelectMenu Resolved Values Tests
 *
 * Tests for resolved values in select menu interactions including
 * resolved users, members, roles, and channels.
 */
import {
	ChannelSelectMenuInteraction,
	ChannelType,
	Client,
	ComponentType,
	Events,
	GatewayIntentBits,
	Guild,
	GuildMember,
	Interaction,
	InteractionType,
	MentionableSelectMenuInteraction,
	RoleSelectMenuInteraction,
	TextChannel,
	UserSelectMenuInteraction
} from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForEvent, waitForReady } from '../utils/helpers.js'

describe('SelectMenu Resolved Values', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel
	let guild: Guild
	let guildId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'select-menu-resolved-tests',
			config: {
				guilds: [
					{
						name: 'SelectMenu Resolved Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				],
				enforceIntents: true,
				approvedPrivilegedIntents: BigInt(GatewayIntentBits.GuildMembers)
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMembers])
		await client.login(session.token)
		await waitForReady(client)

		guild = client.guilds.cache.first()!
		guildId = guild.id
		channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('UserSelectMenu resolved', () => {
		it('should have resolved users in UserSelectMenu', async () => {
			const userId = generateSnowflake()
			const interactorId = generateSnowflake()

			// Send a message first to have a valid message reference
			const message = await channel.send('Select a user')

			const eventPromise = waitForEvent<UserSelectMenuInteraction>(
				client!,
				Events.InteractionCreate,
				5000,
				(i) => (i as Interaction).isUserSelectMenu()
			)

			await dispatchEvent(session.id, 'INTERACTION_CREATE', {
				id: generateSnowflake(),
				application_id: client!.user!.id,
				type: InteractionType.MessageComponent,
				guild_id: guildId,
				channel_id: channel.id,
				channel: {
					id: channel.id,
					type: ChannelType.GuildText
				},
				message: {
					id: message.id,
					channel_id: channel.id,
					guild_id: guildId,
					content: 'Select a user',
					author: { id: client!.user!.id, username: client!.user!.username, discriminator: '0', avatar: null },
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
				},
				member: {
					user: { id: interactorId, username: 'Selector', discriminator: '0', avatar: null },
					roles: [],
					joined_at: new Date().toISOString(),
					deaf: false,
					mute: false
				},
				user: { id: interactorId, username: 'Selector', discriminator: '0', avatar: null },
				data: {
					custom_id: 'user_select',
					component_type: ComponentType.UserSelect,
					values: [userId],
					resolved: {
						users: {
							[userId]: {
								id: userId,
								username: 'SelectedUser',
								discriminator: '0',
								avatar: null,
								global_name: 'Selected User'
							}
						}
					}
				},
				token: `user-select-${Date.now()}`,
				version: 1,
				app_permissions: '0',
				locale: 'en-US',
				guild_locale: 'en-US',
				entitlements: []
			})

			const interaction = await eventPromise

			expect(interaction.users.size).toBe(1)
			expect(interaction.users.first()?.username).toBe('SelectedUser')
		})

		it('should have resolved members in UserSelectMenu', async () => {
			const memberId = generateSnowflake()
			const interactorId = generateSnowflake()

			// Send a message first
			const message = await channel.send('Select a member')

			const eventPromise = waitForEvent<UserSelectMenuInteraction>(
				client!,
				Events.InteractionCreate,
				5000,
				(i) => (i as Interaction).isUserSelectMenu()
			)

			await dispatchEvent(session.id, 'INTERACTION_CREATE', {
				id: generateSnowflake(),
				application_id: client!.user!.id,
				type: InteractionType.MessageComponent,
				guild_id: guildId,
				channel_id: channel.id,
				channel: {
					id: channel.id,
					type: ChannelType.GuildText
				},
				message: {
					id: message.id,
					channel_id: channel.id,
					guild_id: guildId,
					content: 'Select a member',
					author: { id: client!.user!.id, username: client!.user!.username, discriminator: '0', avatar: null },
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
				},
				member: {
					user: { id: interactorId, username: 'Selector', discriminator: '0', avatar: null },
					roles: [],
					joined_at: new Date().toISOString(),
					deaf: false,
					mute: false
				},
				user: { id: interactorId, username: 'Selector', discriminator: '0', avatar: null },
				data: {
					custom_id: 'user_member_select',
					component_type: ComponentType.UserSelect,
					values: [memberId],
					resolved: {
						users: {
							[memberId]: {
								id: memberId,
								username: 'SelectedMember',
								discriminator: '0',
								avatar: null
							}
						},
						members: {
							[memberId]: {
								nick: 'Nickname',
								roles: [],
								joined_at: new Date().toISOString(),
								deaf: false,
								mute: false
							}
						}
					}
				},
				token: `user-member-select-${Date.now()}`,
				version: 1,
				app_permissions: '0',
				locale: 'en-US',
				guild_locale: 'en-US',
				entitlements: []
			})

			const interaction = await eventPromise

			expect(interaction.members.size).toBe(1)
			expect((interaction.members.first() as GuildMember)?.nickname).toBe('Nickname')
		})
	})

	describe('RoleSelectMenu resolved', () => {
		it('should have resolved roles in RoleSelectMenu', async () => {
			// Create a role first
			const role = await guild.roles.create({ name: 'SelectedRole', color: 0xff0000 })
			const interactorId = generateSnowflake()

			// Send a message first
			const message = await channel.send('Select a role')

			const eventPromise = waitForEvent<RoleSelectMenuInteraction>(
				client!,
				Events.InteractionCreate,
				5000,
				(i) => (i as Interaction).isRoleSelectMenu()
			)

			await dispatchEvent(session.id, 'INTERACTION_CREATE', {
				id: generateSnowflake(),
				application_id: client!.user!.id,
				type: InteractionType.MessageComponent,
				guild_id: guildId,
				channel_id: channel.id,
				channel: {
					id: channel.id,
					type: ChannelType.GuildText
				},
				message: {
					id: message.id,
					channel_id: channel.id,
					guild_id: guildId,
					content: 'Select a role',
					author: { id: client!.user!.id, username: client!.user!.username, discriminator: '0', avatar: null },
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
				},
				member: {
					user: { id: interactorId, username: 'Selector', discriminator: '0', avatar: null },
					roles: [],
					joined_at: new Date().toISOString(),
					deaf: false,
					mute: false
				},
				user: { id: interactorId, username: 'Selector', discriminator: '0', avatar: null },
				data: {
					custom_id: 'role_select',
					component_type: ComponentType.RoleSelect,
					values: [role.id],
					resolved: {
						roles: {
							[role.id]: {
								id: role.id,
								name: 'SelectedRole',
								color: 0xff0000,
								position: 1,
								permissions: '0',
								managed: false,
								mentionable: false,
								hoist: false
							}
						}
					}
				},
				token: `role-select-${Date.now()}`,
				version: 1,
				app_permissions: '0',
				locale: 'en-US',
				guild_locale: 'en-US',
				entitlements: []
			})

			const interaction = await eventPromise

			expect(interaction.roles.size).toBe(1)
			expect(interaction.roles.first()?.name).toBe('SelectedRole')

			// Cleanup
			await role.delete()
		})
	})

	describe('ChannelSelectMenu resolved', () => {
		it('should have resolved channels in ChannelSelectMenu', async () => {
			const interactorId = generateSnowflake()

			// Send a message first
			const message = await channel.send('Select a channel')

			const eventPromise = waitForEvent<ChannelSelectMenuInteraction>(
				client!,
				Events.InteractionCreate,
				5000,
				(i) => (i as Interaction).isChannelSelectMenu()
			)

			await dispatchEvent(session.id, 'INTERACTION_CREATE', {
				id: generateSnowflake(),
				application_id: client!.user!.id,
				type: InteractionType.MessageComponent,
				guild_id: guildId,
				channel_id: channel.id,
				channel: {
					id: channel.id,
					type: ChannelType.GuildText
				},
				message: {
					id: message.id,
					channel_id: channel.id,
					guild_id: guildId,
					content: 'Select a channel',
					author: { id: client!.user!.id, username: client!.user!.username, discriminator: '0', avatar: null },
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
				},
				member: {
					user: { id: interactorId, username: 'Selector', discriminator: '0', avatar: null },
					roles: [],
					joined_at: new Date().toISOString(),
					deaf: false,
					mute: false
				},
				user: { id: interactorId, username: 'Selector', discriminator: '0', avatar: null },
				data: {
					custom_id: 'channel_select',
					component_type: ComponentType.ChannelSelect,
					values: [channel.id],
					resolved: {
						channels: {
							[channel.id]: {
								id: channel.id,
								name: channel.name,
								type: ChannelType.GuildText,
								permissions: '0'
							}
						}
					}
				},
				token: `channel-select-${Date.now()}`,
				version: 1,
				app_permissions: '0',
				locale: 'en-US',
				guild_locale: 'en-US',
				entitlements: []
			})

			const interaction = await eventPromise

			expect(interaction.channels.size).toBe(1)
			expect(interaction.channels.first()?.id).toBe(channel.id)
		})
	})

	describe('MentionableSelectMenu resolved', () => {
		it('should have resolved in MentionableSelectMenu', async () => {
			// Create a role for the test
			const role = await guild.roles.create({ name: 'MentionRole' })
			const userId = generateSnowflake()
			const interactorId = generateSnowflake()

			// Send a message first
			const message = await channel.send('Select mentionables')

			const eventPromise = waitForEvent<MentionableSelectMenuInteraction>(
				client!,
				Events.InteractionCreate,
				5000,
				(i) => (i as Interaction).isMentionableSelectMenu()
			)

			await dispatchEvent(session.id, 'INTERACTION_CREATE', {
				id: generateSnowflake(),
				application_id: client!.user!.id,
				type: InteractionType.MessageComponent,
				guild_id: guildId,
				channel_id: channel.id,
				channel: {
					id: channel.id,
					type: ChannelType.GuildText
				},
				message: {
					id: message.id,
					channel_id: channel.id,
					guild_id: guildId,
					content: 'Select mentionables',
					author: { id: client!.user!.id, username: client!.user!.username, discriminator: '0', avatar: null },
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
				},
				member: {
					user: { id: interactorId, username: 'Selector', discriminator: '0', avatar: null },
					roles: [],
					joined_at: new Date().toISOString(),
					deaf: false,
					mute: false
				},
				user: { id: interactorId, username: 'Selector', discriminator: '0', avatar: null },
				data: {
					custom_id: 'mentionable_select',
					component_type: ComponentType.MentionableSelect,
					values: [role.id, userId],
					resolved: {
						users: {
							[userId]: {
								id: userId,
								username: 'MentionUser',
								discriminator: '0',
								avatar: null
							}
						},
						roles: {
							[role.id]: {
								id: role.id,
								name: 'MentionRole',
								color: 0,
								position: 1,
								permissions: '0',
								managed: false,
								mentionable: false,
								hoist: false
							}
						}
					}
				},
				token: `mentionable-select-${Date.now()}`,
				version: 1,
				app_permissions: '0',
				locale: 'en-US',
				guild_locale: 'en-US',
				entitlements: []
			})

			const interaction = await eventPromise

			expect(interaction.users.size).toBe(1)
			expect(interaction.roles.size).toBe(1)

			// Cleanup
			await role.delete()
		})
	})

	describe('multiple values selected', () => {
		it('should handle multiple users selected', async () => {
			const userId1 = generateSnowflake()
			const userId2 = generateSnowflake()
			const interactorId = generateSnowflake()

			// Send a message first
			const message = await channel.send('Select multiple users')

			const eventPromise = waitForEvent<UserSelectMenuInteraction>(
				client!,
				Events.InteractionCreate,
				5000,
				(i) => (i as Interaction).isUserSelectMenu()
			)

			await dispatchEvent(session.id, 'INTERACTION_CREATE', {
				id: generateSnowflake(),
				application_id: client!.user!.id,
				type: InteractionType.MessageComponent,
				guild_id: guildId,
				channel_id: channel.id,
				channel: {
					id: channel.id,
					type: ChannelType.GuildText
				},
				message: {
					id: message.id,
					channel_id: channel.id,
					guild_id: guildId,
					content: 'Select multiple users',
					author: { id: client!.user!.id, username: client!.user!.username, discriminator: '0', avatar: null },
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
				},
				member: {
					user: { id: interactorId, username: 'Selector', discriminator: '0', avatar: null },
					roles: [],
					joined_at: new Date().toISOString(),
					deaf: false,
					mute: false
				},
				user: { id: interactorId, username: 'Selector', discriminator: '0', avatar: null },
				data: {
					custom_id: 'multi_user_select',
					component_type: ComponentType.UserSelect,
					values: [userId1, userId2],
					resolved: {
						users: {
							[userId1]: {
								id: userId1,
								username: 'User1',
								discriminator: '0',
								avatar: null
							},
							[userId2]: {
								id: userId2,
								username: 'User2',
								discriminator: '0',
								avatar: null
							}
						}
					}
				},
				token: `multi-user-select-${Date.now()}`,
				version: 1,
				app_permissions: '0',
				locale: 'en-US',
				guild_locale: 'en-US',
				entitlements: []
			})

			const interaction = await eventPromise

			expect(interaction.users.size).toBe(2)
			expect(interaction.values.length).toBe(2)
		})
	})
})
