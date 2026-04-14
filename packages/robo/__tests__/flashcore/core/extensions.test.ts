/** Phase 2: Core Unit Tests - Extension Registry */

import {
	registerExtensions,
	getExtensions,
	requireExtension,
	_resetExtensions
} from '../../../src/flashcore/core/extensions.js'
import { FeatureNotSupportedError } from '../../../src/flashcore/core/errors.js'

describe('Extension Registry', () => {
	beforeEach(() => {
		_resetExtensions()
	})

	afterEach(() => {
		_resetExtensions()
	})

	it('should return empty object by default', () => {
		const ext = getExtensions()
		expect(ext.migration).toBeUndefined()
		expect(ext.integrity).toBeUndefined()
		expect(ext.transaction).toBeUndefined()
		expect(ext.wal).toBeUndefined()
	})

	it('should register a migration extension', () => {
		const mockMigration = { createMetadataManager: (): null => null } as any
		registerExtensions({ migration: mockMigration })
		expect(getExtensions().migration).toBeDefined()
		expect(getExtensions().migration).toBe(mockMigration)
	})

	it('should merge multiple extension registrations', () => {
		const mockMigration = { createMetadataManager: (): null => null } as any
		const mockIntegrity = { createChecker: (): null => null } as any

		registerExtensions({ migration: mockMigration })
		registerExtensions({ integrity: mockIntegrity })

		expect(getExtensions().migration).toBe(mockMigration)
		expect(getExtensions().integrity).toBe(mockIntegrity)
	})

	describe('requireExtension', () => {
		it('should return the extension when registered', () => {
			const mockMigration = { createMetadataManager: (): null => null } as any
			registerExtensions({ migration: mockMigration })
			const result = requireExtension('migration', 'runMigrations')
			expect(result).toBe(mockMigration)
		})

		it('should throw FeatureNotSupportedError when extension is not registered', () => {
			expect(() => requireExtension('migration', 'runMigrations')).toThrow(FeatureNotSupportedError)
		})

		it('should include install instructions in error message', () => {
			try {
				requireExtension('migration', 'runMigrations')
				fail('Expected an error')
			} catch (e) {
				expect((e as FeatureNotSupportedError).message).toContain('npx robo add @robojs/flashcore-extras')
			}
		})

		it('should include the method name in error message', () => {
			try {
				requireExtension('migration', 'runMigrations')
				fail('Expected an error')
			} catch (e) {
				expect((e as FeatureNotSupportedError).message).toContain('runMigrations')
			}
		})
	})

	it('should clear all extensions with _resetExtensions', () => {
		const mockMigration = { createMetadataManager: (): null => null } as any
		registerExtensions({ migration: mockMigration })
		expect(getExtensions().migration).toBeDefined()

		_resetExtensions()

		expect(getExtensions().migration).toBeUndefined()
	})

	it('should overwrite when same key is registered twice', () => {
		const migrationA = { createMetadataManager: (): string => 'A' } as any
		const migrationB = { createMetadataManager: (): string => 'B' } as any

		registerExtensions({ migration: migrationA })
		registerExtensions({ migration: migrationB })

		expect(getExtensions().migration).toBe(migrationB)
	})
})
