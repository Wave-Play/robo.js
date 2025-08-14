// @ts-expect-error - This is a generated file
import type { Locale, LocaleKey } from '../../generated/types'
import { State } from 'robo.js'

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

export function t(locale: LocaleLike, key: LocaleKey) {
	const localeValues = State.get<Map<string, Record<string, string>>>('localeValues', {
		namespace: '@robojs/i18n'
	})
	// This function should return the translation for the given locale and key.
	// For now, we will just return a placeholder string.
	const localeStr = getLocale(locale)
	const values = localeValues.get(localeStr)
	if (!values) {
		throw new Error(`Locale "${localeStr}" not found`)
	}
	const translation = values[key]
	if (!translation) {
		throw new Error(`Translation for key "${key}" not found in locale "${localeStr}"`)
	}
	return translation
}

function getLocale(input: Locale): Locale
function getLocale(input: { locale: string } | { guildLocale: string }): string
function getLocale(input: LocaleLike): string
function getLocale(input: LocaleLike): string {
	if (typeof input === 'string') return input
	if ('locale' in input && typeof input.locale === 'string') return input.locale
	if ('guildLocale' in input && typeof input.guildLocale === 'string') {
		return input.guildLocale
	}
	throw new TypeError('Invalid LocaleLike')
}
