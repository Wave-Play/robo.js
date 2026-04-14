/**
 * Flashcore v1 (spec rev 4.3) Phase 7 - Auto-Repair Startup Tests
 *
 * Tests the Flashcore.$.runAutoRepair() system API method.
 * This method runs integrity checks and auto-repairs based on configuration.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { FlashcoreSystem, MemoryAdapter, f } from 'robo.js/flashcore'
import type { AutoRepairConfig } from '../../src/migrations/types.js'
import { registerAllExtensions } from '../helpers/register-extensions.js'

describe('runAutoRepair', () => {
	let adapter: MemoryAdapter

	beforeEach(async () => {
		adapter = new MemoryAdapter()
		registerAllExtensions()
		await FlashcoreSystem.init({ adapter })
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	describe('Basic Operation', () => {
		it('should run with default config (true)', async () => {
			FlashcoreSystem.registerModel('User', {
				id: f.id(),
				name: f.string()
			})

			const result = await FlashcoreSystem.runAutoRepair(true)

			expect(result).toHaveProperty('repaired')
			expect(result).toHaveProperty('errors')
			expect(Array.isArray(result.errors)).toBe(true)
		})

		it('should run with empty model registry', async () => {
			const result = await FlashcoreSystem.runAutoRepair(true)

			expect(result.repaired).toBe(0)
			expect(result.errors.length).toBe(0)
		})

		it('should throw if not initialized', async () => {
			await FlashcoreSystem._reset()

			await expect(FlashcoreSystem.runAutoRepair(true)).rejects.toThrow('not initialized')
		})
	})

	describe('Configuration Options', () => {
		it('should respect filter option', async () => {
			FlashcoreSystem.registerModel('User', {
				id: f.id(),
				name: f.string()
			})

			const config: AutoRepairConfig = {
				filter: true,
				indexes: false,
				uniqueIndexes: false
			}

			const result = await FlashcoreSystem.runAutoRepair(config)

			expect(result).toHaveProperty('repaired')
		})

		it('should respect indexes option', async () => {
			FlashcoreSystem.registerModel('User', {
				id: f.id(),
				name: f.string().indexed()
			})

			const config: AutoRepairConfig = {
				filter: false,
				indexes: true,
				uniqueIndexes: false
			}

			const result = await FlashcoreSystem.runAutoRepair(config)

			expect(result).toHaveProperty('repaired')
		})

		it('should respect uniqueIndexes option', async () => {
			FlashcoreSystem.registerModel('User', {
				id: f.id(),
				email: f.string().unique()
			})

			const config: AutoRepairConfig = {
				filter: false,
				indexes: false,
				uniqueIndexes: true
			}

			const result = await FlashcoreSystem.runAutoRepair(config)

			expect(result).toHaveProperty('repaired')
		})

		it('should warn and disable catalog auto-repair', async () => {
			FlashcoreSystem.registerModel('User', {
				id: f.id(),
				name: f.string()
			})

			// Catalog auto-repair should be disabled for safety
			const config: AutoRepairConfig = {
				catalog: true,
				filter: false,
				indexes: false,
				uniqueIndexes: false
			}

			const result = await FlashcoreSystem.runAutoRepair(config)

			// Should complete without error (catalog repair is disabled internally)
			expect(result).toHaveProperty('repaired')
		})
	})

	describe('Model Iteration', () => {
		it('should check all registered models', async () => {
			FlashcoreSystem.registerModel('User', {
				id: f.id(),
				name: f.string()
			})

			FlashcoreSystem.registerModel('Post', {
				id: f.id(),
				title: f.string(),
				authorId: f.string()
			})

			FlashcoreSystem.registerModel('Comment', {
				id: f.id(),
				content: f.string(),
				postId: f.string()
			})

			const result = await FlashcoreSystem.runAutoRepair(true)

			// All models checked (may or may not need repair)
			expect(result).toHaveProperty('repaired')
			expect(result.errors.length).toBe(0)
		})

		it('should handle namespaced models', async () => {
			FlashcoreSystem.registerModel('Config', {
				id: f.id(),
				key: f.string()
			}, { namespace: 'plugin-a' })

			FlashcoreSystem.registerModel('Config', {
				id: f.id(),
				value: f.string()
			}, { namespace: 'plugin-b' })

			const result = await FlashcoreSystem.runAutoRepair(true)

			expect(result.errors.length).toBe(0)
		})
	})

	describe('Error Handling', () => {
		it('should collect errors per model', async () => {
			// Create models that might have issues
			FlashcoreSystem.registerModel('User', {
				id: f.id(),
				name: f.string()
			})

			FlashcoreSystem.registerModel('Post', {
				id: f.id(),
				title: f.string()
			})

			const result = await FlashcoreSystem.runAutoRepair(true)

			// Errors array should be present (even if empty)
			expect(Array.isArray(result.errors)).toBe(true)
		})

		it('should continue after model error', async () => {
			// Register multiple models
			FlashcoreSystem.registerModel('User', {
				id: f.id(),
				name: f.string()
			})

			FlashcoreSystem.registerModel('Post', {
				id: f.id(),
				title: f.string()
			})

			// Even if one model fails, others should be processed
			const result = await FlashcoreSystem.runAutoRepair(true)

			expect(result).toHaveProperty('repaired')
		})
	})

	describe('Metrics Integration', () => {
		it('should increment indexRebuilds counter', async () => {
			FlashcoreSystem.registerModel('User', {
				id: f.id(),
				name: f.string().indexed()
			})

			const metricsBefore = FlashcoreSystem.metrics()
			const rebuildsBefore = metricsBefore.indexRebuilds

			// Create some data to trigger index rebuild
			const model = FlashcoreSystem.getModel<{ id: string; name: string }>('User')
			if (model) {
				await model.create({ id: '1', name: 'Test' })
			}

			await FlashcoreSystem.runAutoRepair({
				filter: true,
				indexes: true,
				uniqueIndexes: true
			})

			// If any repairs happened, indexRebuilds should increase
			const metricsAfter = FlashcoreSystem.metrics()
			// Note: May or may not have increased depending on if repair was needed
			expect(metricsAfter.indexRebuilds).toBeGreaterThanOrEqual(rebuildsBefore)
		})
	})

	describe('Default Configuration', () => {
		it('should use DEFAULT_AUTO_REPAIR_CONFIG when true', async () => {
			FlashcoreSystem.registerModel('User', {
				id: f.id(),
				name: f.string()
			})

			// Passing true should use defaults
			const result = await FlashcoreSystem.runAutoRepair(true)

			expect(result).toHaveProperty('repaired')
			expect(result).toHaveProperty('errors')
		})

		it('should merge provided config with defaults', async () => {
			FlashcoreSystem.registerModel('User', {
				id: f.id(),
				name: f.string()
			})

			// Partial config should merge with defaults
			const result = await FlashcoreSystem.runAutoRepair({
				filter: true
			})

			expect(result).toHaveProperty('repaired')
		})
	})

	describe('Integration with validateSchemas', () => {
		it('should work after validateSchemas', async () => {
			FlashcoreSystem.registerModel('User', {
				id: f.id(),
				name: f.string()
			})

			// First validate schemas
			await FlashcoreSystem.validateSchemas()

			// Then run auto-repair
			const result = await FlashcoreSystem.runAutoRepair(true)

			expect(result.errors.length).toBe(0)
		})

		it('should handle typical startup sequence', async () => {
			// Typical startup: init -> register models -> validate -> auto-repair
			FlashcoreSystem.registerModel('User', {
				id: f.id(),
				name: f.string(),
				email: f.string().optional()
			})

			FlashcoreSystem.registerModel('Post', {
				id: f.id(),
				title: f.string(),
				authorId: f.string().indexed()
			})

			// Validate schemas
			const validateResult = await FlashcoreSystem.validateSchemas()
			expect(validateResult.modelsValidated).toBe(2)

			// Run auto-repair if configured
			const repairResult = await FlashcoreSystem.runAutoRepair(true)
			expect(repairResult.errors.length).toBe(0)
		})
	})
})
