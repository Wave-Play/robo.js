import type { CommandOptionTypes } from './commands'

/**
 * Extracts the literal `value` type from a single choice entry.
 * Example: { name: 'Red', value: 'red' } -> 'red'
 */
export type ChoiceValueOf<C> = C extends { value: infer V } ? V : never

/**
 * For an option `K`, produces a union of all `choices[].value` literals.
 * If no choices are declared, results in `never`.
 * Example: choices: [{value:'red'},{value:'blue'}] -> 'red' | 'blue'
 */
export type ChoiceUnionOfOption<K> = K extends { choices: readonly (infer C)[] } ? ChoiceValueOf<C> : never

/**
 * Gets the discriminant "type name" of an option `K`.
 * If `type` is omitted, we default to `'string'` (matching Robo.js behavior).
 */
export type TypeNameOfOption<K> = K extends { type: infer T }
	? T extends keyof CommandOptionTypes
		? T
		: 'string'
	: 'string'

/**
 * Maps an option’s discriminant type to its runtime value via `CommandOptionTypes`.
 * Example: 'user' -> User, 'channel' -> GuildBasedChannel, 'integer' -> number
 */
export type BaseValueOfOption<K> = CommandOptionTypes[TypeNameOfOption<K>]

/**
 * The final value type for an option `K`.
 * - For choosable primitives (`'string' | 'number' | 'integer'`), if choices exist,
 *   we replace the base value with the literal union of `choices[].value`.
 * - For all other types (user, role, channel, etc.), we keep the base value.
 */
export type ValueOfOption<K> = TypeNameOfOption<K> extends 'string' | 'number' | 'integer'
	? [ChoiceUnionOfOption<K>] extends [never]
		? BaseValueOfOption<K>
		: ChoiceUnionOfOption<K>
	: BaseValueOfOption<K>
