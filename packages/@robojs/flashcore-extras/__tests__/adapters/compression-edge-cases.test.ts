/**
 * Phase 5: Compression Adapter Edge Cases
 *
 * Tests threshold behavior, multi-byte content handling,
 * compressed-value tagging, roundtrip fidelity, and configuration APIs.
 */

import { MemoryAdapter } from 'robo.js/flashcore'
import { CompressionAdapter } from '../../src/adapters/compression.js'

describe('CompressionAdapter edge cases', () => {
	let baseAdapter: MemoryAdapter

	beforeEach(() => {
		baseAdapter = new MemoryAdapter()
	})

	// ── Below-threshold values stay uncompressed ──────────────────

	it('should NOT compress values below the threshold', async () => {
		const comp = new CompressionAdapter(baseAdapter, { threshold: 100 })
		const small = 'tiny'

		await comp.set('small', small)

		const stored = baseAdapter.get('small')
		// Value should be stored as-is (no __gz__: prefix)
		expect(typeof stored === 'string' && stored.startsWith('__gz__:')).toBe(false)
		expect(stored).toBe(small)
	})

	// ── Boundary behavior ─────────────────────────────────────────

	it('should not compress at threshold-1, should compress at threshold+1', async () => {
		const threshold = 20
		const comp = new CompressionAdapter(baseAdapter, { threshold })

		// JSON.stringify(value).length must be compared against the threshold.
		// A string of length N serializes to N+2 chars (with quotes).
		// So we need json.length < threshold for no compression.
		// threshold-1 means json length of 19 => string of length 17
		const belowStr = 'x'.repeat(threshold - 3) // JSON = "xxx..." => length threshold - 1
		const aboveStr = 'x'.repeat(threshold - 1) // JSON = "xxx..." => length threshold + 1

		await comp.set('below', belowStr)
		await comp.set('above', aboveStr)

		const storedBelow = baseAdapter.get('below') as string | unknown
		const storedAbove = baseAdapter.get('above') as string | unknown

		// Below threshold: stored without prefix
		expect(typeof storedBelow === 'string' && storedBelow.startsWith('__gz__:')).toBe(false)

		// Above threshold: stored with prefix
		expect(typeof storedAbove === 'string' && storedAbove.startsWith('__gz__:')).toBe(true)
	})

	// ── Multi-byte UTF-8 content ──────────────────────────────────

	it('should use string length (not byte length) for threshold comparison', async () => {
		// Each emoji is 1-2 chars in JS string length but 4 bytes in UTF-8.
		// We pick a threshold between the string length and byte length.
		const emojis = '😀😃😄😁😆😅😂🤣' // 8 emoji, string length varies by runtime
		const jsonLen = JSON.stringify(emojis).length

		// Set threshold just above the JSON string length so it is NOT compressed
		const comp = new CompressionAdapter(baseAdapter, { threshold: jsonLen + 1 })
		await comp.set('emoji', emojis)

		const stored = baseAdapter.get('emoji')
		// Should not be compressed (threshold uses string.length)
		expect(typeof stored === 'string' && stored.startsWith('__gz__:')).toBe(false)

		// Roundtrip must still succeed
		expect(await comp.get('emoji')).toBe(emojis)
	})

	// ── Compressed prefix tag ─────────────────────────────────────

	it('should tag compressed values with __gz__: prefix', async () => {
		const comp = new CompressionAdapter(baseAdapter, { threshold: 10 })
		const bigValue = 'a'.repeat(200)

		await comp.set('big', bigValue)

		const stored = baseAdapter.get('big') as string
		expect(stored.startsWith('__gz__:')).toBe(true)
	})

	// ── isCompressed utility ──────────────────────────────────────

	it('should identify compressed values correctly', async () => {
		const comp = new CompressionAdapter(baseAdapter, { threshold: 10 })
		await comp.set('big', 'a'.repeat(200))
		baseAdapter.set('plain', 'hello')

		expect(comp.isCompressed(baseAdapter.get('big'))).toBe(true)
		expect(comp.isCompressed(baseAdapter.get('plain'))).toBe(false)
		expect(comp.isCompressed(undefined)).toBe(false)
		expect(comp.isCompressed(42)).toBe(false)
	})

	// ── Roundtrip with complex data ───────────────────────────────

	it('should roundtrip JSON objects, arrays, and nested data through compression', async () => {
		const comp = new CompressionAdapter(baseAdapter, { threshold: 10 })
		const complex = {
			users: [
				{ id: 1, name: 'Alice', tags: ['admin', 'editor'] },
				{ id: 2, name: 'Bob', tags: [] }
			],
			metadata: { version: 3, nested: { deep: { value: true } } }
		}

		await comp.set('complex', complex)
		expect(await comp.get('complex')).toEqual(complex)
	})

	// ── getConfig ─────────────────────────────────────────────────

	it('should return threshold and level from getConfig', () => {
		const comp = new CompressionAdapter(baseAdapter, { threshold: 256, level: 9 })
		expect(comp.getConfig()).toEqual({ threshold: 256, level: 9 })
	})

	it('should use defaults when no options provided', () => {
		const comp = new CompressionAdapter(baseAdapter)
		expect(comp.getConfig()).toEqual({ threshold: 512, level: 6 })
	})

	// ── setThreshold ──────────────────────────────────────────────

	it('should allow changing threshold dynamically', async () => {
		const comp = new CompressionAdapter(baseAdapter, { threshold: 10000 })
		const largeStr = 'z'.repeat(500)

		// With high threshold, value is not compressed
		await comp.set('a', largeStr)
		expect(comp.isCompressed(baseAdapter.get('a'))).toBe(false)

		// Lower threshold
		comp.setThreshold(10)
		await comp.set('b', largeStr)
		expect(comp.isCompressed(baseAdapter.get('b'))).toBe(true)

		// Verify getThreshold reflects change
		expect(comp.getThreshold()).toBe(10)
	})
})
