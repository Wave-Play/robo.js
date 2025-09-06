import { describe, expect, test } from 'tstyche'
import { createCommandConfig } from '../.robo/build/core/lib'
import type { CommandOptions } from 'robo.js'

describe('createCommandConfig — CommandOptions typing from options', () => {
	test('Optional option → value type is string | undefined', () => {
		const cfg = createCommandConfig({
			nameKey: 'commands:ping.name',
			descriptionKey: 'commands:ping.desc',
			options: [
				{
					type: 'string',
					name: 'text',
					nameKey: 'commands:ping.arg.name',
					descriptionKey: 'commands:ping.arg.desc'
				}
			]
		} as const)

		type Opts = CommandOptions<typeof cfg>
		expect<Opts>().type.toHaveProperty('text')
		expect<Pick<Opts, 'text'>>().type.toBe<{ text: string | undefined }>()
	})

	test('required:true → value type is exactly string (no undefined)', () => {
		const cfg = createCommandConfig({
			nameKey: 'commands:ping.name',
			descriptionKey: 'commands:ping.desc',
			options: [
				{
					type: 'string',
					name: 'text',
					nameKey: 'commands:ping.arg.name',
					descriptionKey: 'commands:ping.arg.desc',
					required: true
				}
			]
		} as const)

		type Opts = CommandOptions<typeof cfg>
		expect<Opts>().type.toHaveProperty('text')
		type TextVal = Pick<Opts, 'text'>
		expect<TextVal>().type.toBe<{ text: string }>()
		expect<TextVal>().type.not.toBeAssignableWith<undefined>()
		expect<Opts>().type.not.toHaveProperty('missing')
	})

	test('Omitting option.name is a type error (inference requires it)', () => {
		expect(
			createCommandConfig({
				nameKey: 'commands:ping.name',
				descriptionKey: 'commands:ping.desc',
				options: [
					{
						type: 'string',
						// name missing on purpose
						nameKey: 'commands:ping.arg.name',
						descriptionKey: 'commands:ping.arg.desc'
					}
				]
			} as const)
		).type.toRaiseError()
	})
})
