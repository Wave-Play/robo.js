/** Phase 2: Core Unit Tests - Error Classes (new classes + cause propagation) */

import {
	FlashcoreError,
	ValidationError,
	NotFoundError,
	UniqueConstraintError,
	FeatureNotSupportedError,
	AdapterError,
	DataCorruptionError,
	StorageExhaustedError,
	TransactionConflictError,
	ConnectionError,
	FlashcoreSchemaError,
	MigrationError,
	SafetyError
} from '../../../src/flashcore/core/errors.js'

describe('Flashcore Error Types - Phase 2', () => {
	// ─────────────────────────────────────────────────────────
	// New error classes NOT covered by phase0
	// ─────────────────────────────────────────────────────────

	describe('StorageExhaustedError', () => {
		it('should have correct name property', () => {
			const error = new StorageExhaustedError('Disk full')
			expect(error.name).toBe('StorageExhaustedError')
		})

		it('should have correct code property', () => {
			const error = new StorageExhaustedError('Disk full')
			expect(error.code).toBe('STORAGE_EXHAUSTED')
		})

		it('should be instanceof FlashcoreError and Error', () => {
			const error = new StorageExhaustedError('Disk full')
			expect(error).toBeInstanceOf(FlashcoreError)
			expect(error).toBeInstanceOf(Error)
		})

		it('should propagate cause via ErrorOptions', () => {
			const original = new Error('original ENOSPC')
			const error = new StorageExhaustedError('Disk full', { cause: original })
			expect(error.cause).toBe(original)
		})
	})

	describe('ConnectionError', () => {
		it('should have correct name property', () => {
			const error = new ConnectionError('Connection refused')
			expect(error.name).toBe('ConnectionError')
		})

		it('should have correct code property', () => {
			const error = new ConnectionError('Connection refused')
			expect(error.code).toBe('CONNECTION_ERROR')
		})

		it('should set retriesAttempted correctly', () => {
			const error = new ConnectionError('Connection refused', { retriesAttempted: 3 })
			expect(error.retriesAttempted).toBe(3)
		})

		it('should be instanceof FlashcoreError and Error', () => {
			const error = new ConnectionError('Connection refused')
			expect(error).toBeInstanceOf(FlashcoreError)
			expect(error).toBeInstanceOf(Error)
		})

		it('should propagate cause', () => {
			const original = new Error('ECONNREFUSED')
			const error = new ConnectionError('Connection refused', { cause: original })
			expect(error.cause).toBe(original)
		})
	})

	describe('FlashcoreSchemaError', () => {
		it('should have correct name property', () => {
			const error = new FlashcoreSchemaError('Schema drift detected')
			expect(error.name).toBe('FlashcoreSchemaError')
		})

		it('should have correct code property', () => {
			const error = new FlashcoreSchemaError('Schema drift detected')
			expect(error.code).toBe('SCHEMA_ERROR')
		})

		it('should set model, schemaChange, and cliInstructions correctly', () => {
			const error = new FlashcoreSchemaError('Breaking change', {
				model: 'User',
				schemaChange: 'field_removed',
				cliInstructions: 'Run npx robo db migrate'
			})
			expect(error.model).toBe('User')
			expect(error.schemaChange).toBe('field_removed')
			expect(error.cliInstructions).toBe('Run npx robo db migrate')
		})

		it('should be instanceof FlashcoreError and Error', () => {
			const error = new FlashcoreSchemaError('Schema drift')
			expect(error).toBeInstanceOf(FlashcoreError)
			expect(error).toBeInstanceOf(Error)
		})

		it('should propagate cause', () => {
			const original = new Error('checksum mismatch')
			const error = new FlashcoreSchemaError('Schema drift', { cause: original })
			expect(error.cause).toBe(original)
		})
	})

	describe('MigrationError', () => {
		it('should have correct name property', () => {
			const error = new MigrationError('Migration failed')
			expect(error.name).toBe('MigrationError')
		})

		it('should have correct code property', () => {
			const error = new MigrationError('Migration failed')
			expect(error.code).toBe('MIGRATION_ERROR')
		})

		it('should set migrationName and phase correctly', () => {
			const error = new MigrationError('Migration failed', {
				migrationName: '001_add_users',
				phase: 'up'
			})
			expect(error.migrationName).toBe('001_add_users')
			expect(error.phase).toBe('up')
		})

		it('should be instanceof FlashcoreError and Error', () => {
			const error = new MigrationError('Migration failed')
			expect(error).toBeInstanceOf(FlashcoreError)
			expect(error).toBeInstanceOf(Error)
		})

		it('should propagate cause', () => {
			const original = new Error('lock timeout')
			const error = new MigrationError('Migration failed', {
				migrationName: '002_add_posts',
				phase: 'lock',
				cause: original
			})
			expect(error.cause).toBe(original)
		})
	})

	// ─────────────────────────────────────────────────────────
	// cause propagation on ALL error classes
	// ─────────────────────────────────────────────────────────

	describe('cause propagation across all error classes', () => {
		const original = new Error('root cause')

		it('FlashcoreError propagates cause', () => {
			const error = new FlashcoreError('msg', 'CODE', { cause: original })
			expect(error.cause).toBe(original)
		})

		it('ValidationError propagates cause', () => {
			const error = new ValidationError('msg', { field: 'f', cause: original })
			expect(error.cause).toBe(original)
		})

		it('NotFoundError propagates cause', () => {
			const error = new NotFoundError('msg', { model: 'M', cause: original })
			expect(error.cause).toBe(original)
		})

		it('UniqueConstraintError propagates cause', () => {
			const error = new UniqueConstraintError('msg', { model: 'M', cause: original })
			expect(error.cause).toBe(original)
		})

		it('FeatureNotSupportedError propagates cause', () => {
			const error = new FeatureNotSupportedError('msg', { feature: 'WAL', cause: original })
			expect(error.cause).toBe(original)
		})

		it('AdapterError propagates cause', () => {
			const error = new AdapterError('msg', { operation: 'set', cause: original })
			expect(error.cause).toBe(original)
		})

		it('DataCorruptionError propagates cause', () => {
			const error = new DataCorruptionError('msg', { model: 'M', cause: original })
			expect(error.cause).toBe(original)
		})

		it('StorageExhaustedError propagates cause', () => {
			const error = new StorageExhaustedError('msg', { cause: original })
			expect(error.cause).toBe(original)
		})

		it('TransactionConflictError propagates cause', () => {
			const error = new TransactionConflictError('msg', { model: 'M', cause: original })
			expect(error.cause).toBe(original)
		})

		it('ConnectionError propagates cause', () => {
			const error = new ConnectionError('msg', { cause: original })
			expect(error.cause).toBe(original)
		})

		it('FlashcoreSchemaError propagates cause', () => {
			const error = new FlashcoreSchemaError('msg', { model: 'M', cause: original })
			expect(error.cause).toBe(original)
		})

		it('MigrationError propagates cause', () => {
			const error = new MigrationError('msg', { phase: 'up', cause: original })
			expect(error.cause).toBe(original)
		})

		it('SafetyError propagates cause', () => {
			const error = new SafetyError('msg', { reason: 'test', cause: original })
			expect(error.cause).toBe(original)
		})
	})
})
