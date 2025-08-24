// @ts-expect-error - This is a generated file
import type { Locale, LocaleKey } from '../../generated/types'
import type { CommandConfig, CommandOption } from 'robo.js'

type Autocomplete<T extends string> = T | (string & NonNullable<unknown>)
type LocaleStr = Extract<Locale, string>

export type LocaleLike =
	| Locale
	| {
			locale: Autocomplete<LocaleStr>
	  }
	| {
			guildLocale: Autocomplete<LocaleStr>
	  }

// This function is used to create a command config with localized names and descriptions
export interface LocaleCommandOption extends Omit<CommandOption, 'description'> {
	nameKey: LocaleKey
	descriptionKey?: LocaleKey
}

export interface LocaleCommandConfig extends Omit<CommandConfig, 'options'> {
	descriptionKey?: LocaleKey
	options?: readonly LocaleCommandOption[]
}

export interface PluginConfig {
	defaultLocale?: string
}
