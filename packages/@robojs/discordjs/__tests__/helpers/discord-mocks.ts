/**
 * Discord.js mock utilities for testing @robojs/discordjs
 *
 * Provides mock implementations of Discord.js objects like Client, Interaction, etc.
 */

import { jest } from '@jest/globals'
import { GatewayIntentBits, ChannelType, ApplicationCommandType, InteractionType } from 'discord.js'
import type { Client, ChatInputCommandInteraction, User, Guild, TextChannel, GuildMember } from 'discord.js'

/**
 * Create a mock Discord.js Client
 */
export function createMockClient(options?: {
	intents?: number
	tag?: string
	id?: string
}): jest.Mocked<Client> {
	const intents = options?.intents ?? GatewayIntentBits.Guilds
	const tag = options?.tag ?? 'TestBot#1234'
	const id = options?.id ?? '123456789'

	const mockClient = {
		user: {
			id,
			tag,
			username: tag.split('#')[0],
			discriminator: tag.split('#')[1] ?? '0',
			setActivity: jest.fn()
		},
		options: {
			intents: {
				bitfield: BigInt(intents)
			}
		},
		guilds: {
			cache: new Map()
		},
		channels: {
			cache: new Map()
		},
		login: jest.fn<() => Promise<string>>().mockResolvedValue('mock-token'),
		destroy: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
		once: jest.fn(),
		on: jest.fn(),
		off: jest.fn(),
		emit: jest.fn(),
		isReady: jest.fn(() => true)
	} as unknown as jest.Mocked<Client>

	return mockClient
}

/**
 * Create a mock User
 */
export function createMockUser(options?: {
	id?: string
	username?: string
	discriminator?: string
	bot?: boolean
}): jest.Mocked<User> {
	return {
		id: options?.id ?? '987654321',
		username: options?.username ?? 'TestUser',
		discriminator: options?.discriminator ?? '0',
		tag: `${options?.username ?? 'TestUser'}#${options?.discriminator ?? '0'}`,
		bot: options?.bot ?? false,
		createdAt: new Date(),
		createdTimestamp: Date.now()
	} as unknown as jest.Mocked<User>
}

/**
 * Create a mock Guild
 */
export function createMockGuild(options?: {
	id?: string
	name?: string
}): jest.Mocked<Guild> {
	return {
		id: options?.id ?? '111222333',
		name: options?.name ?? 'Test Guild',
		members: {
			cache: new Map(),
			fetch: jest.fn()
		},
		channels: {
			cache: new Map()
		},
		roles: {
			cache: new Map()
		}
	} as unknown as jest.Mocked<Guild>
}

/**
 * Create a mock TextChannel
 */
export function createMockTextChannel(options?: {
	id?: string
	name?: string
	guildId?: string
}): jest.Mocked<TextChannel> {
	return {
		id: options?.id ?? '444555666',
		name: options?.name ?? 'test-channel',
		type: ChannelType.GuildText,
		guildId: options?.guildId ?? '111222333',
		send: jest.fn<() => Promise<unknown>>().mockResolvedValue({ id: 'msg-123' }),
		isTextBased: () => true
	} as unknown as jest.Mocked<TextChannel>
}

/**
 * Create a mock GuildMember
 */
export function createMockGuildMember(options?: {
	id?: string
	nickname?: string
	user?: jest.Mocked<User>
}): jest.Mocked<GuildMember> {
	const user = options?.user ?? createMockUser({ id: options?.id })
	return {
		id: options?.id ?? user.id,
		nickname: options?.nickname ?? null,
		user,
		displayName: options?.nickname ?? user.username,
		permissions: {
			has: jest.fn(() => true),
			bitfield: BigInt(0)
		}
	} as unknown as jest.Mocked<GuildMember>
}

/**
 * Options for creating a mock ChatInputCommandInteraction
 */
export interface MockInteractionOptions {
	commandName?: string
	commandId?: string
	userId?: string
	guildId?: string
	channelId?: string
	options?: Array<{
		name: string
		type: number
		value: unknown
	}>
	deferred?: boolean
	replied?: boolean
}

/**
 * Create a mock ChatInputCommandInteraction
 */
export function createMockInteraction(
	options?: MockInteractionOptions
): jest.Mocked<ChatInputCommandInteraction> {
	const commandName = options?.commandName ?? 'test-command'
	const user = createMockUser({ id: options?.userId })
	const guild = createMockGuild({ id: options?.guildId })
	const channel = createMockTextChannel({ id: options?.channelId, guildId: guild.id })
	const member = createMockGuildMember({ user })

	let deferred = options?.deferred ?? false
	let replied = options?.replied ?? false

	const mockInteraction = {
		id: `interaction-${Date.now()}`,
		type: InteractionType.ApplicationCommand,
		commandName,
		commandId: options?.commandId ?? 'cmd-123',
		commandType: ApplicationCommandType.ChatInput,
		user,
		member,
		guild,
		guildId: guild.id,
		channel,
		channelId: channel.id,
		client: createMockClient(),
		createdAt: new Date(),
		createdTimestamp: Date.now(),
		options: {
			get: jest.fn((name: string) => {
				const opt = options?.options?.find((o) => o.name === name)
				return opt ? { name: opt.name, type: opt.type, value: opt.value } : null
			}),
			getString: jest.fn((name: string) => {
				const opt = options?.options?.find((o) => o.name === name)
				return opt?.value as string | null
			}),
			getInteger: jest.fn((name: string) => {
				const opt = options?.options?.find((o) => o.name === name)
				return opt?.value as number | null
			}),
			getBoolean: jest.fn((name: string) => {
				const opt = options?.options?.find((o) => o.name === name)
				return opt?.value as boolean | null
			}),
			getUser: jest.fn(() => null),
			getMember: jest.fn(() => null),
			getChannel: jest.fn(() => null),
			getRole: jest.fn(() => null),
			getAttachment: jest.fn(() => null),
			getSubcommand: jest.fn(() => null),
			getSubcommandGroup: jest.fn(() => null),
			data: options?.options ?? []
		},
		get deferred() {
			return deferred
		},
		get replied() {
			return replied
		},
		deferReply: jest.fn<() => Promise<unknown>>().mockImplementation(async () => {
			deferred = true
			return {}
		}),
		reply: jest.fn<() => Promise<unknown>>().mockImplementation(async () => {
			replied = true
			return {}
		}),
		editReply: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
		followUp: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
		deleteReply: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
		fetchReply: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
		isChatInputCommand: () => true,
		isAutocomplete: () => false,
		isContextMenuCommand: () => false,
		isButton: () => false,
		isStringSelectMenu: () => false,
		isModalSubmit: () => false,
		inGuild: () => true,
		inCachedGuild: () => true,
		isRepliable: () => true
	} as unknown as jest.Mocked<ChatInputCommandInteraction>

	return mockInteraction
}

/**
 * Options for creating a mock AutocompleteInteraction
 */
export interface MockAutocompleteOptions {
	commandName?: string
	focusedOption?: {
		name: string
		value: string
	}
}

/**
 * Create a mock AutocompleteInteraction
 */
export function createMockAutocompleteInteraction(options?: MockAutocompleteOptions) {
	const commandName = options?.commandName ?? 'test-command'
	const focusedOption = options?.focusedOption ?? { name: 'query', value: '' }

	return {
		id: `autocomplete-${Date.now()}`,
		type: InteractionType.ApplicationCommandAutocomplete,
		commandName,
		options: {
			getFocused: jest.fn(() => focusedOption.value),
			data: [focusedOption]
		},
		respond: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
		isChatInputCommand: () => false,
		isAutocomplete: () => true,
		isContextMenuCommand: () => false
	}
}

/**
 * Create a mock ContextMenuCommandInteraction (user or message)
 */
export function createMockContextMenuInteraction(options?: {
	commandName?: string
	type?: 'user' | 'message'
	targetUser?: jest.Mocked<User>
	targetMessage?: unknown
}) {
	const commandName = options?.commandName ?? 'Test Context Menu'
	const type = options?.type ?? 'user'
	const targetUser = options?.targetUser ?? createMockUser()

	return {
		id: `context-${Date.now()}`,
		type: InteractionType.ApplicationCommand,
		commandName,
		commandType: type === 'user' ? ApplicationCommandType.User : ApplicationCommandType.Message,
		targetUser: type === 'user' ? targetUser : undefined,
		targetMessage: type === 'message' ? options?.targetMessage ?? { id: 'msg-target' } : undefined,
		user: createMockUser(),
		guild: createMockGuild(),
		channel: createMockTextChannel(),
		deferReply: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
		reply: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
		editReply: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
		isChatInputCommand: () => false,
		isAutocomplete: () => false,
		isContextMenuCommand: () => true,
		isUserContextMenuCommand: () => type === 'user',
		isMessageContextMenuCommand: () => type === 'message'
	}
}

/**
 * Create a mock Message for prefix command testing.
 * Provides author, guild, channel (with sendTyping), member (with permissions), and reply.
 */
export function createMockMessage(options: {
	content?: string
	authorBot?: boolean
	authorId?: string
	guildId?: string | null
	permissions?: string[]
} = {}) {
	const {
		content = '!ping',
		authorBot = false,
		authorId = 'user123',
		guildId = '123456',
		permissions = []
	} = options
	const permissionSet = new Set(permissions)

	return {
		content,
		author: { id: authorId, bot: authorBot },
		guild: guildId ? { id: guildId } : null,
		guildId,
		channel: {
			sendTyping: jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
		},
		member: guildId
			? {
					permissions: {
						has: jest.fn((perm: string) => permissionSet.has(perm))
					}
				}
			: null,
		reply: jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
	}
}

/**
 * Reset all mock function calls on a mock object
 */
export function resetMockCalls(mockObj: Record<string, unknown>): void {
	Object.values(mockObj).forEach((value) => {
		if (typeof value === 'function' && 'mockClear' in value) {
			;(value as jest.Mock).mockClear()
		}
	})
}
