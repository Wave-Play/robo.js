/**
 * Phase 5: Encryption Adapter Edge Cases
 *
 * Tests edge-case behaviors of the EncryptionAdapter including short keys,
 * ciphertext tagging, roundtrip fidelity, key rotation, fallback keys, and CAS.
 */

import { MemoryAdapter } from 'robo.js/flashcore'
import { EncryptionAdapter } from '../../src/adapters/encryption.js'

describe('EncryptionAdapter edge cases', () => {
	let baseAdapter: MemoryAdapter
	const PRIMARY_KEY = 'primary-encryption-key-32-chars!'

	beforeEach(() => {
		baseAdapter = new MemoryAdapter()
	})

	// ── Key validation ────────────────────────────────────────────

	it('should reject keys shorter than 8 characters', () => {
		expect(() => new EncryptionAdapter(baseAdapter, { key: 'short' })).toThrow(
			'Encryption key must be at least 8 characters'
		)
	})

	it('should accept keys of exactly 8 characters', () => {
		expect(() => new EncryptionAdapter(baseAdapter, { key: '12345678' })).not.toThrow()
	})

	// ── Ciphertext tagging ────────────────────────────────────────

	it('should tag encrypted values with __enc__: prefix', async () => {
		const enc = new EncryptionAdapter(baseAdapter, { key: PRIMARY_KEY })
		await enc.set('tagged', 'hello')

		const stored = baseAdapter.get('tagged') as string
		expect(stored.startsWith('__enc__:')).toBe(true)
	})

	// ── Roundtrip with various data types ─────────────────────────

	it.each([
		['string', 'hello world'],
		['number', 42],
		['object', { nested: { deep: true } }],
		['null', null],
		['boolean', false],
		['array', [1, 'two', null, { four: 4 }]]
	])('should roundtrip %s values through encryption', async (_label, value) => {
		const enc = new EncryptionAdapter(baseAdapter, { key: PRIMARY_KEY })
		await enc.set('rt', value)
		const result = await enc.get('rt')
		expect(result).toEqual(value)
	})

	// ── Different keys produce different ciphertext ───────────────

	it('should produce different ciphertext for same value with different keys', async () => {
		const adapter1 = new MemoryAdapter()
		const adapter2 = new MemoryAdapter()
		const enc1 = new EncryptionAdapter(adapter1, { key: 'key-alpha-32-characters-long!!!!' })
		const enc2 = new EncryptionAdapter(adapter2, { key: 'key-bravo-32-characters-long!!!!' })

		const value = { data: 'identical' }
		await enc1.set('k', value)
		await enc2.set('k', value)

		const stored1 = adapter1.get('k') as string
		const stored2 = adapter2.get('k') as string

		// Both encrypted but with different derived keys
		expect(stored1.startsWith('__enc__:')).toBe(true)
		expect(stored2.startsWith('__enc__:')).toBe(true)
		expect(stored1).not.toBe(stored2)
	})

	// ── Default algorithm ─────────────────────────────────────────

	it('should default to aes-256-gcm algorithm', () => {
		const enc = new EncryptionAdapter(baseAdapter, { key: PRIMARY_KEY })
		expect(enc.getConfig().algorithm).toBe('aes-256-gcm')
	})

	// ── reEncrypt key rotation ────────────────────────────────────

	it('should re-encrypt a value from old key to new key adapter', async () => {
		const oldEnc = new EncryptionAdapter(baseAdapter, { key: PRIMARY_KEY })
		await oldEnc.set('secret', { important: true })

		const newBase = new MemoryAdapter()
		const newEnc = new EncryptionAdapter(newBase, { key: 'new-key-for-rotation-32-chars!!' })

		const ok = await oldEnc.reEncrypt('secret', newEnc)
		expect(ok).toBe(true)

		// New adapter can decrypt
		expect(await newEnc.get('secret')).toEqual({ important: true })
	})

	// ── isEncrypted utility ───────────────────────────────────────

	it('should correctly identify encrypted vs plain values', async () => {
		const enc = new EncryptionAdapter(baseAdapter, { key: PRIMARY_KEY })
		await enc.set('enc-key', 'secret')
		baseAdapter.set('plain-key', 'not encrypted')

		const encStored = baseAdapter.get('enc-key')
		const plainStored = baseAdapter.get('plain-key')

		expect(enc.isEncrypted(encStored)).toBe(true)
		expect(enc.isEncrypted(plainStored)).toBe(false)
		expect(enc.isEncrypted(undefined)).toBe(false)
		expect(enc.isEncrypted(42)).toBe(false)
	})

	// ── Fallback key (legacy default salt) ────────────────────────

	it('should decrypt values written with legacy default salt via fallback', async () => {
		// Write with explicit legacy salt
		const legacyBase = new MemoryAdapter()
		const legacyEnc = new EncryptionAdapter(legacyBase, {
			key: PRIMARY_KEY,
			salt: 'flashcore-v4-salt' // legacy default
		})
		await legacyEnc.set('legacy', { migrated: false })

		// Read with default salt (no explicit salt) which adds fallback for legacy salt
		const currentEnc = new EncryptionAdapter(legacyBase, { key: PRIMARY_KEY })
		const result = await currentEnc.get('legacy')
		expect(result).toEqual({ migrated: false })
	})

	// ── getConfig ─────────────────────────────────────────────────

	it('should return current configuration', () => {
		const gcm = new EncryptionAdapter(baseAdapter, { key: PRIMARY_KEY })
		expect(gcm.getConfig()).toEqual({ algorithm: 'aes-256-gcm' })

		const cbc = new EncryptionAdapter(baseAdapter, { key: PRIMARY_KEY, algorithm: 'aes-256-cbc' })
		expect(cbc.getConfig()).toEqual({ algorithm: 'aes-256-cbc' })
	})

	// ── CAS through encryption ────────────────────────────────────

	it('should support compareAndSwap through the encryption layer', async () => {
		const enc = new EncryptionAdapter(baseAdapter, { key: PRIMARY_KEY })
		const v1 = { version: 1 }
		const v2 = { version: 2 }

		await enc.set('cas', v1)

		// Correct expected value => swap succeeds
		const swapped = await enc.compareAndSwap!('cas', v1, v2)
		expect(swapped).toBe(true)
		expect(await enc.get('cas')).toEqual(v2)

		// Wrong expected value => swap fails
		const failed = await enc.compareAndSwap!('cas', v1, { version: 3 })
		expect(failed).toBe(false)
		expect(await enc.get('cas')).toEqual(v2) // unchanged
	})
})
