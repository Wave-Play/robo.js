/**
 * Flashcore v1 (spec rev 4.3) Migration Definition API
 *
 * Provides the defineMigration() function for creating migration scripts.
 */

import { createHash } from 'crypto'
import type { MigrationDefinition, RegisteredMigration } from './types.js'

/**
 * Define a migration script.
 *
 * Migrations are used to apply breaking schema changes that cannot be
 * auto-applied on startup. Each migration should be:
 *
 * 1. **Idempotent**: Safe to run multiple times
 * 2. **Atomic**: Either fully applies or fully rolls back
 * 3. **Testable**: Can be verified in a test environment
 *
 * @example
 * ```typescript
 * // migrations/001_add_role_field.ts
 * import { defineMigration } from '@robojs/flashcore-extras/migrations'
 *
 * export default defineMigration({
 *   name: 'add_role_field',
 *
 *   async up(ctx) {
 *     // Add default value for existing records
 *     await ctx.model('user').updateMany({
 *       where: { role: { equals: undefined } },
 *       data: { role: 'user' }
 *     })
 *   },
 *
 *   async down(ctx) {
 *     // Remove the field (optional rollback)
 *     ctx.progress('Rollback not supported for this migration')
 *   }
 * })
 * ```
 *
 * @param definition - Migration definition with name, up, and optional down
 * @returns Registered migration with computed checksum
 */
export function defineMigration(definition: MigrationDefinition): RegisteredMigration {
	// Validate definition
	if (!definition.name || typeof definition.name !== 'string') {
		throw new Error('Migration must have a name')
	}

	if (typeof definition.up !== 'function') {
		throw new Error('Migration must have an up() function')
	}

	if (definition.down && typeof definition.down !== 'function') {
		throw new Error('Migration down must be a function')
	}

	// Compute checksum for drift detection
	const checksum = computeMigrationChecksum(definition)

	return {
		name: definition.name,
		up: definition.up,
		down: definition.down,
		checksum
	}
}

/**
 * Compute a checksum for a migration definition.
 *
 * The checksum is used to detect if a migration has been modified
 * after it was applied. This helps prevent data inconsistency.
 *
 * @param definition - Migration definition
 * @returns Hex string checksum (16 characters)
 */
function computeMigrationChecksum(definition: MigrationDefinition): string {
	// Include name and function bodies in checksum
	const content = [
		definition.name,
		definition.up.toString(),
		definition.down?.toString() ?? ''
	].join('|')

	// Use SHA-256 and take first 16 characters
	return createHash('sha256')
		.update(content)
		.digest('hex')
		.slice(0, 16)
}

/**
 * Migration registry for discovered migrations.
 *
 * Used internally to collect migrations from the filesystem.
 */
export class MigrationRegistry {
	private readonly migrations: Map<string, RegisteredMigration> = new Map()

	/**
	 * Register a migration.
	 *
	 * @param migration - Registered migration
	 */
	register(migration: RegisteredMigration): void {
		if (this.migrations.has(migration.name)) {
			throw new Error(`Duplicate migration name: ${migration.name}`)
		}
		this.migrations.set(migration.name, migration)
	}

	/**
	 * Get all registered migrations in order.
	 *
	 * Migrations are sorted by name (typically timestamp-prefixed).
	 */
	getAll(): RegisteredMigration[] {
		return Array.from(this.migrations.values()).sort((a, b) =>
			a.name.localeCompare(b.name)
		)
	}

	/**
	 * Get a specific migration by name.
	 */
	get(name: string): RegisteredMigration | undefined {
		return this.migrations.get(name)
	}

	/**
	 * Check if a migration is registered.
	 */
	has(name: string): boolean {
		return this.migrations.has(name)
	}

	/**
	 * Get the number of registered migrations.
	 */
	get size(): number {
		return this.migrations.size
	}

	/**
	 * Clear all registered migrations.
	 */
	clear(): void {
		this.migrations.clear()
	}
}

/**
 * Global migration registry instance.
 */
export const migrationRegistry = new MigrationRegistry()

/**
 * Helper to generate a migration filename.
 *
 * @param name - Migration name (lowercase, underscore-separated)
 * @returns Filename with timestamp prefix
 *
 * @example
 * ```typescript
 * generateMigrationFilename('add_role_field')
 * // => '20240115120000_add_role_field.ts'
 * ```
 */
export function generateMigrationFilename(name: string): string {
	const now = new Date()
	const timestamp = [
		now.getFullYear(),
		String(now.getMonth() + 1).padStart(2, '0'),
		String(now.getDate()).padStart(2, '0'),
		String(now.getHours()).padStart(2, '0'),
		String(now.getMinutes()).padStart(2, '0'),
		String(now.getSeconds()).padStart(2, '0')
	].join('')

	// Sanitize name
	const safeName = name
		.toLowerCase()
		.replace(/[^a-z0-9_]/g, '_')
		.replace(/_+/g, '_')
		.replace(/^_|_$/g, '')

	return `${timestamp}_${safeName}.ts`
}

/**
 * Migration template for code generation.
 */
export const MIGRATION_TEMPLATE = `import { defineMigration } from '@robojs/flashcore-extras/migrations'

export default defineMigration({
  name: '{{name}}',

  async up(ctx) {
    // Forward migration
    // ctx.model('modelName').updateMany({ where: {...}, data: {...} })
    // ctx.progress('Processing...')
  },

  async down(ctx) {
    // Rollback migration (optional)
    // ctx.model('modelName').deleteMany({ where: {...} })
  }
})
`

/**
 * Generate migration file content.
 *
 * @param name - Migration name
 * @returns TypeScript migration file content
 */
export function generateMigrationContent(name: string): string {
	return MIGRATION_TEMPLATE.replace('{{name}}', name)
}
