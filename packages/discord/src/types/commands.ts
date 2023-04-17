import type { ApplicationCommandOptionChoiceData, AutocompleteInteraction, CommandInteraction } from 'discord.js'
import type { BaseConfig, Handler, SageOptions } from './index.js'

type BaseCommandResult = BaseCommandResultData | string | void

type BaseCommandResultData = {
	embeds: Embed[]
}
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

export type CommandResult = BaseCommandResult | Promise<BaseCommandResult>

interface Embed {
	description: string
	title: string
}
