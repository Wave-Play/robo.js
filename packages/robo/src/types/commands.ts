import type {
	ApplicationCommandOptionAllowedChannelTypes,
	ApplicationCommandOptionChoiceData,
	ApplicationIntegrationType,
	Attachment,
	AutocompleteInteraction,
	CommandInteraction,
	GuildBasedChannel,
	GuildMember,
	InteractionContextType,
	InteractionReplyOptions,
	MessagePayload,
	RestOrArray,
	Role,
	User
} from 'discord.js'
import type { BaseConfig, SageOptions } from './index.js'
import type { EnforceConfig, ExactConfig, ValueOfOption } from './helpers.js'

export interface Command {
	autocomplete?: (
		interaction: AutocompleteInteraction
	) => Promise<ApplicationCommandOptionChoiceData<string | number>[]>
	config?: CommandConfig
	default: (interaction: CommandInteraction, options: unknown) => unknown | Promise<unknown>
}

export interface CommandConfig extends BaseConfig {
	contexts?: CommandContext[]
	defaultMemberPermissions?: string | number | bigint
	/** @deprecated Use `contexts` instead */
	dmPermission?: boolean
	descriptionLocalizations?: Record<string, string>
	integrationTypes?: CommandIntegrationType[]
	nameLocalizations?: Record<string, string>
	options?: readonly CommandOption[]
	sage?: false | SageOptions
	timeout?: number
}

export type SmartCommandConfig<C extends CommandConfig> = ExactConfig<C> & EnforceConfig<C>

export type CommandContext = 'BotDM' | 'Guild' | 'PrivateChannel' | InteractionContextType

export interface CommandEntry extends CommandConfig {
	subcommands?: Record<string, CommandEntry>
}

export type CommandIntegrationType = 'GuildInstall' | 'UserInstall' | ApplicationIntegrationType

/**
 * Base fields shared by all options.
 */
interface CommandOptionCommon {
	autocomplete?: boolean
	choices?: readonly ApplicationCommandOptionChoiceData<string | number>[]
	description?: string
	descriptionLocalizations?: Record<string, string>
	max?: number
	min?: number
	name: string
	nameLocalizations?: Record<string, string>
	required?: boolean
}

/**
 * Discriminated union:
 * - If type is 'channel', allow optional channelTypes: ChannelType[]
 * - Otherwise (or if type omitted), forbid channelTypes.
 */
export type CommandOption =
	| (CommandOptionCommon & {
			type: 'channel'
			channelTypes?: RestOrArray<ApplicationCommandOptionAllowedChannelTypes>
	  })
	| (CommandOptionCommon & {
			type?: Exclude<keyof CommandOptionTypes, 'channel'>
	  })

export type CommandResult = string | InteractionReplyOptions | MessagePayload | void

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

export type CommandOptions<ConfigType extends CommandConfig> = {
	[K in NonNullable<ConfigType['options']>[number] as K['name']]: K extends { required: true }
		? ValueOfOption<K>
		: ValueOfOption<K> | undefined
}

export default {}
