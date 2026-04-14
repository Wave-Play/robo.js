/**
 * Flashcore v1 (spec rev 4.3) Schema History Manager
 *
 * Manages the append-only schema history for visual diff support.
 */

import type { FlashcoreAdapter } from 'robo.js/flashcore'
import { buildSchemaHistoryKey } from 'robo.js/flashcore'
import type {
	SchemaHistoryEntry,
	SchemaChange,
	VersionDiff,
	ModelDiff,
	FieldMetadata,
	FieldDiffEntry
} from './types.js'

/**
 * Maximum number of history entries to keep.
 * Older entries beyond this limit may be pruned.
 */
const MAX_HISTORY_ENTRIES = 100

/**
 * Manager for schema version history.
 *
 * Provides:
 * - Append-only history storage
 * - Version retrieval and comparison
 * - Visual diff generation between versions
 */
export class SchemaHistoryManager {
	constructor(private readonly adapter: FlashcoreAdapter) {}

	// =========================================================================
	// History Storage
	// =========================================================================

	/**
	 * Get the full schema history for a namespace.
	 *
	 * @param namespace - Namespace name (undefined for default)
	 * @returns Array of history entries, oldest first
	 */
	async getHistory(namespace?: string): Promise<SchemaHistoryEntry[]> {
		const key = buildSchemaHistoryKey(namespace)
		const data = await this.adapter.get(key)

		if (!data || !Array.isArray(data)) {
			return []
		}

		return this.parseHistoryEntries(data)
	}

	/**
	 * Append a new history entry.
	 *
	 * @param entry - History entry to append
	 * @param namespace - Namespace name (undefined for default)
	 */
	async appendHistory(
		entry: SchemaHistoryEntry,
		namespace?: string
	): Promise<void> {
		const key = buildSchemaHistoryKey(namespace)
		const existing = await this.getHistory(namespace)

		// Append new entry
		existing.push(entry)

		// Prune old entries if exceeding limit
		const pruned = existing.length > MAX_HISTORY_ENTRIES
			? existing.slice(-MAX_HISTORY_ENTRIES)
			: existing

		await this.adapter.set(key, pruned)
	}

	/**
	 * Get the latest version number for a namespace.
	 *
	 * @param namespace - Namespace name (undefined for default)
	 * @returns Latest version number, or 0 if no history
	 */
	async getVersion(namespace?: string): Promise<number> {
		const history = await this.getHistory(namespace)

		if (history.length === 0) {
			return 0
		}

		return history[history.length - 1].version
	}

	/**
	 * Get a specific history entry by version.
	 *
	 * @param version - Version number to retrieve
	 * @param namespace - Namespace name (undefined for default)
	 * @returns History entry or null if not found
	 */
	async getVersionEntry(
		version: number,
		namespace?: string
	): Promise<SchemaHistoryEntry | null> {
		const history = await this.getHistory(namespace)
		return history.find(e => e.version === version) || null
	}

	/**
	 * Clear all history for a namespace.
	 *
	 * @param namespace - Namespace name (undefined for default)
	 */
	async clearHistory(namespace?: string): Promise<void> {
		const key = buildSchemaHistoryKey(namespace)
		await this.adapter.delete(key)
	}

	// =========================================================================
	// Version Comparison
	// =========================================================================

	/**
	 * Generate a diff between two versions.
	 *
	 * @param fromVersion - Starting version number
	 * @param toVersion - Ending version number
	 * @param namespace - Namespace name (undefined for default)
	 * @returns Version diff or null if versions not found
	 */
	async diffVersions(
		fromVersion: number,
		toVersion: number,
		namespace?: string
	): Promise<VersionDiff | null> {
		const fromEntry = await this.getVersionEntry(fromVersion, namespace)
		const toEntry = await this.getVersionEntry(toVersion, namespace)

		if (!fromEntry || !toEntry) {
			return null
		}

		// Collect all changes between versions
		const history = await this.getHistory(namespace)
		const changesInRange = history
			.filter(e => e.version > fromVersion && e.version <= toVersion)
			.flatMap(e => e.changes)

		// Group changes by model
		const modelChanges = new Map<string, SchemaChange[]>()
		for (const change of changesInRange) {
			const model = change.model || '_global'
			if (!modelChanges.has(model)) {
				modelChanges.set(model, [])
			}
			modelChanges.get(model)!.push(change)
		}

		// Build model diffs
		const modelDiffs: ModelDiff[] = []
		for (const [modelName, changes] of modelChanges) {
			const diff = this.buildModelDiff(modelName, changes)
			if (diff.added.length > 0 || diff.removed.length > 0 || diff.modified.length > 0) {
				modelDiffs.push(diff)
			}
		}

		return {
			from: fromEntry,
			to: toEntry,
			modelDiffs
		}
	}

	/**
	 * Get changes between two versions as a flat list.
	 *
	 * @param fromVersion - Starting version number
	 * @param toVersion - Ending version number
	 * @param namespace - Namespace name (undefined for default)
	 * @returns List of changes
	 */
	async getChangesBetween(
		fromVersion: number,
		toVersion: number,
		namespace?: string
	): Promise<SchemaChange[]> {
		const history = await this.getHistory(namespace)

		return history
			.filter(e => e.version > fromVersion && e.version <= toVersion)
			.flatMap(e => e.changes)
	}

	// =========================================================================
	// History Entry Creation
	// =========================================================================

	/**
	 * Create a history entry for auto-applied changes.
	 *
	 * @param version - New version number
	 * @param checksum - New combined checksum
	 * @param changes - Changes that were auto-applied
	 * @returns History entry
	 */
	static createAutoEntry(
		version: number,
		checksum: string,
		changes: SchemaChange[]
	): SchemaHistoryEntry {
		return {
			version,
			checksum,
			changes,
			appliedAt: new Date().toISOString(),
			appliedBy: 'auto'
		}
	}

	/**
	 * Create a history entry for migration-applied changes.
	 *
	 * @param version - New version number
	 * @param checksum - New combined checksum
	 * @param changes - Changes that were applied
	 * @param migrationName - Name of the migration
	 * @returns History entry
	 */
	static createMigrationEntry(
		version: number,
		checksum: string,
		changes: SchemaChange[],
		migrationName: string
	): SchemaHistoryEntry {
		return {
			version,
			checksum,
			changes,
			appliedAt: new Date().toISOString(),
			appliedBy: 'migration',
			migrationName
		}
	}

	// =========================================================================
	// Formatting Helpers
	// =========================================================================

	/**
	 * Format history entries for display.
	 *
	 * @param entries - History entries to format
	 * @param options - Formatting options
	 * @returns Formatted string
	 */
	static formatHistory(
		entries: SchemaHistoryEntry[],
		options: { limit?: number; showChanges?: boolean } = {}
	): string {
		const { limit = 10, showChanges = false } = options
		const toShow = entries.slice(-limit).reverse()

		if (toShow.length === 0) {
			return 'No history entries'
		}

		const lines: string[] = []

		for (const entry of toShow) {
			const date = new Date(entry.appliedAt).toLocaleDateString()
			const applier = entry.appliedBy === 'migration'
				? `migration: ${entry.migrationName}`
				: 'auto'

			lines.push(`v${entry.version} - ${entry.checksum} - ${date} (${applier})`)

			if (showChanges && entry.changes.length > 0) {
				for (const change of entry.changes) {
					const prefix = change.safe ? '  +' : '  !'
					lines.push(`${prefix} ${change.description}`)
				}
			}
		}

		return lines.join('\n')
	}

	/**
	 * Format a version diff for display.
	 *
	 * @param diff - Version diff to format
	 * @returns Formatted string
	 */
	static formatVersionDiff(diff: VersionDiff): string {
		const lines: string[] = [
			`From: v${diff.from.version} (${diff.from.checksum})`,
			`To:   v${diff.to.version} (${diff.to.checksum})`,
			''
		]

		if (diff.modelDiffs.length === 0) {
			lines.push('No changes')
			return lines.join('\n')
		}

		for (const modelDiff of diff.modelDiffs) {
			lines.push(`Model: ${modelDiff.modelName}`)

			for (const field of modelDiff.added) {
				lines.push(`  + ${field}`)
			}

			for (const field of modelDiff.removed) {
				lines.push(`  - ${field}`)
			}

			for (const mod of modelDiff.modified) {
				lines.push(`  ~ ${mod.field}`)
				if (mod.from.type !== mod.to.type) {
					lines.push(`      type: ${mod.from.type} -> ${mod.to.type}`)
				}
				if (mod.from.optional !== mod.to.optional) {
					lines.push(`      optional: ${mod.from.optional} -> ${mod.to.optional}`)
				}
			}

			lines.push('')
		}

		return lines.join('\n')
	}

	// =========================================================================
	// Private Helpers
	// =========================================================================

	/**
	 * Parse and validate history entries from storage.
	 */
	private parseHistoryEntries(data: unknown[]): SchemaHistoryEntry[] {
		const entries: SchemaHistoryEntry[] = []

		for (const item of data) {
			if (!item || typeof item !== 'object') {
				continue
			}

			const obj = item as Record<string, unknown>

			if (
				typeof obj.version !== 'number' ||
				typeof obj.checksum !== 'string' ||
				!Array.isArray(obj.changes)
			) {
				continue
			}

			entries.push({
				version: obj.version,
				checksum: obj.checksum,
				changes: obj.changes as SchemaChange[],
				appliedAt: (obj.appliedAt as string) || new Date().toISOString(),
				appliedBy: (obj.appliedBy as 'auto' | 'migration') || 'auto',
				migrationName: obj.migrationName as string | undefined
			})
		}

		return entries
	}

	/**
	 * Build a model diff from a list of changes.
	 */
	private buildModelDiff(modelName: string, changes: SchemaChange[]): ModelDiff {
		const added: string[] = []
		const removed: string[] = []
		const modified: FieldDiffEntry[] = []

		// Track fields that were both added and removed (modification)
		const fieldChanges = new Map<string, {
			added?: SchemaChange
			removed?: SchemaChange
			modifications: SchemaChange[]
		}>()

		for (const change of changes) {
			if (!change.field) continue

			if (!fieldChanges.has(change.field)) {
				fieldChanges.set(change.field, { modifications: [] })
			}

			const fc = fieldChanges.get(change.field)!

			if (change.type === 'add_field' || change.type === 'add_required_field') {
				fc.added = change
			} else if (change.type === 'remove_field') {
				fc.removed = change
			} else {
				fc.modifications.push(change)
			}
		}

		for (const [field, fc] of fieldChanges) {
			if (fc.added && !fc.removed) {
				added.push(field)
			} else if (fc.removed && !fc.added) {
				removed.push(field)
			} else if (fc.modifications.length > 0) {
				// Build a synthetic from/to for the modification
				// This is a simplified representation
				modified.push({
					field,
					from: this.buildFieldMetadataFromChanges(fc.modifications, 'old'),
					to: this.buildFieldMetadataFromChanges(fc.modifications, 'new')
				})
			}
		}

		return { modelName, added, removed, modified }
	}

	/**
	 * Build a simplified FieldMetadata from change entries.
	 */
	private buildFieldMetadataFromChanges(
		changes: SchemaChange[],
		which: 'old' | 'new'
	): FieldMetadata {
		const base: FieldMetadata = {
			name: changes[0]?.field || 'unknown',
			type: 'string',
			optional: false,
			unique: false,
			indexed: false,
			indexTypes: [],
			primaryKey: false,
			version: false,
			hasDefault: false
		}

		for (const change of changes) {
			const value = which === 'old' ? change.oldValue : change.newValue

			switch (change.type) {
				case 'change_type':
					if (typeof value === 'string') {
						base.type = value as FieldMetadata['type']
					}
					break
				case 'change_optional':
					if (typeof value === 'boolean') {
						base.optional = value
					}
					break
				case 'add_index':
				case 'remove_index':
					base.indexed = change.type === 'add_index' ? (which === 'new') : (which === 'old')
					break
				case 'add_unique':
				case 'remove_unique':
					base.unique = change.type === 'add_unique' ? (which === 'new') : (which === 'old')
					break
			}
		}

		return base
	}
}
