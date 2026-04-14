/**
 * Flashcore v1 (spec rev 4.3) Phase 3 - Metrics Tests
 *
 * Tests the Flashcore.$.metrics() and resetMetrics() APIs.
 */

// Uses Jest globals
import { FlashcoreSystem, MemoryAdapter } from 'robo.js/flashcore'
import { CacheAdapter } from '../../src/adapters/cache.js'
import { f } from 'robo.js/flashcore'

describe('Flashcore Metrics', () => {
	beforeEach(async () => {
		await FlashcoreSystem._reset()
		await FlashcoreSystem.init({ adapter: new MemoryAdapter() })
	})

	describe('Initial State', () => {
		it('should start with zero counters', () => {
			const metrics = FlashcoreSystem.metrics()

			expect(metrics.operations.create).toBe(0)
			expect(metrics.operations.update).toBe(0)
			expect(metrics.operations.delete).toBe(0)
			expect(metrics.operations.findUnique).toBe(0)
			expect(metrics.operations.findMany).toBe(0)
			expect(metrics.cacheHits).toBe(0)
			expect(metrics.cacheMisses).toBe(0)
			expect(metrics.indexRebuilds).toBe(0)
			expect(metrics.walRecoveries).toBe(0)
			expect(metrics.transactionRetries).toBe(0)
			expect(metrics.avgQueryTime).toBe(0)
		})

		it('should return a copy of metrics', () => {
			const metrics1 = FlashcoreSystem.metrics()
			const metrics2 = FlashcoreSystem.metrics()

			expect(metrics1).not.toBe(metrics2)
			expect(metrics1).toEqual(metrics2)
		})
	})

	describe('Operation Counters', () => {
		it('should increment create counter', () => {
			FlashcoreSystem._incrementMetric('create')
			FlashcoreSystem._incrementMetric('create')
			FlashcoreSystem._incrementMetric('create')

			expect(FlashcoreSystem.metrics().operations.create).toBe(3)
		})

		it('should increment update counter', () => {
			FlashcoreSystem._incrementMetric('update')
			FlashcoreSystem._incrementMetric('update')

			expect(FlashcoreSystem.metrics().operations.update).toBe(2)
		})

		it('should increment delete counter', () => {
			FlashcoreSystem._incrementMetric('delete')

			expect(FlashcoreSystem.metrics().operations.delete).toBe(1)
		})

		it('should increment findUnique counter', () => {
			FlashcoreSystem._incrementMetric('findUnique')
			FlashcoreSystem._incrementMetric('findUnique')

			expect(FlashcoreSystem.metrics().operations.findUnique).toBe(2)
		})

		it('should increment findMany counter', () => {
			FlashcoreSystem._incrementMetric('findMany')

			expect(FlashcoreSystem.metrics().operations.findMany).toBe(1)
		})

		it('should track multiple operation types independently', () => {
			FlashcoreSystem._incrementMetric('create')
			FlashcoreSystem._incrementMetric('create')
			FlashcoreSystem._incrementMetric('update')
			FlashcoreSystem._incrementMetric('delete')
			FlashcoreSystem._incrementMetric('findUnique')
			FlashcoreSystem._incrementMetric('findMany')
			FlashcoreSystem._incrementMetric('findMany')
			FlashcoreSystem._incrementMetric('findMany')

			const metrics = FlashcoreSystem.metrics()
			expect(metrics.operations.create).toBe(2)
			expect(metrics.operations.update).toBe(1)
			expect(metrics.operations.delete).toBe(1)
			expect(metrics.operations.findUnique).toBe(1)
			expect(metrics.operations.findMany).toBe(3)
		})
	})

	describe('Cache Counters', () => {
		it('should increment cache hits', () => {
			FlashcoreSystem._incrementCounter('cacheHits')
			FlashcoreSystem._incrementCounter('cacheHits')
			FlashcoreSystem._incrementCounter('cacheHits')

			expect(FlashcoreSystem.metrics().cacheHits).toBe(3)
		})

		it('should increment cache misses', () => {
			FlashcoreSystem._incrementCounter('cacheMisses')
			FlashcoreSystem._incrementCounter('cacheMisses')

			expect(FlashcoreSystem.metrics().cacheMisses).toBe(2)
		})

		it('should track hits and misses independently', () => {
			FlashcoreSystem._incrementCounter('cacheHits')
			FlashcoreSystem._incrementCounter('cacheHits')
			FlashcoreSystem._incrementCounter('cacheMisses')

			const metrics = FlashcoreSystem.metrics()
			expect(metrics.cacheHits).toBe(2)
			expect(metrics.cacheMisses).toBe(1)
		})

		it('should increment cache metrics via CacheAdapter operations', async () => {
			await FlashcoreSystem._reset()

			const base = new MemoryAdapter()
			const cached = new CacheAdapter(base, {
				onCacheHit: () => FlashcoreSystem._incrementCounter('cacheHits'),
				onCacheMiss: () => FlashcoreSystem._incrementCounter('cacheMisses')
			})

			await FlashcoreSystem.init({ adapter: cached })

			// Miss
			await FlashcoreSystem.adapter.get('missing')

			// Hit (set populates cache)
			await FlashcoreSystem.adapter.set('k', 'v')
			await FlashcoreSystem.adapter.get('k')

			const metrics = FlashcoreSystem.metrics()
			expect(metrics.cacheMisses).toBe(1)
			expect(metrics.cacheHits).toBe(1)
		})
	})

	describe('Other Counters', () => {
		it('should increment index rebuilds', () => {
			FlashcoreSystem._incrementCounter('indexRebuilds')
			FlashcoreSystem._incrementCounter('indexRebuilds')

			expect(FlashcoreSystem.metrics().indexRebuilds).toBe(2)
		})

		it('should increment WAL recoveries', () => {
			FlashcoreSystem._incrementCounter('walRecoveries')

			expect(FlashcoreSystem.metrics().walRecoveries).toBe(1)
		})

		it('should increment transaction retries', () => {
			FlashcoreSystem._incrementCounter('transactionRetries')
			FlashcoreSystem._incrementCounter('transactionRetries')
			FlashcoreSystem._incrementCounter('transactionRetries')

			expect(FlashcoreSystem.metrics().transactionRetries).toBe(3)
		})
	})

	describe('Query Time Tracking', () => {
		beforeEach(() => {
			// Reset metrics before each query time test to start with fresh samples
			FlashcoreSystem.resetMetrics()
		})

		it('should track average query time', () => {
			FlashcoreSystem._recordQueryTime(10)
			FlashcoreSystem._recordQueryTime(20)
			FlashcoreSystem._recordQueryTime(30)

			// Average of 10, 20, 30 = 20
			expect(FlashcoreSystem.metrics().avgQueryTime).toBe(20)
		})

		it('should update average as new times are recorded', () => {
			FlashcoreSystem._recordQueryTime(100)
			expect(FlashcoreSystem.metrics().avgQueryTime).toBe(100)

			FlashcoreSystem._recordQueryTime(200)
			expect(FlashcoreSystem.metrics().avgQueryTime).toBe(150)

			FlashcoreSystem._recordQueryTime(300)
			expect(FlashcoreSystem.metrics().avgQueryTime).toBe(200)
		})

		it('should handle a single sample', () => {
			FlashcoreSystem._recordQueryTime(42)

			expect(FlashcoreSystem.metrics().avgQueryTime).toBe(42)
		})
	})

	describe('WAL State', () => {
		it('should record WAL pending entries', async () => {
			FlashcoreSystem._setWalPendingEntries(5)

			const introspection = await FlashcoreSystem.introspect()
			expect(introspection.walStatus.pendingEntries).toBe(5)
		})

		it('should record WAL recovery event', async () => {
			FlashcoreSystem._recordWalRecovery()

			const metrics = FlashcoreSystem.metrics()
			expect(metrics.walRecoveries).toBe(1)

			const introspection = await FlashcoreSystem.introspect()
			expect(introspection.walStatus.lastRecovery).toBeInstanceOf(Date)
		})
	})

	describe('Reset Metrics', () => {
		it('should reset all operation counters', () => {
			FlashcoreSystem._incrementMetric('create')
			FlashcoreSystem._incrementMetric('update')
			FlashcoreSystem._incrementMetric('delete')
			FlashcoreSystem._incrementMetric('findUnique')
			FlashcoreSystem._incrementMetric('findMany')

			FlashcoreSystem.resetMetrics()

			const metrics = FlashcoreSystem.metrics()
			expect(metrics.operations.create).toBe(0)
			expect(metrics.operations.update).toBe(0)
			expect(metrics.operations.delete).toBe(0)
			expect(metrics.operations.findUnique).toBe(0)
			expect(metrics.operations.findMany).toBe(0)
		})

		it('should reset cache counters', () => {
			FlashcoreSystem._incrementCounter('cacheHits')
			FlashcoreSystem._incrementCounter('cacheMisses')

			FlashcoreSystem.resetMetrics()

			const metrics = FlashcoreSystem.metrics()
			expect(metrics.cacheHits).toBe(0)
			expect(metrics.cacheMisses).toBe(0)
		})

		it('should reset other counters', () => {
			FlashcoreSystem._incrementCounter('indexRebuilds')
			FlashcoreSystem._incrementCounter('walRecoveries')
			FlashcoreSystem._incrementCounter('transactionRetries')

			FlashcoreSystem.resetMetrics()

			const metrics = FlashcoreSystem.metrics()
			expect(metrics.indexRebuilds).toBe(0)
			expect(metrics.walRecoveries).toBe(0)
			expect(metrics.transactionRetries).toBe(0)
		})

		it('should reset average query time', () => {
			FlashcoreSystem._recordQueryTime(100)
			FlashcoreSystem._recordQueryTime(200)

			FlashcoreSystem.resetMetrics()

			expect(FlashcoreSystem.metrics().avgQueryTime).toBe(0)
		})

		it('should allow fresh tracking after reset', () => {
			FlashcoreSystem._incrementMetric('create')
			FlashcoreSystem._recordQueryTime(100)

			FlashcoreSystem.resetMetrics()

			FlashcoreSystem._incrementMetric('create')
			FlashcoreSystem._recordQueryTime(50)

			const metrics = FlashcoreSystem.metrics()
			expect(metrics.operations.create).toBe(1)
			expect(metrics.avgQueryTime).toBe(50)
		})
	})

	describe('Model Operations Integration', () => {
		it('should be ready for model operation tracking', async () => {
			// Register a model (side effect only)
			FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			// Note: Full integration testing of model -> metrics
			// would be done in integration tests. Here we verify
			// the metrics API is accessible and working.

			const initialMetrics = FlashcoreSystem.metrics()
			expect(initialMetrics).toBeDefined()
			expect(typeof initialMetrics.operations.create).toBe('number')
		})
	})
})
