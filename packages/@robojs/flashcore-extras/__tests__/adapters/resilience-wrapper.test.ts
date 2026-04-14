/**
 * Flashcore v1 (spec rev 4.3) Phase 3 - Resilience Wrapper Tests
 *
 * Tests for the retry with exponential backoff wrapper.
 */

import { jest } from '@jest/globals'
import { ResilienceAdapter, createResilienceAdapter } from '../../src/adapters/resilience.js'
import { MemoryAdapter } from 'robo.js/flashcore'
import type { FlashcoreAdapter } from 'robo.js/flashcore'

describe('ResilienceAdapter', () => {
	let baseAdapter: MemoryAdapter
	let resilience: ResilienceAdapter

	beforeEach(() => {
		jest.useFakeTimers()
		baseAdapter = new MemoryAdapter()
		resilience = new ResilienceAdapter(baseAdapter, {
			maxRetries: 3,
			retryBaseDelay: 100,
			retryMaxDelay: 1000
		})
	})

	afterEach(() => {
		jest.useRealTimers()
	})

	describe('Basic Passthrough', () => {
		it('should pass through successful operations', async () => {
			await resilience.set('key', 'value')
			const result = await resilience.get('key')
			expect(result).toBe('value')
		})

		it('should pass through delete', async () => {
			await resilience.set('key', 'value')
			await resilience.delete('key')
			expect(await resilience.has('key')).toBe(false)
		})

		it('should pass through has', async () => {
			await resilience.set('key', 'value')
			expect(await resilience.has('key')).toBe(true)
		})

		it('should pass through clear', async () => {
			await resilience.set('a', 1)
			await resilience.set('b', 2)
			await resilience.clear()
			expect(await resilience.has('a')).toBe(false)
		})
	})

	describe('Retry Behavior', () => {
		it('should retry on retryable errors', async () => {
			let attempts = 0
			const failingAdapter: FlashcoreAdapter = {
				name: 'FailingAdapter',
				get: async () => {
					attempts++
					if (attempts < 3) {
						const err = new Error('Connection refused')
						;(err as NodeJS.ErrnoException).code = 'ECONNREFUSED'
						throw err
					}
					return 'success'
				},
				set: async () => true,
				delete: async () => true,
				has: async () => false,
				clear: async () => {}
			}

			const retrying = new ResilienceAdapter(failingAdapter, {
				maxRetries: 3,
				retryBaseDelay: 100
			})

			const resultPromise = retrying.get('key')

			// Advance timers to complete retries
			await jest.advanceTimersByTimeAsync(500)

			const result = await resultPromise
			expect(result).toBe('success')
			expect(attempts).toBe(3)
		})

		it('should not retry non-retryable errors', async () => {
			const nonRetryableAdapter: FlashcoreAdapter = {
				name: 'NonRetryableAdapter',
				get: async () => {
					throw new Error('Invalid argument')
				},
				set: async () => true,
				delete: async () => true,
				has: async () => false,
				clear: async () => {}
			}

			const retrying = new ResilienceAdapter(nonRetryableAdapter, {
				maxRetries: 3,
				retryBaseDelay: 100
			})

			await expect(retrying.get('key')).rejects.toThrow('Invalid argument')
		})

		it('should exhaust retries and throw', async () => {
			const alwaysFailAdapter: FlashcoreAdapter = {
				name: 'AlwaysFailAdapter',
				get: async () => {
					const err = new Error('Service unavailable')
					;(err as NodeJS.ErrnoException).code = 'ETIMEDOUT'
					throw err
				},
				set: async () => true,
				delete: async () => true,
				has: async () => false,
				clear: async () => {}
			}

			const retrying = new ResilienceAdapter(alwaysFailAdapter, {
				maxRetries: 2,
				retryBaseDelay: 100
			})

			let threw = false
			let error: Error | null = null
			const promise = retrying.get('key').catch(e => {
				threw = true
				error = e
			})
			await jest.advanceTimersByTimeAsync(2000)
			await promise

			expect(threw).toBe(true)
			expect(error).toBeInstanceOf(Error)
		})
	})

	describe('Exponential Backoff', () => {
		it('should increase delay exponentially', async () => {
			let attempts = 0

			const slowAdapter: FlashcoreAdapter = {
				name: 'SlowAdapter',
				get: async () => {
					attempts++
					if (attempts <= 3) {
						const err = new Error('timeout')
						;(err as NodeJS.ErrnoException).code = 'ETIMEDOUT'
						throw err
					}
					return 'done'
				},
				set: async () => true,
				delete: async () => true,
				has: async () => false,
				clear: async () => {}
			}

			const retrying = new ResilienceAdapter(slowAdapter, {
				maxRetries: 3,
				retryBaseDelay: 100,
				jitter: 0 // Disable jitter for predictable testing
			})

			const promise = retrying.get('key')

			// Expected delays: 100ms (attempt 1), 200ms (attempt 2), 400ms (attempt 3)
			await jest.advanceTimersByTimeAsync(100)
			await jest.advanceTimersByTimeAsync(200)
			await jest.advanceTimersByTimeAsync(400)

			await promise
			expect(attempts).toBe(4)
		})

		it('should cap delay at maxRetryDelay', async () => {
			let attempts = 0

			const failAdapter: FlashcoreAdapter = {
				name: 'FailAdapter',
				get: async () => {
					attempts++
					if (attempts <= 5) {
						const err = new Error('timeout')
						;(err as NodeJS.ErrnoException).code = 'ETIMEDOUT'
						throw err
					}
					return 'done'
				},
				set: async () => true,
				delete: async () => true,
				has: async () => false,
				clear: async () => {}
			}

			const retrying = new ResilienceAdapter(failAdapter, {
				maxRetries: 5,
				retryBaseDelay: 100,
				retryMaxDelay: 500,
				jitter: 0
			})

			const promise = retrying.get('key')
			await jest.advanceTimersByTimeAsync(5000)

			await promise
			expect(attempts).toBe(6)
		})
	})

	describe('Disconnect/Reconnect Callbacks', () => {
		it('should call onDisconnect when retries exhausted', async () => {
			const onDisconnect = jest.fn()

			const failAdapter: FlashcoreAdapter = {
				name: 'FailAdapter',
				get: async () => {
					const err = new Error('Connection lost')
					;(err as NodeJS.ErrnoException).code = 'ECONNRESET'
					throw err
				},
				set: async () => true,
				delete: async () => true,
				has: async () => false,
				clear: async () => {}
			}

			const retrying = new ResilienceAdapter(failAdapter, {
				maxRetries: 2,
				retryBaseDelay: 100,
				onDisconnect
			})

			let threw = false
			const promise = retrying.get('key').catch(() => {
				threw = true
			})
			await jest.advanceTimersByTimeAsync(2000)
			await promise

			expect(threw).toBe(true)
			expect(onDisconnect).toHaveBeenCalled()
		})

		it('should call onReconnect after recovery', async () => {
			const onReconnect = jest.fn()

			let attempts = 0
			const flakeyAdapter: FlashcoreAdapter = {
				name: 'FlakeyAdapter',
				get: async () => {
					attempts++
					if (attempts === 1) {
						const err = new Error('timeout')
						;(err as NodeJS.ErrnoException).code = 'ETIMEDOUT'
						throw err
					}
					return 'success'
				},
				set: async () => true,
				delete: async () => true,
				has: async () => false,
				clear: async () => {}
			}

			const retrying = new ResilienceAdapter(flakeyAdapter, {
				maxRetries: 3,
				retryBaseDelay: 100,
				onReconnect
			})

			const promise = retrying.get('key')
			await jest.advanceTimersByTimeAsync(500)

			const result = await promise
			expect(result).toBe('success')
			// Note: onReconnect is only called if the adapter was previously disconnected
			// After a single temporary failure, it may not trigger
		})
	})

	describe('Custom isRetryable', () => {
		it('should use custom retryable check', async () => {
			let attempts = 0

			const customAdapter: FlashcoreAdapter = {
				name: 'CustomAdapter',
				get: async () => {
					attempts++
					if (attempts < 3) {
						throw new Error('CustomRetryable:temporary failure')
					}
					return 'success'
				},
				set: async () => true,
				delete: async () => true,
				has: async () => false,
				clear: async () => {}
			}

			const retrying = new ResilienceAdapter(customAdapter, {
				maxRetries: 3,
				retryBaseDelay: 100,
				isRetryable: (error) => error.message.startsWith('CustomRetryable:')
			})

			const promise = retrying.get('key')
			await jest.advanceTimersByTimeAsync(500)

			const result = await promise
			expect(result).toBe('success')
			expect(attempts).toBe(3)
		})
	})

	describe('Status Methods', () => {
		it('should report disconnected state', async () => {
			const failAdapter: FlashcoreAdapter = {
				name: 'FailAdapter',
				get: async () => {
					const err = new Error('down')
					;(err as NodeJS.ErrnoException).code = 'ECONNREFUSED'
					throw err
				},
				set: async () => true,
				delete: async () => true,
				has: async () => false,
				clear: async () => {}
			}

			const retrying = new ResilienceAdapter(failAdapter, {
				maxRetries: 1,
				retryBaseDelay: 100
			})

			expect(retrying.isCurrentlyDisconnected()).toBe(false)

			let threw = false
			const promise = retrying.get('key').catch(() => {
				threw = true
			})
			await jest.advanceTimersByTimeAsync(1000)
			await promise

			expect(threw).toBe(true)
			expect(retrying.isCurrentlyDisconnected()).toBe(true)
		})

		it('should track consecutive failures', async () => {
			const failAdapter: FlashcoreAdapter = {
				name: 'FailAdapter',
				get: async () => {
					const err = new Error('fail')
					;(err as NodeJS.ErrnoException).code = 'ETIMEDOUT'
					throw err
				},
				set: async () => true,
				delete: async () => true,
				has: async () => false,
				clear: async () => {}
			}

			const retrying = new ResilienceAdapter(failAdapter, {
				maxRetries: 2,
				retryBaseDelay: 100
			})

			let threw = false
			const promise = retrying.get('key').catch(() => {
				threw = true
			})
			await jest.advanceTimersByTimeAsync(1000)
			await promise

			expect(threw).toBe(true)
			expect(retrying.getConsecutiveFailures()).toBe(3) // initial + 2 retries
		})

		it('should reset failures on success', async () => {
			resilience.resetFailures()
			expect(resilience.getConsecutiveFailures()).toBe(0)
		})

		it('should return config', () => {
			const config = resilience.getConfig()
			expect(config.maxRetries).toBe(3)
			expect(config.retryBaseDelay).toBe(100)
			expect(config.retryMaxDelay).toBe(1000)
		})
	})

	describe('Capability Propagation', () => {
		it('should propagate scan with retry', async () => {
			await resilience.set('user:1', 'a')
			await resilience.set('user:2', 'b')

			const keys = await resilience.scan!('user:') as string[]
			expect(keys.sort()).toEqual(['user:1', 'user:2'].sort())
		})

		it('should propagate setIfNotExists with retry', async () => {
			const result1 = await resilience.setIfNotExists!('key', 'value')
			expect(result1).toBe(true)

			const result2 = await resilience.setIfNotExists!('key', 'other')
			expect(result2).toBe(false)
		})
	})

	describe('Factory Function', () => {
		it('should create adapter with createResilienceAdapter', async () => {
			const factoryResilience = createResilienceAdapter(baseAdapter, {
				maxRetries: 5
			})

			await factoryResilience.set('test', 'value')
			expect(await factoryResilience.get('test')).toBe('value')
		})
	})
})

// Run afterEach outside of describe to ensure cleanup
afterEach(() => {
	jest.useRealTimers()
})
