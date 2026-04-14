/**
 * Phase 8: Schema Checksum Collision Stress Tests
 *
 * Validates deterministic checksum properties:
 * - No collisions across a large set of distinct schemas
 * - Any field change (type, optional, unique, indexed) changes the checksum
 * - Field ordering does not affect the checksum
 */

import { computeSchemaChecksum, f } from '../helpers/flashcore-compat.js'

/**
 * Generate a schema with variable fields and modifiers for collision testing.
 */
function generateSchema(seed: number): Record<string, any> {
	const types = [
		() => f.string(),
		() => f.number(),
		() => f.boolean(),
		() => f.date(),
		() => f.json()
	]

	const schema: Record<string, any> = { id: f.id() }
	const numFields = 2 + (seed % 5) // 2-6 fields

	for (let i = 0; i < numFields; i++) {
		const fieldName = `field_${seed}_${i}`
		const typeIndex = (seed + i) % types.length
		let field = types[typeIndex]()

		// Apply modifiers based on seed bits
		if ((seed >> i) & 1) {
			field = field.optional()
		}
		if ((seed >> (i + 5)) & 1) {
			field = field.unique()
		}
		if ((seed >> (i + 10)) & 1) {
			field = field.indexed()
		}

		schema[fieldName] = field
	}

	return schema
}

describe('Schema Checksum Collisions', () => {
	it('should produce no collisions across 1000 different schemas', () => {
		const checksums = new Set<string>()
		const collisions: Array<{ seed: number; checksum: string }> = []

		for (let i = 0; i < 1000; i++) {
			const schema = generateSchema(i)
			const checksum = computeSchemaChecksum(schema)

			if (checksums.has(checksum)) {
				collisions.push({ seed: i, checksum })
			}

			checksums.add(checksum)
		}

		// Allow zero collisions for 1000 distinct schemas with 32-bit FNV-1a
		expect(collisions).toHaveLength(0)
		expect(checksums.size).toBe(1000)
	})

	it('should change checksum when any field modifier changes', () => {
		// Base schema
		const base = { id: f.id(), name: f.string(), age: f.number() }
		const baseChecksum = computeSchemaChecksum(base)

		// Change type
		const withDifferentType = { id: f.id(), name: f.string(), age: f.boolean() }
		expect(computeSchemaChecksum(withDifferentType)).not.toBe(baseChecksum)

		// Change optional
		const withOptional = { id: f.id(), name: f.string().optional(), age: f.number() }
		expect(computeSchemaChecksum(withOptional)).not.toBe(baseChecksum)

		// Change unique
		const withUnique = { id: f.id(), name: f.string().unique(), age: f.number() }
		expect(computeSchemaChecksum(withUnique)).not.toBe(baseChecksum)

		// Change indexed
		const withIndexed = { id: f.id(), name: f.string().indexed(), age: f.number() }
		expect(computeSchemaChecksum(withIndexed)).not.toBe(baseChecksum)

		// Add a field
		const withExtraField = { id: f.id(), name: f.string(), age: f.number(), email: f.string() }
		expect(computeSchemaChecksum(withExtraField)).not.toBe(baseChecksum)

		// Remove a field
		const withMissingField = { id: f.id(), name: f.string() }
		expect(computeSchemaChecksum(withMissingField)).not.toBe(baseChecksum)
	})

	it('should produce the same checksum regardless of field ordering', () => {
		const schemaAB = {
			id: f.id(),
			alpha: f.string(),
			beta: f.number()
		}

		const schemaBA = {
			beta: f.number(),
			id: f.id(),
			alpha: f.string()
		}

		const checksumAB = computeSchemaChecksum(schemaAB)
		const checksumBA = computeSchemaChecksum(schemaBA)

		expect(checksumAB).toBe(checksumBA)

		// Also test with more fields and modifiers
		const schemaComplex1 = {
			id: f.id(),
			name: f.string().unique(),
			age: f.number().optional(),
			active: f.boolean().indexed(),
			createdAt: f.date()
		}

		const schemaComplex2 = {
			createdAt: f.date(),
			active: f.boolean().indexed(),
			name: f.string().unique(),
			id: f.id(),
			age: f.number().optional()
		}

		expect(computeSchemaChecksum(schemaComplex1)).toBe(computeSchemaChecksum(schemaComplex2))
	})
})
