/**
 * Flashcore v1 (spec rev 4.3) Resilience Wrapper
 *
 * Adds automatic retry with exponential backoff for transient failures.
 * Supports disconnect/reconnect callbacks for monitoring.
 */

import type { FlashcoreAdapter, BatchOperation, AdapterTransaction } from 'robo.js/flashcore'
import { AdapterWrapper } from './base.js'

/**
 * Options for the resilience wrapper.
 */
export interface ResilienceOptions {
	/**
	 * Maximum number of retry attempts.
	 * Default: 3
	 */
	maxRetries?: number

	/**
	 * Base delay for exponential backoff in milliseconds.
	 * Default: 100
	 */
	retryBaseDelay?: number

	/**
	 * Maximum delay between retries in milliseconds.
	 * Default: 5000
	 */
	retryMaxDelay?: number

	/**
	 * Callback when adapter disconnects (after max retries exhausted).
	 */
	onDisconnect?: (error: Error) => void

	/**
	 * Callback when adapter reconnects (after successful retry).
	 */
	onReconnect?: () => void

	/**
	 * Custom function to determine if an error is retryable.
	 * Default: checks for common transient error codes.
	 */
	isRetryable?: (error: Error) => boolean

	/**
	 * Jitter factor for retry delays (0 to 1).
	 * Adds randomness to prevent thundering herd.
	 * Default: 0.1
	 */
	jitter?: number
}

// Common transient error codes that should be retried
const RETRYABLE_ERROR_CODES = new Set([
	'ECONNRESET',
	'ECONNREFUSED',
	'ETIMEDOUT',
	'EPIPE',
	'ENETUNREACH',
	'EHOSTUNREACH',
	'EAI_AGAIN',
	'ENOTCONN',
	'ECONNABORTED',
])

/**
 * Default function to check if an error is retryable.
 */
function defaultIsRetryable(error: Error): boolean {
	// Check for Node.js error codes
	const code = (error as NodeJS.ErrnoException).code
	if (code && RETRYABLE_ERROR_CODES.has(code)) {
		return true
	}

	// Check for common retryable error messages
	const message = error.message.toLowerCase()
	const retryablePatterns = [
		'connection',
		'timeout',
		'network',
		'unavailable',
		'busy',
		'overloaded',
		'rate limit',
		'throttl',
		'too many',
		'temporarily',
		'service unavailable',
		'503',
		'504',
		'429',
	]

	return retryablePatterns.some(pattern => message.includes(pattern))
}

/**
 * Resilience wrapper for adapters.
 *
 * Automatically retries failed operations with exponential backoff
 * when transient errors occur.
 */
export class ResilienceAdapter<K extends string = string, V = unknown>
	extends AdapterWrapper<K, V>
{
	readonly name = 'ResilienceAdapter'

	private maxRetries: number
	private retryBaseDelay: number
	private retryMaxDelay: number
	private jitter: number
	private isRetryable: (error: Error) => boolean
	private onDisconnect?: (error: Error) => void
	private onReconnect?: () => void

	private isDisconnected = false
	private consecutiveFailures = 0

	constructor(adapter: FlashcoreAdapter<K, V>, options: ResilienceOptions = {}) {
		super(adapter)
		this.maxRetries = options.maxRetries ?? 3
		this.retryBaseDelay = options.retryBaseDelay ?? 100
		this.retryMaxDelay = options.retryMaxDelay ?? 5000
		this.jitter = options.jitter ?? 0.1
		this.isRetryable = options.isRetryable ?? defaultIsRetryable
		this.onDisconnect = options.onDisconnect
		this.onReconnect = options.onReconnect
	}

	// ─────────────────────────────────────────────────────────────
	// Overridden Methods with Retry Logic
	// ─────────────────────────────────────────────────────────────

	async get(key: K): Promise<V | undefined> {
		return this.withRetry(() => this.next.get(key))
	}

	async set(key: K, value: V): Promise<boolean> {
		return this.withRetry(() => this.next.set(key, value))
	}

	async delete(key: K): Promise<boolean> {
		return this.withRetry(() => this.next.delete(key))
	}

	async has(key: K): Promise<boolean> {
		return this.withRetry(() => this.next.has(key))
	}

	async clear(): Promise<void> {
		const result = await this.withRetry(() => this.next.clear())
		// clear() can return void, so we need to handle that
		return result as void
	}

	// ─────────────────────────────────────────────────────────────
	// Override optional methods with retry logic
	// ─────────────────────────────────────────────────────────────

	get scan(): ((prefix: K) => Promise<K[]> | K[] | AsyncIterable<K> | Promise<AsyncIterable<K>>) | undefined {
		if (!this.next.scan) return undefined

		return async (prefix: K): Promise<K[]> => {
			const result = await this.withRetry(() => this.next.scan!(prefix))
			// Normalize to array for consistency after retry
			if (Symbol.asyncIterator in (result as object)) {
				const arr: K[] = []
				for await (const key of result as AsyncIterable<K>) {
					arr.push(key)
				}
				return arr
			}
			return result as K[]
		}
	}

	get setIfNotExists(): ((key: K, value: V) => Promise<boolean> | boolean) | undefined {
		if (!this.next.setIfNotExists) return undefined

		return async (key: K, value: V) => {
			return this.withRetry(() => this.next.setIfNotExists!(key, value))
		}
	}

	get compareAndSwap(): ((key: K, expected: V, next: V) => Promise<boolean> | boolean) | undefined {
		if (!this.next.compareAndSwap) return undefined

		return async (key: K, expected: V, next: V) => {
			return this.withRetry(() => this.next.compareAndSwap!(key, expected, next))
		}
	}

	get atomicBatch(): ((ops: BatchOperation<K, V>[]) => Promise<void> | void) | undefined {
		if (!this.next.atomicBatch) return undefined

		return async (ops: BatchOperation<K, V>[]) => {
			return this.withRetry(() => this.next.atomicBatch!(ops))
		}
	}

	get transaction(): ((fn: (tx: AdapterTransaction<K, V>) => Promise<void>) => Promise<void>) | undefined {
		if (!this.next.transaction) return undefined

		return async (fn: (tx: AdapterTransaction<K, V>) => Promise<void>) => {
			return this.withRetry(() => this.next.transaction!(fn))
		}
	}

	async init(): Promise<void> {
		return this.withRetry(() => this.next.init?.()) as Promise<void>
	}

	// ─────────────────────────────────────────────────────────────
	// Retry Logic
	// ─────────────────────────────────────────────────────────────

	/**
	 * Execute an operation with retry logic.
	 */
	private async withRetry<T>(operation: () => T | Promise<T>): Promise<T> {
		let lastError: Error | undefined

		for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
			try {
				const result = await operation()

				// Success - record recovery if we were disconnected
				if (this.consecutiveFailures > 0) {
					this.consecutiveFailures = 0
					if (this.isDisconnected) {
						this.isDisconnected = false
						this.onReconnect?.()
					}
				}

				return result
			} catch (err) {
				const error = err instanceof Error ? err : new Error(String(err))
				lastError = error

				// Check if this error is retryable
				if (!this.isRetryable(error)) {
					throw error
				}

				this.consecutiveFailures++

				// If we've exhausted retries, give up
				if (attempt >= this.maxRetries) {
					if (!this.isDisconnected) {
						this.isDisconnected = true
						this.onDisconnect?.(error)
					}
					throw error
				}

				// Calculate delay with exponential backoff and jitter
				const delay = this.calculateDelay(attempt)
				await this.sleep(delay)
			}
		}

		// Should never reach here, but TypeScript needs this
		throw lastError ?? new Error('Unknown error')
	}

	/**
	 * Calculate retry delay with exponential backoff and jitter.
	 */
	private calculateDelay(attempt: number): number {
		// Exponential backoff: baseDelay * 2^attempt
		let delay = this.retryBaseDelay * Math.pow(2, attempt)

		// Apply jitter
		if (this.jitter > 0) {
			const jitterAmount = delay * this.jitter
			delay += (Math.random() - 0.5) * 2 * jitterAmount
		}

		// Cap at max delay
		return Math.min(delay, this.retryMaxDelay)
	}

	/**
	 * Sleep for the specified duration.
	 */
	private sleep(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms))
	}

	// ─────────────────────────────────────────────────────────────
	// Status & Configuration
	// ─────────────────────────────────────────────────────────────

	/**
	 * Check if the adapter is currently in a disconnected state.
	 */
	isCurrentlyDisconnected(): boolean {
		return this.isDisconnected
	}

	/**
	 * Get the number of consecutive failures.
	 */
	getConsecutiveFailures(): number {
		return this.consecutiveFailures
	}

	/**
	 * Reset the failure counter (useful for testing).
	 */
	resetFailures(): void {
		this.consecutiveFailures = 0
		this.isDisconnected = false
	}

	/**
	 * Get the current retry configuration.
	 */
	getConfig(): {
		maxRetries: number
		retryBaseDelay: number
		retryMaxDelay: number
		jitter: number
	} {
		return {
			maxRetries: this.maxRetries,
			retryBaseDelay: this.retryBaseDelay,
			retryMaxDelay: this.retryMaxDelay,
			jitter: this.jitter,
		}
	}
}

/**
 * Create a new ResilienceAdapter wrapping another adapter.
 */
export function createResilienceAdapter<K extends string = string, V = unknown>(
	adapter: FlashcoreAdapter<K, V>,
	options?: ResilienceOptions
): ResilienceAdapter<K, V> {
	return new ResilienceAdapter<K, V>(adapter, options)
}
