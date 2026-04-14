/**
 * Flashcore v1 System Integrity Methods
 *
 * Extracted from system.ts — integrity checking, verification,
 * repair, index rebuild, flush, and preload operations.
 */

import type { FlashcoreAdapter } from '../adapter/types.js'
import type { FlashcoreModel } from '../model/model.js'
import type { CuckooFilter } from '../index/filter.js'
import type { SortedIndex } from '../index/sorted.js'
import type { IndexPersistenceManager } from '../index/persistence.js'
import { FlashcoreError } from './errors.js'
import { requireExtension } from './extensions.js'
import { ensureInitialized } from './system-utils.js'
import type { IntegrityCheckOptions, IntegrityReport, RepairResult, FullRepairResult, RepairOptions, FlashcoreMetrics } from './system.js'

/**
 * Logger interface matching the system logger shape.
 */
interface Logger {
	warn: (msg: string) => void
	debug: (msg: string, ...args: unknown[]) => void
}

/**
 * Check integrity of all registered models.
 *
 * Validates derived index structures (filter, sorted indexes, unique indexes)
 * against authoritative data (catalog, chunks).
 */
export async function checkIntegrityImpl(
	initialized: boolean,
	adapter: FlashcoreAdapter | null,
	models: Map<string, FlashcoreModel<{ id: string }>>,
	options?: IntegrityCheckOptions
): Promise<{ models: IntegrityReport[]; isValid: boolean; durationMs: number }> {
	ensureInitialized(initialized, adapter)

	const ext = requireExtension('integrity', 'checkIntegrity')

	const startTime = Date.now()
	const checker = ext.createChecker(adapter)
	const reports: IntegrityReport[] = []
	let allValid = true

	for (const model of models.values()) {
		const catalog = model._getCatalog()
		const filter = await model._getFilter()
		const sortedIndexes = await model._getSortedIndexes()
		const uniqueFields = model.getUniqueFields()

		const report = await checker.checkAll(model.name, catalog, {
			...options,
			filter: filter ?? undefined,
			sortedIndexes,
			uniqueFields,
			namespace: model.namespace
		})

		reports.push(report)
		if (!report.isValid) {
			allValid = false
		}
	}

	return {
		models: reports,
		isValid: allValid,
		durationMs: Date.now() - startTime
	}
}

/**
 * Verify integrity of a specific model.
 */
export async function verifyImpl(
	initialized: boolean,
	adapter: FlashcoreAdapter | null,
	models: Map<string, FlashcoreModel<{ id: string }>>,
	modelName: string,
	options?: IntegrityCheckOptions
): Promise<IntegrityReport> {
	ensureInitialized(initialized, adapter)

	const model = models.get(modelName)
	if (!model) {
		throw new FlashcoreError(
			`Model "${modelName}" not found.`,
			'MODEL_NOT_FOUND'
		)
	}

	const ext = requireExtension('integrity', 'verify')
	const checker = ext.createChecker(adapter)
	const catalog = model._getCatalog()
	const filter = await model._getFilter()
	const sortedIndexes = await model._getSortedIndexes()
	const uniqueFields = model.getUniqueFields()

	return checker.checkAll(model.name, catalog, {
		...options,
		filter: filter ?? undefined,
		sortedIndexes,
		uniqueFields,
		namespace: model.namespace
	})
}

/**
 * Repair a specific model based on integrity check.
 */
export async function repairImpl(
	initialized: boolean,
	adapter: FlashcoreAdapter | null,
	models: Map<string, FlashcoreModel<{ id: string }>>,
	metrics: FlashcoreMetrics,
	modelName: string,
	options?: RepairOptions
): Promise<FullRepairResult> {
	ensureInitialized(initialized, adapter)

	const model = models.get(modelName)
	if (!model) {
		throw new FlashcoreError(
			`Model "${modelName}" not found.`,
			'MODEL_NOT_FOUND'
		)
	}

	// First check integrity
	const ext = requireExtension('integrity', 'repair')
	const checker = ext.createChecker(adapter)
	const catalog = model._getCatalog()
	const filter = await model._getFilter()
	const sortedIndexes = await model._getSortedIndexes()
	const chunkManager = model._getChunkManager()
	const uniqueFields = model.getUniqueFields()

	const report = await checker.checkAll(model.name, catalog, {
		filter: filter ?? undefined,
		sortedIndexes,
		uniqueFields,
		namespace: model.namespace
	})

	// Repair based on report
	const engine = ext.createRepairEngine(adapter)
	const result = await engine.repairFromReport(
		model.name,
		catalog,
		chunkManager,
		report,
		options
	)

	// If filter was repaired, update model
	if (result.filter && !options?.dryRun) {
		const repairedFilter = (result.filter as RepairResult & { filter?: CuckooFilter }).filter
		if (repairedFilter) {
			model._setFilter(repairedFilter)
		}
	}

	// If sorted indexes were repaired, update model
	if (!options?.dryRun) {
		for (const [field, repairResult] of result.sortedIndexes) {
			const repairedIndex = (repairResult as RepairResult & { index?: SortedIndex }).index
			if (repairedIndex) {
				model._setSortedIndex(field, repairedIndex)
			}
		}
	}

	// Increment metrics
	metrics.indexRebuilds++

	return result
}

/**
 * Rebuild all indexes for a model (or all models).
 *
 * This completely rebuilds filter and sorted indexes from authoritative data.
 */
export async function rebuildIndexesImpl(
	initialized: boolean,
	adapter: FlashcoreAdapter | null,
	models: Map<string, FlashcoreModel<{ id: string }>>,
	metrics: FlashcoreMetrics,
	logger: Logger,
	modelName?: string
): Promise<void> {
	ensureInitialized(initialized, adapter)

	const modelsToRebuild = modelName
		? [models.get(modelName)]
		: Array.from(models.values())

	if (modelName && !modelsToRebuild[0]) {
		throw new FlashcoreError(
			`Model "${modelName}" not found.`,
			'MODEL_NOT_FOUND'
		)
	}

	const ext = requireExtension('integrity', 'rebuildIndexes')
	const engine = ext.createRepairEngine(adapter)

	for (const model of modelsToRebuild) {
		if (!model) continue

		const catalog = model._getCatalog()
		const chunkManager = model._getChunkManager()
		const indexedFields = model.getIndexedFields()

		const { filter, sortedIndexes } = await engine.rebuildAll(
			model.name,
			catalog,
			chunkManager,
			indexedFields,
			model.namespace
		)

		// Update model with rebuilt indexes
		model._setFilter(filter)
		model._setSortedIndexes(sortedIndexes)

		// Increment metrics
		metrics.indexRebuilds++
	}

	logger.debug(`Rebuilt indexes for ${modelsToRebuild.length} model(s)`)
}

/**
 * Flush all pending index changes to storage.
 *
 * Forces immediate persistence of all dirty indexes.
 */
export async function flushIndexesImpl(
	initialized: boolean,
	adapter: FlashcoreAdapter | null,
	indexPersistence: IndexPersistenceManager | null,
	logger: Logger
): Promise<void> {
	ensureInitialized(initialized, adapter)

	if (indexPersistence) {
		const result = await indexPersistence.flushAll()
		logger.debug(`Flushed ${result.flushed} index(es) in ${result.durationMs}ms`)

		if (result.errors.length > 0) {
			for (const error of result.errors) {
				logger.warn(`Index flush error for ${error.modelName}${error.field ? ':' + error.field : ''}: ${error.error.message}`)
			}
		}
	} else {
		logger.debug('Index flush requested (no persistence manager)')
	}
}

/**
 * Preload specified models into memory.
 *
 * Loads catalog, filter, and sorted indexes for the specified models.
 * Useful when lazyLoading is enabled but you want to warm up specific models.
 */
export async function preloadImpl(
	initialized: boolean,
	adapter: FlashcoreAdapter | null,
	models: Map<string, FlashcoreModel<{ id: string }>>,
	logger: Logger,
	modelNames: string[]
): Promise<void> {
	ensureInitialized(initialized, adapter)

	for (const name of modelNames) {
		const model = models.get(name)
		if (!model) {
			logger.warn(`Model "${name}" not found for preload`)
			continue
		}

		// Load indexes (this will load catalog as well)
		await model._loadIndexes()
	}

	logger.debug(`Preloaded ${modelNames.length} model(s)`)
}

/**
 * Rebuild indexes for a single model using a dedicated pass.
 *
 * Builds new indexes from authoritative data, then swaps them into the model.
 * Note: This is an async operation that awaits completion — queries against
 * the model use the old indexes until the swap occurs.
 */
export async function rebuildIndexesDedicatedImpl(
	initialized: boolean,
	adapter: FlashcoreAdapter | null,
	models: Map<string, FlashcoreModel<{ id: string }>>,
	metrics: FlashcoreMetrics,
	logger: Logger,
	modelName: string
): Promise<void> {
	ensureInitialized(initialized, adapter)

	const model = models.get(modelName)
	if (!model) {
		throw new FlashcoreError(
			`Model "${modelName}" not found.`,
			'MODEL_NOT_FOUND'
		)
	}

	const ext = requireExtension('integrity', 'rebuildIndexesDedicated')
	const engine = ext.createRepairEngine(adapter)

	// Build new indexes from authoritative data (old indexes still serve queries until swap)
	const catalog = model._getCatalog()
	const chunkManager = model._getChunkManager()
	const indexedFields = model.getIndexedFields()

	const { filter, sortedIndexes } = await engine.rebuildAll(
		model.name,
		catalog,
		chunkManager,
		indexedFields,
		model.namespace
	)

	// Atomic swap - replace old indexes with new ones
	model._setFilter(filter)
	model._setSortedIndexes(sortedIndexes)

	// Increment metrics
	metrics.indexRebuilds++

	logger.debug(`Dedicated index rebuild complete for model: ${modelName}`)
}
