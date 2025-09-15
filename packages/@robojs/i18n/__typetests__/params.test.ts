import { describe, expect, test } from 'tstyche'
import type { ParamsFor } from '../.robo/generated/types'
import type { StrictParamsFor } from '../.robo/build/core/types'

describe('MF2 inference → ParamsFor & StrictParamsFor', () => {
	test('shared/common:hello → {$name, $randomNumber :integer}', () => {
		type P = ParamsFor<'shared/common:hello'>
		type Name = Pick<P, 'name'>
		type Random = Pick<P, 'randomNumber'>
		expect<Name>().type.toBe<{ name?: string }>()
		expect<Random>().type.toBe<{ randomNumber?: number }>()

		type S = StrictParamsFor<'shared/common:hello'>
		type SName = Pick<S, 'name'>
		type SRandom = Pick<S, 'randomNumber'>
		expect<SName>().type.toBe<{ name: string }>()
		expect<SRandom>().type.toBe<{ randomNumber: number }>()
	})

	test('shared/common:pets.count → {$count :number}', () => {
		type P = ParamsFor<'shared/common:pets.count'>
		type Count = Pick<P, 'count'>
		expect<Count>().type.toBe<{ count?: number }>()

		type S = StrictParamsFor<'shared/common:pets.count'>
		type SCount = Pick<S, 'count'>
		expect<SCount>().type.toBe<{ count: number }>()
	})

	test('shared/common:when.run → {$ts :time + :date}', () => {
		type P = ParamsFor<'shared/common:when.run'>
		type TS = Pick<P, 'ts'>
		expect<TS>().type.toBe<{ ts?: Date | number }>()

		type S = StrictParamsFor<'shared/common:when.run'>
		type STS = Pick<S, 'ts'>
		expect<STS>().type.toBe<{ ts: Date | number }>()
	})

	test('commands:hey → {$user.name :string} (nested object)', () => {
		type P = ParamsFor<'commands:hey'>
		type User = Pick<P, 'user'>
		expect<User>().type.toBe<{ user?: { name?: string } }>()

		type S = StrictParamsFor<'commands:hey'>
		type SUser = Pick<S, 'user'>
		expect<SUser>().type.toBe<{ user: { name: string } }>()
	})

	test('shared/common:array collects params across items', () => {
		type P = ParamsFor<'shared/common:array'>
		type Num = Pick<P, 'num'>
		type DateParam = Pick<P, 'date'>
		expect<Num>().type.toBe<{ num?: number }>()
		expect<DateParam>().type.toBe<{ date?: Date | number }>()
	})
})
