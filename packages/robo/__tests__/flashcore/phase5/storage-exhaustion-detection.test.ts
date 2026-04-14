/**
 * Flashcore v1 (spec rev 4.3) Phase 5 Tests - Storage Exhaustion Detection
 *
 * Tests that ENOSPC/quota errors are wrapped as StorageExhaustedError.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { FlashcoreSystem } from '../helpers/flashcore-compat.js'
import { ChunkManager } from '../../../src/flashcore/model/chunk.js'
import { StorageExhaustedError } from '../../../src/flashcore/core/errors.js'

describe('Storage Exhaustion Detection', () => {
	beforeEach(async () => {
		await FlashcoreSystem._reset()
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	describe('ENOSPC Detection', () => {
		it('should detect ENOSPC error message', async () => {
			const failingAdapter = {
				name: 'FailingAdapter',
				get: async () => ({}),
				set: async () => {
					throw new Error('ENOSPC: no space left on device')
				},
				delete: async () => true,
				has: async () => false,
				clear: async () => {}
			}

			const chunkManager = new ChunkManager({
				adapter: failingAdapter,
				modelName: 'Test'
			})

			await expect(
				chunkManager.saveChunk(0, { 'id-1': { id: 'id-1' } })
			).rejects.toThrow(StorageExhaustedError)
		})

		it('should detect "no space left" error message', async () => {
			const failingAdapter = {
				name: 'FailingAdapter',
				get: async () => ({}),
				set: async () => {
					throw new Error('no space left on device')
				},
				delete: async () => true,
				has: async () => false,
				clear: async () => {}
			}

			const chunkManager = new ChunkManager({
				adapter: failingAdapter,
				modelName: 'Test'
			})

			await expect(
				chunkManager.saveChunk(0, { 'id-1': { id: 'id-1' } })
			).rejects.toThrow(StorageExhaustedError)
		})
	})

	describe('Quota Exceeded Detection', () => {
		it('should detect "quota exceeded" error message', async () => {
			const failingAdapter = {
				name: 'FailingAdapter',
				get: async () => ({}),
				set: async () => {
					throw new Error('quota exceeded for user')
				},
				delete: async () => true,
				has: async () => false,
				clear: async () => {}
			}

			const chunkManager = new ChunkManager({
				adapter: failingAdapter,
				modelName: 'Test'
			})

			await expect(
				chunkManager.saveChunk(0, { 'id-1': { id: 'id-1' } })
			).rejects.toThrow(StorageExhaustedError)
		})

		it('should detect "storage limit" error message', async () => {
			const failingAdapter = {
				name: 'FailingAdapter',
				get: async () => ({}),
				set: async () => {
					throw new Error('storage limit reached')
				},
				delete: async () => true,
				has: async () => false,
				clear: async () => {}
			}

			const chunkManager = new ChunkManager({
				adapter: failingAdapter,
				modelName: 'Test'
			})

			await expect(
				chunkManager.saveChunk(0, { 'id-1': { id: 'id-1' } })
			).rejects.toThrow(StorageExhaustedError)
		})

		it('should detect "disk full" error message', async () => {
			const failingAdapter = {
				name: 'FailingAdapter',
				get: async () => ({}),
				set: async () => {
					throw new Error('disk full')
				},
				delete: async () => true,
				has: async () => false,
				clear: async () => {}
			}

			const chunkManager = new ChunkManager({
				adapter: failingAdapter,
				modelName: 'Test'
			})

			await expect(
				chunkManager.saveChunk(0, { 'id-1': { id: 'id-1' } })
			).rejects.toThrow(StorageExhaustedError)
		})
	})

	describe('Error Message Quality', () => {
		it('should include actionable guidance in error message', async () => {
			const failingAdapter = {
				name: 'FailingAdapter',
				get: async () => ({}),
				set: async () => {
					throw new Error('ENOSPC: no space left on device')
				},
				delete: async () => true,
				has: async () => false,
				clear: async () => {}
			}

			const chunkManager = new ChunkManager({
				adapter: failingAdapter,
				modelName: 'Test'
			})

			try {
				await chunkManager.saveChunk(0, { 'id-1': { id: 'id-1' } })
				throw new Error('Should have thrown')
			} catch (error) {
				if (error instanceof Error && error.message === 'Should have thrown') {
					throw error
				}
				expect(error).toBeInstanceOf(StorageExhaustedError)
				const exhaustedError = error as StorageExhaustedError
				// Should include guidance about freeing space or increasing quota
				expect(
					exhaustedError.message.includes('disk space') ||
					exhaustedError.message.includes('storage quota') ||
					exhaustedError.message.includes('Free up')
				).toBe(true)
			}
		})

		it('should include operation context in error message', async () => {
			const failingAdapter = {
				name: 'FailingAdapter',
				get: async () => ({}),
				set: async () => {
					throw new Error('quota exceeded')
				},
				delete: async () => true,
				has: async () => false,
				clear: async () => {}
			}

			const chunkManager = new ChunkManager({
				adapter: failingAdapter,
				modelName: 'Test'
			})

			try {
				await chunkManager.saveChunk(0, { 'id-1': { id: 'id-1' } })
				throw new Error('Should have thrown')
			} catch (error) {
				if (error instanceof Error && error.message === 'Should have thrown') {
					throw error
				}
				expect(error).toBeInstanceOf(StorageExhaustedError)
				expect((error as StorageExhaustedError).message).toContain('set')
			}
		})
	})

	describe('Segment Storage Exhaustion', () => {
		it('should detect storage exhaustion during segment write', async () => {
			const failingAdapter = {
				name: 'FailingAdapter',
				get: async (): Promise<unknown> => undefined,
				set: async () => {
					throw new Error('ENOSPC: no space left')
				},
				delete: async () => true,
				has: async () => false,
				clear: async () => {}
			}

			const chunkManager = new ChunkManager({
				adapter: failingAdapter,
				modelName: 'Test',
				maxChunkSize: 100
			})

			await expect(
				chunkManager.saveSegmentedRecord('record-1', { id: 'record-1', data: 'x'.repeat(200) })
			).rejects.toThrow(StorageExhaustedError)
		})
	})
})
