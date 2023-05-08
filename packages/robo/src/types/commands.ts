import type { ApplicationCommandOptionChoiceData, AutocompleteInteraction, CommandInteraction, InteractionReplyOptions, MessagePayload } from 'discord.js'
import type { BaseConfig, Handler, SageOptions } from './index.js'

export interface Command {
	autocomplete?: (
		interaction: AutocompleteInteraction
	) => Promise<ApplicationCommandOptionChoiceData<string | number>[]>
	config?: CommandConfig
	default: (interaction: CommandInteraction) => unknown | Promise<unknown>
}

export interface CommandConfig extends BaseConfig {
	description?: string
	descriptionLocalizations?: Record<string, string>
	nameLocalizations?: Record<string, string>
	options?: CommandOption[]
	sage?: false | SageOptions
	timeout?: number
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

export interface CommandRecord extends Handler {
	handler: Command
}

export type CommandResult = string | InteractionReplyOptions | MessagePayload | void
