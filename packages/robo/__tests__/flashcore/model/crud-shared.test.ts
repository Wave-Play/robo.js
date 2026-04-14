/**
 * Flashcore v1 (spec rev 4.3) Phase 3 - CRUD Shared Utilities Tests
 *
 * Tests pure functions and async helpers from src/flashcore/model/crud/shared.ts.
 * Covers findVersionField, valuesEqual, applySelect, getChunkIdFromEntry,
 * validateWhereClause, resolveChunkKey, incrementVersion, extractIdFromWhere,
 * and releaseConstraintsOnError.
 */

import { jest } from '@jest/globals'
import {
	findVersionField,
	valuesEqual,
	applySelect,
	getChunkIdFromEntry,
	validateWhereClause,
	resolveChunkKey,
	incrementVersion,
	extractIdFromWhere,
	releaseConstraintsOnError
} from '../../../src/flashcore/model/crud/shared.js'
import { ValidationError } from '../../../src/flashcore/core/errors.js'
import { buildModelKey } from '../../../src/flashcore/core/keys.js'
import type { NormalizedSchema, NormalizedField } from '../../../src/flashcore/schema/types.js'
import type { CatalogEntry } from '../../../src/flashcore/model/catalog.js'

/**
 * Helper to create a minimal NormalizedSchema for testing.
 */
function makeSchema(
	fields: Record<string, Partial<NormalizedField>>,
	overrides?: Partial<NormalizedSchema>
): NormalizedSchema {
	const map = new Map<string, NormalizedField>()
	for (const [name, def] of Object.entries(fields)) {
		map.set(name, {
			name,
			type: 'number',
			optional: false,
			unique: false,
			indexed: false,
			indexTypes: [],
			primaryKey: false,
			version: false,
			hasDefault: false,
			...def
		} as NormalizedField)
	}
	return {
		fields: map,
		primaryKey: overrides?.primaryKey ?? 'id',
		uniqueFields: overrides?.uniqueFields ?? [],
		indexedFields: overrides?.indexedFields ?? [],
		requiredFields: overrides?.requiredFields ?? [],
		optionalFields: overrides?.optionalFields ?? [],
		defaultFields: overrides?.defaultFields ?? new Map(),
		relations: overrides?.relations ?? new Map(),
		compoundUniques: overrides?.compoundUniques ?? [],
		checksum: overrides?.checksum ?? ''
	}
}

describe('CRUD Shared Utilities', () => {
	// ================================================================
	// findVersionField
	// ================================================================
	describe('findVersionField()', () => {
		it('should return field name when a field has version: true', () => {
			const schema = makeSchema({
				id: { type: 'string', primaryKey: true },
				name: { type: 'string' },
				version: { type: 'number', version: true }
			})

			expect(findVersionField(schema)).toBe('version')
		})

		it('should return null when no version field exists', () => {
			const schema = makeSchema({
				id: { type: 'string', primaryKey: true },
				name: { type: 'string' },
				count: { type: 'number' }
			})

			expect(findVersionField(schema)).toBeNull()
		})
	})

	// ================================================================
	// valuesEqual
	// ================================================================
	describe('valuesEqual()', () => {
		it('should return true for same reference', () => {
			const obj = { a: 1 }
			expect(valuesEqual(obj, obj)).toBe(true)
		})

		it('should return true for null and null', () => {
			expect(valuesEqual(null, null)).toBe(true)
		})

		it('should return true for null and undefined (both nullish)', () => {
			expect(valuesEqual(null, undefined)).toBe(true)
		})

		it('should return true for undefined and undefined', () => {
			expect(valuesEqual(undefined, undefined)).toBe(true)
		})

		it('should return false for null and string', () => {
			expect(valuesEqual(null, 'string')).toBe(false)
		})

		it('should return false for string and null', () => {
			expect(valuesEqual('string', null)).toBe(false)
		})

		it('should return true for same Date values', () => {
			const d1 = new Date('2024-01-01')
			const d2 = new Date('2024-01-01')
			expect(valuesEqual(d1, d2)).toBe(true)
		})

		it('should return false for different Date values', () => {
			const d1 = new Date('2024-01-01')
			const d2 = new Date('2024-06-15')
			expect(valuesEqual(d1, d2)).toBe(false)
		})

		it('should return false for different types (number vs string)', () => {
			expect(valuesEqual(1, '1')).toBe(false)
		})

		it('should return true for same primitives', () => {
			expect(valuesEqual('hello', 'hello')).toBe(true)
			expect(valuesEqual(42, 42)).toBe(true)
			expect(valuesEqual(true, true)).toBe(true)
		})
	})

	// ================================================================
	// applySelect
	// ================================================================
	describe('applySelect()', () => {
		const record = { id: 'r1', name: 'Alice', age: 30, email: 'a@b.com' }

		it('should return full record when select is empty', () => {
			const result = applySelect(record, {})
			expect(result).toEqual(record)
		})

		it('should filter to only selected fields plus id', () => {
			const result = applySelect(record, { name: true })
			expect(result).toEqual({ id: 'r1', name: 'Alice' })
		})

		it('should always include id even if not in select', () => {
			const result = applySelect(record, { age: true })
			expect(result).toHaveProperty('id', 'r1')
			expect(result).toHaveProperty('age', 30)
			expect(result).not.toHaveProperty('name')
		})

		it('should include only truthy select entries (plus id)', () => {
			const result = applySelect(record, { name: true, age: false } as any)
			expect(result).toEqual({ id: 'r1', name: 'Alice' })
		})

		it('should skip fields in select that are not in record', () => {
			const result = applySelect(record, { name: true, nonexistent: true } as any)
			expect(result).toEqual({ id: 'r1', name: 'Alice' })
			expect(result).not.toHaveProperty('nonexistent')
		})
	})

	// ================================================================
	// getChunkIdFromEntry
	// ================================================================
	describe('getChunkIdFromEntry()', () => {
		it('should return chunkId for chunk entry', () => {
			const entry: CatalogEntry = { kind: 'chunk', chunkId: 5 } as any
			expect(getChunkIdFromEntry(entry)).toBe(5)
		})

		it('should return 0 for chunk entry with undefined chunkId', () => {
			const entry: CatalogEntry = { kind: 'chunk' } as any
			expect(getChunkIdFromEntry(entry)).toBe(0)
		})

		it('should return 0 for segments entry', () => {
			const entry: CatalogEntry = { kind: 'segments', segmentIds: ['s1', 's2'] } as any
			expect(getChunkIdFromEntry(entry)).toBe(0)
		})
	})

	// ================================================================
	// validateWhereClause
	// ================================================================
	describe('validateWhereClause()', () => {
		it('should throw ValidationError for null where', () => {
			expect(() => validateWhereClause(null, 'findUnique')).toThrow(ValidationError)
			expect(() => validateWhereClause(null, 'findUnique')).toThrow(/findUnique/)
		})

		it('should throw ValidationError for undefined where', () => {
			expect(() => validateWhereClause(undefined, 'update')).toThrow(ValidationError)
		})

		it('should throw ValidationError for non-object where (string)', () => {
			expect(() => validateWhereClause('bad', 'delete')).toThrow(ValidationError)
		})

		it('should NOT throw for valid object where', () => {
			expect(() => validateWhereClause({ id: '123' }, 'findUnique')).not.toThrow()
		})
	})

	// ================================================================
	// resolveChunkKey
	// ================================================================
	describe('resolveChunkKey()', () => {
		it('should call getChunkKey override when provided', () => {
			const getChunkKey = jest.fn((chunkId: number) => `custom:${chunkId}`)

			const result = resolveChunkKey('User', 3, undefined, getChunkKey)

			expect(getChunkKey).toHaveBeenCalledWith(3)
			expect(result).toBe('custom:3')
		})

		it('should call buildModelKey when no override is provided', () => {
			const result = resolveChunkKey('User', 0, undefined)
			const expected = buildModelKey('User', 'chunk:0', undefined)
			expect(result).toBe(expected)
		})

		it('should pass namespace to buildModelKey', () => {
			const result = resolveChunkKey('Post', 2, 'blog')
			const expected = buildModelKey('Post', 'chunk:2', 'blog')
			expect(result).toBe(expected)
		})
	})

	// ================================================================
	// incrementVersion
	// ================================================================
	describe('incrementVersion()', () => {
		it('should increment version field by 1', () => {
			const schema = makeSchema({
				id: { type: 'string' },
				version: { type: 'number', version: true }
			})
			const merged: Record<string, unknown> = { id: 'r1', version: 5 }

			incrementVersion(merged, schema, 'User', 'r1')

			expect(merged.version).toBe(6)
		})

		it('should skip if version field is not in schema', () => {
			const schema = makeSchema({
				id: { type: 'string' },
				name: { type: 'string' }
			})
			const merged: Record<string, unknown> = { id: 'r1', name: 'Alice' }

			incrementVersion(merged, schema, 'User', 'r1')

			expect(merged).toEqual({ id: 'r1', name: 'Alice' })
		})

		it('should skip if version field is not in merged record', () => {
			const schema = makeSchema({
				id: { type: 'string' },
				version: { type: 'number', version: true }
			})
			const merged: Record<string, unknown> = { id: 'r1', name: 'Alice' }

			incrementVersion(merged, schema, 'User', 'r1')

			expect(merged).not.toHaveProperty('version')
		})

		it('should skip if version field is in skipFields', () => {
			const schema = makeSchema({
				id: { type: 'string' },
				version: { type: 'number', version: true }
			})
			const merged: Record<string, unknown> = { id: 'r1', version: 5 }

			incrementVersion(merged, schema, 'User', 'r1', { version: 10 })

			expect(merged.version).toBe(5) // unchanged
		})

		it('should reset to 1 on overflow (MAX_VERSION_VALUE)', () => {
			const schema = makeSchema({
				id: { type: 'string' },
				version: { type: 'number', version: true }
			})
			// MAX_VERSION_VALUE is Number.MAX_SAFE_INTEGER, so next = MAX_SAFE_INTEGER + 1 >= MAX
			const merged: Record<string, unknown> = { id: 'r1', version: Number.MAX_SAFE_INTEGER - 1 }

			incrementVersion(merged, schema, 'User', 'r1')

			expect(merged.version).toBe(1)
		})
	})

	// ================================================================
	// extractIdFromWhere (async, with mocks)
	// ================================================================
	describe('extractIdFromWhere()', () => {
		it('should return id directly from where clause', async () => {
			const schema = makeSchema({ id: { type: 'string', primaryKey: true } })
			const result = await extractIdFromWhere({ id: 'abc' }, {
				schema,
				modelName: 'User'
			})
			expect(result).toEqual({ id: 'abc', hadUniqueField: true })
		})

		it('should return id from custom primary key', async () => {
			const schema = makeSchema(
				{
					slug: { type: 'string', primaryKey: true },
					title: { type: 'string' }
				},
				{ primaryKey: 'slug' }
			)
			const result = await extractIdFromWhere({ slug: 'my-post' }, {
				schema,
				modelName: 'Post'
			})
			expect(result).toEqual({ id: 'my-post', hadUniqueField: true })
		})

		it('should resolve id via unique field lookup', async () => {
			const schema = makeSchema(
				{
					id: { type: 'string', primaryKey: true },
					email: { type: 'string', unique: true }
				},
				{ uniqueFields: ['email'] }
			)
			const mockUniqueIndexManager = {
				lookup: jest.fn(async () => 'found-id')
			} as any

			const result = await extractIdFromWhere({ email: 'test@example.com' }, {
				schema,
				modelName: 'User',
				uniqueIndexManager: mockUniqueIndexManager
			})

			expect(result).toEqual({ id: 'found-id', hadUniqueField: true })
			expect(mockUniqueIndexManager.lookup).toHaveBeenCalledWith(
				{ modelName: 'User', namespace: undefined, field: 'email' },
				'test@example.com'
			)
		})

		it('should return null id when no unique fields match', async () => {
			const schema = makeSchema({
				id: { type: 'string', primaryKey: true },
				name: { type: 'string' }
			})

			const result = await extractIdFromWhere({ name: 'test' }, {
				schema,
				modelName: 'User'
			})

			expect(result).toEqual({ id: null, hadUniqueField: false })
		})
	})

	// ================================================================
	// releaseConstraintsOnError (async, with mocks)
	// ================================================================
	describe('releaseConstraintsOnError()', () => {
		it('should always return null', async () => {
			const result = await releaseConstraintsOnError(undefined, [], null)
			expect(result).toBeNull()
		})

		it('should call release on each acquired constraint', async () => {
			const releaseFn = jest.fn(async () => {})
			const mockUniqueIndexManager = { release: releaseFn } as any

			const constraints = [
				{ options: { modelName: 'User', field: 'email' }, value: 'a@b.com' },
				{ options: { modelName: 'User', field: 'name' }, value: 'Alice' }
			]

			await releaseConstraintsOnError(
				mockUniqueIndexManager,
				constraints as any,
				null
			)

			expect(releaseFn).toHaveBeenCalledTimes(2)
			expect(releaseFn).toHaveBeenCalledWith(
				{ modelName: 'User', field: 'email' },
				'a@b.com'
			)
			expect(releaseFn).toHaveBeenCalledWith(
				{ modelName: 'User', field: 'name' },
				'Alice'
			)
		})

		it('should call wal.manager.deleteEntry when walId and wal provided', async () => {
			const deleteEntry = jest.fn(async () => {})
			const wal = { manager: { deleteEntry } } as any

			await releaseConstraintsOnError(undefined, [], 'wal-123', wal)

			expect(deleteEntry).toHaveBeenCalledWith('wal-123')
		})

		it('should handle errors in release silently', async () => {
			const releaseFn = jest.fn(async () => { throw new Error('release failed') })
			const mockUniqueIndexManager = { release: releaseFn } as any

			const constraints = [
				{ options: { modelName: 'User', field: 'email' }, value: 'a@b.com' }
			]

			// Should not throw
			const result = await releaseConstraintsOnError(
				mockUniqueIndexManager,
				constraints as any,
				null
			)

			expect(result).toBeNull()
		})
	})
})
