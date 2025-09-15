import { describe, expect, test } from 'tstyche'
import type { Locale } from '../.robo/generated/types'
import type { LocaleLike } from '../.robo/build/core/types'

describe('Locales & LocaleLike', () => {
	test('Locale includes shipped tags', () => {
		expect<Locale>().type.toBeAssignableWith<'en-US'>()
		expect<Locale>().type.toBeAssignableWith<'es-ES'>()
		expect<Locale>().type.toBeAssignableWith<'fr'>()
	})

	test('Unknown plain string is not a Locale', () => {
		expect<Locale>().type.not.toBeAssignableWith<'de-DE'>()
	})

	test('LocaleLike accepts string or objects with locale/guildLocale', () => {
		expect<LocaleLike>().type.toBeAssignableWith<'en-US'>()
		expect<LocaleLike>().type.toBeAssignableWith<{ locale: 'en-US' }>()
		expect<LocaleLike>().type.toBeAssignableWith<{ guildLocale: 'fr' }>()
	})

	test('LocaleLike intentionally allows dynamic strings inside objects', () => {
		expect<LocaleLike>().type.toBeAssignableWith<{ locale: 'de-DE' }>()
	})
})
