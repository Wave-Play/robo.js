/**
 * Flashcore v1 (spec rev 4.3) Phase 0 Tests - Error Types
 *
 * Tests error class hierarchy and properties.
 */

import {
	FlashcoreError,
	ValidationError,
	NotFoundError,
	UniqueConstraintError,
	FeatureNotSupportedError,
	AdapterError,
	DataCorruptionError,
	TransactionConflictError,
	SafetyError
} from '../helpers/flashcore-compat.js'

describe('Flashcore Error Types', () => {
	describe('FlashcoreError (base)', () => {
		it('should have correct name and code', () => {
			const error = new FlashcoreError('Test error', 'TEST_CODE')
			expect(error.name).toBe('FlashcoreError')
			expect(error.code).toBe('TEST_CODE')
			expect(error.message).toBe('Test error')
		})

		it('should use default code when not provided', () => {
			const error = new FlashcoreError('Test error')
			expect(error.code).toBe('FLASHCORE_ERROR')
		})

		it('should extend Error', () => {
			const error = new FlashcoreError('Test')
			expect(error).toBeInstanceOf(Error)
		})

		it('should capture stack trace', () => {
			const error = new FlashcoreError('Test')
			expect(error.stack).toBeDefined()
		})
	})

	describe('ValidationError', () => {
		it('should extend FlashcoreError', () => {
			const error = new ValidationError('Invalid input')
			expect(error).toBeInstanceOf(FlashcoreError)
			expect(error).toBeInstanceOf(Error)
		})

		it('should have field and value properties', () => {
			const error = new ValidationError('Invalid email', {
				field: 'email',
				value: 'not-an-email'
			})
			expect(error.name).toBe('ValidationError')
			expect(error.code).toBe('VALIDATION_ERROR')
			expect(error.field).toBe('email')
			expect(error.value).toBe('not-an-email')
		})
	})

	describe('NotFoundError', () => {
		it('should have model and id properties', () => {
			const error = new NotFoundError('User not found', {
				model: 'User',
				id: '123'
			})
			expect(error.name).toBe('NotFoundError')
			expect(error.code).toBe('NOT_FOUND')
			expect(error.model).toBe('User')
			expect(error.id).toBe('123')
		})
	})

	describe('UniqueConstraintError', () => {
		it('should have model, field, and value properties', () => {
			const error = new UniqueConstraintError('Email already exists', {
				model: 'User',
				field: 'email',
				value: 'test@example.com'
			})
			expect(error.name).toBe('UniqueConstraintError')
			expect(error.code).toBe('UNIQUE_CONSTRAINT')
			expect(error.model).toBe('User')
			expect(error.field).toBe('email')
			expect(error.value).toBe('test@example.com')
		})
	})

	describe('FeatureNotSupportedError', () => {
		it('should have feature and requiredCapability properties', () => {
			const error = new FeatureNotSupportedError('WAL not available', {
				feature: 'WAL',
				requiredCapability: 'scan'
			})
			expect(error.name).toBe('FeatureNotSupportedError')
			expect(error.code).toBe('FEATURE_NOT_SUPPORTED')
			expect(error.feature).toBe('WAL')
			expect(error.requiredCapability).toBe('scan')
		})
	})

	describe('AdapterError', () => {
		it('should have operation and key properties', () => {
			const error = new AdapterError('Write failed', {
				operation: 'set',
				key: 'test:key'
			})
			expect(error.name).toBe('AdapterError')
			expect(error.code).toBe('ADAPTER_ERROR')
			expect(error.operation).toBe('set')
			expect(error.key).toBe('test:key')
		})
	})

	describe('DataCorruptionError', () => {
		it('should have model, structure, and repairGuidance properties', () => {
			const error = new DataCorruptionError('Chunk corrupted', {
				model: 'User',
				structure: 'chunk',
				repairGuidance: 'Run flashcore repair'
			})
			expect(error.name).toBe('DataCorruptionError')
			expect(error.code).toBe('DATA_CORRUPTION')
			expect(error.model).toBe('User')
			expect(error.structure).toBe('chunk')
			expect(error.repairGuidance).toBe('Run flashcore repair')
		})
	})

	describe('TransactionConflictError', () => {
		it('should have version mismatch properties', () => {
			const error = new TransactionConflictError('Version conflict', {
				model: 'User',
				id: '123',
				expectedVersion: 1,
				actualVersion: 2
			})
			expect(error.name).toBe('TransactionConflictError')
			expect(error.code).toBe('TRANSACTION_CONFLICT')
			expect(error.model).toBe('User')
			expect(error.id).toBe('123')
			expect(error.expectedVersion).toBe(1)
			expect(error.actualVersion).toBe(2)
		})
	})

	describe('SafetyError', () => {
		it('should have reason, limit, and actual properties', () => {
			const error = new SafetyError('Reserved prefix', {
				reason: 'reserved_prefix',
				limit: 0,
				actual: 1
			})
			expect(error.name).toBe('SafetyError')
			expect(error.code).toBe('SAFETY_ERROR')
			expect(error.reason).toBe('reserved_prefix')
			expect(error.limit).toBe(0)
			expect(error.actual).toBe(1)
		})
	})

	describe('Error cause chain', () => {
		it('should preserve cause through inheritance', () => {
			const cause = new Error('Original error')
			const error = new ValidationError('Wrapper', { cause })
			expect(error.cause).toBe(cause)
		})
	})
})
