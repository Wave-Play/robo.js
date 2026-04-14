/**
 * Flashcore v1 (spec rev 4.3) Phase 5 Tests - Chunk Corruption Detection
 *
 * Tests that malformed chunk payloads trigger DataCorruptionError with actionable guidance.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { FlashcoreSystem, MemoryAdapter } from '../helpers/flashcore-compat.js'
import { ChunkManager } from '../../../src/flashcore/model/chunk.js'
import { DataCorruptionError } from '../../../src/flashcore/core/errors.js'
import { buildModelKey } from '../../../src/flashcore/core/keys.js'

describe('Chunk Corruption Detection', () => {
	let adapter: MemoryAdapter

	beforeEach(async () => {
		await FlashcoreSystem._reset()
		adapter = new MemoryAdapter()
		await adapter.init?.()
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	describe('Malformed Chunk Detection', () => {
		it('should throw DataCorruptionError for array chunk data', async () => {
			const chunkManager = new ChunkManager({
				adapter,
				modelName: 'Test'
			})

			// Corrupt the chunk with an array instead of object
			const chunkKey = buildModelKey('Test', 'chunk:0')
			await adapter.set(chunkKey, ['invalid', 'array', 'data'])

			await expect(chunkManager.loadChunk(0)).rejects.toThrow(DataCorruptionError)
		})

		it('should throw DataCorruptionError for string chunk data', async () => {
			const chunkManager = new ChunkManager({
				adapter,
				modelName: 'Test'
			})

			const chunkKey = buildModelKey('Test', 'chunk:0')
			await adapter.set(chunkKey, 'invalid string data')

			await expect(chunkManager.loadChunk(0)).rejects.toThrow(DataCorruptionError)
		})

		it('should throw DataCorruptionError for number chunk data', async () => {
			const chunkManager = new ChunkManager({
				adapter,
				modelName: 'Test'
			})

			const chunkKey = buildModelKey('Test', 'chunk:0')
			await adapter.set(chunkKey, 12345)

			await expect(chunkManager.loadChunk(0)).rejects.toThrow(DataCorruptionError)
		})

		it('should include model name in error', async () => {
			const chunkManager = new ChunkManager({
				adapter,
				modelName: 'UserProfile'
			})

			const chunkKey = buildModelKey('UserProfile', 'chunk:0')
			await adapter.set(chunkKey, ['invalid'])

			try {
				await chunkManager.loadChunk(0)
				throw new Error('Should have thrown')
			} catch (error) {
				if (error instanceof Error && error.message === 'Should have thrown') {
					throw error
				}
				expect(error).toBeInstanceOf(DataCorruptionError)
				expect((error as DataCorruptionError).message).toContain('UserProfile')
			}
		})

		it('should include repair guidance in error', async () => {
			const chunkManager = new ChunkManager({
				adapter,
				modelName: 'Test'
			})

			const chunkKey = buildModelKey('Test', 'chunk:0')
			await adapter.set(chunkKey, ['invalid'])

			try {
				await chunkManager.loadChunk(0)
				throw new Error('Should have thrown')
			} catch (error) {
				if (error instanceof Error && error.message === 'Should have thrown') {
					throw error
				}
				expect(error).toBeInstanceOf(DataCorruptionError)
				const corruptionError = error as DataCorruptionError
				expect(corruptionError.repairGuidance).toBeDefined()
				expect(corruptionError.message).toContain('robo db repair')
			}
		})

		it('should include structure type in error', async () => {
			const chunkManager = new ChunkManager({
				adapter,
				modelName: 'Test'
			})

			const chunkKey = buildModelKey('Test', 'chunk:0')
			await adapter.set(chunkKey, ['invalid'])

			try {
				await chunkManager.loadChunk(0)
				throw new Error('Should have thrown')
			} catch (error) {
				if (error instanceof Error && error.message === 'Should have thrown') {
					throw error
				}
				expect(error).toBeInstanceOf(DataCorruptionError)
				expect((error as DataCorruptionError).structure).toBe('chunk')
			}
		})
	})

	describe('Valid Chunk Data', () => {
		it('should accept valid object chunk data', async () => {
			const chunkManager = new ChunkManager({
				adapter,
				modelName: 'Test'
			})

			const chunkKey = buildModelKey('Test', 'chunk:0')
			await adapter.set(chunkKey, {
				'id-1': { id: 'id-1', name: 'Record 1' },
				'id-2': { id: 'id-2', name: 'Record 2' }
			})

			const chunk = await chunkManager.loadChunk(0)
			expect(chunk).toEqual({
				'id-1': { id: 'id-1', name: 'Record 1' },
				'id-2': { id: 'id-2', name: 'Record 2' }
			})
		})

		it('should return empty object for missing chunk', async () => {
			const chunkManager = new ChunkManager({
				adapter,
				modelName: 'Test'
			})

			const chunk = await chunkManager.loadChunk(99)
			expect(chunk).toEqual({})
		})

		it('should return empty object for null chunk data', async () => {
			const chunkManager = new ChunkManager({
				adapter,
				modelName: 'Test'
			})

			const chunkKey = buildModelKey('Test', 'chunk:0')
			await adapter.set(chunkKey, null)

			const chunk = await chunkManager.loadChunk(0)
			expect(chunk).toEqual({})
		})
	})

	describe('Segment Corruption Detection', () => {
		it('should throw DataCorruptionError for missing segment', async () => {
			const chunkManager = new ChunkManager({
				adapter,
				modelName: 'Test',
				maxChunkSize: 500
			})

			// Only save one segment, then try to load with two segment IDs
			const segKey = buildModelKey('Test', 'seg:record-1:0')
			await adapter.set(segKey, '{"partial":"data"}')

			await expect(
				chunkManager.loadSegmentedRecord('record-1', ['0', '1'])
			).rejects.toThrow(DataCorruptionError)
		})

		it('should throw DataCorruptionError for non-string segment', async () => {
			const chunkManager = new ChunkManager({
				adapter,
				modelName: 'Test',
				maxChunkSize: 500
			})

			const segKey = buildModelKey('Test', 'seg:record-1:0')
			await adapter.set(segKey, { invalid: 'object segment' })

			await expect(
				chunkManager.loadSegmentedRecord('record-1', ['0'])
			).rejects.toThrow(DataCorruptionError)
		})

		it('should throw DataCorruptionError for unparseable JSON segments', async () => {
			const chunkManager = new ChunkManager({
				adapter,
				modelName: 'Test',
				maxChunkSize: 500
			})

			const segKey = buildModelKey('Test', 'seg:record-1:0')
			await adapter.set(segKey, 'not valid json {{{')

			await expect(
				chunkManager.loadSegmentedRecord('record-1', ['0'])
			).rejects.toThrow(DataCorruptionError)
		})
	})
})
