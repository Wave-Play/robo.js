/**
 * Flashcore v1 (spec rev 4.3) WAL Delta Builders
 *
 * Provides helpers to build authoritative and inverse deltas
 * for create, update, and delete operations.
 *
 * Moved from packages/robo/src/flashcore/wal/deltas.ts to
 * @robojs/flashcore-extras as an opt-in extension.
 */

import type {
	WalAuthoritativeDelta,
	WalInverseDelta,
	WalDerivedDelta,
	ChunkPutDelta,
	ChunkPatchDelta,
	ChunkDeleteDelta,
	CatalogSetDelta,
	CatalogDeleteDelta,
	CatalogSetSegmentsDelta,
	UniqueAcquireDelta,
	UniqueReleaseDelta,
	SegmentPutDelta,
	SegmentDeleteDelta,
	FilterAddDelta,
	FilterRemoveDelta,
	DeltaBuildResult,
	UniqueChange,
	UniqueUpdate,
	SegmentWrite
} from 'robo.js/flashcore'

// ─────────────────────────────────────────────────────────────
// Create Deltas
// ─────────────────────────────────────────────────────────────

/**
 * Build deltas for a create operation.
 *
 * Create operation:
 * - auth: chunk_put, catalog_set, unique_acquire (for each unique field)
 * - undo: chunk_delete, catalog_delete, unique_release
 * - derived: filter_add
 *
 * @param chunkKey - Target chunk key
 * @param chunkId - Target chunk ID
 * @param id - Record ID
 * @param record - Full record data (serialized)
 * @param uniqueKeys - Unique constraint keys to acquire
 * @returns Delta build result
 */
export function buildCreateDeltas(
	chunkKey: string,
	chunkId: number,
	id: string,
	record: unknown,
	uniqueKeys: UniqueChange[]
): DeltaBuildResult {
	const auth: WalAuthoritativeDelta[] = []
	const undo: WalInverseDelta[] = []
	const derived: WalDerivedDelta[] = []

	// Auth: Put record into chunk
	const chunkPut: ChunkPutDelta = { t: 'chunk_put', chunkId: chunkKey, id, record }
	auth.push(chunkPut)

	// Undo: Delete record from chunk
	const chunkDelete: ChunkDeleteDelta = { t: 'chunk_delete', chunkId: chunkKey, id }
	undo.push(chunkDelete)

	// Auth: Set catalog mapping
	const catalogSet: CatalogSetDelta = { t: 'catalog_set', id, chunkId }
	auth.push(catalogSet)

	// Undo: Delete catalog mapping
	const catalogDelete: CatalogDeleteDelta = { t: 'catalog_delete', id }
	undo.push(catalogDelete)

	// Auth: Acquire unique constraints
	for (const { key, id: recordId } of uniqueKeys) {
		const acquire: UniqueAcquireDelta = { t: 'unique_acquire', key, id: recordId }
		auth.push(acquire)

		// Undo: Release unique constraint
		const release: UniqueReleaseDelta = { t: 'unique_release', key, id: recordId }
		undo.push(release)
	}

	// Derived: Add to filter (placeholder for Phase 6)
	const filterAdd: FilterAddDelta = { t: 'filter_add', id }
	derived.push(filterAdd)

	return { auth, undo, derived }
}

// ─────────────────────────────────────────────────────────────
// Update Deltas
// ─────────────────────────────────────────────────────────────

/**
 * Build deltas for an update operation.
 *
 * Update operation:
 * - auth: chunk_patch, unique_acquire (for changed unique fields), unique_release
 * - undo: chunk_patch (inverse), unique_acquire (old), unique_release (new)
 * - derived: (index updates will be added in Phase 6)
 *
 * @param chunkId - Chunk containing the record
 * @param id - Record ID
 * @param patch - Fields being updated (new values)
 * @param inversePatch - Previous values for rollback
 * @param uniqueUpdates - Unique constraint changes
 * @returns Delta build result
 */
export function buildUpdateDeltas(
	chunkId: string,
	id: string,
	patch: Record<string, unknown>,
	inversePatch: Record<string, unknown>,
	uniqueUpdates: UniqueUpdate[]
): DeltaBuildResult {
	const auth: WalAuthoritativeDelta[] = []
	const undo: WalInverseDelta[] = []
	const derived: WalDerivedDelta[] = []

	// Auth: Apply patch to chunk
	const chunkPatch: ChunkPatchDelta = { t: 'chunk_patch', chunkId, id, patch }
	auth.push(chunkPatch)

	// Undo: Apply inverse patch (restore previous values)
	const inverseChunkPatch: ChunkPatchDelta = { t: 'chunk_patch', chunkId, id, patch: inversePatch }
	undo.push(inverseChunkPatch)

	// Handle unique constraint changes
	for (const update of uniqueUpdates) {
		// Auth: Acquire new constraint (if value is not null)
		if (update.newKey !== null) {
			const acquire: UniqueAcquireDelta = { t: 'unique_acquire', key: update.newKey, id: update.id }
			auth.push(acquire)
		}

		// Auth: Release old constraint (if value was not null)
		if (update.oldKey !== null) {
			const release: UniqueReleaseDelta = { t: 'unique_release', key: update.oldKey, id: update.id }
			auth.push(release)
		}

		// Undo: Acquire old constraint back (if it was not null)
		if (update.oldKey !== null) {
			const undoAcquire: UniqueAcquireDelta = { t: 'unique_acquire', key: update.oldKey, id: update.id }
			undo.push(undoAcquire)
		}

		// Undo: Release new constraint (if it was not null)
		if (update.newKey !== null) {
			const undoRelease: UniqueReleaseDelta = { t: 'unique_release', key: update.newKey, id: update.id }
			undo.push(undoRelease)
		}
	}

	return { auth, undo, derived }
}

// ─────────────────────────────────────────────────────────────
// Delete Deltas
// ─────────────────────────────────────────────────────────────

/**
 * Build deltas for a delete operation.
 *
 * Delete operation:
 * - auth: chunk_delete, catalog_delete, unique_release
 * - undo: chunk_put (full record), catalog_set, unique_acquire
 * - derived: filter_remove
 *
 * @param chunkKey - Chunk containing the record
 * @param chunkId - Chunk ID
 * @param id - Record ID
 * @param record - Full record data (for rollback)
 * @param uniqueKeys - Unique constraint keys to release
 * @returns Delta build result
 */
export function buildDeleteDeltas(
	chunkKey: string,
	chunkId: number,
	id: string,
	record: unknown,
	uniqueKeys: UniqueChange[]
): DeltaBuildResult {
	const auth: WalAuthoritativeDelta[] = []
	const undo: WalInverseDelta[] = []
	const derived: WalDerivedDelta[] = []

	// Auth: Delete record from chunk
	const chunkDelete: ChunkDeleteDelta = { t: 'chunk_delete', chunkId: chunkKey, id }
	auth.push(chunkDelete)

	// Undo: Put record back into chunk
	const chunkPut: ChunkPutDelta = { t: 'chunk_put', chunkId: chunkKey, id, record }
	undo.push(chunkPut)

	// Auth: Delete catalog mapping
	const catalogDelete: CatalogDeleteDelta = { t: 'catalog_delete', id }
	auth.push(catalogDelete)

	// Undo: Set catalog mapping back
	const catalogSet: CatalogSetDelta = { t: 'catalog_set', id, chunkId }
	undo.push(catalogSet)

	// Auth: Release unique constraints
	for (const { key, id: recordId } of uniqueKeys) {
		const release: UniqueReleaseDelta = { t: 'unique_release', key, id: recordId }
		auth.push(release)

		// Undo: Acquire unique constraint back
		const acquire: UniqueAcquireDelta = { t: 'unique_acquire', key, id: recordId }
		undo.push(acquire)
	}

	// Derived: Remove from filter (placeholder for Phase 6)
	const filterRemove: FilterRemoveDelta = { t: 'filter_remove', id }
	derived.push(filterRemove)

	return { auth, undo, derived }
}

// ─────────────────────────────────────────────────────────────
// Segmented (Large Record) Deltas (Phase 5)
// ─────────────────────────────────────────────────────────────

function appendUniqueUpdateDeltas(
	auth: WalAuthoritativeDelta[],
	undo: WalInverseDelta[],
	uniqueUpdates: UniqueUpdate[]
): void {
	for (const update of uniqueUpdates) {
		// Auth: Acquire new constraint (if value is not null)
		if (update.newKey !== null) {
			const acquire: UniqueAcquireDelta = { t: 'unique_acquire', key: update.newKey, id: update.id }
			auth.push(acquire)
		}

		// Auth: Release old constraint (if value was not null)
		if (update.oldKey !== null) {
			const release: UniqueReleaseDelta = { t: 'unique_release', key: update.oldKey, id: update.id }
			auth.push(release)
		}

		// Undo: Acquire old constraint back (if it was not null)
		if (update.oldKey !== null) {
			const undoAcquire: UniqueAcquireDelta = { t: 'unique_acquire', key: update.oldKey, id: update.id }
			undo.push(undoAcquire)
		}

		// Undo: Release new constraint (if it was not null)
		if (update.newKey !== null) {
			const undoRelease: UniqueReleaseDelta = { t: 'unique_release', key: update.newKey, id: update.id }
			undo.push(undoRelease)
		}
	}
}

export function buildCreateSegmentedDeltas(
	id: string,
	segmentIds: string[],
	segments: SegmentWrite[],
	uniqueKeys: UniqueChange[]
): DeltaBuildResult {
	const auth: WalAuthoritativeDelta[] = []
	const undo: WalInverseDelta[] = []
	const derived: WalDerivedDelta[] = []

	// Auth: Write segments
	for (const seg of segments) {
		const put: SegmentPutDelta = { t: 'seg_put', segmentKey: seg.segmentKey, id, index: seg.index, data: seg.data }
		auth.push(put)

		// Undo: Delete segment
		const del: SegmentDeleteDelta = { t: 'seg_delete', segmentKey: seg.segmentKey, id, index: seg.index }
		undo.push(del)
	}

	// Auth: Catalog entry for segmented record
	const catalogSet: CatalogSetSegmentsDelta = { t: 'catalog_set_segments', id, segmentIds }
	auth.push(catalogSet)

	// Undo: Remove catalog entry
	const catalogDelete: CatalogDeleteDelta = { t: 'catalog_delete', id }
	undo.push(catalogDelete)

	// Auth: Acquire unique constraints
	for (const { key, id: recordId } of uniqueKeys) {
		const acquire: UniqueAcquireDelta = { t: 'unique_acquire', key, id: recordId }
		auth.push(acquire)

		// Undo: Release unique constraint
		const release: UniqueReleaseDelta = { t: 'unique_release', key, id: recordId }
		undo.push(release)
	}

	// Derived: Add to filter (placeholder for Phase 6)
	const filterAdd: FilterAddDelta = { t: 'filter_add', id }
	derived.push(filterAdd)

	return { auth, undo, derived }
}

export function buildDeleteSegmentedDeltas(
	id: string,
	segmentIds: string[],
	segments: SegmentWrite[],
	uniqueKeys: UniqueChange[]
): DeltaBuildResult {
	const auth: WalAuthoritativeDelta[] = []
	const undo: WalInverseDelta[] = []
	const derived: WalDerivedDelta[] = []

	// Auth: Delete segments
	for (const seg of segments) {
		const del: SegmentDeleteDelta = { t: 'seg_delete', segmentKey: seg.segmentKey, id, index: seg.index }
		auth.push(del)

		// Undo: Restore segment
		const put: SegmentPutDelta = { t: 'seg_put', segmentKey: seg.segmentKey, id, index: seg.index, data: seg.data }
		undo.push(put)
	}

	// Auth: Remove catalog entry
	const catalogDelete: CatalogDeleteDelta = { t: 'catalog_delete', id }
	auth.push(catalogDelete)

	// Undo: Restore catalog entry
	const catalogSet: CatalogSetSegmentsDelta = { t: 'catalog_set_segments', id, segmentIds }
	undo.push(catalogSet)

	// Auth: Release unique constraints
	for (const { key, id: recordId } of uniqueKeys) {
		const release: UniqueReleaseDelta = { t: 'unique_release', key, id: recordId }
		auth.push(release)

		// Undo: Acquire unique constraint back
		const acquire: UniqueAcquireDelta = { t: 'unique_acquire', key, id: recordId }
		undo.push(acquire)
	}

	// Derived: Remove from filter (placeholder for Phase 6)
	const filterRemove: FilterRemoveDelta = { t: 'filter_remove', id }
	derived.push(filterRemove)

	return { auth, undo, derived }
}

export type { SegmentWrite, UniqueChange, UniqueUpdate }

export function buildUpdateSegmentedDeltas(
	id: string,
	oldSegmentIds: string[],
	oldSegments: SegmentWrite[],
	newSegmentIds: string[],
	newSegments: SegmentWrite[],
	uniqueUpdates: UniqueUpdate[]
): DeltaBuildResult {
	const auth: WalAuthoritativeDelta[] = []
	const undo: WalInverseDelta[] = []
	const derived: WalDerivedDelta[] = []

	// Auth: Write new segments
	for (const seg of newSegments) {
		const put: SegmentPutDelta = { t: 'seg_put', segmentKey: seg.segmentKey, id, index: seg.index, data: seg.data }
		auth.push(put)
	}

	// Auth: delete trailing old segments if record shrank
	if (oldSegments.length > newSegments.length) {
		for (let i = newSegments.length; i < oldSegments.length; i++) {
			const seg = oldSegments[i]
			const del: SegmentDeleteDelta = { t: 'seg_delete', segmentKey: seg.segmentKey, id, index: seg.index }
			auth.push(del)
		}
	}

	// Auth: Update catalog to new segments
	const catalogSet: CatalogSetSegmentsDelta = { t: 'catalog_set_segments', id, segmentIds: newSegmentIds }
	auth.push(catalogSet)

	// Undo: Restore old segments
	for (const seg of oldSegments) {
		const put: SegmentPutDelta = { t: 'seg_put', segmentKey: seg.segmentKey, id, index: seg.index, data: seg.data }
		undo.push(put)
	}

	// Undo: delete trailing new segments if record grew
	if (newSegments.length > oldSegments.length) {
		for (let i = oldSegments.length; i < newSegments.length; i++) {
			const seg = newSegments[i]
			const del: SegmentDeleteDelta = { t: 'seg_delete', segmentKey: seg.segmentKey, id, index: seg.index }
			undo.push(del)
		}
	}

	// Undo: restore catalog to old segments
	const catalogUndo: CatalogSetSegmentsDelta = { t: 'catalog_set_segments', id, segmentIds: oldSegmentIds }
	undo.push(catalogUndo)

	appendUniqueUpdateDeltas(auth, undo, uniqueUpdates)

	return { auth, undo, derived }
}

export function buildUpdateChunkToSegmentsDeltas(
	oldChunkKey: string,
	oldChunkId: number,
	id: string,
	oldRecord: unknown,
	newSegmentIds: string[],
	newSegments: SegmentWrite[],
	uniqueUpdates: UniqueUpdate[]
): DeltaBuildResult {
	const auth: WalAuthoritativeDelta[] = []
	const undo: WalInverseDelta[] = []
	const derived: WalDerivedDelta[] = []

	// Auth: remove from old chunk
	const chunkDelete: ChunkDeleteDelta = { t: 'chunk_delete', chunkId: oldChunkKey, id }
	auth.push(chunkDelete)

	// Auth: write segments
	for (const seg of newSegments) {
		const put: SegmentPutDelta = { t: 'seg_put', segmentKey: seg.segmentKey, id, index: seg.index, data: seg.data }
		auth.push(put)
	}

	// Auth: update catalog to segments
	const catalogSet: CatalogSetSegmentsDelta = { t: 'catalog_set_segments', id, segmentIds: newSegmentIds }
	auth.push(catalogSet)

	// Undo: delete segments
	for (const seg of newSegments) {
		const del: SegmentDeleteDelta = { t: 'seg_delete', segmentKey: seg.segmentKey, id, index: seg.index }
		undo.push(del)
	}

	// Undo: restore old chunk record
	const chunkPut: ChunkPutDelta = { t: 'chunk_put', chunkId: oldChunkKey, id, record: oldRecord }
	undo.push(chunkPut)

	// Undo: restore catalog to chunk
	const catalogUndo: CatalogSetDelta = { t: 'catalog_set', id, chunkId: oldChunkId }
	undo.push(catalogUndo)

	appendUniqueUpdateDeltas(auth, undo, uniqueUpdates)

	return { auth, undo, derived }
}

export function buildUpdateSegmentsToChunkDeltas(
	id: string,
	oldSegmentIds: string[],
	oldSegments: SegmentWrite[],
	newChunkKey: string,
	newChunkId: number,
	newRecord: unknown,
	uniqueUpdates: UniqueUpdate[]
): DeltaBuildResult {
	const auth: WalAuthoritativeDelta[] = []
	const undo: WalInverseDelta[] = []
	const derived: WalDerivedDelta[] = []

	// Auth: delete old segments
	for (const seg of oldSegments) {
		const del: SegmentDeleteDelta = { t: 'seg_delete', segmentKey: seg.segmentKey, id, index: seg.index }
		auth.push(del)
	}

	// Auth: write new chunk record
	const chunkPut: ChunkPutDelta = { t: 'chunk_put', chunkId: newChunkKey, id, record: newRecord }
	auth.push(chunkPut)

	// Auth: update catalog to chunk
	const catalogSet: CatalogSetDelta = { t: 'catalog_set', id, chunkId: newChunkId }
	auth.push(catalogSet)

	// Undo: remove chunk record
	const chunkDelete: ChunkDeleteDelta = { t: 'chunk_delete', chunkId: newChunkKey, id }
	undo.push(chunkDelete)

	// Undo: restore segments
	for (const seg of oldSegments) {
		const put: SegmentPutDelta = { t: 'seg_put', segmentKey: seg.segmentKey, id, index: seg.index, data: seg.data }
		undo.push(put)
	}

	// Undo: restore catalog to segments
	const catalogUndo: CatalogSetSegmentsDelta = { t: 'catalog_set_segments', id, segmentIds: oldSegmentIds }
	undo.push(catalogUndo)

	appendUniqueUpdateDeltas(auth, undo, uniqueUpdates)

	return { auth, undo, derived }
}

// ─────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────

/**
 * Compute a minimal patch from old and new record.
 *
 * Only includes fields that have changed.
 *
 * @param oldRecord - Previous record state
 * @param newRecord - New record state
 * @returns Patch with only changed fields
 */
export function computePatch(
	oldRecord: Record<string, unknown>,
	newRecord: Record<string, unknown>
): { patch: Record<string, unknown>; inversePatch: Record<string, unknown> } {
	const patch: Record<string, unknown> = {}
	const inversePatch: Record<string, unknown> = {}

	// Check all fields in new record
	for (const key of Object.keys(newRecord)) {
		const oldValue = oldRecord[key]
		const newValue = newRecord[key]

		if (!valuesEqual(oldValue, newValue)) {
			patch[key] = newValue
			inversePatch[key] = oldValue
		}
	}

	return { patch, inversePatch }
}

/**
 * Compare two values for equality.
 */
function valuesEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true
	if (a === null || a === undefined) return b === null || b === undefined
	if (b === null || b === undefined) return false

	// Handle Date comparison
	if (a instanceof Date && b instanceof Date) {
		return a.getTime() === b.getTime()
	}

	// Handle object comparison (shallow)
	if (typeof a === 'object' && typeof b === 'object') {
		const aKeys = Object.keys(a as object)
		const bKeys = Object.keys(b as object)
		if (aKeys.length !== bKeys.length) return false

		for (const key of aKeys) {
			if (!valuesEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
				return false
			}
		}
		return true
	}

	return false
}

/**
 * Merge a patch into an existing record.
 *
 * @param record - Base record
 * @param patch - Fields to update
 * @returns Merged record
 */
export function applyPatch<T extends Record<string, unknown>>(
	record: T,
	patch: Record<string, unknown>
): T {
	return { ...record, ...patch }
}
