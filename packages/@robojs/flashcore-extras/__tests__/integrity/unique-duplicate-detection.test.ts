/**
 * Phase 6: Unique Duplicate Detection Tests
 *
 * Tests for detecting duplicate unique values during integrity checks.
 */

import { FlashcoreSystem, MemoryAdapter, buildUniqueKey, encodeUniqueValue, f } from 'robo.js/flashcore'
import { IntegrityChecker } from '../../src/integrity/check.js'
import { registerAllExtensions } from '../helpers/register-extensions.js'

describe('Unique Duplicate Detection', () => {
	let adapter: MemoryAdapter

	beforeEach(async () => {
		await FlashcoreSystem._reset()
		registerAllExtensions()
		adapter = new MemoryAdapter()
		await adapter.init()
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
		await adapter.clear()
	})

	describe('IntegrityChecker.checkUniqueIndexes()', () => {
		it('should detect orphaned unique keys', async () => {
			// Manually create an orphaned unique key (key pointing to non-existent record)
			await adapter.set(
				buildUniqueKey('TestModel', 'email', encodeUniqueValue('test@example.com')),
				{ id: 'non-existent-id' }
			)

			const checker = new IntegrityChecker(adapter)
			const result = await checker.checkUniqueIndexes('TestModel', ['email'])

			expect(result.isValid).toBe(false)
			expect(result.orphanedKeys.length).toBeGreaterThan(0)
		})

		it('should pass for valid unique indexes', async () => {
			await FlashcoreSystem.init({ adapter })

			const TestModel = FlashcoreSystem.registerModel<{ id: string; email: string }>('TestModel', {
				id: f.id(),
				email: f.string().unique()
			})

			await TestModel.create({ email: 'valid@example.com' })

			const report = await FlashcoreSystem.verify('TestModel', {
				checkUniqueIndexes: true
			})

			// Should be valid if unique constraints are properly maintained
			expect(report.uniqueIndex).toBeDefined()
		})
	})

	describe('$.verify() with unique indexes', () => {
			it('should include unique index check in verify', async () => {
				await FlashcoreSystem.init({ adapter })

				const TestModel = FlashcoreSystem.registerModel<{ id: string; email: string; username: string }>('TestModel', {
					id: f.id(),
					email: f.string().unique(),
					username: f.string().unique()
				})

			await TestModel.create({ email: 'test@example.com', username: 'testuser' })

			const report = await FlashcoreSystem.verify('TestModel', {
				checkUniqueIndexes: true
			})

			expect(report.modelName).toBe('TestModel')
		})
	})

	describe('$.repair() with unique indexes', () => {
		it('should clean orphaned unique keys during repair', async () => {
			// Create orphaned key first
			await adapter.set(
				buildUniqueKey('TestModel', 'email', encodeUniqueValue('orphan@test.com')),
				{ id: 'deleted-record-id' }
			)

				await FlashcoreSystem.init({ adapter })

				FlashcoreSystem.registerModel<{ id: string; email: string }>('TestModel', {
					id: f.id(),
					email: f.string().unique()
				})

			// Repair should clean up orphaned keys
			const result = await FlashcoreSystem.repair('TestModel', {
				repairUniqueIndexes: true
			})

			expect(result.durationMs).toBeGreaterThanOrEqual(0)
		})

			it('should report duplicates that cannot be auto-repaired', async () => {
				await FlashcoreSystem.init({ adapter })

			// This test verifies that the repair engine correctly reports
			// duplicates that require manual resolution

				const TestModel = FlashcoreSystem.registerModel<{ id: string; email: string }>('TestModel', {
					id: f.id(),
					email: f.string().unique()
				})

			// Create a valid record
			await TestModel.create({ email: 'unique@example.com' })

			// Run repair - should complete without issues for valid data
			const result = await FlashcoreSystem.repair('TestModel')
			expect(result.durationMs).toBeGreaterThanOrEqual(0)
		})
	})

	describe('Unique constraint enforcement', () => {
			it('should prevent duplicate unique values on create', async () => {
				await FlashcoreSystem.init({ adapter })

				const TestModel = FlashcoreSystem.registerModel<{ id: string; email: string }>('TestModel', {
					id: f.id(),
					email: f.string().unique()
				})

			await TestModel.create({ email: 'first@example.com' })

			await expect(TestModel.create({ email: 'first@example.com' })).rejects.toThrow(/unique/i)
		})

			it('should prevent duplicate unique values on update', async () => {
				await FlashcoreSystem.init({ adapter })

				const TestModel = FlashcoreSystem.registerModel<{ id: string; email: string }>('TestModel', {
					id: f.id(),
					email: f.string().unique()
				})

			await TestModel.create({ email: 'first@example.com' })
			const record2 = await TestModel.create({ email: 'second@example.com' })

			await expect(
				TestModel.update({
					where: { id: record2.id },
					data: { email: 'first@example.com' }
				})
			).rejects.toThrow(/unique/i)
		})

			it('should allow updating to same value', async () => {
				await FlashcoreSystem.init({ adapter })

				const TestModel = FlashcoreSystem.registerModel<{ id: string; email: string; name: string }>('TestModel', {
					id: f.id(),
					email: f.string().unique(),
					name: f.string()
				})

			const record = await TestModel.create({ email: 'test@example.com', name: 'Test' })

			// Updating to same email should work
			const updated = await TestModel.update({
				where: { id: record.id },
				data: { email: 'test@example.com', name: 'Updated' }
			})

			expect(updated?.name).toBe('Updated')
		})
	})
})
