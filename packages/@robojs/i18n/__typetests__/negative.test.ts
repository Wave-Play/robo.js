import { describe, expect, test } from 'tstyche'
import { t, tr } from '../.robo/build/core/lib'

describe('Negative edges', () => {
	test('Unknown key at callsite is a type error', () => {
		expect(t('en-US', 'shared/common:__nope__')).type.toRaiseError()
		expect(tr('en-US', 'commands:__nope__')).type.toRaiseError()
	})

	test('Wrong param kinds', () => {
		expect(t('en-US', 'shared/common:hello', { name: 123, randomNumber: 1 })).type.toRaiseError()
		expect(t('en-US', 'shared/common:pets.count', { count: 'x' })).type.toRaiseError()
	})

	test('Excess nested props rejected', () => {
		expect(tr('en-US', 'commands:hey', { user: { name: 'Robo', extra: true } })).type.toRaiseError()
	})

	test('No-param key rejects args (excess property check)', () => {
		expect(tr('en-US', 'commands:ping.name', { oops: 1 })).type.toRaiseError()
	})
})
