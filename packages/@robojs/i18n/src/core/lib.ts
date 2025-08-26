// @ts-expect-error - This is a generated file
import type { LocaleKey, ParamsFor } from '../../generated/types'
import { getFormatter } from './formatter.js'
import { i18nLogger } from './loggers.js'
import {
	flattenParams,
	getLocale,
	loadLocales,
	loadLocalNames,
	mapKeysToSanitized,
	sanitizeDottedArgs
} from './utils.js'
import { join } from 'node:path'
import { createCommandConfig as _createCommandConfig, getPluginOptions, State } from 'robo.js'
import type {
	BaseFromLocale,
	LocaleCommandConfig,
	LocaleLike,
	MaybeArgs,
	PluginConfig,
	ValidatedCommandConfig
} from './types'
import type { SmartCommandConfig } from 'robo.js'

let _isLoaded = false

/**
 * Creates a **localized** command configuration for Robo.js projects.
 *
 * This is a drop-in replacement for `robo.js`’s `createCommandConfig` that:
 * - Accepts **key-based** fields (`nameKey`, `descriptionKey`, and per-option keys).
 * - Resolves the default strings from the configured `defaultLocale` (plugin option).
 * - Auto-populates `nameLocalizations` and `descriptionLocalizations` for **all** discovered locales.
 *
 * @param config - A command config that uses locale keys instead of raw strings.
 * @returns A standard `SmartCommandConfig` ready for Robo.js to register.
 *
 * @example
 * ```ts
 * import { createCommandConfig } from '@robojs/i18n'
 *
 * export const config = createCommandConfig({
 *   nameKey: 'cmd.ping.name',
 *   descriptionKey: 'cmd.ping.desc',
 *   options: [{
 *     type: 'string',
 *     name: 'text',                  // keep a raw name to help TS narrow option types
 *     nameKey: 'cmd.ping.arg',
 *     descriptionKey: 'cmd.ping.arg.desc',
 *     required: false
 *   }]
 * } as const)
 * ```
 *
 * @remarks
 * - Locales and message files are loaded once (on first call). You can call this
 *   multiple times for different commands; it will reuse the loaded state.
 * - If a `descriptionKey` is omitted, only names/localizations for options are generated.
 */
export function createCommandConfig<const C extends LocaleCommandConfig>(config: ValidatedCommandConfig<C>) {
	// Load locales only once
	if (!_isLoaded) {
		loadLocales()
		_isLoaded = true
	}

	// Validate config
	const localNames = loadLocalNames()
	const descriptionKey = config.descriptionKey
	const pluginConfig = getPluginOptions(join('@robojs', 'i18n')) as PluginConfig
	const defaultLocale = pluginConfig?.defaultLocale || 'en-US'
	config.description = t(defaultLocale, config.descriptionKey)

	localNames.forEach((locale: string) => {
		if (descriptionKey) {
			const description = t(locale, descriptionKey)
			config.descriptionLocalizations = config.descriptionLocalizations || {}
			config.descriptionLocalizations[locale] = description
		}

		delete config.descriptionKey
	})

	if (config && config.options) {
		config.options.forEach((option) => {
			localNames.forEach((locale: string) => {
				const nameKey = option.nameKey
				const descriptionKey = option.descriptionKey
				const name = t(locale, nameKey)
				const description = t(locale, descriptionKey)

				option.nameLocalizations = option.nameLocalizations || {}
				option.nameLocalizations[locale] = name
				option.descriptionLocalizations = option.descriptionLocalizations || {}
				option.descriptionLocalizations[locale] = description
			})

			// @ts-expect-error - We know these keys exist
			option.description = t(defaultLocale, option.descriptionKey)
			option.name = t(defaultLocale, option.nameKey)

			delete option.nameKey
			delete option.descriptionKey
		})
	}

	i18nLogger.debug('Creating localized command config:', { config })
	return _createCommandConfig(config as unknown as SmartCommandConfig<BaseFromLocale<C>>)
}

/**
 * Formats a localized message by key with **strongly-typed params** inferred from your ICU message.
 *
 * - Supports `LocaleLike`: pass a locale string (`'en-US'`) or any object with `{ locale }` or `{ guildLocale }`.
 * - Accepts **nested params** (e.g., `{ user: { name: 'Robo' } }`) which are auto-flattened to dotted paths.
 * - Handles ICU numbers/plurals/select/date/time; for `{ts, date/time}` the param can be `Date | number`.
 *
 * @typeParam K - A key from your generated `LocaleKey` union.
 * @param locale - A `LocaleLike` (`'en-US'`, `{ locale: 'en-US' }`, or a Discord Interaction/guild context).
 * @param key - A key present in your `/locales` folder (type-safe via `LocaleKey`).
 * @param params - Parameters inferred from the ICU message (`ParamsFor<K>`). Nested objects are allowed.
 * @returns The formatted string for the given locale and key.
 *
 * @example
 * ```ts
 * // /locales/en-US/common.json:
 * // { "hello.user": "Hello {user.name}!" }
 *
 * import { t } from '@robojs/i18n'
 * t('en-US', 'hello.user', { user: { name: 'Robo' } }) // "Hello Robo!"
 * ```
 *
 * @example
 * ```ts
 * // ICU plural:
 * // { "pets.count": "{count, plural, one {# pet} other {# pets}}" }
 * t('en-US', 'pets.count', { count: 1 }) // "1 pet"
 * t('en-US', 'pets.count', { count: 3 }) // "3 pets"
 * ```
 *
 * @example
 * ```ts
 * // Date/time:
 * // { "when.run": "Ran at {ts, time, short} on {ts, date, medium}" }
 * t('en-US', 'when.run', { ts: Date.now() })
 * ```
 *
 * @example
 * ```ts
 * // Using a Discord interaction object (has {locale} or {guildLocale}):
 * export default (interaction: ChatInputCommandInteraction) => {
 *   return t(interaction, 'hello.user', { user: { name: interaction.user.username } })
 * }
 * ```
 *
 * @throws If the locale is unknown (no `/locales/<locale>` loaded) or the key is missing in that locale.
 * @remarks
 * - You can also pass dotted keys directly: `t('en-US', 'hello.user', { 'user.name': 'Robo' })`.
 * - If different locales disagree on a param’s kind, the generator safely widens the param type.
 */
export function t<K extends LocaleKey>(locale: LocaleLike, key: K, params?: ParamsFor<K>): string {
	const localeValues = State.get<Record<string, Record<string, string>>>('localeValues', {
		namespace: '@robojs/i18n'
	})

	// This function should return the translation for the given locale and key.
	// For now, we will just return a placeholder string.
	const localeStr = getLocale(locale)
	const values = localeValues[localeStr]
	if (!values) {
		throw new Error(`Locale "${localeStr}" not found`)
	}
	const translation = values[key]
	if (!translation) {
		throw new Error(`Translation for key "${key}" not found in locale "${localeStr}"`)
	}

	if (params) {
		const flat = flattenParams(params as Record<string, unknown>)
		const safeMsg = sanitizeDottedArgs(translation)
		const safeValues = mapKeysToSanitized(flat)
		const formatter = getFormatter(localeStr, String(key), safeMsg)

		return formatter.format(safeValues) as string
	}

	return translation
}

/**
 * `tr` — a **strict** version of `t`:
 * - Works the same as {@link t} but **requires** that all message parameters are provided and non-undefined.
 * - If the target key has **no parameters**, `tr` does **not** require a params object.
 * - Supports nested objects (auto-flattened), dotted placeholders, and uses the same formatter cache.
 *
 * @typeParam K - A key from your generated `LocaleKey` union.
 * @param locale - A `LocaleLike` (`'en-US'`, `{ locale: 'en-US' }`, or a Discord Interaction/guild context).
 * @param key - A key present in your locales.
 * @param args - If the key expects params, pass a single object whose type is {@link StrictParamsFor} of `K`;
 *               otherwise omit this argument entirely.
 * @returns The formatted string for the given locale and key.
 *
 * @example
 * ```ts
 * // /locales/en-US/common.json:
 * // { "hello.user": "Hello {user.name}!" }
 *
 * import { tr } from '@robojs/i18n'
 * tr('en-US', 'hello.user', { user: { name: 'Robo' } }) // OK
 *
 * // ❌ Compile-time error: 'user.name' is required via StrictParamsFor
 * // tr('en-US', 'hello.user', { user: {} })
 * ```
 *
 * @example
 * ```ts
 * // /locales/en-US/common.json:
 * // { "ping": "Pong!" }   // no params
 *
 * tr('en-US', 'ping')            // OK: no params required
 * // tr('en-US', 'ping', {})     // Also OK, but unnecessary
 * ```
 *
 * @example
 * ```ts
 * // Plural example:
 * // { "pets.count": "{count, plural, one {# pet} other {# pets}}" }
 *
 * tr('en-US', 'pets.count', { count: 3 }) // OK
 *
 * // ❌ Compile-time error: 'count' required in StrictParamsFor<'pets.count'>
 * // tr('en-US', 'pets.count')
 * ```
 */
export function tr<K extends LocaleKey>(locale: LocaleLike, key: K, ...args: MaybeArgs<K>): string {
	return t(locale, key, args[0] as ParamsFor<K>)
}

/**
 * Binds a `LocaleLike` to produce a curried translator.
 *
 * - **Loose mode (default):** returns a `t$` that accepts optional params based on `ParamsFor<K>`.
 * - **Strict mode:** pass `{ strict: true }` to return a `tr$` that **requires** all params
 *   for keys that have any (using your `MaybeArgs<K>` tuple).
 *
 * Overloads:
 * - `withLocale(local)` → `<K>(key: K, params?: ParamsFor<K>) => string`
 * - `withLocale(local, { strict: true })` → `<K>(key: K, ...args: MaybeArgs<K>) => string`
 *
 * @param local A `LocaleLike` (string, `{ locale }`, `{ guildLocale }`, or a Discord Interaction).
 * @param options Optional `{ strict: true }` to get the strict variant.
 *
 * @example
 * ```ts
 * // Loose (default): params optional when message has params
 * const t$ = withLocale('en-US')
 * t$('hello.user', { user: { name: 'Robo' } })
 * t$('ping') // key with no params
 * ```
 *
 * @example
 * ```ts
 * // Strict: params required when message has params
 * const tr$ = withLocale('en-US', { strict: true })
 * tr$('hello.user', { user: { name: 'Robo' } })  // ✅ required
 * // tr$('hello.user')                           // ❌ compile-time error
 * tr$('ping')                                    // ✅ key with no params
 * ```
 */
export function withLocale(local: LocaleLike): <K extends LocaleKey>(key: K, params?: ParamsFor<K>) => string
export function withLocale(
	local: LocaleLike,
	opts: { strict: true }
): <K extends LocaleKey>(key: K, ...args: MaybeArgs<K>) => string
export function withLocale(local: LocaleLike, opts?: { strict?: boolean }) {
	if (opts?.strict) {
		// strict delegate (uses `tr`)
		return <K extends LocaleKey>(key: K, ...args: MaybeArgs<K>) => tr(local, key, ...args)
	}
	// loose delegate (uses `t`)
	return <K extends LocaleKey>(key: K, params?: ParamsFor<K>) => t(local, key, params)
}
