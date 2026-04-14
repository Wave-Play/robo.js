/**
 * Phase 7: Schema Diff Tests
 *
 * Tests for schema change analysis - detecting safe vs breaking changes.
 * These tests focus on the utility functions in diff.ts.
 */

import { describe, it, expect } from '@jest/globals'
import {
	analyzeSchemaChanges,
	formatSchemaChanges,
	hasSchemaChanged,
	summarizeChanges
} from '../../src/migrations/diff.js'
import { normalizeSchema, f } from 'robo.js/flashcore'
import type { FieldMetadata, SchemaChange } from '../../src/migrations/types.js'

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

describe('analyzeSchemaChanges', () => {
	describe('safe changes', () => {
		it('should detect adding optional field as safe', () => {
			// f.id() produces: type='string', primaryKey=true (NOT unique or indexed)
			const stored = createStoredFields({
				id: { type: 'string', primaryKey: true },
				name: { type: 'string' }
			})

			const current = normalizeSchema({
				id: f.id(),
				name: f.string(),
				description: f.string().optional()
			})

			const result = analyzeSchemaChanges(stored, current, 'User')

			expect(result.safe.length).toBeGreaterThan(0)
			expect(result.hasBreakingChanges).toBe(false)
			expect(result.safe.some(c => c.field === 'description' && c.type === 'add_field')).toBe(true)
		})

		it('should detect adding field with default as safe', () => {
			const stored = createStoredFields({
				id: { type: 'string', primaryKey: true },
				name: { type: 'string' }
			})

			const current = normalizeSchema({
				id: f.id(),
				name: f.string(),
				role: f.string().default('user')
			})

			const result = analyzeSchemaChanges(stored, current, 'User')

			expect(result.safe.length).toBeGreaterThan(0)
			expect(result.hasBreakingChanges).toBe(false)
		})

		it('should detect adding index as safe', () => {
			const stored = createStoredFields({
				id: { type: 'string', primaryKey: true },
				name: { type: 'string' }
			})

			const current = normalizeSchema({
				id: f.id(),
				name: f.string().indexed()
			})

			const result = analyzeSchemaChanges(stored, current, 'User')

			expect(result.safe.length).toBeGreaterThan(0)
			expect(result.hasBreakingChanges).toBe(false)
			expect(result.safe.some(c => c.field === 'name' && c.type === 'add_index')).toBe(true)
		})

		it('should detect removing index as safe', () => {
			const stored = createStoredFields({
				id: { type: 'string', primaryKey: true },
				name: { type: 'string', indexed: true }
			})

			const current = normalizeSchema({
				id: f.id(),
				name: f.string()
			})

			const result = analyzeSchemaChanges(stored, current, 'User')

			expect(result.safe.length).toBeGreaterThan(0)
			expect(result.hasBreakingChanges).toBe(false)
			expect(result.safe.some(c => c.field === 'name' && c.type === 'remove_index')).toBe(true)
		})
	})

	describe('breaking changes', () => {
		it('should detect removing field as breaking', () => {
			const stored = createStoredFields({
				id: { type: 'string', primaryKey: true },
				name: { type: 'string' }
			})

			const current = normalizeSchema({
				id: f.id()
				// name field removed
			})

			const result = analyzeSchemaChanges(stored, current, 'User')

			expect(result.hasBreakingChanges).toBe(true)
			expect(result.breaking.some(c => c.field === 'name' && c.type === 'remove_field')).toBe(true)
		})

		it('should detect type change as breaking', () => {
			const stored = createStoredFields({
				id: { type: 'string', primaryKey: true },
				name: { type: 'string' }
			})

			const current = normalizeSchema({
				id: f.id(),
				name: f.number() // Changed type
			})

			const result = analyzeSchemaChanges(stored, current, 'User')

			expect(result.hasBreakingChanges).toBe(true)
			expect(result.breaking.some(c => c.field === 'name' && c.type === 'change_type')).toBe(true)
		})

		it('should detect adding required field without default as breaking', () => {
			const stored = createStoredFields({
				id: { type: 'string', primaryKey: true },
				name: { type: 'string' }
			})

			const current = normalizeSchema({
				id: f.id(),
				name: f.string(),
				email: f.string().unique() // Required, no default
			})

			const result = analyzeSchemaChanges(stored, current, 'User')

			expect(result.hasBreakingChanges).toBe(true)
			expect(result.breaking.some(c => c.field === 'email' && c.type === 'add_required_field')).toBe(true)
		})

		it('should detect making optional field required as breaking', () => {
			const stored = createStoredFields({
				id: { type: 'string', primaryKey: true },
				bio: { type: 'string', optional: true }
			})

			const current = normalizeSchema({
				id: f.id(),
				bio: f.string() // Now required
			})

			const result = analyzeSchemaChanges(stored, current, 'User')

			expect(result.hasBreakingChanges).toBe(true)
			expect(result.breaking.some(c => c.field === 'bio' && c.type === 'change_optional')).toBe(true)
		})
	})

	describe('no changes', () => {
		it('should detect no changes when schemas match', () => {
			// f.id() produces: type='string', primaryKey=true (NOT unique or indexed)
			const stored = createStoredFields({
				id: { type: 'string', primaryKey: true },
				name: { type: 'string' }
			})

			const current = normalizeSchema({
				id: f.id(),
				name: f.string()
			})

			const result = analyzeSchemaChanges(stored, current, 'User')

			expect(result.safe.length).toBe(0)
			expect(result.breaking.length).toBe(0)
			expect(result.hasBreakingChanges).toBe(false)
		})
	})
})

describe('formatSchemaChanges', () => {
	it('should format safe changes with + prefix', () => {
		const changes: SchemaChange[] = [
			{
				type: 'add_field',
				model: 'User',
				field: 'email',
				description: 'Add optional field \'email\'',
				safe: true
			}
		]

		const formatted = formatSchemaChanges(changes)

		expect(formatted).toContain('+')
	})

	it('should format breaking changes with ! prefix', () => {
		const changes: SchemaChange[] = [
			{
				type: 'remove_field',
				model: 'User',
				field: 'deprecated',
				description: 'Remove field \'deprecated\'',
				safe: false
			}
		]

		const formatted = formatSchemaChanges(changes)

		expect(formatted).toContain('!')
	})

	it('should include field descriptions', () => {
		const changes: SchemaChange[] = [
			{
				type: 'change_type',
				model: 'User',
				field: 'score',
				description: 'Change type of \'score\' from \'string\' to \'number\'',
				safe: false
			}
		]

		const formatted = formatSchemaChanges(changes)

		expect(formatted).toContain('score')
	})

	it('should handle empty changes', () => {
		const formatted = formatSchemaChanges([])
		expect(formatted).toContain('No changes')
	})
})

describe('hasSchemaChanged', () => {
	it('should return false when checksums match', () => {
		const result = hasSchemaChanged('abc123', 'abc123')
		expect(result).toBe(false)
	})

	it('should return true when checksums differ', () => {
		const result = hasSchemaChanged('abc123', 'xyz789')
		expect(result).toBe(true)
	})

	it('should be case insensitive', () => {
		const result = hasSchemaChanged('ABC123', 'abc123')
		expect(result).toBe(false)
	})
})

describe('summarizeChanges', () => {
	it('should summarize no changes', () => {
		const result = summarizeChanges({ safe: [], breaking: [], hasBreakingChanges: false })
		expect(result.toLowerCase()).toContain('no')
	})

	it('should count safe changes', () => {
		const result = summarizeChanges({
			safe: [
				{ type: 'add_field', model: 'User', field: 'a', description: 'Add a', safe: true },
				{ type: 'add_field', model: 'User', field: 'b', description: 'Add b', safe: true }
			],
			breaking: [],
			hasBreakingChanges: false
		})

		expect(result).toContain('2')
		expect(result.toLowerCase()).toContain('safe')
	})

	it('should count breaking changes', () => {
		const result = summarizeChanges({
			safe: [],
			breaking: [
				{ type: 'remove_field', model: 'User', field: 'c', description: 'Remove c', safe: false }
			],
			hasBreakingChanges: true
		})

		expect(result).toContain('1')
		expect(result.toLowerCase()).toContain('breaking')
	})

	it('should count both safe and breaking changes', () => {
		const result = summarizeChanges({
			safe: [
				{ type: 'add_field', model: 'User', field: 'a', description: 'Add a', safe: true }
			],
			breaking: [
				{ type: 'remove_field', model: 'User', field: 'b', description: 'Remove b', safe: false }
			],
			hasBreakingChanges: true
		})

		expect(result.toLowerCase()).toContain('safe')
		expect(result.toLowerCase()).toContain('breaking')
	})
})
