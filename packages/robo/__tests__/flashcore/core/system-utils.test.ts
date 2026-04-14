/** Phase 2: Core Unit Tests - System Utilities */

import { ensureInitialized } from '../../../src/flashcore/core/system-utils.js'
import { FlashcoreError } from '../../../src/flashcore/core/errors.js'

describe('ensureInitialized', () => {
	const mockAdapter = {
		get: async () => {},
		set: async () => true,
		delete: async () => true,
		has: async () => false,
		clear: async () => {}
	}

	it('should throw FlashcoreError with code NOT_INITIALIZED when initialized=false and adapter=null', () => {
		expect(() => ensureInitialized(false, null)).toThrow(FlashcoreError)
		try {
			ensureInitialized(false, null)
		} catch (e) {
			expect(e).toBeInstanceOf(FlashcoreError)
			expect((e as FlashcoreError).code).toBe('NOT_INITIALIZED')
		}
	})

	it('should throw when initialized=false even with valid adapter object', () => {
		expect(() => ensureInitialized(false, mockAdapter as any)).toThrow(FlashcoreError)
	})

	it('should throw when adapter=null even with initialized=true', () => {
		expect(() => ensureInitialized(true, null)).toThrow(FlashcoreError)
	})

	it('should NOT throw when initialized=true AND adapter is a valid object', () => {
		expect(() => ensureInitialized(true, mockAdapter as any)).not.toThrow()
	})

	it('should have an error message containing "init()"', () => {
		try {
			ensureInitialized(false, null)
			fail('Expected an error to be thrown')
		} catch (e) {
			expect((e as FlashcoreError).message).toContain('init()')
		}
	})
})
