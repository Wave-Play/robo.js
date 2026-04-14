/**
 * Phase 7: defineMigration API Tests
 *
 * Tests for the user-facing migration definition API.
 */

import { describe, it, expect, beforeEach } from '@jest/globals'
import {
	defineMigration,
	MigrationRegistry,
	generateMigrationFilename,
	generateMigrationContent,
	MIGRATION_TEMPLATE
} from '../../src/migrations/define.js'

describe('defineMigration', () => {
	it('should create a registered migration with checksum', () => {
		const migration = defineMigration({
			name: 'add_email_field',
			async up(ctx) {
				ctx.progress('Adding email field')
			}
		})

		expect(migration.name).toBe('add_email_field')
		expect(migration.up).toBeDefined()
		expect(migration.checksum).toBeDefined()
		expect(typeof migration.checksum).toBe('string')
		expect(migration.checksum.length).toBe(16) // SHA-256 truncated to 16 chars
	})

	it('should support optional down function', () => {
		const migration = defineMigration({
			name: 'add_column',
			async up(ctx) {
				ctx.progress('Adding column')
			},
			async down(ctx) {
				ctx.progress('Removing column')
			}
		})

		expect(migration.down).toBeDefined()
	})

	it('should generate different checksums for different migrations', () => {
		const migration1 = defineMigration({
			name: 'migration_1',
			async up() {}
		})

		const migration2 = defineMigration({
			name: 'migration_2',
			async up() {}
		})

		expect(migration1.checksum).not.toBe(migration2.checksum)
	})

	it('should generate same checksum for identical migrations', () => {
		const upFn = async () => {}

		const migration1 = defineMigration({
			name: 'same_migration',
			up: upFn
		})

		const migration2 = defineMigration({
			name: 'same_migration',
			up: upFn
		})

		expect(migration1.checksum).toBe(migration2.checksum)
	})

	it('should throw if name is missing', () => {
		expect(() => {
			defineMigration({
				name: '',
				async up() {}
			})
		}).toThrow('Migration must have a name')
	})

	it('should throw if up function is missing', () => {
		expect(() => {
			defineMigration({
				name: 'no_up',
				up: null as any
			})
		}).toThrow('Migration must have an up() function')
	})

	it('should throw if down is not a function', () => {
		expect(() => {
			defineMigration({
				name: 'invalid_down',
				async up() {},
				down: 'not a function' as any
			})
		}).toThrow('Migration down must be a function')
	})
})

describe('MigrationRegistry', () => {
	let registry: MigrationRegistry

	beforeEach(() => {
		registry = new MigrationRegistry()
	})

	describe('register', () => {
		it('should register a migration', () => {
			const migration = defineMigration({
				name: 'test_migration',
				async up() {}
			})

			registry.register(migration)

			expect(registry.has('test_migration')).toBe(true)
		})

		it('should throw on duplicate registration', () => {
			const migration = defineMigration({
				name: 'duplicate',
				async up() {}
			})

			registry.register(migration)

			expect(() => {
				registry.register(migration)
			}).toThrow('Duplicate migration name: duplicate')
		})
	})

	describe('getAll', () => {
		it('should return migrations sorted by name', () => {
			const migrationC = defineMigration({
				name: '20240103_c',
				async up() {}
			})

			const migrationA = defineMigration({
				name: '20240101_a',
				async up() {}
			})

			const migrationB = defineMigration({
				name: '20240102_b',
				async up() {}
			})

			registry.register(migrationC)
			registry.register(migrationA)
			registry.register(migrationB)

			const all = registry.getAll()

			expect(all[0].name).toBe('20240101_a')
			expect(all[1].name).toBe('20240102_b')
			expect(all[2].name).toBe('20240103_c')
		})
	})

	describe('get', () => {
		it('should return migration by name', () => {
			const migration = defineMigration({
				name: 'find_me',
				async up() {}
			})

			registry.register(migration)

			const found = registry.get('find_me')
			expect(found).toBe(migration)
		})

		it('should return undefined for non-existent migration', () => {
			const found = registry.get('nonexistent')
			expect(found).toBeUndefined()
		})
	})

	describe('size', () => {
		it('should return number of registered migrations', () => {
			expect(registry.size).toBe(0)

			registry.register(defineMigration({
				name: 'first',
				async up() {}
			}))

			expect(registry.size).toBe(1)

			registry.register(defineMigration({
				name: 'second',
				async up() {}
			}))

			expect(registry.size).toBe(2)
		})
	})

	describe('clear', () => {
		it('should remove all migrations', () => {
			registry.register(defineMigration({
				name: 'to_clear',
				async up() {}
			}))

			expect(registry.size).toBe(1)

			registry.clear()

			expect(registry.size).toBe(0)
		})
	})
})

describe('generateMigrationFilename', () => {
	it('should generate filename with timestamp prefix', () => {
		const filename = generateMigrationFilename('add_users_table')

		// Should match pattern: YYYYMMDDHHmmss_name.ts
		expect(filename).toMatch(/^\d{14}_add_users_table\.ts$/)
	})

	it('should sanitize name to lowercase with underscores', () => {
		const filename = generateMigrationFilename('Add-Users Table!')

		expect(filename).toMatch(/_add_users_table\.ts$/)
	})

	it('should remove leading/trailing underscores', () => {
		const filename = generateMigrationFilename('_test_')

		expect(filename).toMatch(/_test\.ts$/)
		expect(filename).not.toMatch(/__/)
	})
})

describe('generateMigrationContent', () => {
	it('should generate valid TypeScript migration content', () => {
		const content = generateMigrationContent('add_email_field')

		expect(content).toContain("import { defineMigration }")
		expect(content).toContain("name: 'add_email_field'")
		expect(content).toContain('async up(ctx)')
		expect(content).toContain('async down(ctx)')
	})
})

describe('MIGRATION_TEMPLATE', () => {
	it('should contain placeholder for name', () => {
		expect(MIGRATION_TEMPLATE).toContain('{{name}}')
	})

	it('should contain up and down functions', () => {
		expect(MIGRATION_TEMPLATE).toContain('async up(ctx)')
		expect(MIGRATION_TEMPLATE).toContain('async down(ctx)')
	})

	it('should import from @robojs/flashcore-extras/migrations', () => {
		expect(MIGRATION_TEMPLATE).toContain("from '@robojs/flashcore-extras/migrations'")
	})
})
