// @ts-expect-error - This is a generated file
import type { Locale, LocaleKey, ParamsFor } from '../../generated/types'
import type { CommandConfig, CommandOption } from 'robo.js'

type Autocomplete<T extends string> = T | (string & NonNullable<unknown>)

type LocaleStr = Extract<Locale, string>

/** A union describing acceptable inputs that carry a locale (string or objects with `locale`/`guildLocale`). */
export type LocaleLike =
	| Locale
	| {
			locale: Autocomplete<LocaleStr>
	  }
	| {
			guildLocale: Autocomplete<LocaleStr>
	  }

/** Command option shape that uses namespaced i18n keys for name/description. */
export interface LocaleCommandOption extends Omit<CommandOption, 'description'> {
	nameKey: LocaleKey
	descriptionKey?: LocaleKey
}

/** Command config shape that accepts namespaced i18n keys and optional localized options. */
export interface LocaleCommandConfig extends Omit<CommandConfig, 'options'> {
	descriptionKey?: LocaleKey
	nameKey?: LocaleKey
	options?: readonly LocaleCommandOption[]
}

/** Plugin options for `@robojs/i18n` (e.g., `defaultLocale`). */
export interface PluginConfig {
	defaultLocale?: string
}

type ToCommandOption<O> = O extends LocaleCommandOption
	? Omit<O, 'nameKey' | 'descriptionKey'> & { description?: string }
	: O

type MapOptions<Opts> = Opts extends readonly unknown[]
	? { readonly [I in keyof Opts]: ToCommandOption<Opts[I]> }
	: never

/** CommandConfig-like type with i18n keys stripped and options mapped while preserving tuple shapes. */
export type BaseFromLocale<C extends LocaleCommandConfig> = Omit<C, 'nameKey' | 'descriptionKey' | 'options'> &
	(undefined extends C['options']
		? { options?: MapOptions<Exclude<C['options'], undefined>> }
		: { options: MapOptions<C['options']> })

/** Ensures the provided i18n command config narrows to a valid Robo.js `CommandConfig`. */
export type ValidatedCommandConfig<C extends LocaleCommandConfig> = BaseFromLocale<C> extends CommandConfig ? C : never

/** Internal canonical param kinds inferred from ICU (`number` | `string` | `dateOrNumber`). */
export type TsKind = 'number' | 'string' | 'dateOrNumber'

/** Param tree node used to build nested parameter types for each key. */
export type Node = {
	// If this node is ever used as a scalar directly (e.g., {user}), we record its scalar kind
	kind?: TsKind
	// Children mean dotted sub-keys exist (e.g., user.name)
	children?: Record<string, Node>
}

type DeepRequired<T> = T extends Date
	? Date
	: T extends Array<infer U>
		? Array<DeepRequired<U>>
		: T extends object
			? { [P in keyof T]-?: NonNullable<DeepRequired<T[P]>> }
			: NonNullable<T>

/** Deep-required variant of generated `ParamsFor<K>`. */
export type StrictParamsFor<K extends LocaleKey> = DeepRequired<ParamsFor<K>>

/** Tuple helper: `[]` when a key has no params, otherwise `[StrictParamsFor<K>]`. */
export type MaybeArgs<K extends LocaleKey> = keyof ParamsFor<K> extends never ? [] : [StrictParamsFor<K>]
