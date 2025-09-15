import { describe, expect, test } from 'tstyche'
import type { LocaleKey } from '../.robo/generated/types'

describe('LocaleKey coverage', () => {
	test('Known keys exist', () => {
		expect<LocaleKey>().type.toBeAssignableWith<'shared/common:hello'>()
		expect<LocaleKey>().type.toBeAssignableWith<'shared/common:pets.count'>()
		expect<LocaleKey>().type.toBeAssignableWith<'shared/common:when.run'>()
		expect<LocaleKey>().type.toBeAssignableWith<'shared/common:array'>()
		expect<LocaleKey>().type.toBeAssignableWith<'commands:hey'>()
		expect<LocaleKey>().type.toBeAssignableWith<'commands:ping.name'>()
		expect<LocaleKey>().type.toBeAssignableWith<'commands:ping.desc'>()
		expect<LocaleKey>().type.toBeAssignableWith<'commands:ping.arg.name'>()
		expect<LocaleKey>().type.toBeAssignableWith<'commands:ping.arg.desc'>()
	})

	test('Unknown keys are not present', () => {
		expect<LocaleKey>().type.not.toBeAssignableWith<'shared/common:missing'>()
		expect<LocaleKey>().type.not.toBeAssignableWith<'foo:bar'>()
	})
})
