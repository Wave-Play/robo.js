import { describe, expect, test } from 'tstyche'
import type { ReturnOf } from '../.robo/generated/types'
import { t } from '../.robo/build/core/lib'

describe('Return types (string vs string[])', () => {
	test('ReturnOf → array key maps to string[]', () => {
		expect<ReturnOf<'shared/common:array'>>().type.toBe<string[]>()
		expect<ReturnOf<'shared/common:hello'>>().type.toBe<string>()
	})

	test('t(): returns string for scalar keys; string[] for array keys', () => {
		const a = t('en-US', 'shared/common:hello', { name: 'Robo', randomNumber: 7 })
		expect<typeof a>().type.toBe<string>()

		const b = t('en-US', 'shared/common:array', { num: 1, date: Date.now() })
		expect<typeof b>().type.toBe<string[]>()
	})
})
