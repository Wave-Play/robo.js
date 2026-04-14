/**
 * Flashcore v1 (spec rev 4.3) Phase 0 Tests - KV Backward Compatibility
 *
 * Tests legacy key composition, kvReadPreference, kvWriteMode, dual-key resolution.
 */

import {
	Flashcore,
	FlashcoreSystem,
	MemoryAdapter,
	composeLegacyKey,
	composeV1Key,
	parseLegacyKey
} from '../helpers/flashcore-compat.js'

describe('KV Backward Compatibility', () => {
	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	describe('Key Composition Helpers', () => {
		describe('composeLegacyKey', () => {
			it('should compose key without namespace', () => {
				expect(composeLegacyKey('key')).toBe('key')
			})

			it('should compose key with string namespace', () => {
				expect(composeLegacyKey('key', 'ns')).toBe('ns__key')
			})

			it('should compose key with array namespace', () => {
				expect(composeLegacyKey('key', ['a', 'b'])).toBe('a/b__key')
			})

			it('should use custom separator', () => {
				expect(composeLegacyKey('key', ['a', 'b'], '::')).toBe('a::b__key')
			})

			it('should handle empty array namespace', () => {
				expect(composeLegacyKey('key', [])).toBe('key')
			})
		})

		describe('parseLegacyKey', () => {
			it('should parse key without namespace', () => {
				const result = parseLegacyKey('key')
				expect(result.namespace).toEqual([])
				expect(result.key).toBe('key')
			})

			it('should parse key with namespace', () => {
				const result = parseLegacyKey('ns__key')
				expect(result.namespace).toEqual(['ns'])
				expect(result.key).toBe('key')
			})

			it('should parse key with multi-segment namespace', () => {
				const result = parseLegacyKey('a/b/c__key')
				expect(result.namespace).toEqual(['a', 'b', 'c'])
				expect(result.key).toBe('key')
			})

			it('should handle custom separator', () => {
				const result = parseLegacyKey('a::b__key', '::')
				expect(result.namespace).toEqual(['a', 'b'])
				expect(result.key).toBe('key')
			})
		})

		describe('composeV1Key', () => {
			it('should compose key without namespace', () => {
				const result = composeV1Key('key')
				expect(result).toBe('key')
			})

			it('should compose key with namespace', () => {
				const result = composeV1Key('key', ['ns'])
				expect(result).toBe('ns::key')
			})

			it('should compose key with multi-segment namespace', () => {
				const result = composeV1Key('key', ['a', 'b', 'c'])
				expect(result).toBe('a:b:c::key')
			})
		})
	})

	describe('kvReadPreference', () => {
		it('should prefer legacy key by default', async () => {
			const adapter = new MemoryAdapter()
			await Flashcore.$.init({
				adapter,
				kvReadPreference: 'legacy',
				kvWriteMode: 'dual'
			})

			// Write different values to legacy and v1 keys
			const legacyKey = composeLegacyKey('key', 'ns')
			const v1Key = composeV1Key('key', ['ns'])

			adapter.set(legacyKey, 'legacy-value')
			adapter.set(v1Key, 'v1-value')

			// Should read from legacy key
			expect(await Flashcore.get('key', { namespace: 'ns' })).toBe('legacy-value')
		})

		it('should prefer v1 key when configured', async () => {
			const adapter = new MemoryAdapter()
			await Flashcore.$.init({
				adapter,
				kvReadPreference: 'v1',
				kvWriteMode: 'dual'
			})

			// Write different values to legacy and v1 keys
			const legacyKey = composeLegacyKey('key', 'ns')
			const v1Key = composeV1Key('key', ['ns'])

			adapter.set(legacyKey, 'legacy-value')
			adapter.set(v1Key, 'v1-value')

			// Should read from v1 key
			expect(await Flashcore.get('key', { namespace: 'ns' })).toBe('v1-value')
		})

		it('should fall back when preferred key is missing', async () => {
			const adapter = new MemoryAdapter()
			await Flashcore.$.init({
				adapter,
				kvReadPreference: 'legacy',
				kvWriteMode: 'dual'
			})

			// Only set v1 key
			const v1Key = composeV1Key('key', ['ns'])
			adapter.set(v1Key, 'v1-only')

			// Should fall back to v1 key
			expect(await Flashcore.get('key', { namespace: 'ns' })).toBe('v1-only')
		})
	})

	describe('kvWriteMode', () => {
		it('should write only legacy key with legacy mode', async () => {
			const adapter = new MemoryAdapter()
			await Flashcore.$.init({
				adapter,
				kvReadPreference: 'legacy',
				kvWriteMode: 'legacy'
			})

			await Flashcore.set('key', 'value', { namespace: 'ns' })

			const legacyKey = composeLegacyKey('key', 'ns')
			const v1Key = composeV1Key('key', ['ns'])

			expect(adapter.has(legacyKey)).toBe(true)
			expect(adapter.has(v1Key)).toBe(false)
		})

		it('should write only v1 key with v1 mode', async () => {
			const adapter = new MemoryAdapter()
			await Flashcore.$.init({
				adapter,
				kvReadPreference: 'v1',
				kvWriteMode: 'v1'
			})

			await Flashcore.set('key', 'value', { namespace: 'ns' })

			const legacyKey = composeLegacyKey('key', 'ns')
			const v1Key = composeV1Key('key', ['ns'])

			expect(adapter.has(legacyKey)).toBe(false)
			expect(adapter.has(v1Key)).toBe(true)
		})

		it('should write both keys with dual mode', async () => {
			const adapter = new MemoryAdapter()
			await Flashcore.$.init({
				adapter,
				kvReadPreference: 'legacy',
				kvWriteMode: 'dual'
			})

			await Flashcore.set('key', 'value', { namespace: 'ns' })

			const legacyKey = composeLegacyKey('key', 'ns')
			const v1Key = composeV1Key('key', ['ns'])

			expect(adapter.has(legacyKey)).toBe(true)
			expect(adapter.has(v1Key)).toBe(true)
			expect(adapter.get(legacyKey)).toBe('value')
			expect(adapter.get(v1Key)).toBe('value')
		})
	})

	describe('Delete removes both keys', () => {
		it('should delete both legacy and v1 keys regardless of write mode', async () => {
			const adapter = new MemoryAdapter()
			await Flashcore.$.init({
				adapter,
				kvReadPreference: 'legacy',
				kvWriteMode: 'legacy'
			})

			// Manually set both keys to simulate migration scenario
			const legacyKey = composeLegacyKey('key', 'ns')
			const v1Key = composeV1Key('key', ['ns'])

			adapter.set(legacyKey, 'legacy-value')
			adapter.set(v1Key, 'v1-value')

			// Delete should remove both
			await Flashcore.delete('key', { namespace: 'ns' })

			expect(adapter.has(legacyKey)).toBe(false)
			expect(adapter.has(v1Key)).toBe(false)
		})

		it('should return true if either key existed', async () => {
			const adapter = new MemoryAdapter()
			await Flashcore.$.init({
				adapter,
				kvReadPreference: 'legacy',
				kvWriteMode: 'dual'
			})

			// Only legacy key exists
			const legacyKey = composeLegacyKey('key', 'ns')
			adapter.set(legacyKey, 'value')

			expect(await Flashcore.delete('key', { namespace: 'ns' })).toBe(true)
		})
	})

	describe('Legacy data readable after upgrade', () => {
		it('should read legacy data written by old Flashcore', async () => {
			const adapter = new MemoryAdapter()

			// Simulate old Flashcore writing data
			const legacyKey = 'myNamespace__myKey'
			adapter.set(legacyKey, { oldData: true })

			// Initialize with legacy preference
			await Flashcore.$.init({
				adapter,
				kvReadPreference: 'legacy',
				kvWriteMode: 'dual'
			})

			// Should be able to read
			const value = await Flashcore.get<{ oldData: boolean }>('myKey', { namespace: 'myNamespace' })
			expect(value).toEqual({ oldData: true })
		})

		it('should read legacy data with nested namespace', async () => {
			const adapter = new MemoryAdapter()

			// Old format with nested namespace
			const legacyKey = 'app/cache/users__profile'
			adapter.set(legacyKey, 'cached-profile')

			await Flashcore.$.init({
				adapter,
				kvReadPreference: 'legacy',
				kvWriteMode: 'dual'
			})

			// Should read with array namespace
			const value = await Flashcore.get('profile', { namespace: ['app', 'cache', 'users'] })
			expect(value).toBe('cached-profile')
		})
	})

	describe('Migration scenario', () => {
		it('should support gradual migration with dual write', async () => {
			const adapter = new MemoryAdapter()

			// Step 1: Legacy data exists
			adapter.set('ns__key1', 'old-value-1')
			adapter.set('ns__key2', 'old-value-2')

			// Step 2: Initialize with dual write
			await Flashcore.$.init({
				adapter,
				kvReadPreference: 'legacy',
				kvWriteMode: 'dual'
			})

			// Step 3: Read old data
			expect(await Flashcore.get('key1', { namespace: 'ns' })).toBe('old-value-1')

			// Step 4: Update data (writes to both keys)
			await Flashcore.set('key1', 'new-value-1', { namespace: 'ns' })

			// Step 5: Both keys have new value
			const legacyKey = composeLegacyKey('key1', 'ns')
			const v1Key = composeV1Key('key1', ['ns'])

			expect(adapter.get(legacyKey)).toBe('new-value-1')
			expect(adapter.get(v1Key)).toBe('new-value-1')

			// Step 6: After migration complete, can switch to v1 preference
			// (would need to reinit in real scenario)
		})
	})

	describe('has() with dual keys', () => {
		it('should return true if either key exists', async () => {
			const adapter = new MemoryAdapter()
			await Flashcore.$.init({
				adapter,
				kvReadPreference: 'legacy',
				kvWriteMode: 'dual'
			})

			// Only v1 key exists
			const v1Key = composeV1Key('key', ['ns'])
			adapter.set(v1Key, 'value')

			expect(await Flashcore.has('key', { namespace: 'ns' })).toBe(true)
		})
	})
})
