import type {
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
	Role,
	User
} from 'discord.js'
import type { BaseConfig, SageOptions } from './index.js'

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

export type CommandContext = 'BotDM' | 'Guild' | 'PrivateChannel' | InteractionContextType

export interface CommandEntry extends CommandConfig {
	subcommands?: Record<string, CommandEntry>
}

export type CommandIntegrationType = 'GuildInstall' | 'UserInstall' | ApplicationIntegrationType

export interface CommandOption {
	autocomplete?: boolean
	choices?: ApplicationCommandOptionChoiceData<string | number>[]
	description?: string
	descriptionLocalizations?: Record<string, string>
	max?: number
	min?: number
	name: string
	nameLocalizations?: Record<string, string>
	required?: boolean
	type?: keyof CommandOptionTypes
}

export type CommandResult = string | InteractionReplyOptions | MessagePayload | void

export type CommandOptionTypes = {
	string: string
	integer: number
	number: number
	boolean: boolean
	user: User
	channel: GuildBasedChannel
	member: GuildMember
	role: Role
	attachment: Attachment
	mention: GuildMember | Role
}

export type CommandOptions<ConfigType extends CommandConfig> = {
	[K in NonNullable<ConfigType['options']>[number] as K['name']]: K extends { required: true; type: infer TypeName }
		? TypeName extends keyof CommandOptionTypes
			? CommandOptionTypes[TypeName]
			: string
		: K extends { type: infer TypeName }
		? TypeName extends keyof CommandOptionTypes
			? CommandOptionTypes[TypeName] | undefined
			: string | undefined
		: K extends { required: true }
		? string
		: string | undefined
}

export default {}
