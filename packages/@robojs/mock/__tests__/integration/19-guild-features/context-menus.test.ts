/**
 * Context Menu Interactions Tests
 *
 * Tests for user and message context menu command interactions,
 * including targetUser, targetMember, targetMessage, and targetId properties.
 */
import {
	ApplicationCommandType,
	ChannelType,
	Client,
	Events,
	GatewayIntentBits,
	Guild,
	GuildMember,
	Interaction,
	InteractionType,
	MessageContextMenuCommandInteraction,
	TextChannel,
	UserContextMenuCommandInteraction
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

describe('Context Menu Interactions', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel
	let guild: Guild

	beforeAll(async () => {
		session = await createSession({
			name: 'context-menus-tests',
			config: {
				guilds: [
					{
						name: 'Context Menu Test Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages])
		await client.login(session.token)
		await waitForReady(client)

		guild = client.guilds.cache.first()!
		channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	it('should have targetUser in user context menu', async () => {
		const interactionId = generateSnowflake()
		const targetUserId = generateSnowflake()

		const eventPromise = waitForInteraction(client!, (i) => i.id === interactionId)

		await dispatchEvent(session.id, 'INTERACTION_CREATE', {
			id: interactionId,
			application_id: client!.user!.id,
			type: InteractionType.ApplicationCommand,
			guild_id: guild.id,
			channel_id: channel.id,
			channel: {
				id: channel.id,
				type: ChannelType.GuildText,
				name: channel.name,
				guild_id: guild.id
			},
			member: {
				user: { id: generateSnowflake(), username: 'User', discriminator: '0', avatar: null },
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			},
			data: {
				id: generateSnowflake(),
				name: 'User Info',
				type: ApplicationCommandType.User,
				target_id: targetUserId,
				resolved: {
					users: {
						[targetUserId]: { id: targetUserId, username: 'TargetUser', discriminator: '0', avatar: null }
					}
				}
			},
			token: `user-ctx-${Date.now()}`,
			version: 1
		})

		const interaction = (await eventPromise) as UserContextMenuCommandInteraction

		expect(interaction.isUserContextMenuCommand()).toBe(true)
		expect(interaction.targetUser.id).toBe(targetUserId)
		expect(interaction.targetUser.username).toBe('TargetUser')
	})

	it('should have targetMember in user context menu (guild)', async () => {
		const interactionId = generateSnowflake()
		const targetMemberId = generateSnowflake()

		const eventPromise = waitForInteraction(client!, (i) => i.id === interactionId)

		await dispatchEvent(session.id, 'INTERACTION_CREATE', {
			id: interactionId,
			application_id: client!.user!.id,
			type: InteractionType.ApplicationCommand,
			guild_id: guild.id,
			channel_id: channel.id,
			channel: {
				id: channel.id,
				type: ChannelType.GuildText,
				name: channel.name,
				guild_id: guild.id
			},
			member: {
				user: { id: generateSnowflake(), username: 'User', discriminator: '0', avatar: null },
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			},
			data: {
				id: generateSnowflake(),
				name: 'Member Info',
				type: ApplicationCommandType.User,
				target_id: targetMemberId,
				resolved: {
					users: {
						[targetMemberId]: { id: targetMemberId, username: 'TargetMember', discriminator: '0', avatar: null }
					},
					members: {
						[targetMemberId]: {
							nick: 'Target Nick',
							roles: [],
							joined_at: new Date().toISOString(),
							deaf: false,
							mute: false
						}
					}
				}
			},
			token: `member-ctx-${Date.now()}`,
			version: 1
		})

		const interaction = (await eventPromise) as UserContextMenuCommandInteraction

		expect(interaction.isUserContextMenuCommand()).toBe(true)
		expect((interaction.targetMember as GuildMember | null)?.nickname).toBe('Target Nick')
	})

	it('should have targetMessage in message context menu', async () => {
		const interactionId = generateSnowflake()
		const targetMessageId = generateSnowflake()

		const eventPromise = waitForInteraction(client!, (i) => i.id === interactionId)

		await dispatchEvent(session.id, 'INTERACTION_CREATE', {
			id: interactionId,
			application_id: client!.user!.id,
			type: InteractionType.ApplicationCommand,
			guild_id: guild.id,
			channel_id: channel.id,
			channel: {
				id: channel.id,
				type: ChannelType.GuildText,
				name: channel.name,
				guild_id: guild.id
			},
			member: {
				user: { id: generateSnowflake(), username: 'User', discriminator: '0', avatar: null },
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			},
			data: {
				id: generateSnowflake(),
				name: 'Quote Message',
				type: ApplicationCommandType.Message,
				target_id: targetMessageId,
				resolved: {
					messages: {
						[targetMessageId]: {
							id: targetMessageId,
							channel_id: channel.id,
							content: 'Target message content',
							author: { id: '456789012345678901', username: 'Author', discriminator: '0', avatar: null },
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
			token: `message-ctx-${Date.now()}`,
			version: 1
		})

		const interaction = (await eventPromise) as MessageContextMenuCommandInteraction

		expect(interaction.isMessageContextMenuCommand()).toBe(true)
		expect(interaction.targetMessage.id).toBe(targetMessageId)
		expect(interaction.targetMessage.content).toBe('Target message content')
	})

	it('should have targetId property', async () => {
		const interactionId = generateSnowflake()
		const targetId = generateSnowflake()

		const eventPromise = waitForInteraction(client!, (i) => i.id === interactionId)

		await dispatchEvent(session.id, 'INTERACTION_CREATE', {
			id: interactionId,
			application_id: client!.user!.id,
			type: InteractionType.ApplicationCommand,
			guild_id: guild.id,
			channel_id: channel.id,
			channel: {
				id: channel.id,
				type: ChannelType.GuildText,
				name: channel.name,
				guild_id: guild.id
			},
			member: {
				user: { id: generateSnowflake(), username: 'User', discriminator: '0', avatar: null },
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			},
			data: {
				id: generateSnowflake(),
				name: 'Target ID Test',
				type: ApplicationCommandType.User,
				target_id: targetId,
				resolved: {
					users: {
						[targetId]: { id: targetId, username: 'Target', discriminator: '0', avatar: null }
					}
				}
			},
			token: `target-id-${Date.now()}`,
			version: 1
		})

		const interaction = (await eventPromise) as UserContextMenuCommandInteraction

		expect(interaction.targetId).toBe(targetId)
	})
})
