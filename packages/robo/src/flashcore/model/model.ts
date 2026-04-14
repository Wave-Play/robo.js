/**
 * Flashcore v1 (spec rev 4.3) Model
 *
 * Main FlashcoreModel class with CRUD operations.
 */

import type { FlashcoreAdapter } from '../adapter/types.js'
import type {
	SchemaFields,
	NormalizedSchema,
	ModelHooks,
	CreateInput,
	FindUniqueArgs,
	UpdateArgs,
	DeleteArgs,
	RelationDef,
	FindManyArgs,
	FindFirstArgs,
	CountArgs,
	CatalogData,
	CreateManyArgs,
	UpdateManyArgs,
	DeleteManyArgs,
	UpsertArgs,
	BatchResult
} from '../schema/types.js'
import { normalizeSchema } from '../schema/normalize.js'
import { RecordValidator } from '../schema/validate.js'
import { TypeSerializer } from '../schema/serialize.js'
import { validateHooks } from './hooks.js'
import { Catalog } from './catalog.js'
import { ChunkManager } from './chunk.js'
import { catalogLockManager, chunkLockManager } from './locks.js'
import { buildModelKey } from '../core/keys.js'

import { executeCreate, type CreateContext } from './crud/create.js'
import { executeFindUnique, type ReadContext } from './crud/read.js'
import { executeUpdate, type UpdateContext } from './crud/update.js'
import { executeDelete, type DeleteContext } from './crud/delete.js'
import {
	executeFindMany,
	executeFindFirst,
	executeCount,
	executeFindManyStream,
	type FindManyContext
} from './crud/find-many.js'
import { UniqueIndexManager } from '../index/unique.js'
import { CuckooFilter, type CuckooFilterData } from '../index/filter.js'
import { SortedIndex, type SortedIndexData } from '../index/sorted.js'
import { getIndexPersistenceManager } from '../index/persistence.js'
import { getWalContext } from '../wal/context.js'
import { FILTER_KEY_SUFFIX, INDEX_KEY_PREFIX } from '../core/constants.js'

// Phase 8: Bulk and upsert operations
import {
	executeCreateMany,
	executeUpdateMany,
	executeDeleteMany,
	type BulkContext,
	type CreateManyResult
} from './crud/bulk.js'

// Phase 9: Relations
import { validateForeignKeys } from '../relation/validation.js'
import {
	checkRestrictConstraints,
	collectCascadeOperations,
	executeCascadeOperations,
	hasCascadeRelations,
	type CascadeContext
} from '../relation/cascade.js'

// Phase 10: Plugin system
import { getPluginContext } from '../plugin/context.js'
import { executeWithMiddleware } from '../plugin/middleware.js'
import type { PluginContext } from '../plugin/types.js'
import { JunctionTableManager } from '../relation/junction.js'
import {
	ValidationError as FlashcoreValidationError,
	UniqueConstraintError
} from '../core/errors.js'

interface ParsedManyToManyMutation {
	connect: string[]
	disconnect: string[]
	set: string[] | null
	disconnectAll: boolean
}

function parseRelationIdInput(value: unknown, field: string): string[] {
	if (value === undefined || value === null) return []

	if (typeof value === 'string') {
		return [value]
	}

	if (Array.isArray(value)) {
		const ids: string[] = []
		for (const entry of value) {
			ids.push(...parseRelationIdInput(entry, field))
		}
		return ids
	}

	if (typeof value === 'object' && value !== null && 'id' in value) {
		const id = (value as { id?: unknown }).id
		if (typeof id === 'string') {
			return [id]
		}
	}

	throw new FlashcoreValidationError(
		`Invalid relation id input for '${field}'. Expected string, { id: string }, or array.`,
		{ field }
	)
}

function parseManyToManyMutation(value: unknown, field: string): ParsedManyToManyMutation | null {
	if (value === undefined || value === null) return null

	// For include clauses users may pass `true`, but mutation data must be an object.
	if (value === true) return null

	if (typeof value !== 'object') {
		throw new FlashcoreValidationError(
			`Invalid manyToMany mutation for '${field}'. Expected an object.`,
			{ field }
		)
	}

	const obj = value as Record<string, unknown>

	const disconnectAll = obj.disconnect === true
	const connect = parseRelationIdInput(obj.connect, field)
	const disconnect = disconnectAll ? [] : parseRelationIdInput(obj.disconnect, field)
	const set = obj.set !== undefined ? parseRelationIdInput(obj.set, field) : null

	// Validate mutually exclusive operations for predictable semantics.
	if (set && (connect.length > 0 || disconnect.length > 0 || disconnectAll)) {
		throw new FlashcoreValidationError(
			`Invalid manyToMany mutation for '${field}'. 'set' cannot be combined with 'connect'/'disconnect'.`,
			{ field }
		)
	}

	if (disconnectAll && connect.length > 0) {
		throw new FlashcoreValidationError(
			`Invalid manyToMany mutation for '${field}'. 'disconnect: true' cannot be combined with 'connect'. Use 'set' instead.`,
			{ field }
		)
	}

	// Dedupe inputs to avoid redundant operations.
	const dedupe = (ids: string[]) => Array.from(new Set(ids))

	return {
		connect: dedupe(connect),
		disconnect: dedupe(disconnect),
		set: set ? dedupe(set) : null,
		disconnectAll
	}
}

/**
 * Model options for registration.
 */
export interface FlashcoreModelOptions {
	namespace?: string
	methods?: Record<string, (...args: unknown[]) => unknown>
	hooks?: ModelHooks

	/**
	 * Function to get a model by name (for relations).
	 * Set by FlashcoreSystem when registering the model.
	 */
	getModel?: (name: string) => FlashcoreModel | undefined

	/**
	 * Function to get a model's schema by name (for cascades).
	 * Set by FlashcoreSystem when registering the model.
	 */
	getSchema?: (name: string) => NormalizedSchema | undefined
}

/**
 * FlashcoreModel class.
 *
 * Provides CRUD operations for a model defined by a schema.
 */
export class FlashcoreModel<T extends { id: string } = { id: string }> {
	readonly name: string
	readonly namespace?: string
	readonly schema: NormalizedSchema
	readonly hooks?: ModelHooks<T>

	/**
	 * Plugin metadata storage.
	 */
	readonly meta: Record<string, unknown> = {}

	// Internal state
	private adapter: FlashcoreAdapter
	private catalog: Catalog
	private chunkManager: ChunkManager
	private validator: RecordValidator
	private serializer: TypeSerializer
	private uniqueIndexManager: UniqueIndexManager
	private catalogLoaded = false

	// Index state (Phase 6)
	private _filter: CuckooFilter | null = null
	private _sortedIndexes: Map<string, SortedIndex> = new Map()
	private _indexesLoaded = false
	private _needsRebuild = false

	// Relation state (Phase 9)
	private _getModel?: (name: string) => FlashcoreModel | undefined
	private _getSchema?: (name: string) => NormalizedSchema | undefined

	/**
	 * Key used for locking and storage.
	 */
	private readonly modelKey: string

	/**
	 * Custom methods added to the model.
	 */
	private readonly customMethods: Record<string, (...args: unknown[]) => unknown>

	constructor(
		name: string,
		schemaFields: SchemaFields,
		adapter: FlashcoreAdapter,
		options?: FlashcoreModelOptions
	) {
		this.name = name
		this.namespace = options?.namespace
		this.adapter = adapter

		// Build model key for storage
		this.modelKey = this.namespace ? `${this.namespace}::${name}` : name

		// Normalize schema
		this.schema = normalizeSchema(schemaFields)

		// Create helpers
		this.catalog = Catalog.empty()
		this.chunkManager = new ChunkManager({
			adapter,
			modelName: name,
			namespace: this.namespace
		})
		this.validator = new RecordValidator(this.schema)
		this.serializer = new TypeSerializer(this.schema)
		this.uniqueIndexManager = new UniqueIndexManager(adapter)

		// Validate and store hooks
		if (options?.hooks) {
			validateHooks(options.hooks)
			this.hooks = options.hooks as ModelHooks<T>
		}

		// Store custom methods (bound to this model)
		this.customMethods = {}
		if (options?.methods) {
			for (const [methodName, method] of Object.entries(options.methods)) {
				this.customMethods[methodName] = method.bind(this)
			}
		}

		// Store relation lookup functions (Phase 9)
		this._getModel = options?.getModel
		this._getSchema = options?.getSchema

		// Create proxy to expose custom methods
		return new Proxy(this, {
			get(target, prop, receiver) {
				// Check custom methods first
				if (typeof prop === 'string' && prop in target.customMethods) {
					return target.customMethods[prop]
				}
				return Reflect.get(target, prop, receiver)
			}
		})
	}

	/**
	 * Build the catalog storage key.
	 */
	private getCatalogKey(): string {
		return buildModelKey(this.name, 'catalog', this.namespace)
	}

	/**
	 * Ensure catalog is loaded from storage.
	 */
	private async ensureCatalogLoaded(): Promise<void> {
		if (this.catalogLoaded) {
			return
		}

		const catalogKey = this.getCatalogKey()
		const data = await this.adapter.get(catalogKey)

		if (data && typeof data === 'object') {
			// Catalog.deserialize supports legacy v1 entries (missing `kind`) at runtime.
			// Treat stored catalog data as opaque and let the catalog module handle migration.
			this.catalog = Catalog.deserialize(data as unknown as CatalogData)
		} else {
			this.catalog = Catalog.empty()
		}

		this.catalogLoaded = true
	}

	/**
	 * Persist catalog to storage.
	 */
	private async persistCatalog(): Promise<void> {
		const catalogKey = this.getCatalogKey()
		const data = this.catalog.serialize()
		await this.adapter.set(catalogKey, data)
	}

	/**
	 * Apply many-to-many relation mutations after a successful create/update.
	 *
	 * Supports Prisma-like mutation shapes:
	 * - `{ connect: [{ id }] }`
	 * - `{ disconnect: [{ id }] }`
	 * - `{ disconnect: true }` (disconnect all)
	 * - `{ set: [{ id }] }` (replace all)
	 */
	private async _applyManyToManyMutations(recordId: string, data: unknown): Promise<void> {
		if (!this._getModel) return
		if (!data || typeof data !== 'object') return

		const input = data as Record<string, unknown>

		// Fast path: check if any manyToMany fields are present in input.
		let hasMutations = false
		for (const [field, relation] of this.schema.relations) {
			if (relation.type !== 'manyToMany') continue
			if (field in input) {
				hasMutations = true
				break
			}
		}

		if (!hasMutations) return

		const manager = new JunctionTableManager(
			this.adapter,
			(modelName: string) => this._getModel!(modelName)
		)

		for (const [field, relation] of this.schema.relations) {
			if (relation.type !== 'manyToMany') continue
			if (!(field in input)) continue

			const mutation = parseManyToManyMutation(input[field], field)
			if (!mutation) continue

			// Ensure target model exists before attempting junction operations.
			const targetModel = this._getModel(relation.model)
			if (!targetModel) {
				throw new FlashcoreValidationError(
					`Cannot apply manyToMany mutation for '${this.name}.${field}': ` +
					`target model '${relation.model}' is not registered.`,
					{ field }
				)
			}

			// Apply operations in a predictable order.
			if (mutation.set) {
				await manager.setRelations(this.name, recordId, relation.model, mutation.set)
				continue
			}

			if (mutation.disconnectAll) {
				await manager.setRelations(this.name, recordId, relation.model, [])
				continue
			}

			for (const targetId of mutation.disconnect) {
				await manager.removeRelation(this.name, recordId, relation.model, targetId)
			}

			for (const targetId of mutation.connect) {
				await manager.addRelation(this.name, recordId, relation.model, targetId)
			}
		}
	}

	// ========================================================================
	// Shared Context Builders
	// ========================================================================

	/** Common read-only fields shared by all CRUD contexts. */
	private _readFields() {
		return {
			modelName: this.name,
			schema: this.schema,
			catalog: this.catalog,
			chunkManager: this.chunkManager,
			serializer: this.serializer
		}
	}

	/** Write-specific fields shared by create/update/delete/bulk/upsert. */
	private _writeFields() {
		return {
			modelKey: this.modelKey,
			persistCatalog: () => this.persistCatalog(),
			uniqueIndexManager: this.uniqueIndexManager,
			namespace: this.namespace
		}
	}

	/** Include context for read operations (Phase 9). */
	private _includeContext() {
		return this._getModel ? { depth: 0, getModel: this._getModel } : undefined
	}

	/** Build relation callbacks for create/update (Phase 9). */
	private _buildRelationCallbacks() {
		if (!this._getModel) return undefined
		return {
			validateForeignKeys: async (inputData: Record<string, unknown>) => {
				await validateForeignKeys(this.name, this.schema, inputData, this._getModel!)
			}
		}
	}

	/** Build cascade callbacks for delete (Phase 9). */
	private _buildCascadeCallbacks() {
		if (!this._getModel || !this._getSchema || !hasCascadeRelations(this.schema)) return undefined
		const cascadeCtx: CascadeContext = {
			getModel: this._getModel!,
			getSchema: this._getSchema!
		}
		return {
			checkRestrict: async (record: { id: string }) => {
				await checkRestrictConstraints(this.name, this.schema, record, cascadeCtx)
			},
			executeCascades: async (record: { id: string }) => {
				const ops = await collectCascadeOperations(this.name, this.schema, record, cascadeCtx, 0)
				if (ops.length > 0) {
					await executeCascadeOperations(ops, record.id, cascadeCtx)
				}
			}
		}
	}

	// ========================================================================
	// CRUD Operations
	// ========================================================================

	/**
	 * Create a new record.
	 *
	 * @param data - Record data (id is auto-generated if not provided)
	 * @returns Created record
	 */
	async create(data: CreateInput<T>): Promise<T> {
		await this.ensureCatalogLoaded()

		const ctx: CreateContext<T> = {
			...this._readFields(),
			...this._writeFields(),
			catalogLock: catalogLockManager,
			chunkLock: chunkLockManager,
			validator: this.validator,
			hooks: this.hooks,
			wal: getWalContext(),
			indexCallbacks: await this._buildIndexCallbacks('create'),
			relationCallbacks: this._buildRelationCallbacks()
		}

		// Phase 10: Execute through middleware pipeline
		const opArgs = { data }
		return executeWithMiddleware(
			'create',
			this as unknown as FlashcoreModel<{ id: string }>,
			opArgs,
			async () => {
				const created = await executeCreate(ctx, opArgs.data)
				await this._applyManyToManyMutations(created.id, opArgs.data as unknown)
				return created
			}
		) as Promise<T>
	}

	/**
	 * Find a unique record by ID or unique field.
	 *
	 * @param args - Find arguments with where clause
	 * @returns Found record or null
	 */
	async findUnique(args: FindUniqueArgs<T>): Promise<T | null> {
		await this.ensureCatalogLoaded()

		const ctx: ReadContext<T> = {
			...this._readFields(),
			uniqueIndexManager: this.uniqueIndexManager,
			namespace: this.namespace,
			includeContext: this._includeContext()
		}

		// Phase 10: Execute through middleware pipeline
		return executeWithMiddleware(
			'findUnique',
			this as unknown as FlashcoreModel<{ id: string }>,
			args,
			() => executeFindUnique(ctx, args)
		) as Promise<T | null>
	}

	/**
	 * Update a record.
	 *
	 * @param args - Update arguments with where and data
	 * @returns Updated record or null if not found
	 */
	async update(args: UpdateArgs<T>): Promise<T | null> {
		await this.ensureCatalogLoaded()

		const ctx: UpdateContext<T> = {
			...this._readFields(),
			...this._writeFields(),
			catalogLock: catalogLockManager,
			chunkLock: chunkLockManager,
			validator: this.validator,
			hooks: this.hooks,
			wal: getWalContext(),
			indexCallbacks: await this._buildIndexCallbacks('update'),
			relationCallbacks: this._buildRelationCallbacks()
		}

		// Phase 10: Execute through middleware pipeline
		return executeWithMiddleware(
			'update',
			this as unknown as FlashcoreModel<{ id: string }>,
			args,
			async () => {
				const updated = await executeUpdate(ctx, args)
				if (updated) {
					await this._applyManyToManyMutations(updated.id, args.data as unknown)
				}
				return updated
			}
		) as Promise<T | null>
	}

	/**
	 * Delete a record.
	 *
	 * @param args - Delete arguments with where clause
	 * @returns Deleted record or null if not found
	 */
	async delete(args: DeleteArgs<T>): Promise<T | null> {
		await this.ensureCatalogLoaded()

		const ctx: DeleteContext<T> = {
			...this._readFields(),
			...this._writeFields(),
			catalogLock: catalogLockManager,
			chunkLock: chunkLockManager,
			hooks: this.hooks,
			wal: getWalContext(),
			indexCallbacks: await this._buildIndexCallbacks('delete'),
			cascadeCallbacks: this._buildCascadeCallbacks()
		}

		// Phase 10: Execute through middleware pipeline
		return executeWithMiddleware(
			'delete',
			this as unknown as FlashcoreModel<{ id: string }>,
			args,
			() => executeDelete(ctx, args)
		) as Promise<T | null>
	}

	/**
	 * Find multiple records with filtering, ordering, and pagination.
	 *
	 * @param args - FindMany arguments
	 * @returns Array of matching records
	 */
	async findMany(args?: FindManyArgs<T>): Promise<T[]> {
		await this.ensureCatalogLoaded()
		await this._ensureIndexesLoaded()

		const ctx: FindManyContext<T> = {
			...this._readFields(),
			filter: this._filter ?? undefined,
			sortedIndexes: this._sortedIndexes,
			includeContext: this._includeContext()
		}

		// Phase 10: Execute through middleware pipeline
		return executeWithMiddleware(
			'findMany',
			this as unknown as FlashcoreModel<{ id: string }>,
			args ?? {},
			() => executeFindMany(ctx, args)
		) as Promise<T[]>
	}

	/**
	 * Find the first matching record.
	 *
	 * @param args - FindFirst arguments
	 * @returns First matching record or null
	 */
	async findFirst(args?: FindFirstArgs<T>): Promise<T | null> {
		await this.ensureCatalogLoaded()
		await this._ensureIndexesLoaded()

		const ctx: FindManyContext<T> = {
			...this._readFields(),
			filter: this._filter ?? undefined,
			sortedIndexes: this._sortedIndexes,
			includeContext: this._includeContext()
		}

		// Phase 10: Execute through middleware pipeline (uses findMany middleware)
		return executeWithMiddleware(
			'findMany',
			this as unknown as FlashcoreModel<{ id: string }>,
			{ ...args, take: 1 },
			() => executeFindFirst(ctx, args) as unknown as Promise<{ id: string }[]>
		) as unknown as Promise<T | null>
	}

	/**
	 * Stream records for memory-efficient processing.
	 *
	 * @param args - FindMany arguments
	 * @yields Records one by one
	 */
	async *findManyStream(args?: FindManyArgs<T>): AsyncGenerator<T, void, undefined> {
		await this.ensureCatalogLoaded()
		await this._ensureIndexesLoaded()

		const ctx: FindManyContext<T> = {
			...this._readFields(),
			filter: this._filter ?? undefined,
			sortedIndexes: this._sortedIndexes,
			includeContext: this._includeContext()
		}

		yield* executeFindManyStream(ctx, args)
	}

	// ========================================================================
	// Schema Accessors
	// ========================================================================

	/**
	 * Get the raw schema fields.
	 */
	getSchema(): Map<string, {
		name: string
		type: string
		optional: boolean
		unique: boolean
		indexed: boolean
		primaryKey: boolean
	}> {
		const result = new Map()
		for (const [name, field] of this.schema.fields) {
			result.set(name, {
				name: field.name,
				type: field.type,
				optional: field.optional,
				unique: field.unique,
				indexed: field.indexed,
				primaryKey: field.primaryKey
			})
		}
		return result
	}

	/**
	 * Get indexed field names.
	 */
	getIndexedFields(): string[] {
		return [...this.schema.indexedFields]
	}

	/**
	 * Get unique field names.
	 */
	getUniqueFields(): string[] {
		return [...this.schema.uniqueFields]
	}

	/**
	 * Get relation definitions.
	 */
	getRelations(): RelationDef[] {
		return Array.from(this.schema.relations.values())
	}

	/**
	 * Get the schema checksum.
	 */
	getSchemaChecksum(): string {
		return this.schema.checksum
	}

	/**
	 * Get the record count, optionally with filtering.
	 *
	 * @param args - Optional count arguments with where clause
	 * @returns Count of matching records
	 */
	async count(args?: CountArgs<T>): Promise<number> {
		await this.ensureCatalogLoaded()

		// Build execution function
		const execute = async (): Promise<number> => {
			// No filter - use catalog count directly (O(1))
			if (!args?.where) {
				return this.catalog.getCount()
			}

			// With filter - delegate to executeCount
			const ctx: FindManyContext<T> = {
				...this._readFields()
			}

			return executeCount(ctx, args)
		}

		// Phase 10: Execute through middleware pipeline
		return executeWithMiddleware(
			'count',
			this as unknown as FlashcoreModel<{ id: string }>,
			args ?? {},
			execute
		)
	}

	// ========================================================================
	// Plugin Context (Phase 10)
	// ========================================================================

	/**
	 * Get plugin context by name.
	 *
	 * Used by plugins to access their state and methods from model operations.
	 *
	 * @param pluginName - Name of the plugin
	 * @returns Plugin context
	 * @throws Error if plugin not found
	 */
	pluginContext(pluginName: string): PluginContext {
		return getPluginContext(pluginName)
	}

	// ========================================================================
	// Bulk Operations (Phase 8)
	// ========================================================================

	/**
	 * Create multiple records atomically.
	 * Requires adapter with ACID support (transaction or atomicBatch).
	 *
	 * @param args - Create many arguments with data array
	 * @returns Created records array
	 */
	async createMany(args: CreateManyArgs<T>): Promise<CreateManyResult<T>> {
		await this.ensureCatalogLoaded()

		const ctx: BulkContext<T> = {
			...this._readFields(),
			...this._writeFields(),
			catalogLock: catalogLockManager,
			chunkLock: chunkLockManager,
			validator: this.validator,
			adapter: this.adapter,
			indexCallbacks: await this._buildIndexCallbacks('create')
		}

		// Phase 10: Execute through middleware pipeline
		return executeWithMiddleware(
			'createMany',
			this as unknown as FlashcoreModel<{ id: string }>,
			args,
			() => executeCreateMany(ctx, args.data, args.skipDuplicates)
		) as Promise<CreateManyResult<T>>
	}

	/**
	 * Update multiple records atomically.
	 * Requires adapter with ACID support (transaction or atomicBatch).
	 *
	 * @param args - Update many arguments with where clause and data
	 * @returns Batch result with count of updated records
	 */
	async updateMany(args: UpdateManyArgs<T>): Promise<BatchResult> {
		await this.ensureCatalogLoaded()
		await this._ensureIndexesLoaded()

		const ctx: BulkContext<T> = {
			...this._readFields(),
			...this._writeFields(),
			catalogLock: catalogLockManager,
			chunkLock: chunkLockManager,
			validator: this.validator,
			adapter: this.adapter,
			indexCallbacks: await this._buildIndexCallbacks('update')
		}

		// Phase 10: Execute through middleware pipeline
		return executeWithMiddleware(
			'updateMany',
			this as unknown as FlashcoreModel<{ id: string }>,
			args,
			() => executeUpdateMany(ctx, args.where ?? {}, args.data)
		) as Promise<BatchResult>
	}

	/**
	 * Delete multiple records atomically.
	 * Requires adapter with ACID support (transaction or atomicBatch).
	 *
	 * @param args - Delete many arguments with where clause
	 * @returns Batch result with count of deleted records
	 */
	async deleteMany(args: DeleteManyArgs<T>): Promise<BatchResult> {
		await this.ensureCatalogLoaded()
		await this._ensureIndexesLoaded()

		const ctx: BulkContext<T> = {
			...this._readFields(),
			...this._writeFields(),
			catalogLock: catalogLockManager,
			chunkLock: chunkLockManager,
			validator: this.validator,
			adapter: this.adapter,
			indexCallbacks: await this._buildIndexCallbacks('delete')
		}

		// Phase 10: Execute through middleware pipeline
		return executeWithMiddleware(
			'deleteMany',
			this as unknown as FlashcoreModel<{ id: string }>,
			args,
			() => executeDeleteMany(ctx, args.where ?? {})
		) as Promise<BatchResult>
	}

	/**
	 * Create or update a record based on unique identifier.
	 *
	 * @param args - Upsert arguments with where, create, and update data
	 * @returns Created or updated record
	 */
	async upsert(args: UpsertArgs<T>): Promise<T> {
		await this.ensureCatalogLoaded()
		await this._ensureIndexesLoaded()

		// Phase 10: Execute through middleware pipeline
		return executeWithMiddleware(
			'upsert',
			this as unknown as FlashcoreModel<{ id: string }>,
			args,
			async () => {
				const createData = { ...(args.create as Record<string, unknown>) }

				if ('id' in args.where && !('id' in createData)) {
					createData.id = (args.where as { id: string }).id
				}

				for (const field of this.schema.uniqueFields) {
					if (field in args.where && !(field in createData)) {
						createData[field] = (args.where as Record<string, unknown>)[field]
					}
				}

				const existing = await this.findUnique({ where: args.where })
				if (existing) {
					const updated = await this.update({
						where: args.where,
						data: args.update
					})

					if (!updated) {
						throw new Error(
							`Upsert lost its target for model "${this.name}" during update delegation.`
						)
					}

					return updated
				}

				try {
					return await this.create(createData as CreateInput<T>)
				} catch (error) {
					if (!(error instanceof UniqueConstraintError)) {
						throw error
					}

					const updated = await this.update({
						where: args.where,
						data: args.update
					})

					if (!updated) {
						throw error
					}

					return updated
				}
			}
		) as Promise<T>
	}

	// ========================================================================
	// Internal Methods
	// ========================================================================

	/**
	 * Reload catalog from storage.
	 * @internal
	 */
	async _reloadCatalog(): Promise<void> {
		this.catalogLoaded = false
		await this.ensureCatalogLoaded()
	}

	/**
	 * Clear the chunk cache.
	 * @internal
	 */
	_clearCache(): void {
		this.chunkManager.clearCache()
	}

	/**
	 * Get the catalog for testing/debugging.
	 * @internal
	 */
	_getCatalog(): Catalog {
		return this.catalog
	}

	/**
	 * Get the chunk manager for repair operations.
	 * @internal
	 */
	_getChunkManager(): ChunkManager {
		return this.chunkManager
	}

	/**
	 * Get the adapter for repair operations.
	 * @internal
	 */
	_getAdapter(): FlashcoreAdapter {
		return this.adapter
	}

	// ========================================================================
	// Index Methods (Phase 6)
	// ========================================================================

	/**
	 * Build index callbacks for CRUD operations.
	 * @internal
	 */
	private async _buildIndexCallbacks(type: 'create' | 'update' | 'delete') {
		await this._ensureIndexesLoaded()

		const addToFilter = type === 'create' ? (id: string) => {
			if (!this._filter) {
				this._filter = CuckooFilter.empty()
			}
			this._filter.add(id)
		} : undefined

		const removeFromFilter = type === 'delete' ? (id: string) => {
			if (this._filter) {
				this._filter.remove(id)
			}
		} : undefined

		const addToSortedIndex = type !== 'delete' ? (field: string, value: unknown, id: string) => {
			let index = this._sortedIndexes.get(field)
			if (!index) {
				index = new SortedIndex(field)
				this._sortedIndexes.set(field, index)
			}
			index.insert(value, id)
		} : undefined

		const removeFromSortedIndex = type !== 'create' ? (field: string, value: unknown, id: string) => {
			const index = this._sortedIndexes.get(field)
			if (index) {
				index.remove(value, id)
			}
		} : undefined

		const markDirty = type === 'update'
			? (field?: string) => {
				const pm = getIndexPersistenceManager()
				if (pm) {
					if (field) {
						pm.markIndexDirty(this.name, field, this.namespace)
					} else {
						for (const f of this.schema.indexedFields) {
							pm.markIndexDirty(this.name, f, this.namespace)
						}
					}
				}
			}
			: () => {
				const pm = getIndexPersistenceManager()
				if (pm) {
					pm.markFilterDirty(this.name, this.namespace)
					for (const field of this.schema.indexedFields) {
						pm.markIndexDirty(this.name, field, this.namespace)
					}
				}
			}

		return { addToFilter, removeFromFilter, addToSortedIndex, removeFromSortedIndex, markDirty }
	}

	/**
	 * Get the filter, loading from storage if needed.
	 * @internal
	 */
	async _getFilter(): Promise<CuckooFilter> {
		await this._ensureIndexesLoaded()
		if (!this._filter) {
			// Create empty filter if not loaded
			this._filter = CuckooFilter.empty()
		}
		return this._filter
	}

	/**
	 * Get a sorted index for a field, loading from storage if needed.
	 * Returns null if the field is not indexed.
	 * @internal
	 */
	async _getSortedIndex(field: string): Promise<SortedIndex | null> {
		// Only return indexes for fields marked as indexed in schema
		if (!this.schema.indexedFields.includes(field)) {
			return null
		}

		await this._ensureIndexesLoaded()
		return this._sortedIndexes.get(field) ?? null
	}

	/**
	 * Get all sorted indexes.
	 * @internal
	 */
	async _getSortedIndexes(): Promise<Map<string, SortedIndex>> {
		await this._ensureIndexesLoaded()
		return this._sortedIndexes
	}

	/**
	 * Load indexes from storage.
	 * @internal
	 */
	async _loadIndexes(): Promise<void> {
		if (this._indexesLoaded) {
			return
		}

		const persistenceManager = getIndexPersistenceManager()
		if (persistenceManager && await persistenceManager.hasStaleMarker(this.name, this.namespace)) {
			this._filter = null
			this._sortedIndexes.clear()
			this._indexesLoaded = true
			this._needsRebuild = true
			return
		}

		// Load filter
		const filterKey = buildModelKey(this.name, FILTER_KEY_SUFFIX, this.namespace)
		const filterData = await this.adapter.get(filterKey)

		if (filterData && typeof filterData === 'object' && 'version' in filterData) {
			try {
				this._filter = CuckooFilter.deserialize(filterData as CuckooFilterData)
			} catch {
				// Invalid filter data - will rebuild on demand
				this._filter = null
				this._needsRebuild = true
			}
		}

		// Load sorted indexes for each indexed field
		for (const field of this.schema.indexedFields) {
			const indexKey = buildModelKey(this.name, `${INDEX_KEY_PREFIX}${field}`, this.namespace)
			const indexData = await this.adapter.get(indexKey)

			if (indexData && typeof indexData === 'object' && 'version' in indexData) {
				try {
					const index = SortedIndex.deserialize(indexData as SortedIndexData)
					this._sortedIndexes.set(field, index)
				} catch {
					// Invalid index data - will rebuild on demand
					this._needsRebuild = true
				}
			}
		}

		this._indexesLoaded = true
	}

	/**
	 * Ensure indexes are loaded from storage.
	 * @internal
	 */
	private async _ensureIndexesLoaded(): Promise<void> {
		if (!this._indexesLoaded) {
			await this._loadIndexes()
		}
	}

	/**
	 * Mark that indexes need rebuilding.
	 * @internal
	 */
	_markNeedsRebuild(): void {
		this._needsRebuild = true
	}

	/**
	 * Check if indexes need rebuilding.
	 * @internal
	 */
	_needsIndexRebuild(): boolean {
		return this._needsRebuild
	}

	/**
	 * Set the filter directly (used by repair/rebuild).
	 * @internal
	 */
	_setFilter(filter: CuckooFilter): void {
		this._filter = filter
		this._needsRebuild = false
	}

	/**
	 * Set a sorted index directly (used by repair/rebuild).
	 * @internal
	 */
	_setSortedIndex(field: string, index: SortedIndex): void {
		this._sortedIndexes.set(field, index)
	}

	/**
	 * Set all sorted indexes directly (used by repair/rebuild).
	 * @internal
	 */
	_setSortedIndexes(indexes: Map<string, SortedIndex>): void {
		this._sortedIndexes = indexes
		this._needsRebuild = false
	}

	/**
	 * Clear all indexes (used by repair/rebuild).
	 * @internal
	 */
	_clearIndexes(): void {
		this._filter = null
		this._sortedIndexes.clear()
		this._indexesLoaded = false
		this._needsRebuild = true
	}
}

/**
 * Create a FlashcoreModel instance.
 */
export function createModel<T extends { id: string }>(
	name: string,
	schemaFields: SchemaFields,
	adapter: FlashcoreAdapter,
	options?: FlashcoreModelOptions
): FlashcoreModel<T> {
	return new FlashcoreModel<T>(name, schemaFields, adapter, options)
}
