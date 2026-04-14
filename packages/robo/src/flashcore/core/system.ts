/**
 * Flashcore v1 System API (spec rev 4.3)
 *
 * Provides the Flashcore.$ system interface for initialization,
 * capabilities, introspection, and configuration.
 */

import { normalizeCapabilities, warnMissingCapabilities } from '../adapter/capabilities.js'
import { FileAdapter } from '../adapter/builtins/file.js'
import type {
	AdapterCapabilities,
	FlashcoreAdapter,
	FlashcoreConfig,
	FlashcorePlugin,
	InitOptions
} from '../adapter/types.js'
import {
	DEFAULT_NAMESPACE_SEPARATOR,
	DEFAULT_SAFETY_LIMITS,
	DEFAULT_CONNECTION_SETTINGS,
	DEFAULT_TRANSACTION_SETTINGS,
	DEFAULT_INDEX_PERSISTENCE_SETTINGS
} from './constants.js'
import { FlashcoreError } from './errors.js'
import type { SchemaFields, ModelOptions } from '../schema/types.js'
import { FlashcoreModel } from '../model/model.js'
import { catalogLockManager, chunkLockManager } from '../model/locks.js'
import { logger as flashcoreLogger } from './logger.js'
import { setWALManager, getWalPendingEntriesCount, setWalPendingEntriesCount } from '../wal/manager.js'
import { IndexPersistenceManager, setIndexPersistenceManager } from '../index/persistence.js'
import { createJunctionSchema, getJunctionTableDef } from '../relation/junction.js'

// Extension registry (delegates to @robojs/flashcore-extras when installed)
import { getExtensions } from './extensions.js'

// Phase 7: Type-only migration imports (zero runtime cost)
import type { SchemaChange, AutoRepairConfig } from '../migration/types.js'

// Phase 8: Type-only transaction imports (zero runtime cost)
import type {
	TransactionOptions,
	TransactionResult,
	ITransactionContext,
	ResolvedTransactionMode
} from '../transaction/types.js'

// Decomposed system modules
import {
	checkIntegrityImpl,
	verifyImpl,
	repairImpl,
	rebuildIndexesImpl,
	flushIndexesImpl,
	preloadImpl,
	rebuildIndexesDedicatedImpl
} from './system-integrity.js'
import {
	validateSchemasImpl,
	runAutoRepairImpl,
	applySafeChangesImpl,
	createMigrationRunnerImpl
} from './system-schema.js'
import {
	transactionImpl,
	executeTransactionImpl,
	executeOptimisticTransactionImpl,
	clearSerialQueueImpl
} from './system-transaction.js'

// Phase 5: Integrity types inlined (source moved to @robojs/flashcore-extras)
export interface IntegrityReport {
	modelName: string
	namespace?: string
	isValid: boolean
	filter?: { isValid: boolean; orphanedInFilter: string[]; missingInFilter: string[]; recordsChecked: number }
	sortedIndexes: Array<{ field: string; isValid: boolean; orphanedInIndex: string[]; missingInIndex: string[]; wrongValues: Array<{ id: string; expected: unknown; actual: unknown }>; entriesChecked: number }>
	uniqueIndex?: { isValid: boolean; orphanedKeys: string[]; duplicates: Array<{ field: string; value: string; ids: string[] }>; keysChecked: number }
	warnings: string[]
	durationMs: number
}

export interface IntegrityCheckOptions {
	checkFilter?: boolean
	checkSortedIndexes?: boolean
	checkUniqueIndexes?: boolean
	filterSampleSize?: number
	onProgress?: (progress: { phase: 'filter' | 'sorted' | 'unique' | 'complete'; field?: string; checked: number; total: number }) => void
}

export interface RepairResult {
	success: boolean
	repaired: number
	unrepaired: string[]
	warnings: string[]
	durationMs: number
}

export interface FullRepairResult {
	filter?: RepairResult
	sortedIndexes: Map<string, RepairResult>
	uniqueIndex?: RepairResult
	durationMs: number
}

export interface RepairOptions {
	repairFilter?: boolean
	repairSortedIndexes?: boolean
	repairUniqueIndexes?: boolean
	dryRun?: boolean
	onProgress?: (progress: { phase: 'filter' | 'sorted' | 'unique' | 'complete'; field?: string; repaired: number; total: number }) => void
}

// Phase 10: Plugin imports
import {
	PluginManager,
	setPluginManager
} from '../plugin/manager.js'
import { createClientExtensions } from '../plugin/context.js'
import type { PluginContext } from '../plugin/types.js'

/**
 * Introspection data returned by Flashcore.$.introspect().
 */
export interface FlashcoreIntrospection {
	/**
	 * Registered models with metadata.
	 */
	models: Array<{
		name: string
		namespace?: string
		fields: string[]
		relations: string[]
		customMethods: string[]
		indexes: string[]
		recordCount: number
		schemaChecksum?: string
	}>

	/**
	 * Known KV namespaces (best-effort; may be empty on non-scan adapters).
	 */
	kvNamespaces: string[]

	/**
	 * Storage statistics.
	 */
	storage: {
		totalKeys: number
		totalSize?: number // Optional; not all adapters can report this
	}

	/**
	 * Registered plugins.
	 */
	plugins: string[]

	/**
	 * WAL status.
	 */
	walStatus: {
		pendingEntries: number
		lastRecovery?: Date
	}
}

/**
 * Metrics counters for performance tracking.
 */
export interface FlashcoreMetrics {
	operations: {
		create: number
		update: number
		delete: number
		findUnique: number
		findMany: number
	}
	cacheHits: number
	cacheMisses: number
	indexRebuilds: number
	walRecoveries: number
	transactionRetries: number
	avgQueryTime: number
}

/**
 * Schema namespace wrapper for plugin model registration.
 */
export interface FlashcoreSchema {
	/**
	 * Register a model in this namespace.
	 */
	model<T extends { id: string }>(
		name: string,
		schema: SchemaFields,
		options?: Omit<ModelOptions, 'namespace'>
	): FlashcoreModel<T>

	/**
	 * Get the namespace name.
	 */
	readonly namespace: string
}

/**
 * Logger interface for capability warnings.
 */
interface Logger {
	warn: (msg: string) => void
	debug: (msg: string, ...args: unknown[]) => void
}

const defaultLogger: Logger = {
	warn: (msg: string) => flashcoreLogger.warn(msg),
	debug: (msg: string, ...args: unknown[]) => {
		if (process.env.FLASHCORE_DEBUG) {
			flashcoreLogger.debug(msg, ...args)
		}
	}
}

/**
 * Internal state for the Flashcore system.
 */
class FlashcoreSystemState {
	initialized = false
	adapter: FlashcoreAdapter | null = null
	capabilities: AdapterCapabilities | null = null
	config: Readonly<FlashcoreConfig> | null = null
	plugins: FlashcorePlugin[] = []
	metrics: FlashcoreMetrics = this.createEmptyMetrics()
	logger: Logger = defaultLogger

	// Model registry: key format is "namespace::name" or just "name"
	models = new Map<string, FlashcoreModel<{ id: string }>>()

	// WAL state (Phase 4)
	walLastRecovery?: Date
	walPendingEntries = 0

	// Index persistence manager (Phase 6)
	indexPersistence: IndexPersistenceManager | null = null

	// Schema managers (Phase 7)
	schemaMetadataManager: any | null = null
	schemaHistoryManager: any | null = null
	schemasValidated = false

	// Plugin manager (Phase 10)
	pluginManager: PluginManager | null = null

	// Query time tracking for avgQueryTime
	private queryTimes: number[] = []
	private readonly maxQueryTimeSamples = 100

	createEmptyMetrics(): FlashcoreMetrics {
		return {
			operations: {
				create: 0,
				update: 0,
				delete: 0,
				findUnique: 0,
				findMany: 0
			},
			cacheHits: 0,
			cacheMisses: 0,
			indexRebuilds: 0,
			walRecoveries: 0,
			transactionRetries: 0,
			avgQueryTime: 0
		}
	}

	/**
	 * Record a query execution time and update the average.
	 */
	recordQueryTime(durationMs: number): void {
		this.queryTimes.push(durationMs)

		// Keep only the most recent samples
		if (this.queryTimes.length > this.maxQueryTimeSamples) {
			this.queryTimes.shift()
		}

		// Update running average
		if (this.queryTimes.length > 0) {
			const sum = this.queryTimes.reduce((a, b) => a + b, 0)
			this.metrics.avgQueryTime = sum / this.queryTimes.length
		}
	}

	/**
	 * Clear query time samples (called on metrics reset).
	 */
	clearQueryTimes(): void {
		this.queryTimes = []
	}
}

// Global system state
const state = new FlashcoreSystemState()

/**
 * Flashcore.$ system API.
 *
 * Provides initialization, configuration, capabilities, and introspection.
 */
const FlashcoreSystemBase = {
	/**
	 * Initialize Flashcore with the provided options.
	 *
	 * Must be called before using any Flashcore features.
	 * Idempotent: calling multiple times with the same options is safe.
	 *
	 * @param options - Initialization options
	 */
	async init(options: InitOptions = {}): Promise<void> {
		// Idempotent: if already initialized, just return
		if (state.initialized) {
			state.logger.debug('Flashcore already initialized, skipping')
			return
		}

		state.logger.debug('Initializing Flashcore with options:', options)

		// Core defaults to persistent local storage. In-memory adapters live in
		// @robojs/flashcore-extras and must be opted into explicitly.
		const adapter = options.adapter ?? new FileAdapter()

		const rawKvReadPreference = (options as Record<string, unknown>).kvReadPreference
		const rawKvWriteMode = (options as Record<string, unknown>).kvWriteMode

		const kvReadPreference =
			rawKvReadPreference === 'v4' ? 'v1' : (rawKvReadPreference as FlashcoreConfig['kvReadPreference'])
		const kvWriteMode =
			rawKvWriteMode === 'v4' ? 'v1' : (rawKvWriteMode as FlashcoreConfig['kvWriteMode'])

		// Build effective config with defaults
		const config: FlashcoreConfig = Object.freeze({
			adapter,
			namespaceSeparator: options.namespaceSeparator ?? DEFAULT_NAMESPACE_SEPARATOR,
			kvReadPreference: kvReadPreference ?? 'v1',
			kvWriteMode: kvWriteMode ?? 'v1',
			wal: options.wal,
			transactions: {
				...DEFAULT_TRANSACTION_SETTINGS,
				...options.transactions
			},
			indexPersistence: {
				...DEFAULT_INDEX_PERSISTENCE_SETTINGS,
				...options.indexPersistence
			},
			connection: {
				...DEFAULT_CONNECTION_SETTINGS,
				...options.connection
			},
			safety: {
				...DEFAULT_SAFETY_LIMITS,
				...options.safety
			},
			plugins: options.plugins ?? [],
			lazyLoading: options.lazyLoading ?? true,
			autoRepair: options.autoRepair ?? false
		})

		// Validate config: kvReadPreference/kvWriteMode compatibility
		// Prevent "writes that don't read back" when both physical keys exist.
		if (config.kvReadPreference === 'v1' && config.kvWriteMode === 'legacy') {
			throw new FlashcoreError(
				'Invalid config: kvReadPreference is "v1" but kvWriteMode is "legacy". ' +
				'This can cause a value written via set() to not be returned by get() when both legacy + v1 keys exist. ' +
				'Use kvWriteMode: "dual" for migration, or set kvReadPreference: "legacy".',
				'CONFIG_ERROR'
			)
		}
		if (config.kvReadPreference === 'legacy' && config.kvWriteMode === 'v1') {
			throw new FlashcoreError(
				'Invalid config: kvReadPreference is "legacy" but kvWriteMode is "v1". ' +
				'This can cause a value written via set() to not be returned by get() when both legacy + v1 keys exist. ' +
				'Use kvWriteMode: "dual" for migration, or set kvReadPreference: "v1".',
				'CONFIG_ERROR'
			)
		}

		// Initialize adapter (call init exactly once)
		if (typeof adapter.init === 'function') {
			await adapter.init()
		}

		if (adapter.name === 'MemoryAdapter') {
			state.logger.warn(
				'Flashcore is using an explicit in-memory adapter. Data will not persist across restarts.'
			)
		}

		// Compute capabilities
		const capabilities = normalizeCapabilities(adapter)

		// Add plugin info to capabilities (will be populated during plugin setup)
		capabilities.plugins = config.plugins.map(p => p.name)
		capabilities.indexTypes = [] // Populated by plugins later

		// WAL setup + recovery (Phase 4)
		// WAL is only enabled for scan-capable adapters AND requires @robojs/flashcore-extras
		const walExt = getExtensions().wal
		if (capabilities.walEnabled && walExt) {
			const wal = walExt.createWALManager(adapter, config.wal)
			setWALManager(wal)

			// Best-effort pending count before recovery.
			const pending = await wal.getAllEntryKeys()
			state.walPendingEntries = pending.length
			setWalPendingEntriesCount(pending.length)

			// Run WAL recovery before model registration
			state.logger.debug('Running WAL recovery...')
			const recoveryResult = await walExt.recoverWAL(adapter, config.wal)

			if (recoveryResult.found > 0) {
				state.logger.debug(
					`WAL recovery complete: found=${recoveryResult.found}, replayed=${recoveryResult.replayed}, rolledBack=${recoveryResult.rolledBack}`
				)
				state.walLastRecovery = new Date()
				state.metrics.walRecoveries += recoveryResult.replayed + recoveryResult.rolledBack

				// Log any errors
				for (const error of recoveryResult.errors) {
					state.logger.warn(`WAL recovery error: ${error.message}`)
				}
			} else {
				state.logger.debug('WAL recovery: no pending entries')
			}

			// Update pending entries count after recovery
			const remaining = await wal.getAllEntryKeys()
			state.walPendingEntries = remaining.length
			setWalPendingEntriesCount(remaining.length)
		} else {
			setWALManager(null)
			setWalPendingEntriesCount(0)
			if (capabilities.walEnabled && !walExt) {
				state.logger.debug('WAL available but @robojs/flashcore-extras not installed')
			} else {
				state.logger.debug('WAL disabled (adapter lacks scan capability)')
			}
		}

		// Initialize index persistence manager (Phase 6)
		state.indexPersistence = new IndexPersistenceManager(adapter, {
			strategy: config.indexPersistence?.strategy ?? 'batched',
			intervalMs: config.indexPersistence?.intervalMs,
			flushOnShutdown: config.indexPersistence?.flushOnShutdown ?? true,
			shutdownTimeout: config.indexPersistence?.shutdownTimeout
		})
		state.indexPersistence.init()
		setIndexPersistenceManager(state.indexPersistence)
		state.logger.debug('Index persistence manager initialized')

		// Initialize schema managers (Phase 7) — only if migration extension is installed
		const migrationExt = getExtensions().migration
		if (migrationExt) {
			state.schemaMetadataManager = migrationExt.createMetadataManager(adapter)
			state.schemaHistoryManager = migrationExt.createHistoryManager(adapter)
			state.logger.debug('Schema managers initialized (flashcore-extras)')
		}
		state.schemasValidated = false

		// Initialize plugin manager (Phase 10)
		state.pluginManager = new PluginManager()
		setPluginManager(state.pluginManager)

		// Register plugins
		for (const plugin of config.plugins) {
			state.pluginManager.register(plugin)
		}
		state.logger.debug(`Registered ${config.plugins.length} plugin(s)`)

		// Store state
		state.adapter = adapter
		state.capabilities = capabilities
		state.config = config
		state.plugins = config.plugins
		state.initialized = true

		// Initialize plugin manager with model access (after state is set)
		state.pluginManager.init({
			getModel: <T extends { id: string }>(name: string) => state.models.get(name) as unknown as FlashcoreModel<T> | undefined,
			registerModel: <T extends { id: string }>(name: string, schema: SchemaFields) => FlashcoreSystem.registerModel<T>(name, schema),
			models: state.models
		})

		// Run plugin setup
		await state.pluginManager.setup()
		state.logger.debug('Plugin setup complete')

		// Warn about missing capabilities
		warnMissingCapabilities(capabilities, state.logger)

		state.logger.debug('Flashcore initialized successfully')
	},

	/**
	 * Get the current adapter capabilities.
	 *
	 * @throws FlashcoreError if not initialized
	 */
	capabilities(): AdapterCapabilities {
		if (!state.initialized || !state.capabilities) {
			throw new FlashcoreError(
				'Flashcore not initialized. Call Flashcore.$.init() first.',
				'NOT_INITIALIZED'
			)
		}
		return state.capabilities
	},

	/**
	 * Get the current configuration (read-only).
	 *
	 * @throws FlashcoreError if not initialized
	 */
	get config(): Readonly<FlashcoreConfig> {
		if (!state.initialized || !state.config) {
			throw new FlashcoreError(
				'Flashcore not initialized. Call Flashcore.$.init() first.',
				'NOT_INITIALIZED'
			)
		}
		return state.config
	},

	/**
	 * Get a namespaced schema helper.
	 *
	 * Used by plugins to register models in isolated namespaces.
	 *
	 * @param namespace - The namespace name
	 */
	schema(namespace: string): FlashcoreSchema {
		return {
			namespace,
			model: <T extends { id: string }>(
				name: string,
				schema: SchemaFields,
				options?: Omit<ModelOptions, 'namespace'>
			): FlashcoreModel<T> => {
				return FlashcoreSystem.registerModel<T>(name, schema, { ...options, namespace })
			}
		}
	},

	/**
	 * Register a model with the given schema.
	 *
	 * @param name - Model name
	 * @param schema - Schema definition using f.* field builders
	 * @param options - Optional model options (namespace, methods, hooks)
	 * @returns The registered FlashcoreModel instance
	 */
	registerModel<T extends { id: string }>(
		name: string,
		schema: SchemaFields,
		options?: ModelOptions
	): FlashcoreModel<T> {
		if (!state.initialized || !state.adapter) {
			throw new FlashcoreError(
				'Flashcore not initialized. Call Flashcore.$.init() first.',
				'NOT_INITIALIZED'
			)
		}

		if (name.includes('::')) {
			throw new FlashcoreError(
				`Invalid model name "${name}". Model names must not include "::" (reserved for namespaces).`,
				'INVALID_MODEL_NAME'
			)
		}

		// Build model key
		const modelKey = options?.namespace ? `${options.namespace}::${name}` : name

		// Check if already registered
		if (state.models.has(modelKey)) {
			throw new FlashcoreError(
				`Model "${modelKey}" is already registered.`,
				'DUPLICATE_MODEL'
			)
		}

		// Create model instance with relation lookup callbacks (Phase 9)
		// Relations are resolved relative to the model's namespace.
		const resolveModelKey = (ref: string): string => {
			// Explicitly-qualified refs are treated as model keys.
			if (ref.includes('::')) return ref

			return options?.namespace ? `${options.namespace}::${ref}` : ref
		}

		const model = new FlashcoreModel<T>(
			name,
			schema,
			state.adapter,
			{
				namespace: options?.namespace,
				methods: options?.methods,
				hooks: options?.hooks,
				// Phase 9: Provide getModel and getSchema for relations
				getModel: (modelName: string) => state.models.get(resolveModelKey(modelName)),
				getSchema: (modelName: string) => state.models.get(resolveModelKey(modelName))?.schema
			}
		)

		// Register in state (use unknown as intermediate type for generic variance)
		state.models.set(modelKey, model as unknown as FlashcoreModel<{ id: string }>)

		// Apply any pending plugin marks (Phase 10)
		state.pluginManager.applyPendingMarks(model as unknown as FlashcoreModel<{ id: string }>)

		// Phase 9: Auto-register junction models for manyToMany relations.
		// Junction tables are internal models named `_junction_{modelA}_{modelB}`.
		const seenManyToManyTargets = new Set<string>()
		for (const relation of model.schema.relations.values()) {
			if (relation.type !== 'manyToMany') continue

			if (relation.model.includes('::')) {
				throw new FlashcoreError(
					`Model "${modelKey}" defines a manyToMany relation to "${relation.model}". ` +
					'Many-to-many relation targets must be un-namespaced model names. ' +
					'Register related models in the same Flashcore namespace and reference them by name.',
					'INVALID_RELATION'
				)
			}

			// Prevent ambiguous duplicates within a single model.
			if (seenManyToManyTargets.has(relation.model)) {
				throw new FlashcoreError(
					`Model "${modelKey}" defines multiple manyToMany relations to "${relation.model}". ` +
					`This is ambiguous without explicit relation configuration.`,
					'INVALID_RELATION'
				)
			}
			seenManyToManyTargets.add(relation.model)

			const junctionDef = getJunctionTableDef(name, relation.model)
			const junctionName = junctionDef.name
			const junctionKey = options?.namespace ? `${options.namespace}::${junctionName}` : junctionName

			// Junction models are registered once per pair of models.
			if (!state.models.has(junctionKey)) {
				FlashcoreSystem.registerModel(
					junctionName,
					createJunctionSchema(junctionDef.modelA, junctionDef.modelB),
					options?.namespace ? { namespace: options.namespace } : undefined
				)
			}
		}

		state.logger.debug(`Registered model: ${modelKey}`)

		return model
	},

	/**
	 * Get a registered model by name.
	 *
	 * @param name - Model name (or "namespace::name" for namespaced models)
	 * @returns The model instance or undefined if not found
	 */
	getModel<T extends { id: string }>(name: string): FlashcoreModel<T> | undefined {
		return state.models.get(name) as unknown as FlashcoreModel<T> | undefined
	},

	/**
	 * Get introspection data about the current Flashcore state.
	 *
	 * Returns information about models, storage, plugins, and WAL status.
	 */
	async introspect(): Promise<FlashcoreIntrospection> {
		if (!state.initialized) {
			throw new FlashcoreError(
				'Flashcore not initialized. Call Flashcore.$.init() first.',
				'NOT_INITIALIZED'
			)
		}

		// Build models array from registry with actual record counts
		const modelEntries = Array.from(state.models.values())
		const counts = await Promise.all(
			modelEntries.map(model => model.count().catch(() => 0))
		)

		const models: FlashcoreIntrospection['models'] = modelEntries.map((model, i) => {
			const schemaInfo = model.getSchema()
			return {
				name: model.name,
				namespace: model.namespace,
				fields: Array.from(schemaInfo.keys()),
				relations: model.getRelations().map(r => r.model),
				customMethods: [] as string[],
				indexes: model.getIndexedFields(),
				recordCount: counts[i],
				schemaChecksum: model.getSchemaChecksum()
			}
		})

		// Sum record counts as an approximation of total keys
		const totalKeys = counts.reduce((sum, c) => sum + c, 0)

		return {
			models,
			kvNamespaces: [], // Best-effort; requires scan capability
			storage: {
				totalKeys,
				totalSize: undefined
			},
			plugins: state.plugins.map(p => p.name),
			walStatus: {
				pendingEntries: getWalPendingEntriesCount(),
				lastRecovery: state.walLastRecovery
			}
		}
	},

	/**
	 * Get current metrics.
	 */
	metrics(): FlashcoreMetrics {
		return { ...state.metrics }
	},

	/**
	 * Reset all metrics counters.
	 */
	resetMetrics(): void {
		state.metrics = state.createEmptyMetrics()
		state.clearQueryTimes()
	},

	/**
	 * Check if Flashcore is initialized.
	 */
	get isInitialized(): boolean {
		return state.initialized
	},

	/**
	 * Get the current adapter (for internal use).
	 * @internal
	 */
	get adapter(): FlashcoreAdapter {
		if (!state.initialized || !state.adapter) {
			throw new FlashcoreError(
				'Flashcore not initialized. Call Flashcore.$.init() first.',
				'NOT_INITIALIZED'
			)
		}
		return state.adapter
	},

	/**
	 * Increment an operation counter.
	 * @internal
	 */
	_incrementMetric(key: keyof FlashcoreMetrics['operations']): void {
		state.metrics.operations[key]++
	},

	/**
	 * Increment a general metric counter.
	 * @internal
	 */
	_incrementCounter(key: 'cacheHits' | 'cacheMisses' | 'indexRebuilds' | 'walRecoveries' | 'transactionRetries'): void {
		state.metrics[key]++
	},

	/**
	 * Record a query execution time for avgQueryTime calculation.
	 * @internal
	 */
	_recordQueryTime(durationMs: number): void {
		state.recordQueryTime(durationMs)
	},

	/**
	 * Update WAL pending entries count.
	 * @internal
	 */
	_setWalPendingEntries(count: number): void {
		state.walPendingEntries = count
		setWalPendingEntriesCount(count)
	},

	/**
	 * Record WAL recovery event.
	 * @internal
	 */
	_recordWalRecovery(): void {
		state.walLastRecovery = new Date()
		state.metrics.walRecoveries++
	},

	/**
	 * Reset state for testing.
	 * @internal
	 */
	async _reset(): Promise<void> {
		// Shutdown plugin manager (Phase 10)
		if (state.pluginManager) {
			await state.pluginManager.shutdown()
			state.pluginManager.clear()
			state.pluginManager = null
		}
		setPluginManager(null)

		// Shutdown index persistence manager
		if (state.indexPersistence) {
			await state.indexPersistence.shutdown()
			state.indexPersistence = null
		}
		setIndexPersistenceManager(null)

		if (state.adapter && typeof state.adapter.shutdown === 'function') {
			await state.adapter.shutdown()
		}
		setWALManager(null)
		state.initialized = false
		setWalPendingEntriesCount(0)
		state.adapter = null
		state.capabilities = null
		state.config = null
		state.plugins = []
		state.models.clear()
		state.metrics = state.createEmptyMetrics()
		state.clearQueryTimes()
		state.walLastRecovery = undefined
		state.walPendingEntries = 0

		// Clear schema managers (Phase 7)
		state.schemaMetadataManager = null
		state.schemaHistoryManager = null
		state.schemasValidated = false

		// Clear lock managers
		catalogLockManager._clear()
		chunkLockManager._clear()

		// Clear serial transaction queue (Phase 8) — only if transaction extension is installed
		getExtensions().transaction?.clearSerialQueue()
	},

	// ========================================================================
	// Phase 6: Integrity & Index Management API
	// ========================================================================

	/**
	 * Check integrity of all registered models.
	 *
	 * Validates derived index structures (filter, sorted indexes, unique indexes)
	 * against authoritative data (catalog, chunks).
	 *
	 * @param options - Optional integrity check options
	 * @returns Integrity report for all models
	 */
	async checkIntegrity(options?: IntegrityCheckOptions) {
		return checkIntegrityImpl(state.initialized, state.adapter, state.models, options)
	},

	/**
	 * Verify integrity of a specific model.
	 *
	 * @param modelName - Model name (or "namespace::name" for namespaced models)
	 * @param options - Optional integrity check options
	 * @returns Integrity report for the model
	 */
	async verify(modelName: string, options?: IntegrityCheckOptions) {
		return verifyImpl(state.initialized, state.adapter, state.models, modelName, options)
	},

	/**
	 * Repair a specific model based on integrity check.
	 *
	 * @param modelName - Model name (or "namespace::name" for namespaced models)
	 * @param options - Optional repair options
	 * @returns Repair result
	 */
	async repair(modelName: string, options?: RepairOptions) {
		return repairImpl(state.initialized, state.adapter, state.models, state.metrics, modelName, options)
	},

	/**
	 * Rebuild all indexes for a model (or all models).
	 *
	 * This completely rebuilds filter and sorted indexes from authoritative data.
	 *
	 * @param modelName - Optional model name. If not provided, rebuilds all models.
	 */
	async rebuildIndexes(modelName?: string) {
		return rebuildIndexesImpl(state.initialized, state.adapter, state.models, state.metrics, state.logger, modelName)
	},

	/**
	 * Flush all pending index changes to storage.
	 *
	 * Forces immediate persistence of all dirty indexes.
	 */
	async flushIndexes() {
		return flushIndexesImpl(state.initialized, state.adapter, state.indexPersistence, state.logger)
	},

	/**
	 * Preload specified models into memory.
	 *
	 * Loads catalog, filter, and sorted indexes for the specified models.
	 * Useful when lazyLoading is enabled but you want to warm up specific models.
	 *
	 * @param modelNames - Model names to preload
	 */
	async preload(modelNames: string[]) {
		return preloadImpl(state.initialized, state.adapter, state.models, state.logger, modelNames)
	},

	/**
	 * Rebuild indexes for a single model using a dedicated pass.
	 *
	 * Builds new indexes from authoritative data, then swaps them into the model.
	 * This is an async operation that awaits completion — queries use old indexes
	 * until the swap occurs.
	 *
	 * @param modelName - Model name to rebuild
	 */
	async rebuildIndexesDedicated(modelName: string) {
		return rebuildIndexesDedicatedImpl(state.initialized, state.adapter, state.models, state.metrics, state.logger, modelName)
	},

	// ========================================================================
	// Phase 7: Schema Validation & Migration API
	// ========================================================================

	/**
	 * Validate schemas of all registered models.
	 *
	 * Compares stored schema metadata checksums against current code checksums.
	 * - Safe changes are auto-applied
	 * - Breaking changes throw FlashcoreSchemaError
	 *
	 * Should be called after all models are registered (typically during app startup).
	 *
	 * @returns Validation result with changes applied
	 */
	async validateSchemas() {
		const result = await validateSchemasImpl(
			state.initialized, state.adapter, state.models,
			state.schemaMetadataManager, state.schemaHistoryManager,
			state.logger, state.metrics
		)
		state.schemasValidated = true
		return result
	},

	/**
	 * Run auto-repair based on configuration.
	 *
	 * Called after schema validation if autoRepair is enabled.
	 *
	 * @param config - Auto-repair configuration (true for defaults, or specific options)
	 */
	async runAutoRepair(config: AutoRepairConfig | true = true) {
		return runAutoRepairImpl(state.initialized, state.adapter, state.models, state.logger, state.metrics, config)
	},

	/**
	 * Check if schemas have been validated.
	 */
	get schemasValidated(): boolean {
		return state.schemasValidated
	},

	/**
	 * Get the schema metadata manager.
	 * @internal
	 */
	get _schemaMetadataManager(): any | null {
		return state.schemaMetadataManager
	},

	/**
	 * Get the schema history manager.
	 * @internal
	 */
	get _schemaHistoryManager(): any | null {
		return state.schemaHistoryManager
	},

	/**
	 * Get all registered models.
	 * Returns a Map of model key to model instance.
	 */
	getRegisteredModels(): Map<string, FlashcoreModel<{ id: string }>> {
		return new Map(state.models)
	},

	/**
	 * Create a migration runner for CLI operations.
	 * @returns MigrationRunner instance or null if not initialized
	 */
	async createMigrationRunner() {
		return createMigrationRunnerImpl(state.initialized, state.adapter)
	},

	// ========================================================================
	// Phase 8: Transaction API
	// ========================================================================

	/**
	 * Execute a function within a transaction.
	 *
	 * @param fn - The function to execute within the transaction
	 * @param options - Optional transaction options
	 * @returns The result of the transaction function
	 *
	 * @example
	 * ```typescript
	 * const result = await Flashcore.$.transaction(async (ctx) => {
	 *   const user = await ctx.read('user:123')
	 *   ctx.set('user:123', { ...user, name: 'Updated' })
	 *   return user
	 * })
	 * ```
	 */
	async transaction<T>(
		fn: (ctx: ITransactionContext) => Promise<T>,
		options?: TransactionOptions
	): Promise<TransactionResult<T>> {
		return transactionImpl(state.initialized, state.adapter, state.logger, state.metrics, fn, options)
	},

	/**
	 * Execute a transaction (internal).
	 * @internal
	 */
	async _executeTransaction<T>(
		fn: (ctx: ITransactionContext) => Promise<T>,
		mode: ResolvedTransactionMode,
		options: Required<TransactionOptions>,
		startTime: number
	): Promise<TransactionResult<T>> {
		return executeTransactionImpl(state.adapter!, state.metrics, fn, mode, options, startTime)
	},

	/**
	 * Execute an optimistic transaction with retries.
	 * @internal
	 */
	async _executeOptimisticTransaction<T>(
		fn: (ctx: ITransactionContext) => Promise<T>,
		mode: ResolvedTransactionMode,
		options: Required<TransactionOptions>,
		startTime: number
	): Promise<TransactionResult<T>> {
		return executeOptimisticTransactionImpl(state.adapter!, state.logger, state.metrics, fn, mode, options, startTime)
	},

	/**
	 * Clear the serial transaction queue.
	 * @internal
	 */
	_clearSerialQueue(): void {
		clearSerialQueueImpl()
	},

	/**
	 * Apply safe schema changes to a model.
	 * @internal
	 */
	async _applySafeChanges(
		model: FlashcoreModel<{ id: string }>,
		changes: SchemaChange[]
	): Promise<void> {
		return applySafeChangesImpl(model, changes, state.logger, state.metrics)
	},

	// ========================================================================
	// Phase 10: Plugin System API
	// ========================================================================

	/**
	 * Register a plugin at runtime.
	 *
	 * This enables runtime plugin composition after initialization.
	 * The plugin's setup() hook will be called immediately.
	 *
	 * @param plugin - The plugin to register
	 * @returns Promise that resolves when the plugin is registered
	 */
	async extend(plugin: FlashcorePlugin): Promise<void> {
		if (!state.pluginManager) {
			throw new FlashcoreError('Cannot extend: Flashcore not initialized', 'NOT_INITIALIZED')
		}

		// Register the plugin
		state.pluginManager.register(plugin)

		// Run setup for this plugin (uses current model registry)
		await state.pluginManager.setupPlugin(plugin)
	},

	/**
	 * Get plugin context by name.
	 *
	 * @param pluginName - Name of the plugin
	 * @returns Plugin context or undefined if not found
	 */
	getPluginContext(pluginName: string): PluginContext | undefined {
		if (!state.pluginManager) return undefined
		return state.pluginManager.getPluginContext(pluginName)
	},

	/**
	 * Get client extensions for all plugins.
	 *
	 * Returns an object where each key is a plugin name and the value
	 * is that plugin's client extensions.
	 *
	 * @returns Client extensions by plugin name
	 */
	getClientExtensions(): Record<string, Record<string, unknown>> {
		return createClientExtensions()
	},

	/**
	 * Get the plugin manager.
	 * @internal
	 */
	get _pluginManager(): PluginManager | null {
		return state.pluginManager
	}
}

/**
 * Flashcore.$ system API with Proxy wrapper.
 *
 * The Proxy enables direct plugin client extension access:
 * - `Flashcore.$.realtime.getSubscriptionCount()` instead of
 * - `Flashcore.$.getClientExtensions()['realtime'].getSubscriptionCount()`
 */
export const FlashcoreSystem = new Proxy(FlashcoreSystemBase, {
	get(target, prop, receiver) {
		// Check if property exists on FlashcoreSystemBase
		if (prop in target) {
			return Reflect.get(target, prop, receiver)
		}

		// Try to resolve as a plugin name for client extensions
		if (typeof prop === 'string' && prop !== 'then' && prop !== 'toJSON') {
			const manager = state.pluginManager
			if (manager) {
				const extensions = manager.getClientExtensions(prop)
				if (extensions) {
					return extensions
				}
			}
		}

		return undefined
	}
})
