import type { ApplicationCommandOptionChoiceData, AutocompleteInteraction, CommandInteraction, InteractionReplyOptions, MessagePayload } from 'discord.js'
import type { BaseConfig, SageOptions } from './index.js'

export interface Command {
	autocomplete?: (
		interaction: AutocompleteInteraction
	) => Promise<ApplicationCommandOptionChoiceData<string | number>[]>
	config?: CommandConfig
	default: (interaction: CommandInteraction) => unknown | Promise<unknown>
}

export interface CommandConfig extends BaseConfig {
	defaultMemberPermissions?: string | number | bigint
	dmPermission?: boolean
	description?: string
	descriptionLocalizations?: Record<string, string>
	nameLocalizations?: Record<string, string>
	options?: CommandOption[]
	sage?: false | SageOptions
	timeout?: number
}

export interface CommandEntry extends CommandConfig {
	subcommands?: Record<string, CommandEntry>
}

export interface CommandOption {
	autocomplete?: boolean
	description?: string
	descriptionLocalizations?: Record<string, string>
	name: string
	nameLocalizations?: Record<string, string>
	required?: boolean
	type?: 'string' | 'integer' | 'boolean' | 'channel' | 'attachment' | 'role' | 'user' | 'mention'
}

export type CommandResult = string | InteractionReplyOptions | MessagePayload | void
