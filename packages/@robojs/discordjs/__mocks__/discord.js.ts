/**
 * Manual mock for discord.js module used by @robojs/discordjs tests.
 *
 * Provides mock implementations of Discord.js classes and types
 * that the plugin depends on.
 */

import { jest } from '@jest/globals'

// Singleton instance for REST mock - set by REST constructor
let restInstance: REST | null = null

// GatewayIntentBits - copied from discord.js
export const GatewayIntentBits = {
	Guilds: 1,
	GuildMembers: 2,
	GuildModeration: 4,
	GuildEmojisAndStickers: 8,
	GuildIntegrations: 16,
	GuildWebhooks: 32,
	GuildInvites: 64,
	GuildVoiceStates: 128,
	GuildPresences: 256,
	GuildMessages: 512,
	GuildMessageReactions: 1024,
	GuildMessageTyping: 2048,
	DirectMessages: 4096,
	DirectMessageReactions: 8192,
	DirectMessageTyping: 16384,
	MessageContent: 32768,
	GuildScheduledEvents: 65536,
	AutoModerationConfiguration: 1048576,
	AutoModerationExecution: 2097152,
	GuildMessagePolls: 16777216,
	DirectMessagePolls: 33554432
} as const

// PermissionFlagsBits - subset of commonly used permissions
export const PermissionFlagsBits = {
	Administrator: BigInt(1) << BigInt(3),
	ManageGuild: BigInt(1) << BigInt(5),
	ManageChannels: BigInt(1) << BigInt(4),
	ManageRoles: BigInt(1) << BigInt(28),
	ManageMessages: BigInt(1) << BigInt(13),
	BanMembers: BigInt(1) << BigInt(2),
	KickMembers: BigInt(1) << BigInt(1),
	CreateInstantInvite: BigInt(1) << BigInt(0),
	ViewChannel: BigInt(1) << BigInt(10),
	SendMessages: BigInt(1) << BigInt(11),
	EmbedLinks: BigInt(1) << BigInt(14),
	AttachFiles: BigInt(1) << BigInt(15),
	ReadMessageHistory: BigInt(1) << BigInt(16),
	MentionEveryone: BigInt(1) << BigInt(17),
	UseExternalEmojis: BigInt(1) << BigInt(18),
	Connect: BigInt(1) << BigInt(20),
	Speak: BigInt(1) << BigInt(21),
	MuteMembers: BigInt(1) << BigInt(22),
	DeafenMembers: BigInt(1) << BigInt(23),
	MoveMembers: BigInt(1) << BigInt(24),
	UseVAD: BigInt(1) << BigInt(25),
	ModerateMembers: BigInt(1) << BigInt(40)
} as const

// MessageFlags
export const MessageFlags = {
	Crossposted: 1 << 0,
	IsCrosspost: 1 << 1,
	SuppressEmbeds: 1 << 2,
	SourceMessageDeleted: 1 << 3,
	Urgent: 1 << 4,
	HasThread: 1 << 5,
	Ephemeral: 1 << 6,
	Loading: 1 << 7,
	FailedToMentionSomeRolesInThread: 1 << 8,
	SuppressNotifications: 1 << 12,
	IsVoiceMessage: 1 << 13
} as const

// Events enum
export const Events = {
	ClientReady: 'clientReady',
	InteractionCreate: 'interactionCreate',
	GuildCreate: 'guildCreate',
	GuildDelete: 'guildDelete',
	GuildUpdate: 'guildUpdate',
	GuildMemberAdd: 'guildMemberAdd',
	GuildMemberRemove: 'guildMemberRemove',
	GuildMemberUpdate: 'guildMemberUpdate',
	MessageCreate: 'messageCreate',
	MessageDelete: 'messageDelete',
	MessageUpdate: 'messageUpdate',
	ChannelCreate: 'channelCreate',
	ChannelDelete: 'channelDelete',
	ChannelUpdate: 'channelUpdate',
	VoiceStateUpdate: 'voiceStateUpdate',
	PresenceUpdate: 'presenceUpdate'
} as const

// ApplicationCommandOptionType
export const ApplicationCommandOptionType = {
	Subcommand: 1,
	SubcommandGroup: 2,
	String: 3,
	Integer: 4,
	Boolean: 5,
	User: 6,
	Channel: 7,
	Role: 8,
	Mentionable: 9,
	Number: 10,
	Attachment: 11
} as const

// ApplicationCommandType
export const ApplicationCommandType = {
	ChatInput: 1,
	User: 2,
	Message: 3
} as const

// ApplicationIntegrationType
export const ApplicationIntegrationType = {
	GuildInstall: 0,
	UserInstall: 1
} as const

// InteractionContextType
export const InteractionContextType = {
	Guild: 0,
	BotDM: 1,
	PrivateChannel: 2
} as const

// InteractionType
export const InteractionType = {
	Ping: 1,
	ApplicationCommand: 2,
	MessageComponent: 3,
	ApplicationCommandAutocomplete: 4,
	ModalSubmit: 5
} as const

// ChannelType
export const ChannelType = {
	GuildText: 0,
	DM: 1,
	GuildVoice: 2,
	GroupDM: 3,
	GuildCategory: 4,
	GuildAnnouncement: 5,
	AnnouncementThread: 10,
	PublicThread: 11,
	PrivateThread: 12,
	GuildStageVoice: 13,
	GuildDirectory: 14,
	GuildForum: 15,
	GuildMedia: 16
} as const

// IntegrationTypesConfig
export const IntegrationTypesConfig = {} as const

// Mock Client class
export class Client {
	user: { tag: string; id: string } | null = { tag: 'MockBot#0000', id: '123456789' }
	options: { intents: { bitfield: bigint } }
	private eventListeners: Map<string, Array<(...args: unknown[]) => void>> = new Map()

	constructor(options: { intents?: number[] | number } = { intents: [] }) {
		const intentsValue = Array.isArray(options.intents)
			? options.intents.reduce((acc, i) => acc | i, 0)
			: options.intents || 0
		this.options = { intents: { bitfield: BigInt(intentsValue) } }
	}

	on(event: string, callback: (...args: unknown[]) => void): this {
		if (!this.eventListeners.has(event)) {
			this.eventListeners.set(event, [])
		}
		this.eventListeners.get(event)!.push(callback)
		return this
	}

	once(event: string, callback: (...args: unknown[]) => void): this {
		const wrappedCallback = (...args: unknown[]) => {
			this.off(event, wrappedCallback)
			callback(...args)
		}
		return this.on(event, wrappedCallback)
	}

	off(event: string, callback: (...args: unknown[]) => void): this {
		const listeners = this.eventListeners.get(event)
		if (listeners) {
			const index = listeners.indexOf(callback)
			if (index !== -1) {
				listeners.splice(index, 1)
			}
		}
		return this
	}

	emit(event: string, ...args: unknown[]): boolean {
		const listeners = this.eventListeners.get(event)
		if (listeners && listeners.length > 0) {
			listeners.forEach((callback) => callback(...args))
			return true
		}
		return false
	}

	login = jest.fn<() => Promise<string>>().mockResolvedValue('mock-token')
	destroy = jest.fn()
}

// Mock REST class - uses singleton pattern for test control
// When code does `new REST()`, it gets the singleton so tests can control it
export class REST {
	setToken = jest.fn().mockReturnThis()
	put = jest.fn<() => Promise<unknown[]>>().mockResolvedValue([])
	get = jest.fn<() => Promise<unknown[]>>().mockResolvedValue([])
	post = jest.fn<() => Promise<unknown>>().mockResolvedValue({})
	patch = jest.fn<() => Promise<unknown>>().mockResolvedValue({})
	delete = jest.fn<() => Promise<void>>().mockResolvedValue(undefined)

	constructor() {
		// Return singleton instance so all code shares the same mock
		// This allows tests to control REST behavior via getRestMock()
		if (restInstance) {
			return restInstance
		}
		restInstance = this
	}
}

// =============================================================================
// REST mock helpers for tests
// =============================================================================
// Tests can import getRestMock() to control REST.put, REST.get, etc.
// This allows tests to use moduleNameMapper while still controlling API mocks.

export function getRestMock(): REST {
	if (!restInstance) {
		restInstance = new REST()
	}
	return restInstance
}

export function resetRestMock(): void {
	if (restInstance) {
		restInstance.setToken.mockClear()
		restInstance.put.mockClear().mockResolvedValue([])
		restInstance.get.mockClear().mockResolvedValue([])
		restInstance.post.mockClear().mockResolvedValue({})
		restInstance.patch.mockClear().mockResolvedValue({})
		restInstance.delete.mockClear().mockResolvedValue(undefined)
	}
}

// Routes helper
export const Routes = {
	applicationCommands: (appId: string) => `/applications/${appId}/commands`,
	applicationGuildCommands: (appId: string, guildId: string) =>
		`/applications/${appId}/guilds/${guildId}/commands`,
	applicationCommand: (appId: string, cmdId: string) => `/applications/${appId}/commands/${cmdId}`,
	applicationGuildCommand: (appId: string, guildId: string, cmdId: string) =>
		`/applications/${appId}/guilds/${guildId}/commands/${cmdId}`
}

// Builders for commands
export class SlashCommandBuilder {
	name = ''
	description = ''
	options: unknown[] = []
	defaultMemberPermissions: string | null = null
	integrationTypes: unknown[] = []
	contexts: unknown[] = []
	nsfw = false
	nameLocalizations: Record<string, string> = {}
	descriptionLocalizations: Record<string, string> = {}
	dmPermission: boolean | undefined = undefined

	setName(name: string): this {
		this.name = name
		return this
	}

	setDescription(description: string): this {
		this.description = description
		return this
	}

	setDefaultMemberPermissions(permissions: string | null): this {
		this.defaultMemberPermissions = permissions
		return this
	}

	setIntegrationTypes(...types: unknown[]): this {
		// Handle both array and spread arguments
		this.integrationTypes = Array.isArray(types[0]) ? types[0] : types
		return this
	}

	setContexts(...contexts: unknown[]): this {
		// Handle both array and spread arguments
		this.contexts = Array.isArray(contexts[0]) ? contexts[0] : contexts
		return this
	}

	setNSFW(nsfw: boolean): this {
		this.nsfw = nsfw
		return this
	}

	setNameLocalizations(localizations: Record<string, string>): this {
		this.nameLocalizations = localizations
		return this
	}

	setDescriptionLocalizations(localizations: Record<string, string>): this {
		this.descriptionLocalizations = localizations
		return this
	}

	setDMPermission(permission: boolean): this {
		this.dmPermission = permission
		return this
	}

	addStringOption(fn: (option: StringOption) => StringOption): this {
		const option = new StringOption()
		fn(option)
		this.options.push(option)
		return this
	}

	addIntegerOption(fn: (option: IntegerOption) => IntegerOption): this {
		const option = new IntegerOption()
		fn(option)
		this.options.push(option)
		return this
	}

	addBooleanOption(fn: (option: BooleanOption) => BooleanOption): this {
		const option = new BooleanOption()
		fn(option)
		this.options.push(option)
		return this
	}

	addSubcommand(fn: (subcommand: SubcommandBuilder) => SubcommandBuilder): this {
		const subcommand = new SubcommandBuilder()
		fn(subcommand)
		this.options.push(subcommand)
		return this
	}

	addSubcommandGroup(fn: (group: SubcommandGroupBuilder) => SubcommandGroupBuilder): this {
		const group = new SubcommandGroupBuilder()
		fn(group)
		this.options.push(group)
		return this
	}

	addUserOption(fn: (option: BaseOption) => BaseOption): this {
		const option = new BaseOption()
		fn(option)
		this.options.push(option)
		return this
	}

	addChannelOption(fn: (option: ChannelOption) => ChannelOption): this {
		const option = new ChannelOption()
		fn(option)
		this.options.push(option)
		return this
	}

	addRoleOption(fn: (option: BaseOption) => BaseOption): this {
		const option = new BaseOption()
		fn(option)
		this.options.push(option)
		return this
	}

	addAttachmentOption(fn: (option: BaseOption) => BaseOption): this {
		const option = new BaseOption()
		fn(option)
		this.options.push(option)
		return this
	}

	addMentionableOption(fn: (option: BaseOption) => BaseOption): this {
		const option = new BaseOption()
		fn(option)
		this.options.push(option)
		return this
	}

	addNumberOption(fn: (option: NumberOption) => NumberOption): this {
		const option = new NumberOption()
		fn(option)
		this.options.push(option)
		return this
	}

	toJSON(): Record<string, unknown> {
		return {
			name: this.name,
			description: this.description,
			 
			options: this.options.map((opt: any) =>
				typeof opt.toJSON === 'function' ? opt.toJSON() : opt
			),
			default_member_permissions: this.defaultMemberPermissions,
			dm_permission: this.dmPermission,
			contexts: this.contexts.length > 0 ? this.contexts : undefined,
			integration_types: this.integrationTypes.length > 0 ? this.integrationTypes : undefined,
			name_localizations: Object.keys(this.nameLocalizations).length > 0 ? this.nameLocalizations : undefined,
			description_localizations: Object.keys(this.descriptionLocalizations).length > 0 ? this.descriptionLocalizations : undefined
		}
	}
}

class BaseOption {
	name = ''
	description = ''
	required = false
	nameLocalizations: Record<string, string> = {}
	descriptionLocalizations: Record<string, string> = {}

	setName(name: string): this {
		this.name = name
		return this
	}

	setDescription(description: string): this {
		this.description = description
		return this
	}

	setRequired(required: boolean): this {
		this.required = required
		return this
	}

	setNameLocalizations(localizations: Record<string, string>): this {
		this.nameLocalizations = localizations
		return this
	}

	setDescriptionLocalizations(localizations: Record<string, string>): this {
		this.descriptionLocalizations = localizations
		return this
	}

	toJSON(): Record<string, unknown> {
		return {
			name: this.name,
			description: this.description,
			required: this.required,
			name_localizations: Object.keys(this.nameLocalizations).length > 0 ? this.nameLocalizations : undefined,
			description_localizations: Object.keys(this.descriptionLocalizations).length > 0 ? this.descriptionLocalizations : undefined
		}
	}
}

class StringOption extends BaseOption {
	choices: Array<{ name: string; value: string }> = []
	autocomplete = false
	maxLength?: number
	minLength?: number

	addChoices(...choices: Array<{ name: string; value: string }>): this {
		this.choices.push(...choices)
		return this
	}

	setAutocomplete(autocomplete: boolean): this {
		this.autocomplete = autocomplete
		return this
	}

	setMaxLength(max: number): this {
		this.maxLength = max
		return this
	}

	setMinLength(min: number): this {
		this.minLength = min
		return this
	}

	toJSON(): Record<string, unknown> {
		return {
			...super.toJSON(),
			type: ApplicationCommandOptionType.String,
			choices: this.choices.length > 0 ? this.choices : undefined,
			autocomplete: this.autocomplete,
			max_length: this.maxLength,
			min_length: this.minLength
		}
	}
}

class IntegerOption extends BaseOption {
	minValue?: number
	maxValue?: number
	choices: Array<{ name: string; value: number }> = []
	autocomplete = false

	setMinValue(value: number): this {
		this.minValue = value
		return this
	}

	setMaxValue(value: number): this {
		this.maxValue = value
		return this
	}

	addChoices(...choices: Array<{ name: string; value: number }>): this {
		this.choices.push(...choices)
		return this
	}

	setAutocomplete(autocomplete: boolean): this {
		this.autocomplete = autocomplete
		return this
	}

	toJSON(): Record<string, unknown> {
		return {
			...super.toJSON(),
			type: ApplicationCommandOptionType.Integer,
			min_value: this.minValue,
			max_value: this.maxValue,
			choices: this.choices.length > 0 ? this.choices : undefined,
			autocomplete: this.autocomplete
		}
	}
}

class NumberOption extends BaseOption {
	minValue?: number
	maxValue?: number
	choices: Array<{ name: string; value: number }> = []
	autocomplete = false

	setMinValue(value: number): this {
		this.minValue = value
		return this
	}

	setMaxValue(value: number): this {
		this.maxValue = value
		return this
	}

	addChoices(...choices: Array<{ name: string; value: number }>): this {
		this.choices.push(...choices)
		return this
	}

	setAutocomplete(autocomplete: boolean): this {
		this.autocomplete = autocomplete
		return this
	}

	toJSON(): Record<string, unknown> {
		return {
			...super.toJSON(),
			type: ApplicationCommandOptionType.Number,
			min_value: this.minValue,
			max_value: this.maxValue,
			choices: this.choices.length > 0 ? this.choices : undefined,
			autocomplete: this.autocomplete
		}
	}
}

class ChannelOption extends BaseOption {
	channelTypes: number[] = []

	addChannelTypes(...types: number[]): this {
		this.channelTypes.push(...types)
		return this
	}

	toJSON(): Record<string, unknown> {
		return {
			...super.toJSON(),
			type: ApplicationCommandOptionType.Channel,
			channel_types: this.channelTypes.length > 0 ? this.channelTypes : undefined
		}
	}
}

class BooleanOption extends BaseOption {
	toJSON(): Record<string, unknown> {
		return {
			...super.toJSON(),
			type: ApplicationCommandOptionType.Boolean
		}
	}
}

class SubcommandBuilder {
	name = ''
	description = ''
	options: unknown[] = []
	nameLocalizations: Record<string, string> = {}
	descriptionLocalizations: Record<string, string> = {}

	setName(name: string): this {
		this.name = name
		return this
	}

	setDescription(description: string): this {
		this.description = description
		return this
	}

	setNameLocalizations(localizations: Record<string, string>): this {
		this.nameLocalizations = localizations
		return this
	}

	setDescriptionLocalizations(localizations: Record<string, string>): this {
		this.descriptionLocalizations = localizations
		return this
	}

	addStringOption(fn: (option: StringOption) => StringOption): this {
		const option = new StringOption()
		fn(option)
		this.options.push(option)
		return this
	}

	addIntegerOption(fn: (option: IntegerOption) => IntegerOption): this {
		const option = new IntegerOption()
		fn(option)
		this.options.push(option)
		return this
	}

	addBooleanOption(fn: (option: BooleanOption) => BooleanOption): this {
		const option = new BooleanOption()
		fn(option)
		this.options.push(option)
		return this
	}

	addUserOption(fn: (option: BaseOption) => BaseOption): this {
		const option = new BaseOption()
		fn(option)
		this.options.push(option)
		return this
	}

	addChannelOption(fn: (option: BaseOption) => BaseOption): this {
		const option = new BaseOption()
		fn(option)
		this.options.push(option)
		return this
	}

	addRoleOption(fn: (option: BaseOption) => BaseOption): this {
		const option = new BaseOption()
		fn(option)
		this.options.push(option)
		return this
	}

	addMentionableOption(fn: (option: BaseOption) => BaseOption): this {
		const option = new BaseOption()
		fn(option)
		this.options.push(option)
		return this
	}

	addNumberOption(fn: (option: NumberOption) => NumberOption): this {
		const option = new NumberOption()
		fn(option)
		this.options.push(option)
		return this
	}

	addAttachmentOption(fn: (option: BaseOption) => BaseOption): this {
		const option = new BaseOption()
		fn(option)
		this.options.push(option)
		return this
	}
}

// Export SubcommandBuilder alias matching discord.js export name
export const SlashCommandSubcommandBuilder = SubcommandBuilder

class SubcommandGroupBuilder {
	name = ''
	description = ''
	subcommands: SubcommandBuilder[] = []
	nameLocalizations: Record<string, string> = {}
	descriptionLocalizations: Record<string, string> = {}

	setName(name: string): this {
		this.name = name
		return this
	}

	setDescription(description: string): this {
		this.description = description
		return this
	}

	setNameLocalizations(localizations: Record<string, string>): this {
		this.nameLocalizations = localizations
		return this
	}

	setDescriptionLocalizations(localizations: Record<string, string>): this {
		this.descriptionLocalizations = localizations
		return this
	}

	addSubcommand(fn: (subcommand: SubcommandBuilder) => SubcommandBuilder): this {
		const subcommand = new SubcommandBuilder()
		fn(subcommand)
		this.subcommands.push(subcommand)
		return this
	}
}

export class ContextMenuCommandBuilder {
	name = ''
	type: number = ApplicationCommandType.User
	contexts: unknown[] = []
	integrationTypes: unknown[] = []
	nameLocalizations: Record<string, string> = {}
	defaultMemberPermissions: string | null = null
	dmPermission: boolean | undefined = undefined

	setName(name: string): this {
		this.name = name
		return this
	}

	setType(type: number): this {
		this.type = type
		return this
	}

	setContexts(...contexts: unknown[]): this {
		// Handle both array and spread arguments
		this.contexts = Array.isArray(contexts[0]) ? contexts[0] as unknown[] : contexts
		return this
	}

	setIntegrationTypes(...types: unknown[]): this {
		// Handle both array and spread arguments
		this.integrationTypes = Array.isArray(types[0]) ? types[0] as unknown[] : types
		return this
	}

	setNameLocalizations(localizations: Record<string, string>): this {
		this.nameLocalizations = localizations
		return this
	}

	setDefaultMemberPermissions(permissions: string | null): this {
		this.defaultMemberPermissions = permissions
		return this
	}

	setDMPermission(permission: boolean): this {
		this.dmPermission = permission
		return this
	}

	toJSON(): Record<string, unknown> {
		return {
			name: this.name,
			type: this.type,
			contexts: this.contexts.length > 0 ? this.contexts : undefined,
			integration_types: this.integrationTypes.length > 0 ? this.integrationTypes : undefined,
			name_localizations: Object.keys(this.nameLocalizations).length > 0 ? this.nameLocalizations : undefined,
			default_member_permissions: this.defaultMemberPermissions,
			dm_permission: this.dmPermission
		}
	}
}

// Collection class (simplified)
export class Collection<K, V> extends Map<K, V> {
	first(): V | undefined {
		return this.values().next().value
	}

	filter(fn: (value: V, key: K) => boolean): Collection<K, V> {
		const result = new Collection<K, V>()
		for (const [key, value] of this) {
			if (fn(value, key)) {
				result.set(key, value)
			}
		}
		return result
	}

	map<T>(fn: (value: V, key: K) => T): T[] {
		const result: T[] = []
		for (const [key, value] of this) {
			result.push(fn(value, key))
		}
		return result
	}
}

// Export types (these are just for TypeScript compatibility)
export type ClientEvents = {
	clientReady: [client: Client]
	interactionCreate: [interaction: unknown]
	guildCreate: [guild: unknown]
	guildDelete: [guild: unknown]
	messageCreate: [message: unknown]
	// Add more as needed
}

export type ClientOptions = {
	intents: number[]
	rest?: { api?: string }
}

export type ChatInputCommandInteraction = {
	commandName: string
	options: unknown
	reply: jest.Mock
	deferReply: jest.Mock
	editReply: jest.Mock
	isChatInputCommand: () => boolean
	isAutocomplete: () => boolean
	isContextMenuCommand: () => boolean
}

export type AutocompleteInteraction = {
	commandName: string
	respond: jest.Mock
	options: {
		getFocused: () => string
		getSubcommand: () => string | null
		getSubcommandGroup: () => string | null
	}
}

export type ContextMenuCommandInteraction = {
	commandName: string
	targetId: string
	reply: jest.Mock
}

export type Guild = {
	id: string
	name: string
}

export type GuildMember = {
	id: string
	user: User
}

export type User = {
	id: string
	tag: string
	username: string
}

export type Message = {
	id: string
	content: string
	author: User
}

export type Interaction = ChatInputCommandInteraction | AutocompleteInteraction | ContextMenuCommandInteraction

export type TextChannel = {
	id: string
	name: string
	send: jest.Mock
}

export type VoiceChannel = {
	id: string
	name: string
}

export type Role = {
	id: string
	name: string
}

export type MessageContextMenuCommandInteraction = ContextMenuCommandInteraction
export type UserContextMenuCommandInteraction = ContextMenuCommandInteraction
export type ApplicationCommandOptionBase = BaseOption

export type APIApplicationCommand = {
	id: string
	name: string
	description: string
	type: number
	options?: unknown[]
}

export default {
	Client,
	REST,
	Routes,
	Events,
	GatewayIntentBits,
	PermissionFlagsBits,
	MessageFlags,
	ApplicationCommandOptionType,
	ApplicationCommandType,
	ApplicationIntegrationType,
	InteractionContextType,
	InteractionType,
	ChannelType,
	SlashCommandBuilder,
	ContextMenuCommandBuilder,
	Collection
}
