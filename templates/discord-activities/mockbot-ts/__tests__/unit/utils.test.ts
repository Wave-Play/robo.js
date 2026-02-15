/**
 * Unit Tests
 *
 * Regular Jest tests that don't require the mock server.
 * Demonstrates that standard Jest functionality works alongside mock tests.
 */
import { jest, describe, it, expect } from '@jest/globals'

describe('utility functions', () => {
	it('should work with regular Jest assertions', () => {
		const result = 2 + 2
		expect(result).toBe(4)
	})

	it('should handle async operations', async () => {
		const promise = Promise.resolve('hello')
		await expect(promise).resolves.toBe('hello')
	})

	it('should work with object matchers', () => {
		const activity = {
			name: 'Mock Activity',
			channelId: '123456789',
			type: 'embedded'
		}

		expect(activity).toMatchObject({
			name: expect.any(String),
			type: 'embedded'
		})
	})

	it('should work with array matchers', () => {
		const scopes = ['identify', 'guilds', 'rpc.activities.write']

		expect(scopes).toContain('guilds')
		expect(scopes).toHaveLength(3)
	})

	it('should handle errors correctly', () => {
		const throwError = () => {
			throw new Error('Test error')
		}

		expect(throwError).toThrow('Test error')
	})

	it('should work with mock functions', () => {
		const mockFn = jest.fn()
		mockFn('hello', 'world')

		expect(mockFn).toHaveBeenCalledWith('hello', 'world')
		expect(mockFn).toHaveBeenCalledTimes(1)
	})
})

describe('string utilities', () => {
	it('should match string patterns', () => {
		const message = 'Hello, World!'

		expect(message).toMatch(/Hello/)
		expect(message).toContain('World')
	})

	it('should handle template literals', () => {
		const name = 'Activity'
		const greeting = `Hello, ${name}!`

		expect(greeting).toBe('Hello, Activity!')
	})
})
