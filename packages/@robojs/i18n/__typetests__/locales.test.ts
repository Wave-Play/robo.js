import { describe, expect, test } from 'tstyche'
import type { Locale } from '../.robo/generated/types'
import type { LocaleLike } from '../.robo/build/core/types'

describe('Locales & LocaleLike', () => {
	test('Locale includes shipped tags', () => {
		expect<'en-US'>().type.toBeAssignableTo<Locale>()
		expect<'es-ES'>().type.toBeAssignableTo<Locale>()
		expect<'fr'>().type.toBeAssignableTo<Locale>()
	})

	test('Unknown plain string is not a Locale', () => {
		expect<'de-DE'>().type.not.toBeAssignableTo<Locale>()
	})

	test('LocaleLike accepts string or objects with locale/guildLocale', () => {
		expect<'en-US'>().type.toBeAssignableTo<LocaleLike>()
		expect<{ locale: 'en-US' }>().type.toBeAssignableTo<LocaleLike>()
		expect<{ guildLocale: 'fr' }>().type.toBeAssignableTo<LocaleLike>()
	})

	test('LocaleLike intentionally allows dynamic strings inside objects', () => {
		expect<{ locale: 'de-DE' }>().type.toBeAssignableTo<LocaleLike>()
	})
})
