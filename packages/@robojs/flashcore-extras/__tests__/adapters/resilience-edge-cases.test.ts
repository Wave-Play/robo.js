/**
 * Phase 5: Resilience Adapter Edge Cases
 *
 * Tests non-retryable error propagation, transient retry with recovery,
 * max-retry exhaustion, disconnect/reconnect callbacks, and failure tracking.
 */

import { jest } from '@jest/globals'
import type { FlashcoreAdapter } from 'robo.js/flashcore'
import { ResilienceAdapter } from '../../src/adapters/resilience.js'

/**
 * Create a mock adapter whose get() can be controlled per-call.
 */
function createControllableAdapter(): {
	adapter: FlashcoreAdapter
	getMock: jest.Mock<() => Promise<unknown>>
} {
	const store = new Map<string, unknown>()
	const getMock = jest.fn<() => Promise<unknown>>()

	const adapter: FlashcoreAdapter = {
		get: getMock as unknown as FlashcoreAdapter['get'],
		set: async (key: string, value: unknown) => {
			store.set(key, value)
			return true
		},
		delete: async (key: string) => store.delete(key),
		has: async (key: string) => store.has(key),
		clear: async () => { store.clear() }
	}

	return { adapter, getMock }
}

describe('ResilienceAdapter edge cases', () => {

	// ── Non-retryable error propagates immediately ────────────────

	it('should propagate non-retryable errors without retrying', async () => {
		const { adapter, getMock } = createControllableAdapter()
		const error = new Error('Invalid argument')

		getMock.mockRejectedValue(error)

		const resilient = new ResilienceAdapter(adapter, {
			maxRetries: 3,
			retryBaseDelay: 1
		})

		await expect(resilient.get('key')).rejects.toThrow('Invalid argument')

		// Should only have been called once (no retries for non-retryable)
		expect(getMock).toHaveBeenCalledTimes(1)
	})

	// ── Retries on transient error then succeeds ──────────────────

	it('should retry on transient error and succeed on subsequent attempt', async () => {
		const { adapter, getMock } = createControllableAdapter()
		const transientError = new Error('connection timeout')

		getMock
			.mockRejectedValueOnce(transientError)
			.mockRejectedValueOnce(transientError)
			.mockResolvedValueOnce('recovered')

		const resilient = new ResilienceAdapter(adapter, {
			maxRetries: 5,
			retryBaseDelay: 1,
			jitter: 0
		})

		const result = await resilient.get('key')
		expect(result).toBe('recovered')
		expect(getMock).toHaveBeenCalledTimes(3) // 1 initial + 2 retries
	})

	// ── Max retries exhaustion ────────────────────────────────────

	it('should throw after exhausting all retry attempts', async () => {
		const { adapter, getMock } = createControllableAdapter()
		const transientError = new Error('connection refused')
		;(transientError as NodeJS.ErrnoException).code = 'ECONNREFUSED'

		// Always fails
		getMock.mockRejectedValue(transientError)

		const resilient = new ResilienceAdapter(adapter, {
			maxRetries: 2,
			retryBaseDelay: 1,
			jitter: 0
		})

		await expect(resilient.get('key')).rejects.toThrow('connection refused')

		// 1 initial + 2 retries = 3 total
		expect(getMock).toHaveBeenCalledTimes(3)
	})

	// ── Disconnect callback ───────────────────────────────────────

	it('should invoke onDisconnect when retries are exhausted', async () => {
		const { adapter, getMock } = createControllableAdapter()
		const transientError = new Error('network unavailable')
		getMock.mockRejectedValue(transientError)

		const onDisconnect = jest.fn()

		const resilient = new ResilienceAdapter(adapter, {
			maxRetries: 1,
			retryBaseDelay: 1,
			jitter: 0,
			onDisconnect
		})

		await expect(resilient.get('key')).rejects.toThrow()
		expect(onDisconnect).toHaveBeenCalledTimes(1)
		expect(onDisconnect).toHaveBeenCalledWith(expect.any(Error))
	})

	// ── Reconnect callback ────────────────────────────────────────

	it('should invoke onReconnect when a call succeeds after previous failures', async () => {
		const { adapter, getMock } = createControllableAdapter()
		const transientError = new Error('temporarily unavailable')

		const onDisconnect = jest.fn()
		const onReconnect = jest.fn()

		const resilient = new ResilienceAdapter(adapter, {
			maxRetries: 1,
			retryBaseDelay: 1,
			jitter: 0,
			onDisconnect,
			onReconnect
		})

		// First call: fail all retries -> disconnect
		getMock.mockRejectedValue(transientError)
		await expect(resilient.get('key')).rejects.toThrow()
		expect(onDisconnect).toHaveBeenCalledTimes(1)

		// Second call: succeeds -> should trigger reconnect
		getMock.mockResolvedValue('success')
		const result = await resilient.get('key')
		expect(result).toBe('success')
		expect(onReconnect).toHaveBeenCalledTimes(1)
	})

	// ── getConsecutiveFailures / resetFailures ────────────────────

	it('should track consecutive failure count', async () => {
		const { adapter, getMock } = createControllableAdapter()
		const transientError = new Error('connection timeout')

		getMock.mockRejectedValue(transientError)

		const resilient = new ResilienceAdapter(adapter, {
			maxRetries: 0, // no retries, fail immediately
			retryBaseDelay: 1,
			jitter: 0
		})

		expect(resilient.getConsecutiveFailures()).toBe(0)

		await expect(resilient.get('key')).rejects.toThrow()
		expect(resilient.getConsecutiveFailures()).toBe(1)

		await expect(resilient.get('key')).rejects.toThrow()
		expect(resilient.getConsecutiveFailures()).toBe(2)
	})

	it('should reset failure state via resetFailures', async () => {
		const { adapter, getMock } = createControllableAdapter()
		const transientError = new Error('network unavailable')
		getMock.mockRejectedValue(transientError)

		const resilient = new ResilienceAdapter(adapter, {
			maxRetries: 0,
			retryBaseDelay: 1,
			jitter: 0
		})

		await expect(resilient.get('key')).rejects.toThrow()
		expect(resilient.getConsecutiveFailures()).toBeGreaterThan(0)
		expect(resilient.isCurrentlyDisconnected()).toBe(true)

		resilient.resetFailures()

		expect(resilient.getConsecutiveFailures()).toBe(0)
		expect(resilient.isCurrentlyDisconnected()).toBe(false)
	})

	// ── isCurrentlyDisconnected ───────────────────────────────────

	it('should reflect disconnected state correctly', async () => {
		const { adapter, getMock } = createControllableAdapter()

		const resilient = new ResilienceAdapter(adapter, {
			maxRetries: 0,
			retryBaseDelay: 1,
			jitter: 0
		})

		expect(resilient.isCurrentlyDisconnected()).toBe(false)

		getMock.mockRejectedValue(new Error('connection timeout'))
		await expect(resilient.get('key')).rejects.toThrow()

		expect(resilient.isCurrentlyDisconnected()).toBe(true)

		// Successful call clears disconnected state
		getMock.mockResolvedValue('ok')
		await resilient.get('key')

		expect(resilient.isCurrentlyDisconnected()).toBe(false)
	})
})
