/**
 * Interaction Type Guards Tests
 *
 * Tests for Discord.js interaction type guard methods like isChatInputCommand(),
 * isButton(), isSelectMenu(), etc.
 */
import {
	ApplicationCommandType,
	ChannelType,
	Client,
	ComponentType,
	Events,
	GatewayIntentBits,
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
function waitForInteraction(
	client: Client,
	predicate: (interaction: Interaction) => boolean,
	timeout = 5000
): Promise<Interaction> {
	return new Promise((resolve, reject) => {
		const timeoutId = setTimeout(() => {
			client.off(Events.InteractionCreate, handler)
			reject(new Error(`Timeout waiting for interaction after ${timeout}ms`))
		}, timeout)

		const handler = (interaction: Interaction) => {
			if (predicate(interaction)) {
				clearTimeout(timeoutId)
				client.off(Events.InteractionCreate, handler)
				resolve(interaction)
			}
		}

		client.on(Events.InteractionCreate, handler)
	})
}

describe('Interaction Type Guards', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel
	let guildId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'interaction-type-guards-tests',
			config: {
				guilds: [
					{
						name: 'Type Guards Test Guild',
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

	it('should identify ChatInputCommand', async () => {
		const interactionId = generateSnowflake()

		const eventPromise = waitForInteraction(client!, (i) => i.id === interactionId)

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
				type: ApplicationCommandType.ChatInput
			},
			token: `token-${Date.now()}`,
			version: 1
		})

		const interaction = await eventPromise

		expect(interaction.isChatInputCommand()).toBe(true)
		expect(interaction.isCommand()).toBe(true)
		expect(interaction.isButton()).toBe(false)
		expect(interaction.isSelectMenu()).toBe(false)
		expect(interaction.isModalSubmit()).toBe(false)
		expect(interaction.isAutocomplete()).toBe(false)
	})

	it('should identify Button', async () => {
		const interactionId = generateSnowflake()

		const eventPromise = waitForInteraction(client!, (i) => i.id === interactionId)

		await dispatchEvent(session.id, 'INTERACTION_CREATE', {
			id: interactionId,
			application_id: client!.user!.id,
			type: InteractionType.MessageComponent,
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
				custom_id: 'test_btn',
				component_type: ComponentType.Button
			},
			message: {
				id: generateSnowflake(),
				channel_id: channel.id,
				content: 'Button message',
				author: { id: client!.user!.id, username: 'Bot', discriminator: '0', avatar: null },
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
			token: `token-${Date.now()}`,
			version: 1
		})

		const interaction = await eventPromise

		expect(interaction.isButton()).toBe(true)
		expect(interaction.isMessageComponent()).toBe(true)
		expect(interaction.isChatInputCommand()).toBe(false)
		expect(interaction.isSelectMenu()).toBe(false)
	})

	it('should identify StringSelectMenu', async () => {
		const interactionId = generateSnowflake()

		const eventPromise = waitForInteraction(client!, (i) => i.id === interactionId)

		await dispatchEvent(session.id, 'INTERACTION_CREATE', {
			id: interactionId,
			application_id: client!.user!.id,
			type: InteractionType.MessageComponent,
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
				custom_id: 'string_select',
				component_type: ComponentType.StringSelect,
				values: ['option1']
			},
			message: {
				id: generateSnowflake(),
				channel_id: channel.id,
				content: 'Select message',
				author: { id: client!.user!.id, username: 'Bot', discriminator: '0', avatar: null },
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
			token: `token-${Date.now()}`,
			version: 1
		})

		const interaction = await eventPromise

		expect(interaction.isStringSelectMenu()).toBe(true)
		expect(interaction.isSelectMenu()).toBe(true)
		expect(interaction.isAnySelectMenu()).toBe(true)
		expect(interaction.isButton()).toBe(false)
	})

	it('should identify UserSelectMenu', async () => {
		const interactionId = generateSnowflake()
		const userId = '111111111111111111'

		const eventPromise = waitForInteraction(client!, (i) => i.id === interactionId)

		await dispatchEvent(session.id, 'INTERACTION_CREATE', {
			id: interactionId,
			application_id: client!.user!.id,
			type: InteractionType.MessageComponent,
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
				custom_id: 'user_select',
				component_type: ComponentType.UserSelect,
				values: [userId],
				resolved: {
					users: { [userId]: { id: userId, username: 'User', discriminator: '0', avatar: null } }
				}
			},
			message: {
				id: generateSnowflake(),
				channel_id: channel.id,
				content: 'User select',
				author: { id: client!.user!.id, username: 'Bot', discriminator: '0', avatar: null },
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
			token: `token-${Date.now()}`,
			version: 1
		})

		const interaction = await eventPromise

		expect(interaction.isUserSelectMenu()).toBe(true)
		expect(interaction.isAnySelectMenu()).toBe(true)
	})

	it('should identify RoleSelectMenu', async () => {
		const interactionId = generateSnowflake()
		const roleId = '222222222222222222'

		const eventPromise = waitForInteraction(client!, (i) => i.id === interactionId)

		await dispatchEvent(session.id, 'INTERACTION_CREATE', {
			id: interactionId,
			application_id: client!.user!.id,
			type: InteractionType.MessageComponent,
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
				custom_id: 'role_select',
				component_type: ComponentType.RoleSelect,
				values: [roleId],
				resolved: {
					roles: {
						[roleId]: {
							id: roleId,
							name: 'Role',
							color: 0,
							position: 0,
							permissions: '0',
							hoist: false,
							managed: false,
							mentionable: false
						}
					}
				}
			},
			message: {
				id: generateSnowflake(),
				channel_id: channel.id,
				content: 'Role select',
				author: { id: client!.user!.id, username: 'Bot', discriminator: '0', avatar: null },
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
			token: `token-${Date.now()}`,
			version: 1
		})

		const interaction = await eventPromise

		expect(interaction.isRoleSelectMenu()).toBe(true)
	})

	it('should identify ChannelSelectMenu', async () => {
		const interactionId = generateSnowflake()

		const eventPromise = waitForInteraction(client!, (i) => i.id === interactionId)

		await dispatchEvent(session.id, 'INTERACTION_CREATE', {
			id: interactionId,
			application_id: client!.user!.id,
			type: InteractionType.MessageComponent,
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
			message: {
				id: generateSnowflake(),
				channel_id: channel.id,
				content: 'Channel select',
				author: { id: client!.user!.id, username: 'Bot', discriminator: '0', avatar: null },
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
			token: `token-${Date.now()}`,
			version: 1
		})

		const interaction = await eventPromise

		expect(interaction.isChannelSelectMenu()).toBe(true)
	})

	it('should identify MentionableSelectMenu', async () => {
		const interactionId = generateSnowflake()
		const userId = '333333333333333333'

		const eventPromise = waitForInteraction(client!, (i) => i.id === interactionId)

		await dispatchEvent(session.id, 'INTERACTION_CREATE', {
			id: interactionId,
			application_id: client!.user!.id,
			type: InteractionType.MessageComponent,
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
				custom_id: 'mentionable_select',
				component_type: ComponentType.MentionableSelect,
				values: [userId],
				resolved: {
					users: { [userId]: { id: userId, username: 'User', discriminator: '0', avatar: null } }
				}
			},
			message: {
				id: generateSnowflake(),
				channel_id: channel.id,
				content: 'Mentionable select',
				author: { id: client!.user!.id, username: 'Bot', discriminator: '0', avatar: null },
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
			token: `token-${Date.now()}`,
			version: 1
		})

		const interaction = await eventPromise

		expect(interaction.isMentionableSelectMenu()).toBe(true)
	})

	it('should identify ModalSubmit', async () => {
		const interactionId = generateSnowflake()

		const eventPromise = waitForInteraction(client!, (i) => i.id === interactionId)

		await dispatchEvent(session.id, 'INTERACTION_CREATE', {
			id: interactionId,
			application_id: client!.user!.id,
			type: InteractionType.ModalSubmit,
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
				custom_id: 'test_modal',
				components: []
			},
			token: `token-${Date.now()}`,
			version: 1
		})

		const interaction = await eventPromise

		expect(interaction.isModalSubmit()).toBe(true)
		expect(interaction.isButton()).toBe(false)
	})

	it('should identify Autocomplete', async () => {
		const interactionId = generateSnowflake()

		const eventPromise = waitForInteraction(client!, (i) => i.id === interactionId)

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
				options: [{ name: 'query', type: 3, value: 'test', focused: true }]
			},
			token: `token-${Date.now()}`,
			version: 1
		})

		const interaction = await eventPromise

		expect(interaction.isAutocomplete()).toBe(true)
		expect(interaction.isCommand()).toBe(false)
	})

	it('should identify UserContextMenuCommand', async () => {
		const interactionId = generateSnowflake()
		const targetUserId = '444444444444444444'

		const eventPromise = waitForInteraction(client!, (i) => i.id === interactionId)

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
				name: 'Get User Info',
				type: ApplicationCommandType.User,
				target_id: targetUserId,
				resolved: {
					users: { [targetUserId]: { id: targetUserId, username: 'Target', discriminator: '0', avatar: null } }
				}
			},
			token: `token-${Date.now()}`,
			version: 1
		})

		const interaction = await eventPromise

		expect(interaction.isUserContextMenuCommand()).toBe(true)
		expect(interaction.isContextMenuCommand()).toBe(true)
		expect(interaction.isChatInputCommand()).toBe(false)
	})

	it('should identify MessageContextMenuCommand', async () => {
		const interactionId = generateSnowflake()
		const targetMessageId = '555555555555555555'

		const eventPromise = waitForInteraction(client!, (i) => i.id === interactionId)

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
				name: 'Report Message',
				type: ApplicationCommandType.Message,
				target_id: targetMessageId,
				resolved: {
					messages: {
						[targetMessageId]: {
							id: targetMessageId,
							channel_id: channel.id,
							content: 'Test',
							author: { id: '666666666666666666', username: 'Author', discriminator: '0', avatar: null },
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
						}
					}
				}
			},
			token: `token-${Date.now()}`,
			version: 1
		})

		const interaction = await eventPromise

		expect(interaction.isMessageContextMenuCommand()).toBe(true)
		expect(interaction.isContextMenuCommand()).toBe(true)
	})

	it('should identify repliable interactions', async () => {
		const interactionId = generateSnowflake()

		const eventPromise = waitForInteraction(client!, (i) => i.id === interactionId)

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
				type: ApplicationCommandType.ChatInput
			},
			token: `token-${Date.now()}`,
			version: 1
		})

		const interaction = await eventPromise

		expect(interaction.isRepliable()).toBe(true)
	})
})
