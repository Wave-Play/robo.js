/**
 * Flashcore v1 (spec rev 4.3) Phase 7 - Schema Change Classification Tests
 *
 * Tests the classification of schema changes as safe or breaking.
 */

import { describe, it, expect } from '@jest/globals'
import { analyzeSchemaChanges, summarizeChanges } from '../../src/migrations/diff.js'
import { normalizeSchema, f } from 'robo.js/flashcore'
import type { FieldMetadata } from '../../src/migrations/types.js'

describe('Schema Change Classification', () => {
	// Helper to create stored field metadata
	function createStoredFields(fields: Record<string, Partial<FieldMetadata>>): Record<string, FieldMetadata> {
		const result: Record<string, FieldMetadata> = {}
		for (const [name, field] of Object.entries(fields)) {
			result[name] = {
				name,
				type: 'string',
				optional: false,
				unique: false,
				indexed: false,
				indexTypes: [],
				primaryKey: false,
				version: false,
				hasDefault: false,
				...field
			}
		}
		return result
	}

	// f.id() produces: type='string', primaryKey=true (unique and indexed are NOT set automatically)
	const ID_FIELD: Partial<FieldMetadata> = { type: 'string', primaryKey: true }

	describe('Safe Changes', () => {
		it('should classify adding optional field as safe', () => {
			const stored = createStoredFields({
				id: ID_FIELD,
				name: { type: 'string' }
			})

			const current = normalizeSchema({
				id: f.id(),
				name: f.string(),
				email: f.string().optional()
			})

			const result = analyzeSchemaChanges(stored, current, 'TestModel')

			expect(result.hasBreakingChanges).toBe(false)
			expect(result.safe.some(c => c.field === 'email' && c.type === 'add_field')).toBe(true)
		})

		it('should classify adding field with default as safe', () => {
			const stored = createStoredFields({
				id: ID_FIELD,
				name: { type: 'string' }
			})

			const current = normalizeSchema({
				id: f.id(),
				name: f.string(),
				status: f.string().default('active')
			})

			const result = analyzeSchemaChanges(stored, current, 'TestModel')

			expect(result.hasBreakingChanges).toBe(false)
			expect(result.safe.some(c => c.field === 'status' && c.type === 'add_field')).toBe(true)
		})

		it('should classify adding index as safe', () => {
			const stored = createStoredFields({
				id: ID_FIELD,
				name: { type: 'string', indexed: false }
			})

			const current = normalizeSchema({
				id: f.id(),
				name: f.string().indexed()
			})

			const result = analyzeSchemaChanges(stored, current, 'TestModel')

			expect(result.hasBreakingChanges).toBe(false)
			expect(result.safe.some(c => c.field === 'name' && c.type === 'add_index')).toBe(true)
		})

		it('should classify removing index as safe', () => {
			const stored = createStoredFields({
				id: ID_FIELD,
				name: { type: 'string', indexed: true }
			})

			const current = normalizeSchema({
				id: f.id(),
				name: f.string()
			})

			const result = analyzeSchemaChanges(stored, current, 'TestModel')

			expect(result.hasBreakingChanges).toBe(false)
			expect(result.safe.some(c => c.field === 'name' && c.type === 'remove_index')).toBe(true)
		})

		it('should classify adding unique constraint as safe', () => {
			const stored = createStoredFields({
				id: ID_FIELD,
				email: { type: 'string', unique: false }
			})

			const current = normalizeSchema({
				id: f.id(),
				email: f.string().unique()
			})

			const result = analyzeSchemaChanges(stored, current, 'TestModel')

			// Adding unique is safe (existing data will be validated)
			expect(result.hasBreakingChanges).toBe(false)
			expect(result.safe.some(c => c.field === 'email' && c.type === 'add_unique')).toBe(true)
		})

		it('should classify making required field optional as safe', () => {
			const stored = createStoredFields({
				id: ID_FIELD,
				name: { type: 'string', optional: false }
			})

			const current = normalizeSchema({
				id: f.id(),
				name: f.string().optional()
			})

			const result = analyzeSchemaChanges(stored, current, 'TestModel')

			expect(result.hasBreakingChanges).toBe(false)
			expect(result.safe.some(c => c.field === 'name' && c.type === 'change_optional')).toBe(true)
		})

		it('should classify removing unique constraint as safe', () => {
			const stored = createStoredFields({
				id: ID_FIELD,
				email: { type: 'string', unique: true }
			})

			const current = normalizeSchema({
				id: f.id(),
				email: f.string()
			})

			const result = analyzeSchemaChanges(stored, current, 'TestModel')

			expect(result.hasBreakingChanges).toBe(false)
			expect(result.safe.some(c => c.field === 'email' && c.type === 'remove_unique')).toBe(true)
		})
	})

	describe('Breaking Changes', () => {
		it('should classify adding required field without default as breaking', () => {
			const stored = createStoredFields({
				id: ID_FIELD,
				name: { type: 'string' }
			})

			const current = normalizeSchema({
				id: f.id(),
				name: f.string(),
				requiredField: f.string()
			})

			const result = analyzeSchemaChanges(stored, current, 'TestModel')

			expect(result.hasBreakingChanges).toBe(true)
			expect(result.breaking.some(c => c.field === 'requiredField' && c.type === 'add_required_field')).toBe(true)
		})

		it('should classify removing field as breaking', () => {
			const stored = createStoredFields({
				id: ID_FIELD,
				name: { type: 'string' },
				email: { type: 'string' }
			})

			const current = normalizeSchema({
				id: f.id(),
				name: f.string()
			})

			const result = analyzeSchemaChanges(stored, current, 'TestModel')

			expect(result.hasBreakingChanges).toBe(true)
			expect(result.breaking.some(c => c.field === 'email' && c.type === 'remove_field')).toBe(true)
		})

		it('should classify changing field type as breaking', () => {
			const stored = createStoredFields({
				id: ID_FIELD,
				count: { type: 'string' }
			})

			const current = normalizeSchema({
				id: f.id(),
				count: f.number()
			})

			const result = analyzeSchemaChanges(stored, current, 'TestModel')

			expect(result.hasBreakingChanges).toBe(true)
			expect(result.breaking.some(c => c.field === 'count' && c.type === 'change_type')).toBe(true)
		})

		it('should classify making optional field required as breaking', () => {
			const stored = createStoredFields({
				id: ID_FIELD,
				email: { type: 'string', optional: true }
			})

			const current = normalizeSchema({
				id: f.id(),
				email: f.string()
			})

			const result = analyzeSchemaChanges(stored, current, 'TestModel')

			expect(result.hasBreakingChanges).toBe(true)
			expect(result.breaking.some(c => c.field === 'email' && c.type === 'change_optional')).toBe(true)
		})
	})

	describe('Mixed Changes', () => {
		it('should detect both safe and breaking changes', () => {
			const stored = createStoredFields({
				id: ID_FIELD,
				name: { type: 'string' },
				email: { type: 'string' }
			})

			const current = normalizeSchema({
				id: f.id(),
				name: f.string(),
				// email removed (breaking)
				// nickname added as optional (safe)
				nickname: f.string().optional()
			})

			const result = analyzeSchemaChanges(stored, current, 'TestModel')

			expect(result.hasBreakingChanges).toBe(true)
			expect(result.safe.length).toBeGreaterThan(0)
			expect(result.breaking.length).toBeGreaterThan(0)
		})

		it('should correctly count changes', () => {
			const stored = createStoredFields({
				id: ID_FIELD,
				a: { type: 'string' },
				b: { type: 'string' }
			})

			const current = normalizeSchema({
				id: f.id(),
				a: f.string(),
				c: f.string().optional(),
				d: f.string().optional()
			})

			const result = analyzeSchemaChanges(stored, current, 'TestModel')

			// b removed (breaking), c and d added (safe)
			expect(result.safe.length + result.breaking.length).toBe(3)
		})
	})

	describe('summarizeChanges', () => {
		it('should provide human-readable summary', () => {
			const stored = createStoredFields({
				id: ID_FIELD,
				name: { type: 'string' }
			})

			const current = normalizeSchema({
				id: f.id(),
				name: f.string(),
				email: f.string().optional()
			})

			const result = analyzeSchemaChanges(stored, current, 'TestModel')
			const summary = summarizeChanges(result)

			expect(summary).toContain('1')
			expect(summary.toLowerCase()).toContain('safe')
		})

		it('should handle no changes', () => {
			const stored = createStoredFields({
				id: ID_FIELD,
				name: { type: 'string' }
			})

			const current = normalizeSchema({
				id: f.id(),
				name: f.string()
			})

			const result = analyzeSchemaChanges(stored, current, 'TestModel')
			const summary = summarizeChanges(result)

			expect(summary.toLowerCase()).toContain('no')
		})

		it('should indicate breaking changes clearly', () => {
			const stored = createStoredFields({
				id: ID_FIELD,
				name: { type: 'string' },
				email: { type: 'string' }
			})

			const current = normalizeSchema({
				id: f.id(),
				name: f.string()
			})

			const result = analyzeSchemaChanges(stored, current, 'TestModel')
			const summary = summarizeChanges(result)

			expect(summary.toLowerCase()).toContain('breaking')
		})
	})

	describe('Edge Cases', () => {
		it('should handle empty stored schema with id only in current', () => {
			const stored = createStoredFields({
				id: ID_FIELD
			})
			const current = normalizeSchema({
				id: f.id()
			})

			const result = analyzeSchemaChanges(stored, current, 'TestModel')

			expect(result.hasBreakingChanges).toBe(false)
			expect(result.safe.length + result.breaking.length).toBe(0)
		})

		it('should handle adding fields to schema', () => {
			const stored = createStoredFields({
				id: ID_FIELD
			})
			const current = normalizeSchema({
				id: f.id(),
				name: f.string()
			})

			const result = analyzeSchemaChanges(stored, current, 'TestModel')

			// New required field is breaking if there's existing data
			expect(result.safe.length + result.breaking.length).toBe(1)
		})

		it('should handle enum value changes - adding values is safe', () => {
			// Note: f.enum() produces type='enum' with enumValues
			const stored = createStoredFields({
				id: ID_FIELD,
				status: { type: 'enum', enumValues: ['pending', 'active'] }
			})

			const current = normalizeSchema({
				id: f.id(),
				status: f.enum(['pending', 'active', 'inactive'])
			})

			const result = analyzeSchemaChanges(stored, current, 'TestModel')

			// Only enum value changes detected (adding 'inactive' is safe)
			// Filter to just enum-related changes for the status field
			const statusChanges = [...result.safe, ...result.breaking].filter(c => c.field === 'status')
			const hasOnlySafeEnumChanges = statusChanges.every(c => c.safe)
			expect(hasOnlySafeEnumChanges).toBe(true)
		})

		it('should handle removing enum values as breaking', () => {
			const stored = createStoredFields({
				id: ID_FIELD,
				status: { type: 'enum', enumValues: ['pending', 'active', 'inactive'] }
			})

			const current = normalizeSchema({
				id: f.id(),
				status: f.enum(['pending', 'active'])
			})

			const result = analyzeSchemaChanges(stored, current, 'TestModel')

			// Removing enum values that may exist in data is breaking
			expect(result.hasBreakingChanges).toBe(true)
		})
	})
})
