/** Phase 2: Core Unit Tests - Constants */

import {
	WAL_ENTRY_PREFIX,
	WAL_SEGMENT_PREFIX,
	WAL_STALE_THRESHOLD_MS,
	DEFAULT_MAX_CHUNK_SIZE,
	DEFAULT_MAX_RECORDS_PER_CHUNK,
	SAFE_ID_PATTERN,
	SAFE_KEY_CHARS,
	DEFAULT_SAFETY_LIMITS,
	MAX_CASCADE_DEPTH,
	MAX_INCLUDE_DEPTH,
	JUNCTION_PREFIX,
	MAX_VERSION_VALUE,
	VERSION_OVERFLOW_WARN_THRESHOLD,
	RESERVED_PREFIXES,
	isReservedPrefix,
	STORAGE_EXHAUSTION_PATTERNS,
	RECORD_SEGMENT_PREFIX,
	DEFAULT_CHUNK_CACHE_SIZE
} from '../../../src/flashcore/core/constants.js'

describe('Flashcore Constants', () => {
	describe('isReservedPrefix', () => {
		it('should return true for _model: prefix', () => {
			expect(isReservedPrefix('_model:test')).toBe(true)
		})

		it('should return true for _flashcore: prefix', () => {
			expect(isReservedPrefix('_flashcore:wal')).toBe(true)
		})

		it('should return true for _wal: prefix', () => {
			expect(isReservedPrefix('_wal:entry')).toBe(true)
		})

		it('should return true for _junction_ prefix', () => {
			expect(isReservedPrefix('_junction_A_B')).toBe(true)
		})

		it('should return false for user:data', () => {
			expect(isReservedPrefix('user:data')).toBe(false)
		})

		it('should return false for regular-key', () => {
			expect(isReservedPrefix('regular-key')).toBe(false)
		})

		it('should return false for empty string', () => {
			expect(isReservedPrefix('')).toBe(false)
		})
	})

	describe('SAFE_ID_PATTERN', () => {
		it('should match alphanumeric with hyphens and underscores', () => {
			expect(SAFE_ID_PATTERN.test('abc123')).toBe(true)
		})

		it('should match mixed separators', () => {
			expect(SAFE_ID_PATTERN.test('a-b_c')).toBe(true)
		})

		it('should not match strings with spaces', () => {
			expect(SAFE_ID_PATTERN.test('hello world')).toBe(false)
		})

		it('should not match empty string', () => {
			expect(SAFE_ID_PATTERN.test('')).toBe(false)
		})
	})

	describe('SAFE_KEY_CHARS', () => {
		it('should match model:chunk:0 format', () => {
			expect(SAFE_KEY_CHARS.test('model:chunk:0')).toBe(true)
		})

		it('should match slashes, hyphens, underscores, dots, colons', () => {
			expect(SAFE_KEY_CHARS.test('a/b-c_d.e:f')).toBe(true)
		})

		it('should not match strings with spaces', () => {
			expect(SAFE_KEY_CHARS.test('key with spaces')).toBe(false)
		})
	})

	describe('STORAGE_EXHAUSTION_PATTERNS', () => {
		it('should match ENOSPC error string', () => {
			const matched = STORAGE_EXHAUSTION_PATTERNS.some((p) => p.test('Error: ENOSPC: write failed'))
			expect(matched).toBe(true)
		})

		it('should match "no space left on device"', () => {
			const matched = STORAGE_EXHAUSTION_PATTERNS.some((p) => p.test('no space left on device'))
			expect(matched).toBe(true)
		})

		it('should match "quota exceeded"', () => {
			const matched = STORAGE_EXHAUSTION_PATTERNS.some((p) => p.test('Storage quota exceeded'))
			expect(matched).toBe(true)
		})

		it('should not match unrelated error strings', () => {
			const matched = STORAGE_EXHAUSTION_PATTERNS.some((p) => p.test('Connection refused'))
			expect(matched).toBe(false)
		})
	})

	describe('Value spot checks', () => {
		it('DEFAULT_MAX_CHUNK_SIZE should be 100000', () => {
			expect(DEFAULT_MAX_CHUNK_SIZE).toBe(100_000)
		})

		it('DEFAULT_MAX_RECORDS_PER_CHUNK should be 50', () => {
			expect(DEFAULT_MAX_RECORDS_PER_CHUNK).toBe(50)
		})

		it('MAX_CASCADE_DEPTH should be 50', () => {
			expect(MAX_CASCADE_DEPTH).toBe(50)
		})

		it('MAX_INCLUDE_DEPTH should be 10', () => {
			expect(MAX_INCLUDE_DEPTH).toBe(10)
		})

		it('DEFAULT_CHUNK_CACHE_SIZE should be 20', () => {
			expect(DEFAULT_CHUNK_CACHE_SIZE).toBe(20)
		})

		it('WAL_STALE_THRESHOLD_MS should be 5 minutes', () => {
			expect(WAL_STALE_THRESHOLD_MS).toBe(5 * 60 * 1000)
		})

		it('MAX_VERSION_VALUE should be Number.MAX_SAFE_INTEGER', () => {
			expect(MAX_VERSION_VALUE).toBe(Number.MAX_SAFE_INTEGER)
		})

		it('VERSION_OVERFLOW_WARN_THRESHOLD should be 90% of MAX_VERSION_VALUE', () => {
			expect(VERSION_OVERFLOW_WARN_THRESHOLD).toBe(Math.floor(Number.MAX_SAFE_INTEGER * 0.9))
		})
	})

	describe('Exported constants are defined', () => {
		it('WAL_ENTRY_PREFIX is a non-empty string', () => {
			expect(typeof WAL_ENTRY_PREFIX).toBe('string')
			expect(WAL_ENTRY_PREFIX.length).toBeGreaterThan(0)
		})

		it('WAL_SEGMENT_PREFIX is a non-empty string', () => {
			expect(typeof WAL_SEGMENT_PREFIX).toBe('string')
			expect(WAL_SEGMENT_PREFIX.length).toBeGreaterThan(0)
		})

		it('RECORD_SEGMENT_PREFIX is a non-empty string', () => {
			expect(typeof RECORD_SEGMENT_PREFIX).toBe('string')
			expect(RECORD_SEGMENT_PREFIX.length).toBeGreaterThan(0)
		})

		it('JUNCTION_PREFIX is a non-empty string', () => {
			expect(typeof JUNCTION_PREFIX).toBe('string')
			expect(JUNCTION_PREFIX.length).toBeGreaterThan(0)
		})

		it('RESERVED_PREFIXES is an array of at least 4 entries', () => {
			expect(Array.isArray(RESERVED_PREFIXES)).toBe(true)
			expect(RESERVED_PREFIXES.length).toBeGreaterThanOrEqual(4)
		})

		it('DEFAULT_SAFETY_LIMITS has expected keys', () => {
			expect(DEFAULT_SAFETY_LIMITS).toHaveProperty('maxDefaultResults')
			expect(DEFAULT_SAFETY_LIMITS).toHaveProperty('warnResultsThreshold')
			expect(DEFAULT_SAFETY_LIMITS).toHaveProperty('maxBulkOperationWithoutWhere')
		})
	})
})
