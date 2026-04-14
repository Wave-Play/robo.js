/**
 * Integration: Schema Validation -> Migration Detection -> Auto-Apply/Reject Flow
 *
 * Verifies the schema validation -> migration detection -> auto-apply/reject flow
 * through the FlashcoreSystem API. Exercises initial registration, safe changes,
 * breaking changes, and schema history recording.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import {
	FlashcoreSystem,
	MemoryAdapter,
	FlashcoreSchemaError,
	f
} from 'robo.js/flashcore'
import { _resetExtensions } from '../../../../robo/src/flashcore/core/extensions.js'
import { registerAllExtensions } from '../helpers/register-extensions.js'

/**
 * A MemoryAdapter subclass that does NOT clear data on shutdown.
 * This allows simulating a "restart" where the data persists across
 * FlashcoreSystem._reset() / init() cycles.
 */
class PersistentMemoryAdapter extends MemoryAdapter {
	shutdown(): void {
		// No-op: preserve data across reset/reinit cycles
	}
}

describe('Schema Migration Flow', () => {
	let adapter: PersistentMemoryAdapter

	beforeEach(async () => {
		await FlashcoreSystem._reset()
		_resetExtensions()
		adapter = new PersistentMemoryAdapter()
		registerAllExtensions()
		await FlashcoreSystem.init({ adapter })
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
		_resetExtensions()
	})

	/**
	 * Helper to simulate a "restart" — reset the system and reinitialize
	 * with the same persistent adapter.
	 */
	async function restart(): Promise<void> {
		await FlashcoreSystem._reset()
		_resetExtensions()
		registerAllExtensions()
		await FlashcoreSystem.init({ adapter })
	}

	// ========================================================================
	// Initial schema registration
	// ========================================================================

	describe('Initial schema registration', () => {
		it('stores initial metadata on first validateSchemas()', async () => {
			FlashcoreSystem.registerModel('User', {
				id: f.id(),
				name: f.string(),
				email: f.string()
			})

			// First validation registers the model
			const result1 = await FlashcoreSystem.validateSchemas()
			expect(result1.modelsValidated).toBe(1)
			expect(result1.newModels).toContain('User')

			// Metadata is stored — verify by checking the metadata manager
			const metadataManager = FlashcoreSystem._schemaMetadataManager!
			const stored = await metadataManager.getModelMetadata('User')
			expect(stored).not.toBeNull()
			expect(stored!.version).toBe(1)
			expect(stored!.checksum).toBeDefined()
			expect(typeof stored!.checksum).toBe('string')

			// Second validation with no changes should be clean
			const result2 = await FlashcoreSystem.validateSchemas()
			expect(result2.newModels).toHaveLength(0)
			expect(result2.changedModels).toHaveLength(0)
		})

		it('registers metadata for multiple models independently', async () => {
			FlashcoreSystem.registerModel('User', {
				id: f.id(),
				name: f.string()
			})

			FlashcoreSystem.registerModel('Post', {
				id: f.id(),
				title: f.string(),
				body: f.string()
			})

			const result = await FlashcoreSystem.validateSchemas()
			expect(result.modelsValidated).toBe(2)
			expect(result.newModels).toContain('User')
			expect(result.newModels).toContain('Post')

			// Both should have distinct checksums
			const metadataManager = FlashcoreSystem._schemaMetadataManager!
			const userMeta = await metadataManager.getModelMetadata('User')
			const postMeta = await metadataManager.getModelMetadata('Post')

			expect(userMeta).not.toBeNull()
			expect(postMeta).not.toBeNull()
			expect(userMeta!.checksum).not.toBe(postMeta!.checksum)
		})
	})

	// ========================================================================
	// Safe schema changes
	// ========================================================================

	describe('Safe schema changes', () => {
		it('auto-applies adding an optional field', async () => {
			// Register initial schema and validate
			FlashcoreSystem.registerModel('SafeUser', {
				id: f.id(),
				name: f.string()
			})
			await FlashcoreSystem.validateSchemas()

			// Restart with updated schema (new optional field)
			await restart()

			FlashcoreSystem.registerModel('SafeUser', {
				id: f.id(),
				name: f.string(),
				bio: f.string().optional()
			})

			// Validation should succeed — safe change auto-applied
			const result = await FlashcoreSystem.validateSchemas()
			expect(result.changedModels).toHaveLength(1)
			expect(result.changedModels[0].name).toBe('SafeUser')
			expect(result.changedModels[0].safeChanges.some(c => c.field === 'bio')).toBe(true)
			expect(result.changedModels[0].safeChanges.every(c => c.safe)).toBe(true)

			// Metadata should be updated
			const metadataManager = FlashcoreSystem._schemaMetadataManager!
			const updated = await metadataManager.getModelMetadata('SafeUser')
			expect(updated).not.toBeNull()
			expect(updated!.version).toBe(2)
		})

		it('auto-applies adding an indexed field', async () => {
			// Register initial schema
			FlashcoreSystem.registerModel('IdxUser', {
				id: f.id(),
				name: f.string()
			})
			await FlashcoreSystem.validateSchemas()

			// Restart with indexed modifier added
			await restart()

			FlashcoreSystem.registerModel('IdxUser', {
				id: f.id(),
				name: f.string().indexed()
			})

			const result = await FlashcoreSystem.validateSchemas()
			expect(result.changedModels).toHaveLength(1)
			expect(result.changedModels[0].safeChanges.some(c => c.type === 'add_index')).toBe(true)
		})

		it('auto-applies removing an index', async () => {
			// Register initial schema with index
			FlashcoreSystem.registerModel('RemIdxUser', {
				id: f.id(),
				name: f.string().indexed()
			})
			await FlashcoreSystem.validateSchemas()

			// Restart without the index
			await restart()

			FlashcoreSystem.registerModel('RemIdxUser', {
				id: f.id(),
				name: f.string()
			})

			const result = await FlashcoreSystem.validateSchemas()
			expect(result.changedModels).toHaveLength(1)
			expect(result.changedModels[0].safeChanges.some(c => c.type === 'remove_index')).toBe(true)
		})
	})

	// ========================================================================
	// Breaking schema changes
	// ========================================================================

	describe('Breaking schema changes', () => {
		it('throws FlashcoreSchemaError when required field is removed', async () => {
			// Register initial schema with required field
			FlashcoreSystem.registerModel('BreakUser', {
				id: f.id(),
				name: f.string(),
				email: f.string()
			})
			await FlashcoreSystem.validateSchemas()

			// Restart without the email field
			await restart()

			FlashcoreSystem.registerModel('BreakUser', {
				id: f.id(),
				name: f.string()
			})

			// Should throw FlashcoreSchemaError
			await expect(FlashcoreSystem.validateSchemas()).rejects.toThrow(FlashcoreSchemaError)

			try {
				await FlashcoreSystem.validateSchemas()
			} catch (error) {
				expect(error).toBeInstanceOf(FlashcoreSchemaError)
				const schemaError = error as FlashcoreSchemaError
				expect(schemaError.message).toContain('email')
				expect(schemaError.message).toContain('BreakUser')
			}
		})

		it('throws FlashcoreSchemaError when field type changes', async () => {
			// Register initial schema with score as number
			FlashcoreSystem.registerModel('TypeUser', {
				id: f.id(),
				score: f.number()
			})
			await FlashcoreSystem.validateSchemas()

			// Restart with score changed to string
			await restart()

			FlashcoreSystem.registerModel('TypeUser', {
				id: f.id(),
				score: f.string()
			})

			await expect(FlashcoreSystem.validateSchemas()).rejects.toThrow(FlashcoreSchemaError)

			try {
				await FlashcoreSystem.validateSchemas()
			} catch (error) {
				expect(error).toBeInstanceOf(FlashcoreSchemaError)
				const schemaError = error as FlashcoreSchemaError
				expect(schemaError.message).toContain('score')
			}
		})
	})

	// ========================================================================
	// Schema history
	// ========================================================================

	describe('Schema history', () => {
		it('records schema changes in history', async () => {
			// Register initial schema and validate (version 1)
			FlashcoreSystem.registerModel('HistUser', {
				id: f.id(),
				name: f.string()
			})
			await FlashcoreSystem.validateSchemas()

			// Restart with a safe change (version 2)
			await restart()

			FlashcoreSystem.registerModel('HistUser', {
				id: f.id(),
				name: f.string(),
				nickname: f.string().optional()
			})
			await FlashcoreSystem.validateSchemas()

			// Check history
			const historyManager = FlashcoreSystem._schemaHistoryManager
			expect(historyManager).not.toBeNull()

			const history = await historyManager!.getHistory('_default')
			expect(history.length).toBeGreaterThanOrEqual(1)

			// The history entry should reference the safe change
			const latestEntry = history[history.length - 1]
			expect(latestEntry.version).toBeGreaterThanOrEqual(2)
			expect(latestEntry.checksum).toBeDefined()
			expect(latestEntry.changes.length).toBeGreaterThan(0)
			expect(latestEntry.appliedBy).toBe('auto')

			// Apply another safe change (version 3) to verify accumulation
			await restart()

			FlashcoreSystem.registerModel('HistUser', {
				id: f.id(),
				name: f.string().indexed(),
				nickname: f.string().optional()
			})
			await FlashcoreSystem.validateSchemas()

			const history2 = await FlashcoreSystem._schemaHistoryManager!.getHistory('_default')
			expect(history2.length).toBeGreaterThanOrEqual(2)

			// Entries should have distinct checksums
				const checksums = history2.map((entry: { checksum: string }) => entry.checksum)
				const uniqueChecksums = new Set(checksums)
				expect(uniqueChecksums.size).toBe(checksums.length)
			})
		})

	// ========================================================================
	// End-to-end: create data, validate, restart, validate again
	// ========================================================================

	describe('End-to-end with data', () => {
		it('preserves data across restart with safe schema evolution', async () => {
			// Phase 1: Register model, create data, validate
			const UserV1 = FlashcoreSystem.registerModel<{ id: string; name: string }>('E2EUser', {
				id: f.id(),
				name: f.string()
			})
			await FlashcoreSystem.validateSchemas()

			const alice = await UserV1.create({ name: 'Alice' })
			const bob = await UserV1.create({ name: 'Bob' })

			// Phase 2: Restart with safe change (add optional field)
			await restart()

			const UserV2 = FlashcoreSystem.registerModel<{ id: string; name: string; age?: number }>('E2EUser', {
				id: f.id(),
				name: f.string(),
				age: f.number().optional()
			})
			const result = await FlashcoreSystem.validateSchemas()

			// Should have detected and auto-applied the safe change
			expect(result.changedModels.length).toBe(1)

			// Data should still be accessible
			const foundAlice = await UserV2.findUnique({ where: { id: alice.id } })
			expect(foundAlice).not.toBeNull()
			expect(foundAlice!.name).toBe('Alice')

			const foundBob = await UserV2.findUnique({ where: { id: bob.id } })
			expect(foundBob).not.toBeNull()
			expect(foundBob!.name).toBe('Bob')

			// New records can use the new field
			const charlie = await UserV2.create({ name: 'Charlie', age: 30 })
			expect(charlie.age).toBe(30)
		})

		it('validates idempotency after restart with no changes', async () => {
			// Register and validate
			FlashcoreSystem.registerModel('IdempUser', {
				id: f.id(),
				name: f.string(),
				active: f.boolean()
			})
			await FlashcoreSystem.validateSchemas()

			// Restart with identical schema
			await restart()

			FlashcoreSystem.registerModel('IdempUser', {
				id: f.id(),
				name: f.string(),
				active: f.boolean()
			})

			const result = await FlashcoreSystem.validateSchemas()
			expect(result.newModels).toHaveLength(0)
			expect(result.changedModels).toHaveLength(0)
		})
	})
})
