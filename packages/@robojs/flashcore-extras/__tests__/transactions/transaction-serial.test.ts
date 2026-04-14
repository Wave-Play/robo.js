/**
 * Flashcore v1 (spec rev 4.3) Phase 8 - Serial Transaction Tests
 *
 * Tests serial mode queue for serializing concurrent transactions.
 */

import { FlashcoreSystem } from 'robo.js/flashcore'
import type { FlashcoreAdapter, AdapterTransaction } from 'robo.js/flashcore'
import { SerialTransactionQueue, clearSerialQueue } from '../../src/transactions/context.js'
import { registerAllExtensions } from '../helpers/register-extensions.js'

/**
 * Create an adapter with native transaction support.
 */
function createNativeAdapter(): FlashcoreAdapter & { store: Map<string, unknown> } {
	const store = new Map<string, unknown>()
	return {
		store,
		get: async (key: string) => store.get(key),
		set: async (key: string, value: unknown) => { store.set(key, value); return true },
		delete: async (key: string) => { store.delete(key); return true },
		has: async (key: string) => store.has(key),
		clear: async () => { store.clear() },
		transaction: async (fn: (tx: AdapterTransaction<string, unknown>) => void | Promise<void>) => {
			const pending: { type: 'set' | 'delete'; key: string; value?: unknown }[] = []
			const tx: AdapterTransaction<string, unknown> = {
				get: async (key) => store.get(key),
				set: (key, value) => { pending.push({ type: 'set', key, value }) },
				delete: (key) => { pending.push({ type: 'delete', key }) }
			}
			await fn(tx)
			for (const op of pending) {
				if (op.type === 'set') {
					store.set(op.key, op.value)
				} else {
					store.delete(op.key)
				}
			}
		}
	}
}

describe('Serial Transaction Queue', () => {
	let queue: SerialTransactionQueue

	beforeEach(() => {
		queue = new SerialTransactionQueue()
	})

	afterEach(() => {
		queue.clear()
	})

	describe('Basic Queue Operations', () => {
		it('should execute single transaction', async () => {
			const result = await queue.enqueue(async () => 42)
			expect(result).toBe(42)
		})

		it('should execute transactions in order', async () => {
			const order: number[] = []

			const results = await Promise.all([
				queue.enqueue(async () => {
					order.push(1)
					return 'first'
				}),
				queue.enqueue(async () => {
					order.push(2)
					return 'second'
				}),
				queue.enqueue(async () => {
					order.push(3)
					return 'third'
				})
			])

			expect(order).toEqual([1, 2, 3])
			expect(results).toEqual(['first', 'second', 'third'])
		})

		it('should handle async delays correctly', async () => {
			const order: number[] = []

			const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

			await Promise.all([
				queue.enqueue(async () => {
					await delay(30)
					order.push(1)
				}),
				queue.enqueue(async () => {
					await delay(10)
					order.push(2)
				}),
				queue.enqueue(async () => {
					await delay(20)
					order.push(3)
				})
			])

			// Despite different delays, order should be preserved
			expect(order).toEqual([1, 2, 3])
		})

		it('should isolate errors to their transaction', async () => {
			const results: (string | Error)[] = []

			await Promise.allSettled([
				queue.enqueue(async () => {
					results.push('success-1')
					return 'ok'
				}),
				queue.enqueue(async () => {
					throw new Error('Transaction failed')
				}).catch(e => results.push(e as Error)),
				queue.enqueue(async () => {
					results.push('success-2')
					return 'ok'
				})
			])

			expect(results[0]).toBe('success-1')
			expect(results[1]).toBeInstanceOf(Error)
			expect(results[2]).toBe('success-2')
		})

		it('should report empty state correctly', () => {
			expect(queue.isEmpty()).toBe(true)
		})

		it('should clear pending transactions', () => {
			// Queue some transactions without awaiting
			void queue.enqueue(async () => new Promise(resolve => setTimeout(resolve, 100)))
			const p2 = queue.enqueue(async () => 'pending')

			queue.clear()

			// Pending transactions should be rejected
			expect(p2).rejects.toThrow('Transaction queue cleared')
		})
	})
})

describe('Serial Mode Integration', () => {
	beforeEach(async () => {
		await FlashcoreSystem._reset()
		registerAllExtensions()
		clearSerialQueue()
	})

	afterEach(() => {
		clearSerialQueue()
	})

	describe('Concurrent Transactions', () => {
		it('should serialize concurrent transactions', async () => {
			const adapter = createNativeAdapter()
			adapter.store.set('counter', 0)
			await FlashcoreSystem.init({ adapter })

			const incrementCounter = async () => {
				return FlashcoreSystem.transaction(async (ctx) => {
					const current = await ctx.read<number>('counter') ?? 0
					ctx.set('counter', current + 1)
					return current + 1
				}, { mode: 'serial' })
			}

			// Run 5 concurrent increments
			const results = await Promise.all([
				incrementCounter(),
				incrementCounter(),
				incrementCounter(),
				incrementCounter(),
				incrementCounter()
			])

			// All increments should have completed
			expect(adapter.store.get('counter')).toBe(5)

			// Results should be unique (1, 2, 3, 4, 5 in some order due to serialization)
			const sortedResults = [...results].map(r => r.result).sort((a, b) => a - b)
			expect(sortedResults).toEqual([1, 2, 3, 4, 5])
		})

		it('should prevent lost updates', async () => {
			const adapter = createNativeAdapter()
			adapter.store.set('balance', 100)
			await FlashcoreSystem.init({ adapter })

			const withdraw = async (amount: number) => {
				return FlashcoreSystem.transaction(async (ctx) => {
					const balance = await ctx.read<number>('balance') ?? 0
					if (balance >= amount) {
						ctx.set('balance', balance - amount)
						return true
					}
					return false
				}, { mode: 'serial' })
			}

			// Try to withdraw more than available with concurrent requests
			const results = await Promise.all([
				withdraw(60),
				withdraw(60)
			])

			// Only one should succeed
			const successes = results.filter(r => r.result === true).length
			expect(successes).toBe(1)

			// Balance should be 40 (100 - 60)
			expect(adapter.store.get('balance')).toBe(40)
		})
	})

	describe('Error Handling', () => {
		it('should continue processing after failed transaction', async () => {
			const adapter = createNativeAdapter()
			await FlashcoreSystem.init({ adapter })

			const results: (string | Error)[] = []

			await Promise.allSettled([
				FlashcoreSystem.transaction(async (ctx) => {
					ctx.set('key1', 'value1')
					results.push('tx1')
				}, { mode: 'serial' }),

				FlashcoreSystem.transaction(async () => {
					throw new Error('Intentional failure')
				}, { mode: 'serial' }).catch(e => results.push(e as Error)),

				FlashcoreSystem.transaction(async (ctx) => {
					ctx.set('key2', 'value2')
					results.push('tx3')
				}, { mode: 'serial' })
			])

			// All three results should be collected (order of error catch vs tx3 push may vary)
			expect(results).toHaveLength(3)
			expect(results.filter(r => r === 'tx1')).toHaveLength(1)
			expect(results.filter(r => r === 'tx3')).toHaveLength(1)
			expect(results.filter(r => r instanceof Error)).toHaveLength(1)
			// tx1 always runs first
			expect(results[0]).toBe('tx1')

			// Successful transactions should have committed
			expect(adapter.store.get('key1')).toBe('value1')
			expect(adapter.store.get('key2')).toBe('value2')
		})
	})

	describe('Deterministic Ordering', () => {
		it('should maintain FIFO order for queued transactions', async () => {
			const adapter = createNativeAdapter()
			await FlashcoreSystem.init({ adapter })

			const order: string[] = []
			const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

			await Promise.all([
				FlashcoreSystem.transaction(async () => {
					await delay(20)
					order.push('A')
				}, { mode: 'serial' }),
				FlashcoreSystem.transaction(async () => {
					await delay(10)
					order.push('B')
				}, { mode: 'serial' }),
				FlashcoreSystem.transaction(async () => {
					await delay(5)
					order.push('C')
				}, { mode: 'serial' })
			])

			// Despite different execution times, order should be preserved
			expect(order).toEqual(['A', 'B', 'C'])
		})
	})
})
