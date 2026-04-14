/**
 * Phase 7: Extension Registration Integration Tests
 *
 * Tests the bridge between the core extension registry and the
 * flashcore-extras plugin. Verifies that registering extensions
 * makes all extension types available, that partial registration
 * merges correctly, and that requireExtension returns the right values.
 */

import {
	registerExtensions,
	getExtensions,
	requireExtension,
	FlashcoreSystem
} from 'robo.js/flashcore'
import { _resetExtensions } from '../../../../robo/src/flashcore/core/extensions.js'
import { registerAllExtensions } from '../helpers/register-extensions.js'

describe('Extension Registration Integration', () => {
	afterEach(async () => {
		_resetExtensions()
		await FlashcoreSystem._reset()
	})

	describe('after registerAllExtensions()', () => {
		beforeEach(() => {
			registerAllExtensions()
		})

		it('should have all 4 extension types registered', () => {
			const ext = getExtensions()
			expect(ext.migration).toBeDefined()
			expect(ext.integrity).toBeDefined()
			expect(ext.transaction).toBeDefined()
			expect(ext.wal).toBeDefined()
		})

		it('should return migration extension via requireExtension without throwing', () => {
			const migration = requireExtension('migration', 'runMigrations')
			expect(migration).toBeDefined()
			expect(typeof migration.createMetadataManager).toBe('function')
		})

		it('should return integrity extension via requireExtension without throwing', () => {
			const integrity = requireExtension('integrity', 'checkIntegrity')
			expect(integrity).toBeDefined()
			expect(typeof integrity.createChecker).toBe('function')
		})

		it('should return transaction extension via requireExtension without throwing', () => {
			const transaction = requireExtension('transaction', 'transaction')
			expect(transaction).toBeDefined()
			expect(typeof transaction.validateMode).toBe('function')
		})

		it('should return WAL extension via requireExtension without throwing', () => {
			const wal = requireExtension('wal', 'recoverWAL')
			expect(wal).toBeDefined()
			expect(typeof wal.createWALManager).toBe('function')
			expect(wal.deltaBuilders).toBeDefined()
		})
	})

	describe('partial registration merges correctly', () => {
		it('should merge migration-only and integrity-only registrations', () => {
			// Register migration only
			const mockMigration = {
				createMetadataManager: (): null => null,
				createHistoryManager: (): null => null,
				analyzeSchemaChanges: (): any => ({}),
				summarizeChanges: (): string => '',
				createMigrationRunner: (): null => null,
				createInitialMetadata: (): any => ({}),
				createUpdatedMetadata: (): any => ({}),
				createAutoEntry: (): any => ({})
			} as any
			registerExtensions({ migration: mockMigration })

			// Register integrity only
			const mockIntegrity = {
				createChecker: (): null => null,
				createRepairEngine: (): null => null,
				rebuildCatalogFromChunks: async (): Promise<any> => ({}),
				verifyCatalogIntegrity: async (): Promise<any> => ({})
			} as any
			registerExtensions({ integrity: mockIntegrity })

			// Both should be present
			const ext = getExtensions()
			expect(ext.migration).toBe(mockMigration)
			expect(ext.integrity).toBe(mockIntegrity)
		})
	})
})
