/**
 * Flashcore v1 System Schema Validation Methods
 *
 * Extracted from system.ts — schema validation, auto-repair,
 * safe change application, and migration runner creation.
 */

import type { FlashcoreAdapter } from '../adapter/types.js'
import type { FlashcoreModel } from '../model/model.js'
import type { SchemaChange, AutoRepairConfig } from '../migration/types.js'
import { DEFAULT_AUTO_REPAIR_CONFIG } from './constants.js'
import { FlashcoreError, FlashcoreSchemaError } from './errors.js'
import { getExtensions, requireExtension } from './extensions.js'
import { ensureInitialized } from './system-utils.js'
import type { CuckooFilter } from '../index/filter.js'
import type { SortedIndex } from '../index/sorted.js'
import type { FlashcoreMetrics, RepairResult } from './system.js'

/**
 * Logger interface matching the system logger shape.
 */
interface Logger {
	warn: (msg: string) => void
	debug: (msg: string, ...args: unknown[]) => void
}

/**
 * Validate schemas of all registered models.
 *
 * Compares stored schema metadata checksums against current code checksums.
 * - Safe changes are auto-applied
 * - Breaking changes throw FlashcoreSchemaError
 *
 * Should be called after all models are registered (typically during app startup).
 */
export async function validateSchemasImpl(
	initialized: boolean,
	adapter: FlashcoreAdapter | null,
	models: Map<string, FlashcoreModel<{ id: string }>>,
	schemaMetadataManager: any | null,
	schemaHistoryManager: any | null,
	logger: Logger,
	metrics: FlashcoreMetrics
): Promise<{
	modelsValidated: number
	newModels: string[]
	changedModels: Array<{ name: string; safeChanges: SchemaChange[] }>
}> {
	ensureInitialized(initialized, adapter)

	if (!schemaMetadataManager) {
		throw new FlashcoreError(
			'Schema metadata manager not available. Ensure @robojs/flashcore-extras is installed.',
			'NOT_INITIALIZED'
		)
	}

	const migrationExt = requireExtension('migration', 'validateSchemas')

	const result = {
		modelsValidated: 0,
		newModels: [] as string[],
		changedModels: [] as Array<{ name: string; safeChanges: SchemaChange[] }>
	}

	for (const model of models.values()) {
		const modelKey = model.namespace ? `${model.namespace}::${model.name}` : model.name
		result.modelsValidated++

		// Get stored metadata
		const stored = await schemaMetadataManager.getModelMetadata(
			model.name,
			model.namespace
		)
		const currentChecksum = model.getSchemaChecksum()

		if (!stored) {
			// New model - store initial metadata
			const metadata = migrationExt.createInitialMetadata(model.schema)
			await schemaMetadataManager.setModelMetadata(
				model.name,
				metadata,
				model.namespace
			)
			result.newModels.push(modelKey)
			logger.debug(`Registered new model: ${modelKey}`)
			continue
		}

		// Check if checksum differs
		if (stored.checksum === currentChecksum) {
			// No changes
			continue
		}

		// Schema changed - analyze changes
		const analysis = migrationExt.analyzeSchemaChanges(
			stored.fields,
			model.schema,
			model.name
		)

		// Breaking changes block startup
		if (analysis.hasBreakingChanges) {
			const breakingDescriptions = analysis.breaking
				.map((c: any) => `  - ${c.description}`)
				.join('\n')

			throw new FlashcoreSchemaError(
				`Breaking schema changes detected for model '${modelKey}':\n${breakingDescriptions}`,
				{
					model: modelKey,
					schemaChange: analysis.breaking.map((c: any) => c.description).join('; '),
					cliInstructions: "Run 'robo db migrate' to apply these changes."
				}
			)
		}

		// Safe changes are auto-applied
		if (analysis.safe.length > 0) {
			logger.debug(
				`Auto-applying safe schema changes for '${modelKey}': ${migrationExt.summarizeChanges(analysis)}`
			)

			// Apply safe changes (e.g., rebuild indexes)
			await applySafeChangesImpl(model, analysis.safe, logger, metrics)

			result.changedModels.push({
				name: modelKey,
				safeChanges: analysis.safe
			})
		}

		// Update stored metadata
		const updatedMetadata = migrationExt.createUpdatedMetadata(
			model.schema,
			stored
		)
		await schemaMetadataManager.setModelMetadata(
			model.name,
			updatedMetadata,
			model.namespace
		)

		// Record in history
		if (schemaHistoryManager && analysis.safe.length > 0) {
			const historyEntry = migrationExt.createAutoEntry(
				updatedMetadata.version,
				updatedMetadata.checksum,
				analysis.safe
			)
			await schemaHistoryManager.appendHistory(
				historyEntry,
				model.namespace ?? '_default'
			)
		}
	}

	logger.debug(
		`Schema validation complete: ${result.modelsValidated} models, ` +
		`${result.newModels.length} new, ${result.changedModels.length} changed`
	)

	return result
}

/**
 * Run auto-repair based on configuration.
 *
 * Called after schema validation if autoRepair is enabled.
 */
export async function runAutoRepairImpl(
	initialized: boolean,
	adapter: FlashcoreAdapter | null,
	models: Map<string, FlashcoreModel<{ id: string }>>,
	logger: Logger,
	metrics: FlashcoreMetrics,
	config: AutoRepairConfig | true = true
): Promise<{
	repaired: number
	errors: string[]
}> {
	ensureInitialized(initialized, adapter)

	const repairConfig: AutoRepairConfig = config === true
		? { ...DEFAULT_AUTO_REPAIR_CONFIG }
		: { ...DEFAULT_AUTO_REPAIR_CONFIG, ...config }

	// Never auto-repair catalog (requires explicit opt-in)
	if (repairConfig.catalog) {
		logger.warn(
			'Auto-repair of catalog is disabled for safety. ' +
			'Use CLI: robo db repair --rebuild=catalog'
		)
		repairConfig.catalog = false
	}

	const result = { repaired: 0, errors: [] as string[] }

	for (const model of models.values()) {
		const modelKey = model.namespace ? `${model.namespace}::${model.name}` : model.name

		try {
			// Quick integrity check
			const integrityExt = requireExtension('integrity', 'runAutoRepair')
			const checker = integrityExt.createChecker(adapter)
			const catalog = model._getCatalog()
			const filter = await model._getFilter()
			const sortedIndexes = await model._getSortedIndexes()

			const report = await checker.checkAll(model.name, catalog, {
				filter: filter ?? undefined,
				sortedIndexes,
				uniqueFields: model.getUniqueFields(),
				namespace: model.namespace,
				checkFilter: repairConfig.filter,
				checkSortedIndexes: repairConfig.indexes,
				checkUniqueIndexes: repairConfig.uniqueIndexes
			})

			if (!report.isValid) {
				// Repair needed
				logger.debug(`Auto-repairing model: ${modelKey}`)

				const engine = integrityExt.createRepairEngine(adapter)
				const chunkManager = model._getChunkManager()

				const repairResult = await engine.repairFromReport(
					model.name,
					catalog,
					chunkManager,
					report,
					{
						repairFilter: repairConfig.filter,
						repairSortedIndexes: repairConfig.indexes,
						repairUniqueIndexes: repairConfig.uniqueIndexes
					}
				)

				// Update model with repaired indexes
				if (repairResult.filter) {
					const repairedFilter = (repairResult.filter as RepairResult & { filter?: CuckooFilter }).filter
					if (repairedFilter) {
						model._setFilter(repairedFilter)
					}
				}

				for (const [field, repairData] of repairResult.sortedIndexes) {
					const repairedIndex = (repairData as RepairResult & { index?: SortedIndex }).index
					if (repairedIndex) {
						model._setSortedIndex(field, repairedIndex)
					}
				}

				result.repaired++
				metrics.indexRebuilds++
			}
		} catch (error) {
			result.errors.push(`${modelKey}: ${error instanceof Error ? error.message : String(error)}`)
		}
	}

	if (result.repaired > 0) {
		logger.debug(`Auto-repair complete: ${result.repaired} model(s) repaired`)
	}

	return result
}

/**
 * Apply safe schema changes to a model.
 */
export async function applySafeChangesImpl(
	model: FlashcoreModel<{ id: string }>,
	changes: SchemaChange[],
	logger: Logger,
	_metrics: FlashcoreMetrics
): Promise<void> {
	for (const change of changes) {
		switch (change.type) {
			case 'add_index':
				// Index will be built on next access (lazy loading)
				if (change.field) {
					logger.debug(`Index registered for field: ${change.field} (will build on first access)`)
				}
				break

			case 'add_unique':
				// Validate existing records don't have duplicates
				if (change.field) {
					logger.debug(`Validating unique constraint on: ${change.field}`)
					// Validation happens on first access
				}
				break

			case 'remove_index':
				// No action needed - index will not be loaded
				break

			case 'remove_unique':
				// No action needed - constraint will not be enforced
				break

			// Other safe changes just update metadata
			default:
				break
		}
	}
}

/**
 * Create a migration runner for CLI operations.
 */
export async function createMigrationRunnerImpl(
	initialized: boolean,
	adapter: FlashcoreAdapter | null
): Promise<any> {
	if (!initialized || !adapter) {
		return null
	}
	const migrationExt = getExtensions().migration
	if (!migrationExt) {
		return null
	}
	return migrationExt.createMigrationRunner(adapter)
}
