/**
 * Flashcore v1 (spec rev 4.3) Phase 0 Tests - Capability Detection
 *
 * Tests capability normalization from adapter interface inspection.
 */

import {
	normalizeCapabilities,
	requireCapability,
	warnMissingCapabilities,
	MemoryAdapter,
	type FlashcoreAdapter,
	type AdapterCapabilities
} from '../helpers/flashcore-compat.js'

describe('Capability Detection', () => {
	describe('normalizeCapabilities', () => {
		it('should detect all capabilities from MemoryAdapter', () => {
			const adapter = new MemoryAdapter()
			const caps = normalizeCapabilities(adapter)

			expect(caps.acid).toBe(true)
			expect(caps.walEnabled).toBe(true)
			expect(caps.nativeTransactions).toBe(false)
			expect(caps.atomicBatch).toBe(true)
			expect(caps.setIfNotExists).toBe(true)
			expect(caps.compareAndSwap).toBe(true)
			expect(caps.scan).toBe(true)
			expect(caps.adapter).toBe('MemoryAdapter')
			expect(caps.isolation).toBe('serializable')
			expect(caps.plugins).toEqual([])
			expect(caps.indexTypes).toEqual([])
		})

		it('should handle minimal adapter', () => {
			// Minimal adapter with only required methods
			const minimalAdapter: FlashcoreAdapter = {
				get: () => undefined,
				set: () => true,
				delete: () => true,
				has: () => false,
				clear: () => {}
			}

			const caps = normalizeCapabilities(minimalAdapter)

			expect(caps.acid).toBe(false)
			expect(caps.walEnabled).toBe(false)
			expect(caps.nativeTransactions).toBe(false)
			expect(caps.atomicBatch).toBe(false)
			expect(caps.setIfNotExists).toBe(false)
			expect(caps.compareAndSwap).toBe(false)
			expect(caps.scan).toBe(false)
			expect(caps.adapter).toBe('unknown') // No name property
			expect(caps.isolation).toBe('none')
		})

		it('should detect native transaction support', () => {
			const adapter: FlashcoreAdapter = {
				get: () => undefined,
				set: () => true,
				delete: () => true,
				has: () => false,
				clear: () => {},
				transaction: async () => {}
			}

			const caps = normalizeCapabilities(adapter)
			expect(caps.acid).toBe(true)
			expect(caps.nativeTransactions).toBe(true)
		})

		it('should use adapter name property', () => {
			const adapter: FlashcoreAdapter = {
				name: 'CustomAdapter',
				get: () => undefined,
				set: () => true,
				delete: () => true,
				has: () => false,
				clear: () => {}
			}

			const caps = normalizeCapabilities(adapter)
			expect(caps.adapter).toBe('CustomAdapter')
		})

		it('should use maxValueSize from adapter', () => {
			const adapter: FlashcoreAdapter = {
				get: () => undefined,
				set: () => true,
				delete: () => true,
				has: () => false,
				clear: () => {},
				maxValueSize: 1024 * 1024 // 1MB
			}

			const caps = normalizeCapabilities(adapter)
			expect(caps.maxValueSize).toBe(1024 * 1024)
		})

		it('should use self-reported capabilities', () => {
			const adapter: FlashcoreAdapter = {
				get: () => undefined,
				set: () => true,
				delete: () => true,
				has: () => false,
				clear: () => {},
				capabilities: () => ({
					isolation: 'read-committed'
				})
			}

			const caps = normalizeCapabilities(adapter)
			expect(caps.isolation).toBe('read-committed')
		})
	})

	describe('requireCapability', () => {
		it('should pass when capability exists', () => {
			const caps: AdapterCapabilities = {
				acid: true,
				walEnabled: true,
				nativeTransactions: true,
				atomicBatch: true,
				isolation: 'serializable',
				adapter: 'Test',
				setIfNotExists: true,
				compareAndSwap: true,
				scan: true,
				plugins: [],
				indexTypes: []
			}

			// Should not throw
			expect(() => requireCapability(caps, 'scan', 'WAL')).not.toThrow()
			expect(() => requireCapability(caps, 'acid', 'Transactions')).not.toThrow()
		})

		it('should throw when capability is missing', () => {
			const caps: AdapterCapabilities = {
				acid: false,
				walEnabled: false,
				nativeTransactions: false,
				atomicBatch: false,
				isolation: 'none',
				adapter: 'Minimal',
				setIfNotExists: false,
				compareAndSwap: false,
				scan: false,
				plugins: [],
				indexTypes: []
			}

			expect(() => requireCapability(caps, 'scan', 'WAL recovery')).toThrow(
				/WAL recovery.*requires.*scan.*not available/
			)

			expect(() => requireCapability(caps, 'acid', 'Multi-op transactions')).toThrow(
				/Multi-op transactions.*requires.*acid/
			)
		})
	})

	describe('warnMissingCapabilities', () => {
		it('should warn about missing capabilities', () => {
			const warnings: string[] = []
			const mockLogger = {
				warn: (msg: string) => warnings.push(msg)
			}

			const caps: AdapterCapabilities = {
				acid: false,
				walEnabled: false,
				nativeTransactions: false,
				atomicBatch: false,
				isolation: 'none',
				adapter: 'Minimal',
				setIfNotExists: false,
				compareAndSwap: false,
				scan: false,
				plugins: [],
				indexTypes: []
			}

			warnMissingCapabilities(caps, mockLogger)

			expect(warnings).toHaveLength(3)
			expect(warnings.some((w) => w.includes('WAL recovery is disabled'))).toBe(true)
			expect(warnings.some((w) => w.includes('Unique constraints are not race-free'))).toBe(true)
			expect(warnings.some((w) => w.includes('does not support multi-key atomic commit'))).toBe(true)
		})

		it('should not warn when capabilities are present', () => {
			const warnings: string[] = []
			const mockLogger = {
				warn: (msg: string) => warnings.push(msg)
			}

			const caps: AdapterCapabilities = {
				acid: true,
				walEnabled: true,
				nativeTransactions: false,
				atomicBatch: true,
				isolation: 'serializable',
				adapter: 'Full',
				setIfNotExists: true,
				compareAndSwap: true,
				scan: true,
				plugins: [],
				indexTypes: []
			}

			warnMissingCapabilities(caps, mockLogger)

			expect(warnings).toHaveLength(0)
		})
	})
})
