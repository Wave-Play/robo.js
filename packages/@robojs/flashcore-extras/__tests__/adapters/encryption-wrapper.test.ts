/**
 * Flashcore v1 (spec rev 4.3) Phase 3 - Encryption Wrapper Tests
 *
 * Tests for the AES encryption wrapper.
 */

// Uses Jest globals
import { EncryptionAdapter, createEncryptionAdapter } from '../../src/adapters/encryption.js'
import { MemoryAdapter } from 'robo.js/flashcore'

describe('EncryptionAdapter', () => {
	let baseAdapter: MemoryAdapter
	let encryption: EncryptionAdapter

	const TEST_KEY = 'test-encryption-key-32-chars-long'

	beforeEach(() => {
		baseAdapter = new MemoryAdapter()
		encryption = new EncryptionAdapter(baseAdapter, { key: TEST_KEY })
	})

	describe('Basic Encryption', () => {
		it('should encrypt values on set', async () => {
			const value = { secret: 'sensitive data' }

			await encryption.set('secret', value)

			// Raw stored value should be encrypted
			const stored = baseAdapter.get('secret') as string
			expect(stored).toMatch(/^__enc__:/)

			// Original value should not be visible in stored data
			expect(stored).not.toContain('sensitive')
		})

		it('should decrypt values on get', async () => {
			const value = { secret: 'sensitive data', count: 42 }

			await encryption.set('secret', value)
			const result = await encryption.get('secret')

			expect(result).toEqual(value)
		})

		it('should handle non-existent keys', async () => {
			const result = await encryption.get('nonexistent')
			expect(result).toBeUndefined()
		})
	})

	describe('Encryption Tag', () => {
		it('should use __enc__: prefix for encrypted data', async () => {
			await encryption.set('tagged', { data: 'test' })

			const stored = baseAdapter.get('tagged') as string
			expect(stored.startsWith('__enc__:')).toBe(true)
		})

		it('should identify encrypted values', async () => {
			await encryption.set('encrypted', { a: 1 })
			await baseAdapter.set('plain', { b: 2 })

			const encryptedStored = baseAdapter.get('encrypted')
			const plainStored = baseAdapter.get('plain')

			expect(encryption.isEncrypted(encryptedStored)).toBe(true)
			expect(encryption.isEncrypted(plainStored)).toBe(false)
		})
	})

	describe('Key Security', () => {
		it('should produce different ciphertext for same plaintext', async () => {
			const value = { data: 'same data' }

			await encryption.set('key1', value)
			await encryption.set('key2', value)

			const stored1 = baseAdapter.get('key1') as string
			const stored2 = baseAdapter.get('key2') as string

			// Ciphertext should differ due to random IV
			expect(stored1).not.toBe(stored2)
		})

		it('should fail decryption with wrong key', async () => {
			await encryption.set('secret', { data: 'sensitive' })

			const wrongKeyAdapter = new EncryptionAdapter(baseAdapter, {
				key: 'different-key-for-testing-1234'
			})

			// Should throw on decryption failure
			await expect(wrongKeyAdapter.get('secret')).rejects.toThrow()
		})

		it('should require minimum key length', () => {
			expect(() => {
				new EncryptionAdapter(baseAdapter, { key: 'short' })
			}).toThrow()
		})
	})

	describe('Data Integrity', () => {
		it('should preserve nested objects', async () => {
			const nested = {
				level1: {
					level2: {
						level3: { secret: 'deep' }
					}
				}
			}

			await encryption.set('nested', nested)
			const result = await encryption.get('nested')
			expect(result).toEqual(nested)
		})

		it('should preserve arrays', async () => {
			const array = [
				{ id: 1, name: 'Alice' },
				{ id: 2, name: 'Bob' },
				{ id: 3, name: 'Charlie' }
			]

			await encryption.set('array', array)
			const result = await encryption.get('array')
			expect(result).toEqual(array)
		})

		it('should preserve unicode', async () => {
			const unicode = {
				chinese: '你好世界',
				emoji: '🔐🔑🗝️',
				arabic: 'مرحبا',
				mixed: 'Hello 世界 🌍'
			}

			await encryption.set('unicode', unicode)
			const result = await encryption.get('unicode')
			expect(result).toEqual(unicode)
		})

		it('should preserve special values', async () => {
			const special: Record<string, unknown> = {
				nullValue: null,
				boolTrue: true,
				boolFalse: false,
				zero: 0,
				empty: '',
				number: 3.14159
			}

			await encryption.set('special', special)
			const result = await encryption.get('special')
			expect(result).toEqual(special)
		})

		it('should handle large values', async () => {
			const large = {
				data: 'x'.repeat(10000),
				array: Array.from({ length: 1000 }, (_, i) => i)
			}

			await encryption.set('large', large)
			const result = await encryption.get('large')
			expect(result).toEqual(large)
		})
	})

	describe('Algorithm Selection', () => {
		it('should support AES-256-GCM (default)', async () => {
			const gcm = new EncryptionAdapter(baseAdapter, {
				key: TEST_KEY,
				algorithm: 'aes-256-gcm'
			})

			const value = { algo: 'gcm' }
			await gcm.set('test', value)
			expect(await gcm.get('test')).toEqual(value)
		})

		it('should support AES-256-CBC', async () => {
			const cbc = new EncryptionAdapter(new MemoryAdapter(), {
				key: TEST_KEY,
				algorithm: 'aes-256-cbc'
			})

			const value = { algo: 'cbc' }
			await cbc.set('test', value)
			expect(await cbc.get('test')).toEqual(value)
		})
	})

	describe('Salt Configuration', () => {
		it('should produce different keys with different salts', async () => {
			const salt1 = new EncryptionAdapter(new MemoryAdapter(), {
				key: TEST_KEY,
				salt: 'salt-one'
			})
			const salt2 = new EncryptionAdapter(new MemoryAdapter(), {
				key: TEST_KEY,
				salt: 'salt-two'
			})

			await salt1.set('test', { data: 'same' })
			await salt2.set('test', { data: 'same' })

			// Data encrypted with salt1 cannot be decrypted with salt2
			const adapter1 = (salt1 as any).next as MemoryAdapter
			const adapter2 = (salt2 as any).next as MemoryAdapter

			const encrypted1 = adapter1.get('test')
			const encrypted2 = adapter2.get('test')

			expect(encrypted1).not.toBe(encrypted2)
		})
	})

	describe('Optional Capabilities', () => {
		it('should encrypt in setIfNotExists', async () => {
			const value = { sensitive: true }

			const result = await encryption.setIfNotExists!('sne', value)
			expect(result).toBe(true)

			const stored = baseAdapter.get('sne') as string
			expect(stored.startsWith('__enc__:')).toBe(true)
			expect(await encryption.get('sne')).toEqual(value)
		})

		it('should handle compareAndSwap with encryption', async () => {
			const v1 = { version: 1 }
			const v2 = { version: 2 }

			await encryption.set('cas', v1)

			// CAS should work by comparing decrypted values
			const result = await encryption.compareAndSwap!('cas', v1, v2)
			expect(result).toBe(true)
			expect(await encryption.get('cas')).toEqual(v2)
		})

		it('should encrypt in atomicBatch', async () => {
			await encryption.atomicBatch!([
				{ type: 'set', key: 'batch1', value: { a: 1 } },
				{ type: 'set', key: 'batch2', value: { b: 2 } }
			])

			const stored1 = baseAdapter.get('batch1') as string
			const stored2 = baseAdapter.get('batch2') as string

			expect(stored1.startsWith('__enc__:')).toBe(true)
			expect(stored2.startsWith('__enc__:')).toBe(true)
		})
	})

	describe('Factory Function', () => {
		it('should create adapter with createEncryptionAdapter', async () => {
			const factoryEncryption = createEncryptionAdapter(baseAdapter, {
				key: 'another-key-for-testing-123'
			})

			const value = { factory: true }
			await factoryEncryption.set('test', value)
			expect(await factoryEncryption.get('test')).toEqual(value)
		})
	})

	describe('Re-encryption', () => {
		it('should support key rotation via reEncrypt', async () => {
			const oldKey = new EncryptionAdapter(baseAdapter, { key: TEST_KEY })
			await oldKey.set('secret', { data: 'important' })

			const newAdapter = new MemoryAdapter()
			const newKey = new EncryptionAdapter(newAdapter, {
				key: 'new-encryption-key-for-rotation'
			})

			// Re-encrypt with new key
			await oldKey.reEncrypt('secret', newKey)

			// New adapter should have the value
			expect(await newKey.get('secret')).toEqual({ data: 'important' })
		})
	})
})
