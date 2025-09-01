import { describe, expect, test } from 'tstyche'
import { createCommandConfig } from '../.robo/build'
import type { CommandOptions } from 'robo.js'

/**
 * ✅ POSITIVE — with `name: 'text'`, CommandOptions exposes `text?: string`
 */
describe('createCommandConfig — option name infers key', () => {
	const cfgOk = createCommandConfig({
		nameKey: 'commands:ping.name',
		descriptionKey: 'commands:ping.desc',
		options: [
			{
				type: 'string',
				name: 'text', // required for inference of the property key
				nameKey: 'commands:ping.arg.name',
				descriptionKey: 'commands:ping.arg.desc'
			}
		]
	} as const)

	type OptsOk = CommandOptions<typeof cfgOk>

	test('CommandOptions<typeof cfgOk> exposes optional text string', () => {
		// has the property
		expect<OptsOk>().type.toHaveProperty('text')
		// property type is string | undefined
		expect<Pick<OptsOk, 'text'>>().type.toBe<{ text: string | undefined }>()
		// should NOT have an unrelated property
		expect<OptsOk>().type.not.toHaveProperty('missing')
	})
})

/**
 * ❌ NEGATIVE — omitting `name` must fail at the callsite
 */
describe('createCommandConfig — missing option name is an error', () => {
	test('omitting name raises a type error', () => {
		expect(
			createCommandConfig({
				nameKey: 'commands:ping.name',
				descriptionKey: 'commands:ping.desc',
				options: [
					{
						type: 'string',
						// name: "text", // omitted on purpose
						nameKey: 'commands:ping.arg.name',
						descriptionKey: 'commands:ping.arg.desc'
					}
				]
			} as const)
		).type.toRaiseError()
	})
})

/**
 * ✅ POSITIVE — required option makes property required
 * CommandOptions<typeof cfgOk2> is { text: string }
 */
describe('createCommandConfig — required option produces required prop', () => {
	const cfgOk2 = createCommandConfig({
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

	type OptsOk2 = CommandOptions<typeof cfgOk2>

	test('shape is exactly { text: string }', () => {
		expect<OptsOk2>().type.toBe<{ text: string }>()
	})
})
