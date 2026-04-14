/**
 * Flashcore v1 (spec rev 4.3) WAL Recovery
 *
 * Provides crash recovery by replaying or rolling back orphaned WAL entries.
 * See spec §9.4.7 for full specification.
 *
 * Moved from packages/robo/src/flashcore/wal/recovery.ts to
 * @robojs/flashcore-extras as an opt-in extension.
 */

import type {
	FlashcoreAdapter,
	WALEntry,
	WalAuthoritativeDelta,
	WalInverseDelta,
	RecoveryResult,
	WALConfig,
	CatalogData
} from 'robo.js/flashcore'
import { WAL_ENTRY_KEY_PREFIX as WAL_ENTRY_PREFIX, buildModelKey } from 'robo.js/flashcore'
import { WriteAheadLog } from './manager.js'
import { applyPatch } from './deltas.js'

/**
 * Recover from any orphaned WAL entries.
 *
 * Called during Flashcore.$.init() before model registration.
 *
 * Recovery strategy:
 * - If phase > 'pending', replay (authoritative writes started)
 * - If phase == 'pending' and stale, rollback
 * - If phase == 'pending' and recent, replay
 *
 * @param adapter - The storage adapter
 * @param config - Optional WAL configuration
 * @returns Recovery result with stats
 */
export async function recoverWAL(
	adapter: FlashcoreAdapter,
	config?: WALConfig
): Promise<RecoveryResult> {
	const result: RecoveryResult = {
		found: 0,
		replayed: 0,
		rolledBack: 0,
		errors: []
	}

	// WAL requires scan capability
	if (!adapter.scan) {
		return result
	}

	const wal = new WriteAheadLog(adapter, config)

	// Discover all orphaned WAL entries
	const entryKeys = await wal.getAllEntryKeys()
	result.found = entryKeys.length

	// Process each entry
	for (const key of entryKeys) {
		// Extract WAL ID from key
		const walId = key.slice(WAL_ENTRY_PREFIX.length)

		try {
			const entry = await wal.readEntry(walId)
			if (!entry) {
				// Entry was cleaned up by another process
				continue
			}

			// Decide replay or rollback. If replay fails (e.g., unique constraint conflict),
			// attempt a rollback so startup can continue without getting stuck on the same
			// entry forever.
			if (wal.shouldReplay(entry)) {
				try {
					await replayEntry(adapter, entry)
					result.replayed++

					// Clean up the WAL entry
					await wal.deleteEntry(walId)
				} catch (error) {
					result.errors.push(error instanceof Error ? error : new Error(String(error)))

					try {
						await rollbackEntry(adapter, entry)
						result.rolledBack++

						// Clean up the WAL entry only if rollback succeeded.
						await wal.deleteEntry(walId)
					} catch (rollbackError) {
						result.errors.push(
							rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError))
						)
						// Leave entry in place for future/manual repair if rollback fails.
					}
				}
			} else {
				await rollbackEntry(adapter, entry)
				result.rolledBack++

				// Clean up the WAL entry
				await wal.deleteEntry(walId)
			}
		} catch (error) {
			result.errors.push(error instanceof Error ? error : new Error(String(error)))
		}
	}

	return result
}

/**
 * Replay a WAL entry (forward recovery).
 *
 * Applies authoritative deltas idempotently.
 * Derived deltas are skipped (will be rebuilt from authoritative data).
 *
 * @param adapter - Storage adapter
 * @param entry - WAL entry to replay
 */
async function replayEntry(adapter: FlashcoreAdapter, entry: WALEntry): Promise<void> {
	const catalogKey = buildModelKey(entry.model, 'catalog', entry.namespace)

	// Apply authoritative deltas
	for (const delta of entry.auth) {
		switch (delta.t) {
			case 'catalog_set':
				await applyCatalogSetDelta(adapter, catalogKey, delta.id, delta.chunkId)
				break
			case 'catalog_set_segments':
				await applyCatalogSetSegmentsDelta(adapter, catalogKey, delta.id, delta.segmentIds)
				break
			case 'catalog_delete':
				await applyCatalogDeleteDelta(adapter, catalogKey, delta.id)
				break
			default:
				await applyAuthoritativeDelta(adapter, delta)
		}
	}

	// Skip derived deltas - they'll be rebuilt from authoritative data
	// This is safer than trying to replay potentially stale derived state
}

/**
 * Rollback a WAL entry (backward recovery).
 *
 * Applies inverse deltas to undo partial changes.
 *
 * @param adapter - Storage adapter
 * @param entry - WAL entry to rollback
 */
async function rollbackEntry(adapter: FlashcoreAdapter, entry: WALEntry): Promise<void> {
	const catalogKey = buildModelKey(entry.model, 'catalog', entry.namespace)

	// Apply inverse deltas in reverse order
	for (let i = entry.undo.length - 1; i >= 0; i--) {
		const delta = entry.undo[i]
		switch (delta.t) {
			case 'catalog_set':
				await applyCatalogSetDelta(adapter, catalogKey, delta.id, delta.chunkId)
				break
			case 'catalog_set_segments':
				await applyCatalogSetSegmentsDelta(adapter, catalogKey, delta.id, delta.segmentIds)
				break
			case 'catalog_delete':
				await applyCatalogDeleteDelta(adapter, catalogKey, delta.id)
				break
			default:
				await applyInverseDelta(adapter, delta)
		}
	}
}

/**
 * Apply an authoritative delta to the adapter.
 *
 * All delta applications are idempotent - applying the same delta
 * multiple times produces the same result.
 */
async function applyAuthoritativeDelta(
	adapter: FlashcoreAdapter,
	delta: WalAuthoritativeDelta
): Promise<void> {
	switch (delta.t) {
		case 'chunk_put': {
			// Idempotent: load chunk, add/overwrite record, save
			const chunkKey = buildChunkKey(delta.chunkId)
			const chunk = (await adapter.get(chunkKey)) as Record<string, unknown> | undefined ?? {}
			chunk[delta.id] = delta.record
			await adapter.set(chunkKey, chunk)
			break
		}

		case 'chunk_patch': {
			// Idempotent: load chunk, merge patch, save
			const chunkKey = buildChunkKey(delta.chunkId)
			const chunk = (await adapter.get(chunkKey)) as Record<string, unknown> | undefined ?? {}
			const existing = chunk[delta.id] as Record<string, unknown> | undefined
			if (existing) {
				chunk[delta.id] = applyPatch(existing, delta.patch)
				await adapter.set(chunkKey, chunk)
			}
			// If record doesn't exist, skip (may have been deleted)
			break
		}

		case 'chunk_delete': {
			// Idempotent: load chunk, remove record, save
			const chunkKey = buildChunkKey(delta.chunkId)
			const chunk = (await adapter.get(chunkKey)) as Record<string, unknown> | undefined
			if (chunk && delta.id in chunk) {
				delete chunk[delta.id]
				await adapter.set(chunkKey, chunk)
			}
			break
		}

		case 'seg_put': {
			// Idempotent: overwrite segment value
			await adapter.set(delta.segmentKey, delta.data)
			break
		}

		case 'seg_delete': {
			// Idempotent: delete if exists
			await adapter.delete(delta.segmentKey)
			break
		}

		case 'catalog_set': {
			// Handled at a higher level by the model recovery
			break
		}

		case 'catalog_delete': {
			// Similar to catalog_set - handled at model level
			break
		}

		case 'unique_acquire': {
			// Idempotent: acquire unique key for this record
			const existing = (await adapter.get(delta.key)) as { id: string } | undefined
			if (!existing) {
				await adapter.set(delta.key, { id: delta.id })
				break
			}
			if (existing.id !== delta.id) {
				throw new Error(
					`Unique constraint conflict during WAL recovery: key "${delta.key}" is owned by "${existing.id}", expected "${delta.id}".`
				)
			}
			break
		}

		case 'unique_release': {
			// Idempotent: delete unique key if owned by this record
			const existing = (await adapter.get(delta.key)) as { id: string } | undefined
			if (existing && existing.id === delta.id) {
				await adapter.delete(delta.key)
			}
			break
		}
	}
}

/**
 * Apply an inverse delta to the adapter.
 *
 * Inverse deltas undo the effect of authoritative deltas.
 */
async function applyInverseDelta(
	adapter: FlashcoreAdapter,
	delta: WalInverseDelta
): Promise<void> {
	// Inverse deltas have the same structure as authoritative deltas
	// but semantically represent the "undo" operation
	await applyAuthoritativeDelta(adapter, delta)
}

/**
 * Build a chunk key from chunk ID.
 *
 * Note: This is a simplified version that works for recovery.
 * The actual chunk key includes model name and namespace.
 * For recovery, we need to store the full key in the delta.
 */
function buildChunkKey(chunkId: string): string {
	// The chunkId in deltas should be the full key
	// e.g., "_model:user:chunk:0" not just "0"
	return chunkId
}

// ─────────────────────────────────────────────────────────────
// Catalog Recovery Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Recovery-aware catalog set.
 *
 * During recovery, we need to apply catalog deltas at the raw adapter level.
 * This helper manages the catalog structure.
 */
export async function applyCatalogSetDelta(
	adapter: FlashcoreAdapter,
	catalogKey: string,
	id: string,
	chunkId: number
): Promise<void> {
	const raw = await adapter.get(catalogKey)
	const catalog = normalizeCatalogData(raw)

	const entries = catalog.entries.filter((e) => e.id !== id)
	entries.push({ id, kind: 'chunk', chunkId })
	entries.sort((a, b) => a.id.localeCompare(b.id))

	await adapter.set(catalogKey, buildCatalogData(entries, catalog.version))
}

/**
 * Recovery-aware catalog set for segmented records.
 */
export async function applyCatalogSetSegmentsDelta(
	adapter: FlashcoreAdapter,
	catalogKey: string,
	id: string,
	segmentIds: string[]
): Promise<void> {
	const raw = await adapter.get(catalogKey)
	const catalog = normalizeCatalogData(raw)

	const entries = catalog.entries.filter((e) => e.id !== id)
	entries.push({ id, kind: 'segments', segmentIds })
	entries.sort((a, b) => a.id.localeCompare(b.id))

	await adapter.set(catalogKey, buildCatalogData(entries, catalog.version))
}

/**
 * Recovery-aware catalog delete.
 */
export async function applyCatalogDeleteDelta(
	adapter: FlashcoreAdapter,
	catalogKey: string,
	id: string
): Promise<void> {
	const raw = await adapter.get(catalogKey)
	const catalog = normalizeCatalogData(raw)

	const nextEntries = catalog.entries.filter((e) => e.id !== id)
	if (nextEntries.length === catalog.entries.length) {
		return
	}

	await adapter.set(catalogKey, buildCatalogData(nextEntries, catalog.version))
}

function normalizeCatalogData(raw: unknown): CatalogData {
	if (!raw || typeof raw !== 'object') {
		return buildCatalogData([], 2)
	}

	const candidate = raw as Partial<CatalogData>
	const version = typeof candidate.version === 'number' ? candidate.version : 2

	const entries: CatalogData['entries'] = Array.isArray(candidate.entries)
		? candidate.entries.filter((e): e is CatalogData['entries'][number] => {
			if (!e || typeof e !== 'object') return false
			const entry = e as { id?: unknown; kind?: unknown; chunkId?: unknown; segmentIds?: unknown }
			if (typeof entry.id !== 'string') return false
			if (entry.kind === 'chunk') return typeof entry.chunkId === 'number'
			if (entry.kind === 'segments') return Array.isArray(entry.segmentIds)
			return false
		})
		: []

	return buildCatalogData(entries, version)
}

function buildCatalogData(entries: CatalogData['entries'], version: number): CatalogData {
	const counts = new Map<number, number>()
	let segmentedCount = 0

	for (const entry of entries) {
		if (entry.kind === 'chunk' && typeof entry.chunkId === 'number') {
			counts.set(entry.chunkId, (counts.get(entry.chunkId) ?? 0) + 1)
		} else if (entry.kind === 'segments') {
			segmentedCount++
		}
	}

	const chunkStats: CatalogData['chunkStats'] = Array.from(counts.entries())
		.map(([chunkId, count]) => ({ chunkId, count }))
		.sort((a, b) => a.chunkId - b.chunkId)

	return {
		version,
		entries,
		chunkStats,
		count: entries.length,
		segmentedCount: segmentedCount > 0 ? segmentedCount : undefined
	}
}

// ─────────────────────────────────────────────────────────────
// Recovery Context (for advanced recovery with model awareness)
// ─────────────────────────────────────────────────────────────

/**
 * Replay a WAL entry with full model context.
 *
 * This version can properly update catalogs because it knows the model structure.
 */
export async function replayEntryWithContext(
	ctx: import('robo.js/flashcore').RecoveryContext,
	entry: WALEntry
): Promise<void> {
	const catalogKey = ctx.getCatalogKey(entry.namespace, entry.model)

	for (const delta of entry.auth) {
		switch (delta.t) {
			case 'catalog_set':
				await applyCatalogSetDelta(ctx.adapter, catalogKey, delta.id, delta.chunkId)
				break

			case 'catalog_set_segments':
				await applyCatalogSetSegmentsDelta(ctx.adapter, catalogKey, delta.id, delta.segmentIds)
				break

			case 'catalog_delete':
				await applyCatalogDeleteDelta(ctx.adapter, catalogKey, delta.id)
				break

			default:
				// Other deltas work directly on their stored keys
				await applyAuthoritativeDelta(ctx.adapter, delta)
		}
	}
}

/**
 * Rollback a WAL entry with full model context.
 */
export async function rollbackEntryWithContext(
	ctx: import('robo.js/flashcore').RecoveryContext,
	entry: WALEntry
): Promise<void> {
	const catalogKey = ctx.getCatalogKey(entry.namespace, entry.model)

	// Apply in reverse order
	for (let i = entry.undo.length - 1; i >= 0; i--) {
		const delta = entry.undo[i]

		switch (delta.t) {
			case 'catalog_set':
				await applyCatalogSetDelta(ctx.adapter, catalogKey, delta.id, delta.chunkId)
				break

			case 'catalog_set_segments':
				await applyCatalogSetSegmentsDelta(ctx.adapter, catalogKey, delta.id, delta.segmentIds)
				break

			case 'catalog_delete':
				await applyCatalogDeleteDelta(ctx.adapter, catalogKey, delta.id)
				break

			default:
				await applyInverseDelta(ctx.adapter, delta)
		}
	}
}
