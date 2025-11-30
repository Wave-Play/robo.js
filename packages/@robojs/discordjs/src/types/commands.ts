/**
 * Discord command types for @robojs/discordjs
 */
import type {
	ApplicationCommandOptionAllowedChannelTypes,
	ApplicationCommandOptionChoiceData,
	ApplicationIntegrationType,
	Attachment,
	AutocompleteInteraction,
	ChatInputCommandInteraction,
	GuildBasedChannel,
	GuildMember,
	InteractionContextType,
	InteractionReplyOptions,
	MessagePayload,
	RestOrArray,
	Role,
	User
} from 'discord.js'
import type { SageOptions, BaseConfig } from './common.js'

/**
 * Command handler function type.
 */
export type CommandHandler = (
	interaction: ChatInputCommandInteraction,
	options: Record<string, unknown>
) => CommandResult | Promise<CommandResult>

/**
 * Autocomplete handler function type.
 */
export type AutocompleteHandler = (
	interaction: AutocompleteInteraction
) => Promise<ApplicationCommandOptionChoiceData<string | number>[]>

/**
 * Command module structure expected in handler files.
 */
export interface Command {
	autocomplete?: AutocompleteHandler
	config?: CommandConfig
	default: CommandHandler
}

/**
 * Command configuration options.
 */
export interface CommandConfig extends BaseConfig {
	/** Interaction contexts where the command is available */
	contexts?: CommandContext[]
	/** Default member permissions required to use the command */
	defaultMemberPermissions?: string | number | bigint
	/** @deprecated Use `contexts` instead */
	dmPermission?: boolean
	/** Description localizations by locale code */
	descriptionLocalizations?: Record<string, string>
	/** Installation contexts for the command */
	integrationTypes?: CommandIntegrationType[]
	/** Name localizations by locale code */
	nameLocalizations?: Record<string, string>
	/** Whether the command is age-restricted */
	nsfw?: boolean
	/** Command options/parameters */
	options?: readonly CommandOption[]
	/** Sage (auto-defer/reply) configuration */
	sage?: false | SageOptions
	/** Execution timeout in milliseconds */
	timeout?: number
}

/**
 * Interaction context types.
 */
export type CommandContext = 'BotDM' | 'Guild' | 'PrivateChannel' | InteractionContextType

/**
 * Command entry in manifest (includes subcommands).
 */
export interface CommandEntry extends CommandConfig {
	subcommands?: Record<string, CommandEntry>
}

/**
 * Integration/installation types.
 */
export type CommandIntegrationType = 'GuildInstall' | 'UserInstall' | ApplicationIntegrationType

/**
 * Base fields shared by all command options.
 */
interface CommandOptionCommon {
	/** Enable autocomplete for this option */
	autocomplete?: boolean
	/** Static choices for the option */
	choices?: readonly ApplicationCommandOptionChoiceData<string | number>[]
	/** Option description */
	description?: string
	/** Description localizations by locale code */
	descriptionLocalizations?: Record<string, string>
	/** Maximum value (for number/integer) or length (for string) */
	max?: number
	/** Minimum value (for number/integer) or length (for string) */
	min?: number
	/** Option name */
	name: string
	/** Name localizations by locale code */
	nameLocalizations?: Record<string, string>
	/** Whether the option is required */
	required?: boolean
}

/**
 * Command option with discriminated union for channel type.
 */
export type CommandOption =
	| (CommandOptionCommon & {
			type: 'channel'
			channelTypes?: RestOrArray<ApplicationCommandOptionAllowedChannelTypes>
	  })
	| (CommandOptionCommon & {
			type?: Exclude<keyof CommandOptionTypes, 'channel'>
	  })

/**
 * Command result type (what can be returned from a command).
 */
export type CommandResult = string | InteractionReplyOptions | MessagePayload | void

/**
 * Map of option type names to their resolved TypeScript types.
 */
export type CommandOptionTypes = {
	string: string
	integer: number
	number: number
	boolean: boolean
	user: User
	channel: GuildBasedChannel
	member: GuildMember | null
	role: Role
	attachment: Attachment
	mention: GuildMember | Role
}

/**
 * Infer options type from command config.
 */
export type CommandOptions<ConfigType extends CommandConfig> = {
	[K in NonNullable<ConfigType['options']>[number] as K['name']]: K extends { required: true }
		? ValueOfOption<K>
		: ValueOfOption<K> | undefined
}

/**
 * Get the value type of an option based on its type property.
 */
type ValueOfOption<O extends CommandOption> = O extends { type: keyof CommandOptionTypes }
	? CommandOptionTypes[O['type']]
	: string

/**
 * Command controller for portal.discord.command()
 */
export interface CommandController {
	/** Check if command is enabled */
	isEnabled(): boolean
	/** Enable or disable the command */
	setEnabled(value: boolean): void
	/** Restrict command to specific servers */
	setServerOnly(serverIds: string | string[]): void
	/** Check if command is enabled for a specific server */
	isEnabledForServer(serverId: string): boolean
	/** Get command metadata */
	getMetadata(): Record<string, unknown>
}
