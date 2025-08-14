import { Locale, LocaleKey } from '../.robo/generated/types'

export function t(locale: Locale, key: LocaleKey) {
	// This function should return the translation for the given locale and key.
	// For now, we will just return a placeholder string.
	return `Translation for ${key} in ${locale}`
}
