/**
 * Flashcore v1 (spec rev 4.3) Schema Diff Analysis
 *
 * Analyzes schema changes to determine if they are safe (auto-applicable)
 * or breaking (require explicit migration).
 */

import type { NormalizedSchema, NormalizedField } from 'robo.js/flashcore'
import type {
	FieldMetadata,
	SchemaChange,
	ChangeAnalysisResult,
	SchemaMetadata,
	SchemaSnapshot
} from './types.js'

/**
 * Analyze schema changes between stored metadata and current schema.
 *
 * Change classification per spec 13.4:
 *
 * Safe changes (auto-apply):
 * - Add optional field
 * - Add field with default
 * - Add/remove index
 * - Add unique constraint (validates existing data)
 *
 * Breaking changes (require migration):
 * - Add required field without default
 * - Remove field
 * - Change field type
 * - Remove unique constraint (potential data implications)
 *
 * @param stored - Previously stored field metadata
 * @param current - Current normalized schema
 * @param modelName - Model name for change descriptions
 * @returns Analysis result with safe and breaking changes
 */
export function analyzeSchemaChanges(
	stored: Record<string, FieldMetadata>,
	current: NormalizedSchema,
	modelName: string
): ChangeAnalysisResult {
	const safe: SchemaChange[] = []
	const breaking: SchemaChange[] = []

	// Get current fields as a record for easier comparison
	const currentFields: Record<string, NormalizedField> = {}
	for (const [name, field] of current.fields) {
		currentFields[name] = field
	}

	// =========================================================================
	// Detect new fields
	// =========================================================================
	for (const [name, field] of Object.entries(currentFields)) {
		if (stored[name]) {
			continue // Field exists, will check for modifications below
		}

		// New field
		if (field.optional || field.hasDefault) {
			// Safe: optional field or field with default
			safe.push({
				type: 'add_field',
				model: modelName,
				field: name,
				description: field.hasDefault
					? `Add field '${name}' with default value`
					: `Add optional field '${name}'`,
				safe: true,
				newValue: {
					type: field.type,
					optional: field.optional,
					hasDefault: field.hasDefault
				}
			})
		} else {
			// Breaking: required field without default
			breaking.push({
				type: 'add_required_field',
				model: modelName,
				field: name,
				description: `Add required field '${name}' without default - existing records would be invalid`,
				safe: false,
				newValue: { type: field.type }
			})
		}
	}

	// =========================================================================
	// Detect removed fields
	// =========================================================================
	for (const [name, storedField] of Object.entries(stored)) {
		if (currentFields[name]) {
			continue // Field still exists
		}

		// Field removed - always breaking (data loss)
		breaking.push({
			type: 'remove_field',
			model: modelName,
			field: name,
			description: `Remove field '${name}' - data would be lost`,
			safe: false,
			oldValue: { type: storedField.type }
		})
	}

	// =========================================================================
	// Detect field modifications
	// =========================================================================
	for (const [name, currentField] of Object.entries(currentFields)) {
		const storedField = stored[name]
		if (!storedField) {
			continue // New field, already handled
		}

		// Type change
		if (storedField.type !== currentField.type) {
			breaking.push({
				type: 'change_type',
				model: modelName,
				field: name,
				description: `Change type of '${name}' from '${storedField.type}' to '${currentField.type}'`,
				safe: false,
				oldValue: storedField.type,
				newValue: currentField.type
			})
		}

		// Optional/required change
		if (storedField.optional !== currentField.optional) {
			if (currentField.optional) {
				// Making required field optional is safe
				safe.push({
					type: 'change_optional',
					model: modelName,
					field: name,
					description: `Make field '${name}' optional`,
					safe: true,
					oldValue: false,
					newValue: true
				})
			} else if (currentField.hasDefault) {
				// Making optional field required with default is safe
				safe.push({
					type: 'change_optional',
					model: modelName,
					field: name,
					description: `Make field '${name}' required (has default)`,
					safe: true,
					oldValue: true,
					newValue: false
				})
			} else {
				// Making optional field required without default is breaking
				breaking.push({
					type: 'change_optional',
					model: modelName,
					field: name,
					description: `Make field '${name}' required without default - existing records with null values would be invalid`,
					safe: false,
					oldValue: true,
					newValue: false
				})
			}
		}

		// Index changes (always safe)
		if (storedField.indexed !== currentField.indexed) {
			if (currentField.indexed) {
				safe.push({
					type: 'add_index',
					model: modelName,
					field: name,
					description: `Add index on '${name}'`,
					safe: true
				})
			} else {
				safe.push({
					type: 'remove_index',
					model: modelName,
					field: name,
					description: `Remove index on '${name}'`,
					safe: true
				})
			}
		}

		// Unique constraint changes
		if (storedField.unique !== currentField.unique) {
			if (currentField.unique) {
				// Adding unique constraint is safe (will validate existing data)
				safe.push({
					type: 'add_unique',
					model: modelName,
					field: name,
					description: `Add unique constraint on '${name}' (will validate existing data)`,
					safe: true
				})
			} else {
				// Removing unique constraint is technically safe but notable
				safe.push({
					type: 'remove_unique',
					model: modelName,
					field: name,
					description: `Remove unique constraint on '${name}'`,
					safe: true
				})
			}
		}

		// Enum values change
		if (storedField.enumValues || currentField.enumValues) {
			const storedEnums = new Set(storedField.enumValues || [])
			const currentEnums = new Set(currentField.enumValues || [])

			// Check for removed enum values (breaking)
			const removedEnums = [...storedEnums].filter(v => !currentEnums.has(v))
			if (removedEnums.length > 0) {
				breaking.push({
					type: 'change_type',
					model: modelName,
					field: name,
					description: `Remove enum values from '${name}': ${removedEnums.join(', ')} - existing records may become invalid`,
					safe: false,
					oldValue: storedField.enumValues,
					newValue: currentField.enumValues
				})
			}

			// Added enum values are safe
			const addedEnums = [...currentEnums].filter(v => !storedEnums.has(v))
			if (addedEnums.length > 0 && removedEnums.length === 0) {
				safe.push({
					type: 'change_type',
					model: modelName,
					field: name,
					description: `Add enum values to '${name}': ${addedEnums.join(', ')}`,
					safe: true,
					oldValue: storedField.enumValues,
					newValue: currentField.enumValues
				})
			}
		}
	}

	return {
		safe,
		breaking,
		hasBreakingChanges: breaking.length > 0
	}
}

/**
 * Analyze namespace-level changes (model additions/removals).
 *
 * @param storedSnapshot - Previously stored schema snapshot (null for new namespace)
 * @param currentModels - Map of model name to current schema metadata
 * @returns Analysis result with safe and breaking changes
 */
export function analyzeNamespaceChanges(
	storedSnapshot: SchemaSnapshot | null,
	currentModels: Map<string, SchemaMetadata>
): ChangeAnalysisResult {
	const safe: SchemaChange[] = []
	const breaking: SchemaChange[] = []

	const storedModelNames = new Set(
		storedSnapshot ? Object.keys(storedSnapshot.models) : []
	)
	const currentModelNames = new Set(currentModels.keys())

	// Detect new models (always safe)
	for (const name of currentModelNames) {
		if (!storedModelNames.has(name)) {
			safe.push({
				type: 'add_model',
				model: name,
				description: `Add model '${name}'`,
				safe: true
			})
		}
	}

	// Detect removed models (breaking)
	for (const name of storedModelNames) {
		if (!currentModelNames.has(name)) {
			breaking.push({
				type: 'remove_model',
				model: name,
				description: `Remove model '${name}' - all data would be lost`,
				safe: false
			})
		}
	}

	return {
		safe,
		breaking,
		hasBreakingChanges: breaking.length > 0
	}
}

/**
 * Format schema changes for display.
 *
 * @param changes - List of schema changes
 * @param options - Formatting options
 * @returns Formatted string for display
 */
export function formatSchemaChanges(
	changes: SchemaChange[],
	options: { color?: boolean; indent?: string } = {}
): string {
	const { indent = '  ' } = options

	if (changes.length === 0) {
		return `${indent}No changes`
	}

	const lines: string[] = []

	for (const change of changes) {
		const prefix = change.safe ? '+' : '!'
		lines.push(`${indent}${prefix} ${change.description}`)
	}

	return lines.join('\n')
}

/**
 * Check if a schema has any changes from stored metadata.
 *
 * Quick check without full analysis.
 *
 * @param storedChecksum - Previously stored checksum
 * @param currentChecksum - Current schema checksum
 * @returns True if checksums differ
 */
export function hasSchemaChanged(
	storedChecksum: string,
	currentChecksum: string
): boolean {
	return storedChecksum.toLowerCase() !== currentChecksum.toLowerCase()
}

/**
 * Summarize changes for logging.
 *
 * @param result - Change analysis result
 * @returns Summary string
 */
export function summarizeChanges(result: ChangeAnalysisResult): string {
	const parts: string[] = []

	if (result.safe.length > 0) {
		parts.push(`${result.safe.length} safe change(s)`)
	}

	if (result.breaking.length > 0) {
		parts.push(`${result.breaking.length} breaking change(s)`)
	}

	if (parts.length === 0) {
		return 'No changes'
	}

	return parts.join(', ')
}
