import { describe, expect, test } from 'tstyche'
import type { LocaleKey } from '../.robo/generated/types'

describe('LocaleKey coverage', () => {
	test('Known keys exist', () => {
		expect<'shared/common:hello'>().type.toBeAssignableTo<LocaleKey>()
		expect<'shared/common:pets.count'>().type.toBeAssignableTo<LocaleKey>()
		expect<'shared/common:when.run'>().type.toBeAssignableTo<LocaleKey>()
		expect<'shared/common:array'>().type.toBeAssignableTo<LocaleKey>()
		expect<'commands:hey'>().type.toBeAssignableTo<LocaleKey>()
		expect<'commands:ping.name'>().type.toBeAssignableTo<LocaleKey>()
		expect<'commands:ping.desc'>().type.toBeAssignableTo<LocaleKey>()
		expect<'commands:ping.arg.name'>().type.toBeAssignableTo<LocaleKey>()
		expect<'commands:ping.arg.desc'>().type.toBeAssignableTo<LocaleKey>()
	})

	test('Unknown keys are not present', () => {
		expect<'shared/common:missing'>().type.not.toBeAssignableTo<LocaleKey>()
		expect<'foo:bar'>().type.not.toBeAssignableTo<LocaleKey>()
	})
})
