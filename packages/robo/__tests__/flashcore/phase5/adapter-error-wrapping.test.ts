/**
 * Flashcore v1 (spec rev 4.3) Phase 5 Tests - Adapter Error Wrapping
 *
 * Tests that adapter errors are wrapped with operation and key context.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { FlashcoreSystem } from '../helpers/flashcore-compat.js'
import { ChunkManager } from '../../../src/flashcore/model/chunk.js'
import { AdapterError } from '../../../src/flashcore/core/errors.js'

describe('Adapter Error Wrapping', () => {
	beforeEach(async () => {
		await FlashcoreSystem._reset()
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	describe('ChunkManager Error Wrapping', () => {
		it('should wrap get errors with operation context', async () => {
			const failingAdapter = {
				name: 'FailingAdapter',
				get: async () => {
					throw new Error('Connection refused')
				},
				set: async () => true,
				delete: async () => true,
				has: async () => false,
				clear: async () => {}
			}

			const chunkManager = new ChunkManager({
				adapter: failingAdapter,
				modelName: 'Test'
			})

			try {
				await chunkManager.loadChunk(0)
				throw new Error('Should have thrown')
			} catch (error) {
				if (error instanceof Error && error.message === 'Should have thrown') {
					throw error
				}
				expect(error).toBeInstanceOf(AdapterError)
				const adapterError = error as AdapterError
				expect(adapterError.message).toContain('get')
				expect(adapterError.message).toContain('Connection refused')
			}
		})

		it('should wrap set errors with operation context', async () => {
			const failingAdapter = {
				name: 'FailingAdapter',
				get: async () => ({}),
				set: async () => {
					throw new Error('Write failed')
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
				expect(error).toBeInstanceOf(AdapterError)
				const adapterError = error as AdapterError
				expect(adapterError.message).toContain('set')
				expect(adapterError.message).toContain('Write failed')
			}
		})

		it('should wrap delete errors with operation context', async () => {
			const failingAdapter = {
				name: 'FailingAdapter',
				get: async () => ({}),
				set: async () => true,
				delete: async () => {
					throw new Error('Delete failed')
				},
				has: async () => false,
				clear: async () => {}
			}

			const chunkManager = new ChunkManager({
				adapter: failingAdapter,
				modelName: 'Test'
			})

			try {
				await chunkManager.deleteChunk(0)
				throw new Error('Should have thrown')
			} catch (error) {
				if (error instanceof Error && error.message === 'Should have thrown') {
					throw error
				}
				expect(error).toBeInstanceOf(AdapterError)
				const adapterError = error as AdapterError
				expect(adapterError.message).toContain('delete')
				expect(adapterError.message).toContain('Delete failed')
			}
		})

		it('should include key in error message', async () => {
			const failingAdapter = {
				name: 'FailingAdapter',
				get: async () => {
					throw new Error('Network timeout')
				},
				set: async () => true,
				delete: async () => true,
				has: async () => false,
				clear: async () => {}
			}

			const chunkManager = new ChunkManager({
				adapter: failingAdapter,
				modelName: 'UserData'
			})

			try {
				await chunkManager.loadChunk(5)
				throw new Error('Should have thrown')
			} catch (error) {
				if (error instanceof Error && error.message === 'Should have thrown') {
					throw error
				}
				expect(error).toBeInstanceOf(AdapterError)
				const adapterError = error as AdapterError
				// Key should include model name and chunk id
				expect(adapterError.message).toContain('UserData')
				expect(adapterError.message).toContain('chunk:5')
			}
		})

		it('should preserve original error as cause', async () => {
			const originalError = new Error('Original error')
			const failingAdapter = {
				name: 'FailingAdapter',
				get: async () => {
					throw originalError
				},
				set: async () => true,
				delete: async () => true,
				has: async () => false,
				clear: async () => {}
			}

			const chunkManager = new ChunkManager({
				adapter: failingAdapter,
				modelName: 'Test'
			})

			try {
				await chunkManager.loadChunk(0)
				throw new Error('Should have thrown')
			} catch (error) {
				if (error instanceof Error && error.message === 'Should have thrown') {
					throw error
				}
				expect(error).toBeInstanceOf(AdapterError)
				expect((error as AdapterError).cause).toBe(originalError)
			}
		})
	})

	describe('Segment Error Wrapping', () => {
		it('should wrap segment get errors', async () => {
			const failingAdapter = {
				name: 'FailingAdapter',
				get: async () => {
					throw new Error('Segment read failed')
				},
				set: async () => true,
				delete: async () => true,
				has: async () => false,
				clear: async () => {}
			}

			const chunkManager = new ChunkManager({
				adapter: failingAdapter,
				modelName: 'Test',
				maxChunkSize: 500
			})

			try {
				await chunkManager.loadSegmentedRecord('record-1', ['0'])
				throw new Error('Should have thrown')
			} catch (error) {
				if (error instanceof Error && error.message === 'Should have thrown') {
					throw error
				}
				expect(error).toBeInstanceOf(AdapterError)
				expect((error as AdapterError).message).toContain('get')
			}
		})

		it('should wrap segment set errors', async () => {
			const failingAdapter = {
				name: 'FailingAdapter',
				get: async (): Promise<unknown> => undefined,
				set: async () => {
					throw new Error('Segment write failed')
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

			try {
				await chunkManager.saveSegmentedRecord('record-1', { id: 'record-1', data: 'x'.repeat(200) })
				throw new Error('Should have thrown')
			} catch (error) {
				if (error instanceof Error && error.message === 'Should have thrown') {
					throw error
				}
				expect(error).toBeInstanceOf(AdapterError)
				expect((error as AdapterError).message).toContain('set')
			}
		})
	})
})
