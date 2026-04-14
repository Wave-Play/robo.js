/**
 * Flashcore v1 (spec rev 4.3) Schema Checksum
 *
 * Computes deterministic checksums for schema change detection.
 * Uses FNV-1a 32-bit hash for fast, stable hashing.
 */

import { fnv1a32 } from '../core/hash.js'
import type { SchemaFields, FieldDef, RelationDef, CompoundUniqueConstraint } from './types.js'

/**
 * Compute a deterministic checksum for a schema.
 *
 * The checksum changes when:
 * - Fields are added or removed
 * - Field types change
 * - Modifiers change (optional, unique, indexed, etc.)
 * - Enum values change
 * - Relations change
 *
 * @param schema - Schema definition
 * @returns Hex string checksum
 */
export function computeSchemaChecksum(schema: SchemaFields): string {
	// Build deterministic string representation
	const normalized = normalizeSchemaForChecksum(schema)
	const hash = fnv1a32(normalized)
	return hash.toString(16).padStart(8, '0')
}

/**
 * Normalize schema to a deterministic string for hashing.
 */
function normalizeSchemaForChecksum(schema: SchemaFields): string {
	const parts: string[] = []

	// Sort field names for deterministic order
	const sortedKeys = Object.keys(schema).sort()

	for (const key of sortedKeys) {
		const field = schema[key]

		// Compound unique constraints
		if (isCompoundUnique(field)) {
			// Include the constraint fields in the checksum so schema change detection
			// catches compound unique additions/removals/changes.
			parts.push(`${key}:cuniq:${field.fields.join(',')}`)
			continue
		}

		if (!field || typeof field !== 'object' || !('_def' in field)) {
			continue
		}

		const isRelation = '_isRelation' in field && field._isRelation

		if (isRelation) {
			// Relation field
			const def = field._def as RelationDef
			parts.push(`${key}:rel:${def.type}:${def.model}:${def.foreignKey ?? ''}:${def.onDelete}`)
		} else {
			// Regular field
			const def = field._def as FieldDef
			const fieldParts = [
				key,
				def.type,
				def.optional ? 'opt' : 'req',
				def.unique ? 'uniq' : '',
				def.indexed ? 'idx' : '',
				def.indexTypes.length > 0 ? def.indexTypes.join(',') : '',
				def.primaryKey ? 'pk' : '',
				def.version ? 'ver' : '',
				def.hasDefault ? 'def' : '',
				def.enumValues?.join(',') ?? ''
			]
			parts.push(fieldParts.filter(Boolean).join(':'))
		}
	}

	return parts.join('|')
}

/**
 * Type guard for compound unique constraints.
 */
function isCompoundUnique(value: unknown): value is CompoundUniqueConstraint {
	return (
		typeof value === 'object' &&
		value !== null &&
		'_type' in value &&
		(value as { _type: string })._type === 'compoundUnique'
	)
}

/**
 * Compare two schema checksums.
 *
 * @param checksum1 - First checksum
 * @param checksum2 - Second checksum
 * @returns True if checksums match
 */
export function compareChecksums(checksum1: string, checksum2: string): boolean {
	return checksum1.toLowerCase() === checksum2.toLowerCase()
}
