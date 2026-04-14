/**
 * Flashcore v1 (spec rev 4.3) Phase 3 - Compression Wrapper Tests
 *
 * Tests for the gzip compression wrapper.
 */

// Uses Jest globals
import { CompressionAdapter, createCompressionAdapter } from '../../src/adapters/compression.js'
import { MemoryAdapter } from 'robo.js/flashcore'

describe('CompressionAdapter', () => {
	let baseAdapter: MemoryAdapter
	let compression: CompressionAdapter

	beforeEach(() => {
		baseAdapter = new MemoryAdapter()
		compression = new CompressionAdapter(baseAdapter, { threshold: 50 })
	})

	describe('Basic Compression', () => {
		it('should compress values above threshold', async () => {
			const largeValue = { data: 'x'.repeat(100) }

			await compression.set('large', largeValue)

			// Check raw stored value has compression prefix
			const stored = baseAdapter.get('large') as string
			expect(stored).toMatch(/^__gz__:/)

			// Should decompress on get
			const result = await compression.get('large')
			expect(result).toEqual(largeValue)
		})

		it('should not compress values below threshold', async () => {
			const smallValue = { a: 1 }

			await compression.set('small', smallValue)

			// Raw value should not be compressed
			const stored = baseAdapter.get('small')
			expect(stored).toEqual(smallValue)

			const result = await compression.get('small')
			expect(result).toEqual(smallValue)
		})

		it('should handle exact threshold boundary', async () => {
			// Create value just at threshold
			const borderValue = 'x'.repeat(48) // JSON overhead brings it to ~50

			await compression.set('border', borderValue)

			// Should round-trip correctly regardless of compression
			const result = await compression.get('border')
			expect(result).toBe(borderValue)
		})
	})

	describe('Compression Tag', () => {
		it('should use __gz__: prefix for compressed data', async () => {
			const largeValue = { content: 'y'.repeat(200) }

			await compression.set('tagged', largeValue)

			const stored = baseAdapter.get('tagged') as string
			expect(stored.startsWith('__gz__:')).toBe(true)
		})

		it('should identify compressed values', async () => {
			await compression.set('compressed', { data: 'z'.repeat(100) })
			await compression.set('uncompressed', { a: 1 })

			const compressedStored = baseAdapter.get('compressed')
			const uncompressedStored = baseAdapter.get('uncompressed')

			expect(compression.isCompressed(compressedStored)).toBe(true)
			expect(compression.isCompressed(uncompressedStored)).toBe(false)
		})
	})

	describe('Data Integrity', () => {
		it('should preserve nested objects', async () => {
			const nested = {
				level1: {
					level2: {
						level3: {
							data: 'nested'.repeat(50)
						}
					}
				}
			}

			await compression.set('nested', nested)
			const result = await compression.get('nested')
			expect(result).toEqual(nested)
		})

		it('should preserve arrays', async () => {
			const array = Array.from({ length: 100 }, (_, i) => ({
				index: i,
				value: `item${i}`
			}))

			await compression.set('array', array)
			const result = await compression.get('array')
			expect(result).toEqual(array)
		})

		it('should preserve unicode', async () => {
			const unicode = {
				chinese: '中'.repeat(100),
				emoji: '🎉'.repeat(100),
				mixed: 'Hello 世界 🌍'.repeat(20)
			}

			await compression.set('unicode', unicode)
			const result = await compression.get('unicode')
			expect(result).toEqual(unicode)
		})

		it('should preserve special JSON values', async () => {
			const special: Record<string, unknown> = {
				nullValue: null,
				boolTrue: true,
				boolFalse: false,
				zero: 0,
				empty: '',
				padding: 'x'.repeat(100)
			}

			await compression.set('special', special)
			const result = await compression.get('special')
			expect(result).toEqual(special)
		})
	})

	describe('Threshold Configuration', () => {
		it('should respect custom threshold', async () => {
			const highThreshold = new CompressionAdapter(baseAdapter, { threshold: 1000 })

			const mediumValue = { data: 'y'.repeat(500) }
			await highThreshold.set('medium', mediumValue)

			// Should not be compressed
			const stored = baseAdapter.get('medium')
			expect(highThreshold.isCompressed(stored)).toBe(false)
		})

		it('should allow changing threshold', async () => {
			compression.setThreshold(1000)
			expect(compression.getThreshold()).toBe(1000)

			const value = { data: 'z'.repeat(500) }
			await compression.set('test', value)

			// Should not be compressed with new higher threshold
			const stored = baseAdapter.get('test')
			expect(compression.isCompressed(stored)).toBe(false)
		})
	})

	describe('Edge Cases', () => {
		it('should handle undefined return', async () => {
			const result = await compression.get('nonexistent')
			expect(result).toBeUndefined()
		})

		it('should handle already-compressed values from underlying adapter', async () => {
			// Simulate pre-compressed value
			const preCompressed = '__gz__:H4sIAAAAAAAAA6tWKkktLlGyUlAqS8wpTtVRSssvyklRAgCIjdQVEQAAAA=='
			await baseAdapter.set('precompressed', preCompressed as unknown)

			// Should decompress correctly
			const result = await compression.get('precompressed')
			expect(result).toBeDefined()
		})

		it('should handle non-string stored values', async () => {
			// Store uncompressed value directly
			const value = { small: true }
			await baseAdapter.set('direct', value)

			const result = await compression.get('direct')
			expect(result).toEqual(value)
		})
	})

	describe('Optional Capabilities', () => {
		it('should compress in setIfNotExists', async () => {
			const largeValue = { data: 'a'.repeat(100) }

			await compression.setIfNotExists!('sne', largeValue)

			const stored = baseAdapter.get('sne') as string
			expect(stored.startsWith('__gz__:')).toBe(true)

			const result = await compression.get('sne')
			expect(result).toEqual(largeValue)
		})

		it('should compress in atomicBatch', async () => {
			const largeValue = { data: 'b'.repeat(100) }

			await compression.atomicBatch!([
				{ type: 'set', key: 'batch', value: largeValue }
			])

			const stored = baseAdapter.get('batch') as string
			expect(stored.startsWith('__gz__:')).toBe(true)
		})
	})

	describe('Factory Function', () => {
		it('should create adapter with createCompressionAdapter', async () => {
			const factoryCompression = createCompressionAdapter(baseAdapter, { threshold: 100 })
			const value = { data: 'c'.repeat(200) }

			await factoryCompression.set('test', value)
			const result = await factoryCompression.get('test')
			expect(result).toEqual(value)
		})
	})

	describe('Compression Levels', () => {
		it('should support different compression levels', async () => {
			const level1 = new CompressionAdapter(baseAdapter, { threshold: 50, level: 1 })
			const level9 = new CompressionAdapter(new MemoryAdapter(), { threshold: 50, level: 9 })

			const value = { data: 'repeated'.repeat(100) }

			await level1.set('key', value)
			await level9.set('key', value)

			// Both should decompress correctly
			expect(await level1.get('key')).toEqual(value)
			expect(await level9.get('key')).toEqual(value)
		})
	})
})
