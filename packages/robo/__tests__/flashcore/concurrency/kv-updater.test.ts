/**
 * Flashcore v1 (spec rev 4.3) Phase 4 - KV Updater Concurrency Tests
 *
 * Tests concurrent Flashcore.set() calls with updater functions to verify
 * behavior under concurrent KV access. Documents that MemoryAdapter lacks
 * compare-and-swap (CAS) semantics, so lost updates are expected under
 * true concurrency.
 */

import {
	Flashcore,
	FlashcoreSystem,
	MemoryAdapter
} from '../helpers/flashcore-compat.js'

describe('KV Updater Concurrency', () => {
	beforeEach(async () => {
		await FlashcoreSystem._reset()
		await Flashcore.$.init({ adapter: new MemoryAdapter() })
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	it('should handle two concurrent updater calls', async () => {
		await Flashcore.set('counter', 0)

		await Promise.all([
			Flashcore.set<number>('counter', (old) => (old ?? 0) + 1),
			Flashcore.set<number>('counter', (old) => (old ?? 0) + 1)
		])

		const final = await Flashcore.get<number>('counter')
		expect(final).toBeDefined()
		expect(typeof final).toBe('number')
		// With MemoryAdapter (no CAS), we may see 1 or 2 depending on
		// whether the reads interleave. Both are valid outcomes.
		expect(final).toBeGreaterThanOrEqual(1)
		expect(final).toBeLessThanOrEqual(2)
	})

	it('should handle N concurrent updaters', async () => {
		const N = 10
		await Flashcore.set('counter', 0)

		const updaters = Array.from({ length: N }, () =>
			Flashcore.set<number>('counter', (old) => (old ?? 0) + 1)
		)

		const results = await Promise.allSettled(updaters)

		// All should succeed
		for (const result of results) {
			expect(result.status).toBe('fulfilled')
		}

		const final = await Flashcore.get<number>('counter')
		expect(final).toBeDefined()
		expect(typeof final).toBe('number')
		// Without CAS, some updates may be lost. The final value should
		// be at least 1 (at least one update applied) and at most N.
		expect(final).toBeGreaterThanOrEqual(1)
		expect(final).toBeLessThanOrEqual(N)
	})

	it('should produce correct final value with sequential updaters', async () => {
		const N = 10
		await Flashcore.set('counter', 0)

		// Run updaters sequentially
		for (let i = 0; i < N; i++) {
			await Flashcore.set<number>('counter', (old) => (old ?? 0) + 1)
		}

		const final = await Flashcore.get<number>('counter')
		expect(final).toBe(N)
	})

	it('should pass undefined to updater for non-existent key', async () => {
		let receivedOldValue: unknown = 'sentinel'

		await Flashcore.set<number>('nonexistent', (old) => {
			receivedOldValue = old
			return 42
		})

		expect(receivedOldValue).toBeUndefined()

		const final = await Flashcore.get<number>('nonexistent')
		expect(final).toBe(42)
	})
})
