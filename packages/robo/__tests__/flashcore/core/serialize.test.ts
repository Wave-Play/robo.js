/** Phase 2: Core Unit Tests - TypeSerializer */

import { TypeSerializer, isSerializedDate, isSerializedBigInt } from '../../../src/flashcore/schema/serialize.js'
import type { NormalizedSchema, NormalizedField } from '../../../src/flashcore/schema/types.js'

/**
 * Build a minimal NormalizedSchema from field definitions for testing.
 */
function makeSchema(fieldDefs: Record<string, { type: string; [k: string]: any }>): NormalizedSchema {
	const fields = new Map<string, NormalizedField>()
	for (const [name, def] of Object.entries(fieldDefs)) {
		fields.set(name, {
			name,
			type: def.type,
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
		fields,
		primaryKey: 'id',
		uniqueFields: [],
		indexedFields: [],
		requiredFields: [],
		optionalFields: [],
		defaultFields: new Map(),
		relations: new Map(),
		compoundUniques: [],
		checksum: ''
	}
}

describe('TypeSerializer', () => {
	describe('Date serialization', () => {
		it('should roundtrip a Date through serialize/deserialize', () => {
			const schema = makeSchema({ createdAt: { type: 'date' } })
			const serializer = new TypeSerializer(schema)
			const now = new Date()

			const serialized = serializer.serialize(now, 'date')
			const deserialized = serializer.deserialize(serialized, 'date')

			expect(deserialized).toBeInstanceOf(Date)
			expect((deserialized as Date).getTime()).toBe(now.getTime())
		})

		it('should serialize a Date with __date__: prefix', () => {
			const schema = makeSchema({ createdAt: { type: 'date' } })
			const serializer = new TypeSerializer(schema)
			const date = new Date('2024-01-01T00:00:00.000Z')

			const serialized = serializer.serialize(date, 'date')
			expect(typeof serialized).toBe('string')
			expect((serialized as string).startsWith('__date__:')).toBe(true)
		})

		it('should deserialize backwards-compatible bare ISO string to Date', () => {
			const schema = makeSchema({ createdAt: { type: 'date' } })
			const serializer = new TypeSerializer(schema)

			const result = serializer.deserialize('2024-06-15T12:30:00.000Z', 'date')
			expect(result).toBeInstanceOf(Date)
			expect((result as Date).toISOString()).toBe('2024-06-15T12:30:00.000Z')
		})
	})

	describe('BigInt serialization', () => {
		it('should roundtrip BigInt through serialize/deserialize', () => {
			const schema = makeSchema({ count: { type: 'number' } })
			const serializer = new TypeSerializer(schema)

			const serialized = serializer.serialize(BigInt(42), 'number')
			expect(typeof serialized).toBe('string')
			expect((serialized as string).startsWith('__bigint__:')).toBe(true)

			const deserialized = serializer.deserialize(serialized, 'number')
			expect(deserialized).toBe(BigInt(42))
		})
	})

	describe('Null and undefined passthrough', () => {
		it('should pass null through for date type', () => {
			const schema = makeSchema({ d: { type: 'date' } })
			const serializer = new TypeSerializer(schema)
			expect(serializer.serialize(null, 'date')).toBe(null)
			expect(serializer.deserialize(null, 'date')).toBe(null)
		})

		it('should pass undefined through for string type', () => {
			const schema = makeSchema({ s: { type: 'string' } })
			const serializer = new TypeSerializer(schema)
			expect(serializer.serialize(undefined, 'string')).toBe(undefined)
		})
	})

	describe('isSerializedDate', () => {
		it('should return true for __date__: prefixed string', () => {
			expect(isSerializedDate('__date__:2024-01-01T00:00:00.000Z')).toBe(true)
		})

		it('should return false for plain string', () => {
			expect(isSerializedDate('plain string')).toBe(false)
		})

		it('should return false for number', () => {
			expect(isSerializedDate(42)).toBe(false)
		})
	})

	describe('isSerializedBigInt', () => {
		it('should return true for __bigint__: prefixed string', () => {
			expect(isSerializedBigInt('__bigint__:42')).toBe(true)
		})

		it('should return false for plain string', () => {
			expect(isSerializedBigInt('plain')).toBe(false)
		})
	})

	describe('serializeRecord / deserializeRecord', () => {
		it('should serialize and deserialize a multi-field record', () => {
			const schema = makeSchema({
				id: { type: 'string', primaryKey: true },
				name: { type: 'string' },
				createdAt: { type: 'date' },
				count: { type: 'number' }
			})
			const serializer = new TypeSerializer(schema)
			const now = new Date()

			const record = { id: 'abc', name: 'test', createdAt: now, count: 42 }
			const serialized = serializer.serializeRecord(record)
			const deserialized = serializer.deserializeRecord(serialized)

			expect(deserialized.id).toBe('abc')
			expect(deserialized.name).toBe('test')
			expect(deserialized.createdAt).toBeInstanceOf(Date)
			expect((deserialized.createdAt as Date).getTime()).toBe(now.getTime())
			expect(deserialized.count).toBe(42)
		})

		it('should pass through primary key without date transformation', () => {
			const schema = makeSchema({
				id: { type: 'string', primaryKey: true },
				name: { type: 'string' }
			})
			const serializer = new TypeSerializer(schema)

			// Even if the ID looks like a date string, it should stay as-is
			const record = { id: '2024-01-01', name: 'test' }
			const serialized = serializer.serializeRecord(record)
			expect(serialized.id).toBe('2024-01-01')

			const deserialized = serializer.deserializeRecord(serialized)
			expect(deserialized.id).toBe('2024-01-01')
		})

		it('should pass through string fields without transformation', () => {
			const schema = makeSchema({ id: { type: 'string', primaryKey: true }, name: { type: 'string' } })
			const serializer = new TypeSerializer(schema)

			const record = { id: '1', name: 'hello world' }
			const serialized = serializer.serializeRecord(record)
			expect(serialized.name).toBe('hello world')
		})

		it('should pass through json fields as-is', () => {
			const schema = makeSchema({ id: { type: 'string', primaryKey: true }, data: { type: 'json' } })
			const serializer = new TypeSerializer(schema)
			const jsonData = { nested: { value: 123 }, arr: [1, 2, 3] }

			const record = { id: '1', data: jsonData }
			const serialized = serializer.serializeRecord(record)
			expect(serialized.data).toBe(jsonData)
		})

		it('should pass through regular numbers without transformation', () => {
			const schema = makeSchema({ id: { type: 'string', primaryKey: true }, count: { type: 'number' } })
			const serializer = new TypeSerializer(schema)

			const record = { id: '1', count: 999 }
			const serialized = serializer.serializeRecord(record)
			expect(serialized.count).toBe(999)

			const deserialized = serializer.deserializeRecord(serialized)
			expect(deserialized.count).toBe(999)
		})
	})
})
