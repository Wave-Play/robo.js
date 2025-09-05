import { describe, expect, test } from 'tstyche'
import { t, tr, withLocale } from '../.robo/build/core/lib'
import type { MaybeArgs, StrictParamsFor } from '../.robo/build/core/types'

describe('t() (loose) and tr() (strict) enforcement', () => {
	test('t(): params optional but checked; excess props rejected (via excess property checks)', () => {
		const ok1 = t('en-US', 'shared/common:hello', { name: 'X', randomNumber: 1 })
		expect<typeof ok1>().type.toBe<string>()

		// Missing params is OK in loose mode (they’re optional types)
		const ok2 = t('en-US', 'shared/common:hello')
		expect<typeof ok2>().type.toBe<string>()

		// Excess property fails (object-literal excess property checks)
		expect(t('en-US', 'shared/common:hello', { name: 'X', randomNumber: 2, oops: true })).type.toRaiseError()

		// Wrong kind for :number
		expect(t('en-US', 'shared/common:pets.count', { count: '3' })).type.toRaiseError()
	})

	test('tr(): params required when present; kinds enforced', () => {
		// Missing any required param → error
		expect(tr('en-US', 'shared/common:hello', { name: 'X' })).type.toRaiseError()
		// Correct full shape OK
		const ok = tr('en-US', 'shared/common:hello', { name: 'X', randomNumber: 42 })
		expect<typeof ok>().type.toBe<string>()

		// Date/time must be Date | number
		expect(tr('en-US', 'shared/common:when.run', { ts: '2020-01-01' })).type.toRaiseError()
	})

	test('Keys with no params require none in strict mode', () => {
		const ok = tr('en-US', 'commands:ping.name')
		expect<typeof ok>().type.toBe<string>()

		// Passing params for a no-param key should fail (excess property)
		expect(tr('en-US', 'commands:ping.name', {} as StrictParamsFor<'commands:hey'>)).type.toRaiseError()
	})

	test('withLocale: loose vs strict currying', () => {
		const t$ = withLocale('en-US')
		const a = t$('shared/common:hello', { name: 'A', randomNumber: 1 })
		const b = t$('shared/common:hello')
		expect<typeof a>().type.toBe<string>()
		expect<typeof b>().type.toBe<string>()

		const tr$ = withLocale('en-US', { strict: true })
		// Missing params → error (strict)
		expect(tr$('shared/common:hello')).type.toRaiseError()
		// Wrong shape nested → error
		expect(tr$('commands:hey', { user: {} })).type.toRaiseError()
		// Correct nested shape OK
		const ok = tr$('commands:hey', { user: { name: 'Pk' } })
		expect<typeof ok>().type.toBe<string>()
	})

	test('MaybeArgs<K> behavior', () => {
		// Key with params → single-element tuple containing StrictParamsFor<K>
		type M1 = MaybeArgs<'shared/common:hello'>
		expect<M1>().type.toBe<[StrictParamsFor<'shared/common:hello'>]>()

		// Key with NO params → empty tuple
		type M2 = MaybeArgs<'commands:ping.name'>
		expect<M2>().type.toBe<[]>()
	})
})
