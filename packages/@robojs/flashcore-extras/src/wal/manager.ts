/**
 * Flashcore v1 (spec rev 4.3) WAL Manager
 *
 * Provides Write-Ahead Logging for crash-safe operations.
 * See spec §9.4 for full specification.
 *
 * Moved from packages/robo/src/flashcore/wal/manager.ts to
 * @robojs/flashcore-extras as an opt-in extension.
 */

import type {
	FlashcoreAdapter,
	WALEntry,
	WALEntryInput,
	WalPhase,
	WALConfig,
	WalAuthoritativeDelta,
	WalInverseDelta,
	WalDerivedDelta,
	WalManager
} from 'robo.js/flashcore'
import {
	WAL_ENTRY_KEY_PREFIX as WAL_ENTRY_PREFIX,
	WAL_SEGMENT_PREFIX,
	WAL_STALE_THRESHOLD_MS,
	WAL_CLOCK_SKEW_TOLERANCE_MS,
	WAL_DEFAULT_SEGMENT_SIZE,
	generateId,
	scanKeysToArray,
	getWalPendingEntriesCount,
	setWalPendingEntriesCount
} from 'robo.js/flashcore'

/**
 * Serialized WAL entry structure (stored in adapter).
 */
interface SerializedWALEntry {
	id: string
	timestamp: number
	namespace?: string
	model: string
	op: string
	phase: string
	segmented?: { parts: number; partSize: number }
	// Only present if not segmented
	auth?: WalAuthoritativeDelta[]
	undo?: WalInverseDelta[]
	derived?: WalDerivedDelta[]
}

/**
 * Segment data structure (stored in adapter).
 */
interface SegmentData {
	auth: WalAuthoritativeDelta[]
	undo: WalInverseDelta[]
	derived: WalDerivedDelta[]
}

/**
 * Write-Ahead Log manager.
 *
 * Handles WAL entry creation, phase tracking, and cleanup.
 * WAL is only enabled when the adapter supports scan.
 */
export class WriteAheadLog implements WalManager {
	private readonly adapter: FlashcoreAdapter
	private readonly config: Required<WALConfig>

	constructor(adapter: FlashcoreAdapter, config?: WALConfig) {
		this.adapter = adapter
		this.config = {
			staleThresholdMs: config?.staleThresholdMs ?? WAL_STALE_THRESHOLD_MS,
			clockSkewToleranceMs: config?.clockSkewToleranceMs ?? WAL_CLOCK_SKEW_TOLERANCE_MS,
			maxEntrySize: config?.maxEntrySize ?? this.computeMaxEntrySize()
		}
	}

	/**
	 * Check if WAL is enabled for this adapter.
	 * WAL requires scan capability.
	 */
	isEnabled(): boolean {
		return typeof this.adapter.scan === 'function'
	}

	/**
	 * Compute max entry size based on adapter capabilities.
	 */
	private computeMaxEntrySize(): number {
		const adapterMax = this.adapter.maxValueSize
		if (adapterMax !== undefined) {
			// Use 80% of adapter limit to leave room for overhead
			return Math.floor(adapterMax * 0.8)
		}
		return WAL_DEFAULT_SEGMENT_SIZE
	}

	/**
	 * Get the key for a WAL entry.
	 */
	private entryKey(walId: string): string {
		return `${WAL_ENTRY_PREFIX}${walId}`
	}

	/**
	 * Get the key for a WAL segment.
	 */
	private segmentKey(walId: string, index: number): string {
		return `${WAL_SEGMENT_PREFIX}${walId}:${index}`
	}

	/**
	 * Begin a new WAL entry.
	 *
	 * Creates a new entry with phase='pending' and persists it.
	 *
	 * @param input - Entry input (without id, timestamp, phase)
	 * @returns WAL entry ID
	 * @throws Error if WAL is disabled
	 */
	async begin(input: WALEntryInput): Promise<string> {
		if (!this.isEnabled()) {
			throw new Error('WAL is disabled (adapter lacks scan capability)')
		}

		const walId = generateId()
		const entry: WALEntry = {
			...input,
			id: walId,
			timestamp: Date.now(),
			phase: 'pending'
		}

		await this.writeEntry(entry)
		setWalPendingEntriesCount(getWalPendingEntriesCount() + 1)
		return walId
	}

	/**
	 * Mark a WAL entry as having reached a phase.
	 *
	 * @param walId - WAL entry ID
	 * @param phase - New phase
	 */
	async markPhase(walId: string, phase: WalPhase): Promise<void> {
		const entry = await this.readEntry(walId)
		if (!entry) {
			// Entry was already cleaned up or doesn't exist
			return
		}

		entry.phase = phase
		await this.writeEntry(entry)
	}

	/**
	 * Mark a WAL entry as complete and delete it.
	 *
	 * @param walId - WAL entry ID
	 */
	async complete(walId: string): Promise<void> {
		// Mark as complete first (for crash safety)
		await this.markPhase(walId, 'complete')
		// Then delete the entry
		await this.deleteEntry(walId)
	}

	/**
	 * Read a WAL entry by ID.
	 *
	 * Handles both inline and segmented entries.
	 *
	 * @param walId - WAL entry ID
	 * @returns Entry or null if not found
	 */
	async readEntry(walId: string): Promise<WALEntry | null> {
		const key = this.entryKey(walId)
		const raw = await this.adapter.get(key)

		if (raw === undefined) {
			return null
		}

		const stored = raw as SerializedWALEntry

		// If entry is segmented, load segments
		if (stored.segmented) {
			const { auth, undo, derived } = await this.readSegments(walId, stored.segmented.parts)
			return {
				id: stored.id,
				timestamp: stored.timestamp,
				namespace: stored.namespace,
				model: stored.model,
				op: stored.op as WALEntry['op'],
				phase: stored.phase as WalPhase,
				auth,
				undo,
				derived,
				segmented: stored.segmented
			}
		}

		// Inline entry
		return {
			id: stored.id,
			timestamp: stored.timestamp,
			namespace: stored.namespace,
			model: stored.model,
			op: stored.op as WALEntry['op'],
			phase: stored.phase as WalPhase,
			auth: stored.auth ?? [],
			undo: stored.undo ?? [],
			derived: stored.derived ?? []
		}
	}

	/**
	 * Write a WAL entry.
	 *
	 * Handles segmentation for large entries.
	 */
	async writeEntry(entry: WALEntry): Promise<void> {
		// Serialize deltas to check size
		const deltasJson = JSON.stringify({
			auth: entry.auth,
			undo: entry.undo,
			derived: entry.derived
		})

		const needsSegmentation = utf8ByteLength(deltasJson) > this.config.maxEntrySize

		if (needsSegmentation) {
			await this.writeSegmentedEntry(entry, deltasJson)
		} else {
			await this.writeInlineEntry(entry)
		}
	}

	/**
	 * Write an inline (non-segmented) entry.
	 */
	private async writeInlineEntry(entry: WALEntry): Promise<void> {
		const key = this.entryKey(entry.id)
		const stored: SerializedWALEntry = {
			id: entry.id,
			timestamp: entry.timestamp,
			namespace: entry.namespace,
			model: entry.model,
			op: entry.op,
			phase: entry.phase,
			auth: entry.auth,
			undo: entry.undo,
			derived: entry.derived
		}
		await this.adapter.set(key, stored)
	}

	/**
	 * Write a segmented entry (deltas spread across multiple keys).
	 */
	private async writeSegmentedEntry(entry: WALEntry, deltasJson: string): Promise<void> {
		const partSize = this.config.maxEntrySize
		const segments = splitUtf8ByBytes(deltasJson, partSize)
		const parts = segments.length

		// Write segments first
		for (let i = 0; i < parts; i++) {
			const segmentKey = this.segmentKey(entry.id, i)
			await this.adapter.set(segmentKey, segments[i])
		}

		// Write header (without deltas)
		const key = this.entryKey(entry.id)
		const header: SerializedWALEntry = {
			id: entry.id,
			timestamp: entry.timestamp,
			namespace: entry.namespace,
			model: entry.model,
			op: entry.op,
			phase: entry.phase,
			segmented: { parts, partSize }
		}
		await this.adapter.set(key, header)
	}

	/**
	 * Read segments and reconstruct deltas.
	 */
	private async readSegments(walId: string, parts: number): Promise<SegmentData> {
		const chunks: string[] = []

		for (let i = 0; i < parts; i++) {
			const segmentKey = this.segmentKey(walId, i)
			const raw = await this.adapter.get(segmentKey)
			if (raw !== undefined) {
				chunks.push(raw as string)
			}
		}

		const deltasJson = chunks.join('')
		try {
			const parsed = JSON.parse(deltasJson) as SegmentData
			return {
				auth: parsed.auth ?? [],
				undo: parsed.undo ?? [],
				derived: parsed.derived ?? []
			}
		} catch {
			// Corrupted segments - return empty
			return { auth: [], undo: [], derived: [] }
		}
	}

	/**
	 * Delete a WAL entry and all its segments.
	 */
	async deleteEntry(walId: string): Promise<void> {
		// Read entry to check for segments
		const key = this.entryKey(walId)
		const raw = await this.adapter.get(key)
		const existed = raw !== undefined

		if (raw !== undefined) {
			const stored = raw as SerializedWALEntry

			// Delete segments if segmented
			if (stored.segmented) {
				for (let i = 0; i < stored.segmented.parts; i++) {
					await this.adapter.delete(this.segmentKey(walId, i))
				}
			}
		}

		// Delete main entry
		await this.adapter.delete(key)

		if (existed) {
			const count = getWalPendingEntriesCount()
			if (count > 0) {
				setWalPendingEntriesCount(count - 1)
			}
		}
	}

	/**
	 * Get all WAL entry keys (for recovery).
	 *
	 * @returns Array of WAL entry keys
	 */
	async getAllEntryKeys(): Promise<string[]> {
		return scanKeysToArray(this.adapter, WAL_ENTRY_PREFIX)
	}

	/**
	 * Check if an entry is stale (old pending entry that should be rolled back).
	 */
	isStale(entry: WALEntry): boolean {
		const age = Date.now() - entry.timestamp

		// Handle clock skew - entries from the "future" are not stale
		if (age < -this.config.clockSkewToleranceMs) {
			return false
		}

		return age > this.config.staleThresholdMs
	}

	/**
	 * Determine if an entry should be replayed or rolled back.
	 *
	 * - If phase > 'pending', always replay (authoritative writes started)
	 * - If phase == 'pending' and stale, rollback
	 * - If phase == 'pending' and recent, replay (may have crashed during WAL write)
	 */
	shouldReplay(entry: WALEntry): boolean {
		// Always replay if we've started authoritative writes
		if (entry.phase !== 'pending') {
			return true
		}

		// For pending entries, only rollback if stale
		if (this.isStale(entry)) {
			return false // Rollback
		}

		// Recent pending entry - replay to ensure consistency
		return true
	}

	/**
	 * Get the stale threshold.
	 */
	get staleThresholdMs(): number {
		return this.config.staleThresholdMs
	}

	/**
	 * Get the max entry size.
	 */
	get maxEntrySize(): number {
		return this.config.maxEntrySize
	}
}

// ─────────────────────────────────────────────────────────────
// UTF-8 Utilities
// ─────────────────────────────────────────────────────────────

function utf8ByteLength(str: string): number {
	return new TextEncoder().encode(str).length
}

function splitUtf8ByBytes(str: string, maxBytes: number): string[] {
	const encoder = new TextEncoder()
	const decoder = new TextDecoder('utf-8')

	const bytes = encoder.encode(str)
	const parts: string[] = []
	let offset = 0

	while (offset < bytes.length) {
		let end = Math.min(offset + maxBytes, bytes.length)
		end = adjustUtf8ChunkEnd(bytes, offset, end)

		if (end <= offset) {
			throw new Error('Unable to split WAL payload into valid UTF-8 segments')
		}

		parts.push(decoder.decode(bytes.subarray(offset, end)))
		offset = end
	}

	return parts
}

function adjustUtf8ChunkEnd(bytes: Uint8Array, start: number, end: number): number {
	// If we're already at the end, it's safe.
	if (end >= bytes.length) return bytes.length

	let i = end - 1
	let continuation = 0

	// Count trailing continuation bytes (10xxxxxx).
	while (i >= start && (bytes[i] & 0b11000000) === 0b10000000) {
		continuation++
		i--
	}

	if (i < start) {
		return start
	}

	const lead = bytes[i]
	let seqLen = 1

	if ((lead & 0b10000000) === 0) {
		seqLen = 1
	} else if ((lead & 0b11100000) === 0b11000000) {
		seqLen = 2
	} else if ((lead & 0b11110000) === 0b11100000) {
		seqLen = 3
	} else if ((lead & 0b11111000) === 0b11110000) {
		seqLen = 4
	} else {
		// Invalid lead byte; cut before it.
		return i
	}

	const actualLen = continuation + 1

	// If the final sequence is incomplete, cut before the lead byte.
	if (actualLen < seqLen) {
		return i
	}

	return end
}
