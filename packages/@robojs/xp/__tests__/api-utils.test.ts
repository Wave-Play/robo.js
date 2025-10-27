/**
 * Unit tests for API utility functions
 * Tests validation, error handling, and request processing utilities
 */

import { describe, test, expect } from '@jest/globals'
import {
	validateAmount,
	validateSnowflake,
	validateUserId,
	success,
	ERROR_CODES,
	validateMethod
} from '../src/api/xp/utils.js'

// ============================================================================
// Test Suite: validateAmount
// ============================================================================

describe('validateAmount', () => {
	test('accepts positive integers', () => {
		expect(validateAmount(1)).toEqual({ valid: true })
		expect(validateAmount(100)).toEqual({ valid: true })
		expect(validateAmount(1000000)).toEqual({ valid: true })
	})

	test('accepts positive decimals', () => {
		expect(validateAmount(1.5)).toEqual({ valid: true })
		expect(validateAmount(99.99)).toEqual({ valid: true })
	})

	test('rejects 0', () => {
		const result = validateAmount(0)
		expect(result.valid).toBe(false)
		expect(result.error).toBe('Amount must be positive')
	})

	test('rejects negative numbers', () => {
		const result1 = validateAmount(-1)
		expect(result1.valid).toBe(false)
		expect(result1.error).toBe('Amount must be positive')

		const result2 = validateAmount(-100)
		expect(result2.valid).toBe(false)
	})

	test('rejects NaN', () => {
		const result = validateAmount(NaN)
		expect(result.valid).toBe(false)
		expect(result.error).toBe('Amount must be a number')
	})

	test('rejects Infinity', () => {
		const result = validateAmount(Infinity)
		expect(result.valid).toBe(false)
		expect(result.error).toBe('Amount must be positive')
	})

	test('rejects non-numbers', () => {
		const result1 = validateAmount('100')
		expect(result1.valid).toBe(false)
		expect(result1.error).toBe('Amount must be a number')

		const result2 = validateAmount(null)
		expect(result2.valid).toBe(false)

		const result3 = validateAmount(undefined)
		expect(result3.valid).toBe(false)

		const result4 = validateAmount({})
		expect(result4.valid).toBe(false)
	})
})

// ============================================================================
// Test Suite: validateSnowflake
// ============================================================================

describe('validateSnowflake', () => {
	test('accepts valid 18-digit snowflakes', () => {
		expect(validateSnowflake('123456789012345678')).toBe(true)
	})

	test('accepts valid 19-digit snowflakes', () => {
		expect(validateSnowflake('1234567890123456789')).toBe(true)
	})

	test('accepts valid 17-digit snowflakes', () => {
		expect(validateSnowflake('12345678901234567')).toBe(true)
	})

	test('rejects 16-digit strings (too short)', () => {
		expect(validateSnowflake('1234567890123456')).toBe(false)
	})

	test('rejects 20-digit strings (too long)', () => {
		expect(validateSnowflake('12345678901234567890')).toBe(false)
	})

	test('rejects non-numeric strings', () => {
		expect(validateSnowflake('abc')).toBe(false)
		expect(validateSnowflake('user123')).toBe(false)
	})

	test('rejects empty strings', () => {
		expect(validateSnowflake('')).toBe(false)
	})

	test('rejects strings with spaces or special characters', () => {
		expect(validateSnowflake('123 456 789 012 345 678')).toBe(false)
		expect(validateSnowflake('123-456-789-012-345-678')).toBe(false)
	})
})

// ============================================================================
// Test Suite: validateUserId
// ============================================================================

describe('validateUserId', () => {
	test('accepts valid snowflake strings', () => {
		const result = validateUserId('123456789012345678')
		expect(result.valid).toBe(true)
	})

	test('rejects non-string values (number)', () => {
		const result = validateUserId(123456789012345678)
		expect(result.valid).toBe(false)
		expect(result.error).toBe('User ID must be a string')
	})

	test('rejects non-string values (null)', () => {
		const result = validateUserId(null)
		expect(result.valid).toBe(false)
		expect(result.error).toBe('User ID must be a string')
	})

	test('rejects non-string values (undefined)', () => {
		const result = validateUserId(undefined)
		expect(result.valid).toBe(false)
		expect(result.error).toBe('User ID must be a string')
	})

	test('rejects invalid snowflakes (too short)', () => {
		const result = validateUserId('1234567890123456')
		expect(result.valid).toBe(false)
		expect(result.error).toBe('User ID must be a valid Discord snowflake')
	})

	test('rejects invalid snowflakes (non-numeric)', () => {
		const result = validateUserId('user123')
		expect(result.valid).toBe(false)
		expect(result.error).toBe('User ID must be a valid Discord snowflake')
	})
})

// ============================================================================
// Test Suite: success
// ============================================================================

describe('success', () => {
	test('creates success response with correct structure', () => {
		const response = success({ foo: 'bar' })
		expect(response.success).toBe(true)
		expect(response.data).toEqual({ foo: 'bar' })
	})

	test('works with different data types (object)', () => {
		const response = success({ key: 'value' })
		expect(response.success).toBe(true)
		expect(response.data).toEqual({ key: 'value' })
	})

	test('works with different data types (array)', () => {
		const response = success([1, 2, 3])
		expect(response.success).toBe(true)
		expect(response.data).toEqual([1, 2, 3])
	})

	test('works with different data types (string)', () => {
		const response = success('hello')
		expect(response.success).toBe(true)
		expect(response.data).toBe('hello')
	})

	test('works with different data types (number)', () => {
		const response = success(42)
		expect(response.success).toBe(true)
		expect(response.data).toBe(42)
	})

	test('preserves data structure (no mutation)', () => {
		const data = { nested: { value: 123 } }
		const response = success(data)
		expect(response.data).toEqual(data)
		expect(response.data).toBe(data) // Same reference
	})
})

// ============================================================================
// Test Suite: ERROR_CODES
// ============================================================================

describe('ERROR_CODES', () => {
	test('all error codes are defined as constants', () => {
		expect(typeof ERROR_CODES.MISSING_GUILD_ID).toBe('string')
		expect(typeof ERROR_CODES.GUILD_NOT_FOUND).toBe('string')
		expect(typeof ERROR_CODES.MISSING_USER_ID).toBe('string')
		expect(typeof ERROR_CODES.USER_NOT_FOUND).toBe('string')
		expect(typeof ERROR_CODES.METHOD_NOT_ALLOWED).toBe('string')
		expect(typeof ERROR_CODES.INVALID_REQUEST).toBe('string')
		expect(typeof ERROR_CODES.INVALID_AMOUNT).toBe('string')
		expect(typeof ERROR_CODES.INVALID_CONFIG).toBe('string')
		expect(typeof ERROR_CODES.INVALID_LEVEL).toBe('string')
		expect(typeof ERROR_CODES.INVALID_ROLE_ID).toBe('string')
		expect(typeof ERROR_CODES.INVALID_MULTIPLIER).toBe('string')
		expect(typeof ERROR_CODES.DUPLICATE_REWARD).toBe('string')
		expect(typeof ERROR_CODES.REWARD_NOT_FOUND).toBe('string')
		expect(typeof ERROR_CODES.INTERNAL_ERROR).toBe('string')
	})

	test('error codes are unique (no duplicates)', () => {
		const values = Object.values(ERROR_CODES)
		const uniqueValues = new Set(values)
		expect(values.length).toBe(uniqueValues.size)
	})

	test('error codes follow naming convention (UPPER_SNAKE_CASE)', () => {
		for (const [key, value] of Object.entries(ERROR_CODES)) {
			// Check key follows UPPER_SNAKE_CASE
			expect(key).toMatch(/^[A-Z_]+$/)
			// Check value matches key
			expect(value).toBe(key)
		}
	})
})

// ============================================================================
// Test Suite: validateMethod
// ============================================================================

describe('validateMethod', () => {
	// Mock request helper
	function createMockRequest(method: string): any {
		return { method }
	}

	test('passes when method in allowed list', () => {
		const request = createMockRequest('GET')
		expect(() => validateMethod(request, ['GET', 'POST'])).not.toThrow()
	})

	test('throws METHOD_NOT_ALLOWED when method not allowed', () => {
		const request = createMockRequest('DELETE')
		let thrownError: any
		try {
			validateMethod(request, ['GET', 'POST'])
		} catch (error) {
			thrownError = error
		}
		expect(thrownError).toBeDefined()
		expect(thrownError.code).toBe(ERROR_CODES.METHOD_NOT_ALLOWED)
		expect(thrownError.message).toMatch(/Method DELETE not allowed/)
	})

	test('attaches allowedMethods to error object', () => {
		const request = createMockRequest('DELETE')
		let thrownError: any
		try {
			validateMethod(request, ['GET', 'POST'])
		} catch (error) {
			thrownError = error
		}
		expect(thrownError).toBeDefined()
		expect(thrownError.allowedMethods).toEqual(['GET', 'POST'])
	})

	test('validates multiple allowed methods', () => {
		const request1 = createMockRequest('GET')
		const request2 = createMockRequest('POST')
		const request3 = createMockRequest('PUT')

		expect(() => validateMethod(request1, ['GET', 'POST', 'PUT', 'DELETE'])).not.toThrow()
		expect(() => validateMethod(request2, ['GET', 'POST', 'PUT', 'DELETE'])).not.toThrow()
		expect(() => validateMethod(request3, ['GET', 'POST', 'PUT', 'DELETE'])).not.toThrow()
	})
})
