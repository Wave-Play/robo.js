/**
 * Flashcore v1 (spec rev 4.3) Phase 0 Tests - SafeKeyEncoder
 *
 * Tests key encoding, roundtrip stability, special characters.
 */

import {
	SafeKeyEncoder,
	safeKeyEncoder,
	encodeKey,
	decodeKey,
	encodeUniqueValue,
	decodeUniqueValue,
	needsEncoding
} from '../helpers/flashcore-compat.js'

describe('SafeKeyEncoder', () => {
	describe('needsEncoding', () => {
		it('should return false for safe keys', () => {
			expect(needsEncoding('simple')).toBe(false)
			expect(needsEncoding('user:123')).toBe(false)
			expect(needsEncoding('model/v1')).toBe(false)
			expect(needsEncoding('test_key-123')).toBe(false)
			expect(needsEncoding('file.txt')).toBe(false)
		})

		it('should return true for unsafe keys', () => {
			expect(needsEncoding('key with spaces')).toBe(true)
			expect(needsEncoding('emoji🎉')).toBe(true)
			expect(needsEncoding('special!@#')).toBe(true)
			expect(needsEncoding('日本語')).toBe(true)
			expect(needsEncoding('path\\backslash')).toBe(true)
		})
	})

	describe('encodeKey / decodeKey', () => {
		it('should handle simple keys without namespace', () => {
			const key = 'simple-key'
			const encoded = encodeKey([], key)
			const decoded = decodeKey(encoded)

			expect(decoded.namespace).toEqual([])
			expect(decoded.key).toBe(key)
		})

		it('should handle keys with single namespace', () => {
			const namespace = ['users']
			const key = 'profile'
			const encoded = encodeKey(namespace, key)
			const decoded = decodeKey(encoded)

			expect(decoded.namespace).toEqual(namespace)
			expect(decoded.key).toBe(key)
		})

		it('should handle keys with multiple namespace segments', () => {
			const namespace = ['app', 'users', 'settings']
			const key = 'theme'
			const encoded = encodeKey(namespace, key)
			const decoded = decodeKey(encoded)

			expect(decoded.namespace).toEqual(namespace)
			expect(decoded.key).toBe(key)
		})

		it('should encode keys with special characters', () => {
			const key = 'key with spaces!'
			const encoded = encodeKey([], key)

			// Should use _e: prefix for encoded keys
			expect(encoded.startsWith('_e:')).toBe(true)

			const decoded = decodeKey(encoded)
			expect(decoded.key).toBe(key)
		})

		it('should handle unicode characters', () => {
			const namespace = ['i18n']
			const key = '日本語キー'
			const encoded = encodeKey(namespace, key)
			const decoded = decodeKey(encoded)

			expect(decoded.namespace).toEqual(namespace)
			expect(decoded.key).toBe(key)
		})

		it('should handle emoji', () => {
			const key = 'reaction:👍:123'
			const encoded = encodeKey(['messages'], key)
			const decoded = decodeKey(encoded)

			expect(decoded.namespace).toEqual(['messages'])
			expect(decoded.key).toBe(key)
		})

		it('should roundtrip all test cases', () => {
			const testCases = [
				{ namespace: [], key: 'simple' },
				{ namespace: ['ns'], key: 'key' },
				{ namespace: ['a', 'b', 'c'], key: 'd' },
				{ namespace: [], key: 'with spaces' },
				{ namespace: ['日本'], key: '語' },
				{ namespace: [], key: 'emoji:🎉:test' },
				{ namespace: ['mixed'], key: 'key:with:colons' }
			]

			for (const testCase of testCases) {
				const encoded = encodeKey(testCase.namespace, testCase.key)
				const decoded = decodeKey(encoded)

				expect(decoded.namespace).toEqual(testCase.namespace)
				expect(decoded.key).toBe(testCase.key)
			}
		})
	})

	describe('encodeUniqueValue / decodeUniqueValue', () => {
		it('should encode safe strings with tilde prefix', () => {
			const value = 'simple-string'
			const encoded = encodeUniqueValue(value)

			expect(encoded.startsWith('~')).toBe(true)

			const decoded = decodeUniqueValue(encoded)
			expect(decoded).toBe(value)
		})

		it('should encode numbers with tilde prefix', () => {
			const value = 12345
			const encoded = encodeUniqueValue(value)

			expect(encoded).toBe('~12345')

			const decoded = decodeUniqueValue(encoded)
			expect(decoded).toBe(value)
		})

		it('should encode booleans with tilde prefix', () => {
			expect(encodeUniqueValue(true)).toBe('~true')
			expect(encodeUniqueValue(false)).toBe('~false')

			expect(decodeUniqueValue('~true')).toBe(true)
			expect(decodeUniqueValue('~false')).toBe(false)
		})

		it('should encode objects as base64 JSON', () => {
			const value = { name: 'test', count: 5 }
			const encoded = encodeUniqueValue(value)

			// Should not have tilde prefix (encoded as JSON)
			expect(encoded.startsWith('~')).toBe(false)

			const decoded = decodeUniqueValue(encoded)
			expect(decoded).toEqual(value)
		})

		it('should encode arrays as base64 JSON', () => {
			const value = [1, 2, 3, 'test']
			const encoded = encodeUniqueValue(value)

			const decoded = decodeUniqueValue(encoded)
			expect(decoded).toEqual(value)
		})

		it('should handle null', () => {
			const encoded = encodeUniqueValue(null)
			const decoded = decodeUniqueValue(encoded)
			expect(decoded).toBeNull()
		})

		it('should encode strings with special characters', () => {
			const value = 'email@example.com with spaces!'
			const encoded = encodeUniqueValue(value)

			// Should be base64 encoded (contains unsafe chars)
			expect(encoded.startsWith('~')).toBe(false)

			const decoded = decodeUniqueValue(encoded)
			expect(decoded).toBe(value)
		})

		it('should roundtrip various types', () => {
			const testCases = [
				'simple',
				123,
				true,
				false,
				null,
				{ nested: { value: 1 } },
				[1, 'two', { three: 3 }],
				'unicode:日本語',
				0,
				-123,
				3.14159
			]

			for (const value of testCases) {
				const encoded = encodeUniqueValue(value)
				const decoded = decodeUniqueValue(encoded)
				expect(decoded).toEqual(value)
			}
		})
	})

	describe('SafeKeyEncoder class', () => {
		it('should have VERSION constant', () => {
			expect(SafeKeyEncoder.VERSION).toBe(1)
		})

		it('should provide instance methods', () => {
			const encoder = new SafeKeyEncoder()

			expect(encoder.encode(['ns'], 'key')).toBe(encodeKey(['ns'], 'key'))
			expect(encoder.decode(encoder.encode(['ns'], 'key'))).toEqual({ namespace: ['ns'], key: 'key' })
		})

		it('should export default instance', () => {
			expect(safeKeyEncoder).toBeInstanceOf(SafeKeyEncoder)
		})

		it('should detect encoded keys', () => {
			const encoder = new SafeKeyEncoder()
			const plainKey = 'simple-key'
			const encodedKey = encoder.encode([], 'key with spaces')

			expect(encoder.isEncoded(plainKey)).toBe(false)
			expect(encoder.isEncoded(encodedKey)).toBe(true)
		})
	})

	describe('Encoding stability', () => {
		it('should produce deterministic output', () => {
			const namespace = ['test']
			const key = 'deterministic'

			const encoded1 = encodeKey(namespace, key)
			const encoded2 = encodeKey(namespace, key)
			const encoded3 = encodeKey(namespace, key)

			expect(encoded1).toBe(encoded2)
			expect(encoded2).toBe(encoded3)
		})

		it('should handle edge cases', () => {
			// Empty key
			const emptyDecoded = decodeKey(encodeKey([], ''))
			expect(emptyDecoded.key).toBe('')

			// Empty namespace segment
			const emptyNsDecoded = decodeKey(encodeKey([''], 'key'))
			expect(emptyNsDecoded.namespace).toEqual([''])
		})
	})
})
