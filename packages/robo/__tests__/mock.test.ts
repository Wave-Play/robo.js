import { describe, expect, test, jest } from '@jest/globals'

jest.mock('../src/core/logger.js', () => ({
	logger: {
		debug: jest.fn(),
		error: jest.fn(),
		warn: jest.fn()
	}
}))

describe('Test with mock', () => {
	test('should pass', () => {
		expect(true).toBe(true)
	})
})
