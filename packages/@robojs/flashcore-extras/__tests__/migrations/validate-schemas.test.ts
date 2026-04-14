/**
 * Flashcore v1 (spec rev 4.3) Phase 7 - Schema Validation Tests
 *
 * Tests the Flashcore.$.validateSchemas() system API method.
 * This method compares stored schema metadata against current code schemas,
 * auto-applies safe changes, and throws on breaking changes.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { FlashcoreSystem, MemoryAdapter, FlashcoreSchemaError, normalizeSchema, f } from 'robo.js/flashcore'
import { SchemaMetadataManager } from '../../src/migrations/metadata.js'
import { registerAllExtensions } from '../helpers/register-extensions.js'

describe('validateSchemas', () => {
	let adapter: MemoryAdapter

	beforeEach(async () => {
		adapter = new MemoryAdapter()
		registerAllExtensions()
		await FlashcoreSystem.init({ adapter })
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	describe('New Models', () => {
		it('should register new model with initial metadata', async () => {
			FlashcoreSystem.registerModel('User', {
				id: f.id(),
				name: f.string()
			})

			const result = await FlashcoreSystem.validateSchemas()

			expect(result.modelsValidated).toBe(1)
			expect(result.newModels).toContain('User')
			expect(result.changedModels.length).toBe(0)
		})

		it('should track multiple new models', async () => {
			FlashcoreSystem.registerModel('User', {
				id: f.id(),
				name: f.string()
			})

			FlashcoreSystem.registerModel('Post', {
				id: f.id(),
				title: f.string(),
				authorId: f.string()
			})

			const result = await FlashcoreSystem.validateSchemas()

			expect(result.modelsValidated).toBe(2)
			expect(result.newModels).toContain('User')
			expect(result.newModels).toContain('Post')
		})

		it('should store schema metadata after validation', async () => {
			FlashcoreSystem.registerModel('User', {
				id: f.id(),
				name: f.string()
			})

			await FlashcoreSystem.validateSchemas()

			// Validate again - should not be "new" anymore
			const result2 = await FlashcoreSystem.validateSchemas()

			expect(result2.newModels.length).toBe(0)
		})
	})

	describe('Safe Changes', () => {
		it('should auto-apply adding optional field', async () => {
			// Pre-store metadata for "old" schema
			const oldSchema = normalizeSchema({
				id: f.id(),
				name: f.string()
			})
			const oldMetadata = SchemaMetadataManager.createInitialMetadata(oldSchema)

			const metadataManager = FlashcoreSystem._schemaMetadataManager!
			await metadataManager.setModelMetadata('User', oldMetadata)

			// Register model with new optional field
			FlashcoreSystem.registerModel('User', {
				id: f.id(),
				name: f.string(),
				email: f.string().optional()
			})

			const result = await FlashcoreSystem.validateSchemas()

			expect(result.changedModels.length).toBe(1)
			expect(result.changedModels[0].name).toBe('User')
			expect(result.changedModels[0].safeChanges.some(c => c.field === 'email')).toBe(true)
		})

		it('should auto-apply adding index', async () => {
			// Pre-store metadata for "old" schema without index
			const oldSchema = normalizeSchema({
				id: f.id(),
				name: f.string()
			})
			const oldMetadata = SchemaMetadataManager.createInitialMetadata(oldSchema)

			const metadataManager = FlashcoreSystem._schemaMetadataManager!
			await metadataManager.setModelMetadata('User', oldMetadata)

			// Register model with indexed field
			FlashcoreSystem.registerModel('User', {
				id: f.id(),
				name: f.string().indexed()
			})

			const result = await FlashcoreSystem.validateSchemas()

			expect(result.changedModels.length).toBe(1)
			expect(result.changedModels[0].safeChanges.some(c => c.type === 'add_index')).toBe(true)
		})

		it('should auto-apply removing index', async () => {
			// Pre-store metadata for "old" schema with index
			const oldSchema = normalizeSchema({
				id: f.id(),
				name: f.string().indexed()
			})
			const oldMetadata = SchemaMetadataManager.createInitialMetadata(oldSchema)

			const metadataManager = FlashcoreSystem._schemaMetadataManager!
			await metadataManager.setModelMetadata('User', oldMetadata)

			// Register model without index
			FlashcoreSystem.registerModel('User', {
				id: f.id(),
				name: f.string()
			})

			const result = await FlashcoreSystem.validateSchemas()

			expect(result.changedModels.length).toBe(1)
			expect(result.changedModels[0].safeChanges.some(c => c.type === 'remove_index')).toBe(true)
		})
	})

	describe('Breaking Changes', () => {
		it('should throw on removing required field', async () => {
			// Pre-store metadata with email field
			const oldSchema = normalizeSchema({
				id: f.id(),
				name: f.string(),
				email: f.string()
			})
			const oldMetadata = SchemaMetadataManager.createInitialMetadata(oldSchema)

			const metadataManager = FlashcoreSystem._schemaMetadataManager!
			await metadataManager.setModelMetadata('User', oldMetadata)

			// Register model without email
			FlashcoreSystem.registerModel('User', {
				id: f.id(),
				name: f.string()
			})

			await expect(FlashcoreSystem.validateSchemas()).rejects.toThrow(FlashcoreSchemaError)
		})

		it('should throw on adding required field without default', async () => {
			// Pre-store metadata without age field
			const oldSchema = normalizeSchema({
				id: f.id(),
				name: f.string()
			})
			const oldMetadata = SchemaMetadataManager.createInitialMetadata(oldSchema)

			const metadataManager = FlashcoreSystem._schemaMetadataManager!
			await metadataManager.setModelMetadata('User', oldMetadata)

			// Register model with new required field
			FlashcoreSystem.registerModel('User', {
				id: f.id(),
				name: f.string(),
				age: f.number()
			})

			await expect(FlashcoreSystem.validateSchemas()).rejects.toThrow(FlashcoreSchemaError)
		})

		it('should throw on type change', async () => {
			// Pre-store metadata with count as number
			const oldSchema = normalizeSchema({
				id: f.id(),
				count: f.number()
			})
			const oldMetadata = SchemaMetadataManager.createInitialMetadata(oldSchema)

			const metadataManager = FlashcoreSystem._schemaMetadataManager!
			await metadataManager.setModelMetadata('User', oldMetadata)

			// Register model with count as string
			FlashcoreSystem.registerModel('User', {
				id: f.id(),
				count: f.string()
			})

			await expect(FlashcoreSystem.validateSchemas()).rejects.toThrow(FlashcoreSchemaError)
		})

		it('should include CLI instructions in error', async () => {
			// Pre-store metadata
			const oldSchema = normalizeSchema({
				id: f.id(),
				name: f.string()
			})
			const oldMetadata = SchemaMetadataManager.createInitialMetadata(oldSchema)

			const metadataManager = FlashcoreSystem._schemaMetadataManager!
			await metadataManager.setModelMetadata('User', oldMetadata)

			// Register model with type change
			FlashcoreSystem.registerModel('User', {
				id: f.id(),
				name: f.number() // Type change
			})

			try {
				await FlashcoreSystem.validateSchemas()
				throw new Error('Should have thrown FlashcoreSchemaError')
			} catch (error) {
				expect(error).toBeInstanceOf(FlashcoreSchemaError)
				const schemaError = error as FlashcoreSchemaError
				expect(schemaError.cliInstructions).toContain('robo db migrate')
			}
		})
	})

	describe('Namespaced Models', () => {
		it('should validate namespaced models correctly', async () => {
			FlashcoreSystem.registerModel('Config', {
				id: f.id(),
				key: f.string(),
				value: f.string()
			}, { namespace: 'plugin-settings' })

			const result = await FlashcoreSystem.validateSchemas()

			expect(result.modelsValidated).toBe(1)
			expect(result.newModels).toContain('plugin-settings::Config')
		})

		it('should track changes independently per namespace', async () => {
			// Register models in different namespaces
			FlashcoreSystem.registerModel('User', {
				id: f.id(),
				name: f.string()
			}, { namespace: 'ns1' })

			FlashcoreSystem.registerModel('User', {
				id: f.id(),
				email: f.string()
			}, { namespace: 'ns2' })

			const result = await FlashcoreSystem.validateSchemas()

			expect(result.modelsValidated).toBe(2)
			expect(result.newModels).toContain('ns1::User')
			expect(result.newModels).toContain('ns2::User')
		})
	})

	describe('Schema History', () => {
		it('should record safe changes in history', async () => {
			// Pre-store metadata for "old" schema
			const oldSchema = normalizeSchema({
				id: f.id(),
				name: f.string()
			})
			const oldMetadata = SchemaMetadataManager.createInitialMetadata(oldSchema)

			const metadataManager = FlashcoreSystem._schemaMetadataManager!
			await metadataManager.setModelMetadata('User', oldMetadata)

			// Register model with new optional field (safe change)
			FlashcoreSystem.registerModel('User', {
				id: f.id(),
				name: f.string(),
				bio: f.string().optional()
			})
			await FlashcoreSystem.validateSchemas()

			// Check history was recorded
			const historyManager = FlashcoreSystem._schemaHistoryManager
			expect(historyManager).not.toBeNull()

			if (historyManager) {
				const history = await historyManager.getHistory('_default')
				expect(history.length).toBeGreaterThan(0)
			}
		})
	})

	describe('schemasValidated Flag', () => {
		it('should set schemasValidated to true after validation', async () => {
			FlashcoreSystem.registerModel('User', {
				id: f.id(),
				name: f.string()
			})

			expect(FlashcoreSystem.schemasValidated).toBe(false)

			await FlashcoreSystem.validateSchemas()

			expect(FlashcoreSystem.schemasValidated).toBe(true)
		})

		it('should reset schemasValidated on system reset', async () => {
			FlashcoreSystem.registerModel('User', {
				id: f.id(),
				name: f.string()
			})
			await FlashcoreSystem.validateSchemas()

			expect(FlashcoreSystem.schemasValidated).toBe(true)

			await FlashcoreSystem._reset()

			// After reset, need to re-init
			await FlashcoreSystem.init({ adapter: new MemoryAdapter() })
			expect(FlashcoreSystem.schemasValidated).toBe(false)
		})
	})

	describe('Edge Cases', () => {
		it('should handle no registered models', async () => {
			const result = await FlashcoreSystem.validateSchemas()

			expect(result.modelsValidated).toBe(0)
			expect(result.newModels.length).toBe(0)
			expect(result.changedModels.length).toBe(0)
		})

		it('should throw if not initialized', async () => {
			await FlashcoreSystem._reset()

			await expect(FlashcoreSystem.validateSchemas()).rejects.toThrow('not initialized')
		})

		it('should be idempotent for unchanged schemas', async () => {
			FlashcoreSystem.registerModel('User', {
				id: f.id(),
				name: f.string()
			})

			const result1 = await FlashcoreSystem.validateSchemas()
			const result2 = await FlashcoreSystem.validateSchemas()

			// First call registers new model
			expect(result1.newModels.length).toBe(1)

			// Second call should show no changes
			expect(result2.newModels.length).toBe(0)
			expect(result2.changedModels.length).toBe(0)
		})
	})
})
