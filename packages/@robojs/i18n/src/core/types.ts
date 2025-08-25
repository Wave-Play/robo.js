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
	nameKey?: LocaleKey
	options?: readonly LocaleCommandOption[]
}

export interface PluginConfig {
	defaultLocale?: string
}

type ToCommandOption<O> = O extends LocaleCommandOption
	? Omit<O, 'nameKey' | 'descriptionKey'> & { description?: string }
	: O

/** Map over a (possibly tuple) options array, preserving its indices/literals */
type MapOptions<Opts> = Opts extends readonly unknown[]
	? { readonly [I in keyof Opts]: ToCommandOption<Opts[I]> }
	: never

/** Strip locale-only keys but KEEP the options tuple shape and literals */
export type BaseFromLocale<C extends LocaleCommandConfig> = Omit<C, 'nameKey' | 'descriptionKey' | 'options'> &
	(undefined extends C['options']
		? { options?: MapOptions<Exclude<C['options'], undefined>> }
		: { options: MapOptions<C['options']> })

/** enforce at the callsite that the stripped type is a valid CommandConfig */
export type ValidatedCommandConfig<C extends LocaleCommandConfig> = BaseFromLocale<C> extends CommandConfig ? C : never

// Build a per-key param map by parsing ICU messages across all locales,
// then unioning param types if they differ between locales.
export type TsKind = 'number' | 'string' | 'dateOrNumber'

export type Node = {
	// If this node is ever used as a scalar directly (e.g., {user}), we record its scalar kind
	kind?: TsKind
	// Children mean dotted sub-keys exist (e.g., user.name)
	children?: Record<string, Node>
}
