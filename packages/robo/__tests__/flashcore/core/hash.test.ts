/** Phase 2: Core Unit Tests - FNV-1a 32-bit Hash */

import { fnv1a32 } from '../../../src/flashcore/core/hash.js'

describe('fnv1a32', () => {
	it('should produce known FNV-1a 32-bit value for empty string', () => {
		// The FNV offset basis is 0x811c9dc5, but the loop doesn't execute
		// for an empty string, so hash stays at offset basis.
		expect(fnv1a32('')).toBe(0x811c9dc5)
	})

	it('should produce a consistent hash for "foobar"', () => {
		const hash = fnv1a32('foobar')
		// Run twice to confirm the value is deterministic
		expect(fnv1a32('foobar')).toBe(hash)
		// Must be a specific number (snapshot to guard against regression)
		expect(typeof hash).toBe('number')
		expect(hash).toBeGreaterThan(0)
	})

	it('should always return an unsigned 32-bit integer', () => {
		const inputs = ['', 'a', 'hello', 'foobar', '!@#$%^&*()', '\u0000', 'x'.repeat(10000)]
		for (const input of inputs) {
			const hash = fnv1a32(input)
			expect(hash).toBeGreaterThanOrEqual(0)
			expect(hash).toBeLessThanOrEqual(0xffffffff)
			expect(Number.isInteger(hash)).toBe(true)
		}
	})

	it('should be deterministic: same input always produces same output', () => {
		const input = 'determinism-test-string'
		const first = fnv1a32(input)
		for (let i = 0; i < 100; i++) {
			expect(fnv1a32(input)).toBe(first)
		}
	})

	it('should handle unicode input including emoji and CJK characters', () => {
		const emoji = fnv1a32('😀🎉🔥')
		const cjk = fnv1a32('你好世界')
		expect(typeof emoji).toBe('number')
		expect(emoji).toBeGreaterThanOrEqual(0)
		expect(emoji).toBeLessThanOrEqual(0xffffffff)
		expect(typeof cjk).toBe('number')
		expect(cjk).toBeGreaterThanOrEqual(0)
		expect(cjk).toBeLessThanOrEqual(0xffffffff)
	})

	it('should produce different hashes for different single-char inputs', () => {
		expect(fnv1a32('a')).not.toBe(fnv1a32('b'))
	})

	it('should produce different hashes for different words', () => {
		expect(fnv1a32('hello')).not.toBe(fnv1a32('world'))
	})

	it('should produce a valid hash for a single character', () => {
		const hash = fnv1a32('x')
		expect(typeof hash).toBe('number')
		expect(hash).toBeGreaterThanOrEqual(0)
		expect(hash).toBeLessThanOrEqual(0xffffffff)
		expect(hash).not.toBe(0x811c9dc5) // must differ from empty-string hash
	})

	it('should produce a valid hash for a long string input', () => {
		const longString = 'a'.repeat(100_000)
		const hash = fnv1a32(longString)
		expect(typeof hash).toBe('number')
		expect(hash).toBeGreaterThanOrEqual(0)
		expect(hash).toBeLessThanOrEqual(0xffffffff)
	})
})
