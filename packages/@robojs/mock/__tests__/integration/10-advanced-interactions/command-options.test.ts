/**
 * Slash Command Options Access Tests
 *
 * Tests for CommandInteractionOptionResolver methods like getString(),
 * getInteger(), getUser(), getMember(), etc.
 */
import {
	ApplicationCommandOptionType,
	ApplicationCommandType,
	AutocompleteInteraction,
	ChannelType,
	ChatInputCommandInteraction,
	Client,
	Events,
	GatewayIntentBits,
	GuildMember,
	Interaction,
	InteractionType,
	TextChannel
} from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForReady } from '../utils/helpers.js'

/**
 * Wait for an interaction event with a filter predicate
 */
function waitForInteraction<T extends Interaction = Interaction>(
	client: Client,
	predicate: (interaction: Interaction) => boolean,
	timeout = 5000
): Promise<T> {
	return new Promise((resolve, reject) => {
		const timeoutId = setTimeout(() => {
			client.off(Events.InteractionCreate, handler)
			reject(new Error(`Timeout waiting for interaction after ${timeout}ms`))
		}, timeout)

		const handler = (interaction: Interaction) => {
			if (predicate(interaction)) {
				clearTimeout(timeoutId)
				client.off(Events.InteractionCreate, handler)
				resolve(interaction as T)
			}
		}

		client.on(Events.InteractionCreate, handler)
	})
}

describe('Slash Command Options Access', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel
	let guildId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'command-options-tests',
			config: {
				guilds: [
					{
						name: 'Command Options Test Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages])
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

	describe('CommandInteractionOptionResolver', () => {
		it('should get string option', async () => {
			const interactionId = generateSnowflake()

			const eventPromise = waitForInteraction<ChatInputCommandInteraction>(
				client!,
				(i) => i.isChatInputCommand() && i.id === interactionId
			)

			await dispatchEvent(session.id, 'INTERACTION_CREATE', {
				id: interactionId,
				application_id: client!.user!.id,
				type: InteractionType.ApplicationCommand,
				guild_id: guildId,
				channel_id: channel.id,
				channel: {
					id: channel.id,
					type: ChannelType.GuildText,
					name: channel.name,
					guild_id: guildId
				},
				member: {
					user: { id: generateSnowflake(), username: 'TestUser', discriminator: '0', avatar: null },
					roles: [],
					joined_at: new Date().toISOString(),
					deaf: false,
					mute: false
				},
				data: {
					id: generateSnowflake(),
					name: 'test',
					type: ApplicationCommandType.ChatInput,
					options: [{ name: 'text', type: ApplicationCommandOptionType.String, value: 'hello world' }]
				},
				token: `token-${Date.now()}`,
				version: 1
			})

			const interaction = await eventPromise

			expect(interaction.options.getString('text')).toBe('hello world')
			expect(interaction.options.getString('text', true)).toBe('hello world')
			expect(interaction.options.getString('nonexistent')).toBeNull()
		})

		it('should get integer option', async () => {
			const interactionId = generateSnowflake()

			const eventPromise = waitForInteraction<ChatInputCommandInteraction>(
				client!,
				(i) => i.isChatInputCommand() && i.id === interactionId
			)

			await dispatchEvent(session.id, 'INTERACTION_CREATE', {
				id: interactionId,
				application_id: client!.user!.id,
				type: InteractionType.ApplicationCommand,
				guild_id: guildId,
				channel_id: channel.id,
				channel: {
					id: channel.id,
					type: ChannelType.GuildText,
					name: channel.name,
					guild_id: guildId
				},
				member: {
					user: { id: generateSnowflake(), username: 'TestUser', discriminator: '0', avatar: null },
					roles: [],
					joined_at: new Date().toISOString(),
					deaf: false,
					mute: false
				},
				data: {
					id: generateSnowflake(),
					name: 'test',
					type: ApplicationCommandType.ChatInput,
					options: [{ name: 'count', type: ApplicationCommandOptionType.Integer, value: 42 }]
				},
				token: `token-${Date.now()}`,
				version: 1
			})

			const interaction = await eventPromise

			expect(interaction.options.getInteger('count')).toBe(42)
		})

		it('should get number option', async () => {
			const interactionId = generateSnowflake()

			const eventPromise = waitForInteraction<ChatInputCommandInteraction>(
				client!,
				(i) => i.isChatInputCommand() && i.id === interactionId
			)

			await dispatchEvent(session.id, 'INTERACTION_CREATE', {
				id: interactionId,
				application_id: client!.user!.id,
				type: InteractionType.ApplicationCommand,
				guild_id: guildId,
				channel_id: channel.id,
				channel: {
					id: channel.id,
					type: ChannelType.GuildText,
					name: channel.name,
					guild_id: guildId
				},
				member: {
					user: { id: generateSnowflake(), username: 'TestUser', discriminator: '0', avatar: null },
					roles: [],
					joined_at: new Date().toISOString(),
					deaf: false,
					mute: false
				},
				data: {
					id: generateSnowflake(),
					name: 'test',
					type: ApplicationCommandType.ChatInput,
					options: [{ name: 'amount', type: ApplicationCommandOptionType.Number, value: 3.14 }]
				},
				token: `token-${Date.now()}`,
				version: 1
			})

			const interaction = await eventPromise

			expect(interaction.options.getNumber('amount')).toBeCloseTo(3.14)
		})

		it('should get boolean option', async () => {
			const interactionId = generateSnowflake()

			const eventPromise = waitForInteraction<ChatInputCommandInteraction>(
				client!,
				(i) => i.isChatInputCommand() && i.id === interactionId
			)

			await dispatchEvent(session.id, 'INTERACTION_CREATE', {
				id: interactionId,
				application_id: client!.user!.id,
				type: InteractionType.ApplicationCommand,
				guild_id: guildId,
				channel_id: channel.id,
				channel: {
					id: channel.id,
					type: ChannelType.GuildText,
					name: channel.name,
					guild_id: guildId
				},
				member: {
					user: { id: generateSnowflake(), username: 'TestUser', discriminator: '0', avatar: null },
					roles: [],
					joined_at: new Date().toISOString(),
					deaf: false,
					mute: false
				},
				data: {
					id: generateSnowflake(),
					name: 'test',
					type: ApplicationCommandType.ChatInput,
					options: [{ name: 'enabled', type: ApplicationCommandOptionType.Boolean, value: true }]
				},
				token: `token-${Date.now()}`,
				version: 1
			})

			const interaction = await eventPromise

			expect(interaction.options.getBoolean('enabled')).toBe(true)
		})

		it('should get user option with resolved data', async () => {
			const interactionId = generateSnowflake()
			const targetUserId = '555555555555555555'

			const eventPromise = waitForInteraction<ChatInputCommandInteraction>(
				client!,
				(i) => i.isChatInputCommand() && i.id === interactionId
			)

			await dispatchEvent(session.id, 'INTERACTION_CREATE', {
				id: interactionId,
				application_id: client!.user!.id,
				type: InteractionType.ApplicationCommand,
				guild_id: guildId,
				channel_id: channel.id,
				channel: {
					id: channel.id,
					type: ChannelType.GuildText,
					name: channel.name,
					guild_id: guildId
				},
				member: {
					user: { id: generateSnowflake(), username: 'TestUser', discriminator: '0', avatar: null },
					roles: [],
					joined_at: new Date().toISOString(),
					deaf: false,
					mute: false
				},
				data: {
					id: generateSnowflake(),
					name: 'test',
					type: ApplicationCommandType.ChatInput,
					options: [{ name: 'target', type: ApplicationCommandOptionType.User, value: targetUserId }],
					resolved: {
						users: {
							[targetUserId]: { id: targetUserId, username: 'TargetUser', discriminator: '0', avatar: null }
						},
						members: {
							[targetUserId]: { nick: 'Target Nick', roles: [], joined_at: new Date().toISOString() }
						}
					}
				},
				token: `token-${Date.now()}`,
				version: 1
			})

			const interaction = await eventPromise

			const user = interaction.options.getUser('target')
			expect(user?.id).toBe(targetUserId)
			expect(user?.username).toBe('TargetUser')
		})

		it('should get member option', async () => {
			const interactionId = generateSnowflake()
			const targetUserId = '666666666666666666'

			const eventPromise = waitForInteraction<ChatInputCommandInteraction>(
				client!,
				(i) => i.isChatInputCommand() && i.id === interactionId
			)

			await dispatchEvent(session.id, 'INTERACTION_CREATE', {
				id: interactionId,
				application_id: client!.user!.id,
				type: InteractionType.ApplicationCommand,
				guild_id: guildId,
				channel_id: channel.id,
				channel: {
					id: channel.id,
					type: ChannelType.GuildText,
					name: channel.name,
					guild_id: guildId
				},
				member: {
					user: { id: generateSnowflake(), username: 'TestUser', discriminator: '0', avatar: null },
					roles: [],
					joined_at: new Date().toISOString(),
					deaf: false,
					mute: false
				},
				data: {
					id: generateSnowflake(),
					name: 'test',
					type: ApplicationCommandType.ChatInput,
					options: [{ name: 'member', type: ApplicationCommandOptionType.User, value: targetUserId }],
					resolved: {
						users: {
							[targetUserId]: { id: targetUserId, username: 'MemberUser', discriminator: '0', avatar: null }
						},
						members: {
							[targetUserId]: { nick: 'Member Nick', roles: [], joined_at: new Date().toISOString() }
						}
					}
				},
				token: `token-${Date.now()}`,
				version: 1
			})

			const interaction = await eventPromise

			const member = interaction.options.getMember('member') as GuildMember | null
			expect(member).toBeDefined()
			expect(member?.nickname).toBe('Member Nick')
		})

		it('should get channel option', async () => {
			const interactionId = generateSnowflake()

			const eventPromise = waitForInteraction<ChatInputCommandInteraction>(
				client!,
				(i) => i.isChatInputCommand() && i.id === interactionId
			)

			await dispatchEvent(session.id, 'INTERACTION_CREATE', {
				id: interactionId,
				application_id: client!.user!.id,
				type: InteractionType.ApplicationCommand,
				guild_id: guildId,
				channel_id: channel.id,
				channel: {
					id: channel.id,
					type: ChannelType.GuildText,
					name: channel.name,
					guild_id: guildId
				},
				member: {
					user: { id: generateSnowflake(), username: 'TestUser', discriminator: '0', avatar: null },
					roles: [],
					joined_at: new Date().toISOString(),
					deaf: false,
					mute: false
				},
				data: {
					id: generateSnowflake(),
					name: 'test',
					type: ApplicationCommandType.ChatInput,
					options: [{ name: 'channel', type: ApplicationCommandOptionType.Channel, value: channel.id }],
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
				token: `token-${Date.now()}`,
				version: 1
			})

			const interaction = await eventPromise

			const ch = interaction.options.getChannel('channel')
			expect(ch?.id).toBe(channel.id)
		})

		it('should get role option', async () => {
			const interactionId = generateSnowflake()
			const roleId = '777777777777777777'

			const eventPromise = waitForInteraction<ChatInputCommandInteraction>(
				client!,
				(i) => i.isChatInputCommand() && i.id === interactionId
			)

			await dispatchEvent(session.id, 'INTERACTION_CREATE', {
				id: interactionId,
				application_id: client!.user!.id,
				type: InteractionType.ApplicationCommand,
				guild_id: guildId,
				channel_id: channel.id,
				channel: {
					id: channel.id,
					type: ChannelType.GuildText,
					name: channel.name,
					guild_id: guildId
				},
				member: {
					user: { id: generateSnowflake(), username: 'TestUser', discriminator: '0', avatar: null },
					roles: [],
					joined_at: new Date().toISOString(),
					deaf: false,
					mute: false
				},
				data: {
					id: generateSnowflake(),
					name: 'test',
					type: ApplicationCommandType.ChatInput,
					options: [{ name: 'role', type: ApplicationCommandOptionType.Role, value: roleId }],
					resolved: {
						roles: {
							[roleId]: {
								id: roleId,
								name: 'Option Role',
								color: 0,
								position: 1,
								permissions: '0',
								hoist: false,
								managed: false,
								mentionable: false
							}
						}
					}
				},
				token: `token-${Date.now()}`,
				version: 1
			})

			const interaction = await eventPromise

			const r = interaction.options.getRole('role')
			expect(r?.id).toBe(roleId)
			expect(r?.name).toBe('Option Role')
		})

		it('should get mentionable option', async () => {
			const interactionId = generateSnowflake()
			const targetId = '888888888888888888'

			const eventPromise = waitForInteraction<ChatInputCommandInteraction>(
				client!,
				(i) => i.isChatInputCommand() && i.id === interactionId
			)

			await dispatchEvent(session.id, 'INTERACTION_CREATE', {
				id: interactionId,
				application_id: client!.user!.id,
				type: InteractionType.ApplicationCommand,
				guild_id: guildId,
				channel_id: channel.id,
				channel: {
					id: channel.id,
					type: ChannelType.GuildText,
					name: channel.name,
					guild_id: guildId
				},
				member: {
					user: { id: generateSnowflake(), username: 'TestUser', discriminator: '0', avatar: null },
					roles: [],
					joined_at: new Date().toISOString(),
					deaf: false,
					mute: false
				},
				data: {
					id: generateSnowflake(),
					name: 'test',
					type: ApplicationCommandType.ChatInput,
					options: [{ name: 'target', type: ApplicationCommandOptionType.Mentionable, value: targetId }],
					resolved: {
						users: {
							[targetId]: { id: targetId, username: 'Mentionable', discriminator: '0', avatar: null }
						}
					}
				},
				token: `token-${Date.now()}`,
				version: 1
			})

			const interaction = await eventPromise

			const mentionable = interaction.options.getMentionable('target')
			expect(mentionable).toBeDefined()
		})

		it('should get attachment option', async () => {
			const interactionId = generateSnowflake()
			const attachmentId = generateSnowflake()

			const eventPromise = waitForInteraction<ChatInputCommandInteraction>(
				client!,
				(i) => i.isChatInputCommand() && i.id === interactionId
			)

			await dispatchEvent(session.id, 'INTERACTION_CREATE', {
				id: interactionId,
				application_id: client!.user!.id,
				type: InteractionType.ApplicationCommand,
				guild_id: guildId,
				channel_id: channel.id,
				channel: {
					id: channel.id,
					type: ChannelType.GuildText,
					name: channel.name,
					guild_id: guildId
				},
				member: {
					user: { id: generateSnowflake(), username: 'TestUser', discriminator: '0', avatar: null },
					roles: [],
					joined_at: new Date().toISOString(),
					deaf: false,
					mute: false
				},
				data: {
					id: generateSnowflake(),
					name: 'test',
					type: ApplicationCommandType.ChatInput,
					options: [{ name: 'file', type: ApplicationCommandOptionType.Attachment, value: attachmentId }],
					resolved: {
						attachments: {
							[attachmentId]: {
								id: attachmentId,
								filename: 'test.png',
								size: 1024,
								url: 'https://cdn.discordapp.com/attachments/test.png',
								proxy_url: 'https://media.discordapp.net/attachments/test.png',
								content_type: 'image/png'
							}
						}
					}
				},
				token: `token-${Date.now()}`,
				version: 1
			})

			const interaction = await eventPromise

			const attachment = interaction.options.getAttachment('file')
			expect(attachment?.id).toBe(attachmentId)
			expect(attachment?.name).toBe('test.png')
			expect(attachment?.contentType).toBe('image/png')
		})

		it('should get subcommand', async () => {
			const interactionId = generateSnowflake()

			const eventPromise = waitForInteraction<ChatInputCommandInteraction>(
				client!,
				(i) => i.isChatInputCommand() && i.id === interactionId
			)

			await dispatchEvent(session.id, 'INTERACTION_CREATE', {
				id: interactionId,
				application_id: client!.user!.id,
				type: InteractionType.ApplicationCommand,
				guild_id: guildId,
				channel_id: channel.id,
				channel: {
					id: channel.id,
					type: ChannelType.GuildText,
					name: channel.name,
					guild_id: guildId
				},
				member: {
					user: { id: generateSnowflake(), username: 'TestUser', discriminator: '0', avatar: null },
					roles: [],
					joined_at: new Date().toISOString(),
					deaf: false,
					mute: false
				},
				data: {
					id: generateSnowflake(),
					name: 'settings',
					type: ApplicationCommandType.ChatInput,
					options: [
						{
							name: 'view',
							type: ApplicationCommandOptionType.Subcommand,
							options: []
						}
					]
				},
				token: `token-${Date.now()}`,
				version: 1
			})

			const interaction = await eventPromise

			expect(interaction.options.getSubcommand()).toBe('view')
		})

		it('should get subcommand group', async () => {
			const interactionId = generateSnowflake()

			const eventPromise = waitForInteraction<ChatInputCommandInteraction>(
				client!,
				(i) => i.isChatInputCommand() && i.id === interactionId
			)

			await dispatchEvent(session.id, 'INTERACTION_CREATE', {
				id: interactionId,
				application_id: client!.user!.id,
				type: InteractionType.ApplicationCommand,
				guild_id: guildId,
				channel_id: channel.id,
				channel: {
					id: channel.id,
					type: ChannelType.GuildText,
					name: channel.name,
					guild_id: guildId
				},
				member: {
					user: { id: generateSnowflake(), username: 'TestUser', discriminator: '0', avatar: null },
					roles: [],
					joined_at: new Date().toISOString(),
					deaf: false,
					mute: false
				},
				data: {
					id: generateSnowflake(),
					name: 'config',
					type: ApplicationCommandType.ChatInput,
					options: [
						{
							name: 'server',
							type: ApplicationCommandOptionType.SubcommandGroup,
							options: [
								{
									name: 'reset',
									type: ApplicationCommandOptionType.Subcommand,
									options: []
								}
							]
						}
					]
				},
				token: `token-${Date.now()}`,
				version: 1
			})

			const interaction = await eventPromise

			expect(interaction.options.getSubcommandGroup()).toBe('server')
			expect(interaction.options.getSubcommand()).toBe('reset')
		})

		it('should get focused option in autocomplete', async () => {
			const interactionId = generateSnowflake()

			const eventPromise = waitForInteraction<AutocompleteInteraction>(
				client!,
				(i) => i.isAutocomplete() && i.id === interactionId
			)

			await dispatchEvent(session.id, 'INTERACTION_CREATE', {
				id: interactionId,
				application_id: client!.user!.id,
				type: InteractionType.ApplicationCommandAutocomplete,
				guild_id: guildId,
				channel_id: channel.id,
				channel: {
					id: channel.id,
					type: ChannelType.GuildText,
					name: channel.name,
					guild_id: guildId
				},
				member: {
					user: { id: generateSnowflake(), username: 'TestUser', discriminator: '0', avatar: null },
					roles: [],
					joined_at: new Date().toISOString(),
					deaf: false,
					mute: false
				},
				data: {
					id: generateSnowflake(),
					name: 'search',
					type: ApplicationCommandType.ChatInput,
					options: [
						{
							name: 'query',
							type: ApplicationCommandOptionType.String,
							value: 'test',
							focused: true
						}
					]
				},
				token: `token-${Date.now()}`,
				version: 1
			})

			const interaction = await eventPromise

			expect(interaction.isAutocomplete()).toBe(true)
			const focused = interaction.options.getFocused(true)
			expect(focused.name).toBe('query')
			expect(focused.value).toBe('test')
		})
	})
})
