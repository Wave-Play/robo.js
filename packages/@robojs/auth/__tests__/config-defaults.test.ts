import { describe, expect, it } from '@jest/globals'
import { normalizeAuthOptions } from '../src/config/defaults.js'

describe('normalizeAuthOptions', () => {
	it('defaults appName to Robo.js', () => {
		const result = normalizeAuthOptions({})
		expect(result.appName).toBe('Robo.js')
	})

	it('respects custom appName', () => {
		const result = normalizeAuthOptions({ appName: 'Guild Portal' })
		expect(result.appName).toBe('Guild Portal')
	})
})
