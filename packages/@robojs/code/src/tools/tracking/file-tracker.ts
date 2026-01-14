/**
 * File read tracking for stale detection and content eviction
 *
 * Tracks file state (mtime, size) when files are read to detect
 * when files have changed before writes occur. This prevents the
 * LLM from writing outdated content to modified files.
 *
 * Also tracks turn numbers for recency-based content eviction,
 * allowing old file contents to be summarized during compaction.
 */

/**
 * Snapshot of file state at read time
 */
export interface FileReadSnapshot {
	/**
	 * Path to the file
	 */
	path: string

	/**
	 * Modification time in milliseconds (null if file didn't exist)
	 */
	mtimeMs: number | null

	/**
	 * File size in bytes (null if file didn't exist)
	 */
	size: number | null

	/**
	 * Timestamp when the read occurred
	 */
	readAt: number

	/**
	 * Whether the file existed at read time
	 */
	exists: boolean

	/**
	 * Turn number when this file was read.
	 * Used for recency-based content eviction.
	 */
	turnNumber?: number

	/**
	 * Size of content stored in context messages.
	 * May differ from file size if truncated.
	 */
	contentSizeInMessage?: number
}

/**
 * Reason why a file is considered stale
 */
export type StaleReason = 'mtime_changed' | 'size_changed' | 'file_created' | 'file_deleted'

/**
 * Result of a stale check
 */
export interface StaleCheckResult {
	/**
	 * Whether the file is stale (changed since last read)
	 */
	isStale: boolean

	/**
	 * Reason for staleness (only present if isStale is true)
	 */
	reason?: StaleReason

	/**
	 * The snapshot from the last read
	 */
	lastRead?: FileReadSnapshot

	/**
	 * Current state of the file
	 */
	currentState?: {
		mtimeMs: number | null
		size: number | null
		exists: boolean
	}
}

/**
 * Current file state for comparison
 */
export interface CurrentFileState {
	/**
	 * Modification time in milliseconds (undefined if not available)
	 */
	mtimeMs?: number

	/**
	 * File size in bytes
	 */
	size: number

	/**
	 * Whether the file exists
	 */
	exists: boolean
}

/**
 * Tracks file state from read operations to detect staleness on write
 * and manage content recency for eviction.
 *
 * Usage:
 * ```typescript
 * const tracker = new FileReadTracker()
 *
 * // Increment turn at start of each agent cycle
 * tracker.incrementTurn()
 *
 * // Record when a file is read
 * tracker.record({
 *   path: '/src/app.ts',
 *   mtimeMs: 1234567890,
 *   size: 1000,
 *   readAt: Date.now(),
 *   exists: true,
 *   turnNumber: tracker.getTurn()
 * })
 *
 * // Check if file is still "active" (recently read)
 * if (!tracker.isActive('/src/app.ts', 5)) {
 *   // File content can be summarized - not accessed in last 5 turns
 * }
 *
 * // Check before writing
 * if (tracker.hasRead('/src/app.ts')) {
 *   const snapshot = tracker.get('/src/app.ts')!
 *   const result = checkStaleness(snapshot, currentState)
 *   if (result.isStale) {
 *     // Handle stale file
 *   }
 * }
 * ```
 */
export class FileReadTracker {
	private snapshots = new Map<string, FileReadSnapshot>()
	private currentTurn = 0

	/**
	 * Increment the turn counter.
	 * Call this at the start of each agent→tools cycle.
	 *
	 * @returns The new turn number
	 */
	incrementTurn(): number {
		return ++this.currentTurn
	}

	/**
	 * Get the current turn number.
	 */
	getTurn(): number {
		return this.currentTurn
	}

	/**
	 * Set the turn number (for restoring state).
	 */
	setTurn(turn: number): void {
		this.currentTurn = turn
	}

	/**
	 * Record a file read snapshot.
	 *
	 * If a snapshot already exists for this path, it will be overwritten.
	 * Automatically sets turnNumber to current turn if not provided.
	 */
	record(snapshot: FileReadSnapshot): void {
		// Auto-set turn number if not provided
		const snapshotWithTurn: FileReadSnapshot = {
			...snapshot,
			turnNumber: snapshot.turnNumber ?? this.currentTurn
		}
		this.snapshots.set(snapshot.path, snapshotWithTurn)
	}

	/**
	 * Get the last read snapshot for a path.
	 *
	 * @returns The snapshot, or undefined if the path was never read
	 */
	get(path: string): FileReadSnapshot | undefined {
		return this.snapshots.get(path)
	}

	/**
	 * Check if a file has been read (has a snapshot).
	 */
	hasRead(path: string): boolean {
		return this.snapshots.has(path)
	}

	/**
	 * Check if a file is "active" (recently accessed).
	 *
	 * A file is active if it was read within the last N turns.
	 * Active files should keep their full content in context.
	 * Inactive files can have their content summarized during compaction.
	 *
	 * @param path - File path to check
	 * @param recencyThreshold - Number of turns to consider "recent" (default: 5)
	 * @returns true if the file is active (recently accessed)
	 */
	isActive(path: string, recencyThreshold: number = 5): boolean {
		const snapshot = this.snapshots.get(path)
		if (!snapshot || snapshot.turnNumber === undefined) {
			return false
		}
		return this.currentTurn - snapshot.turnNumber <= recencyThreshold
	}

	/**
	 * Get all files that are no longer active (can be evicted/summarized).
	 *
	 * @param recencyThreshold - Number of turns to consider "recent"
	 * @returns Array of snapshots for inactive files
	 */
	getInactiveFiles(recencyThreshold: number = 5): FileReadSnapshot[] {
		const inactive: FileReadSnapshot[] = []
		for (const snapshot of this.snapshots.values()) {
			if (snapshot.turnNumber !== undefined) {
				if (this.currentTurn - snapshot.turnNumber > recencyThreshold) {
					inactive.push(snapshot)
				}
			}
		}
		return inactive
	}

	/**
	 * Get all files that are still active.
	 *
	 * @param recencyThreshold - Number of turns to consider "recent"
	 * @returns Array of snapshots for active files
	 */
	getActiveFiles(recencyThreshold: number = 5): FileReadSnapshot[] {
		const active: FileReadSnapshot[] = []
		for (const snapshot of this.snapshots.values()) {
			if (snapshot.turnNumber !== undefined) {
				if (this.currentTurn - snapshot.turnNumber <= recencyThreshold) {
					active.push(snapshot)
				}
			}
		}
		return active
	}

	/**
	 * Clear tracking for a specific path.
	 *
	 * Call this after a successful write to reset the baseline.
	 */
	clear(path: string): void {
		this.snapshots.delete(path)
	}

	/**
	 * Clear all tracking data.
	 */
	clearAll(): void {
		this.snapshots.clear()
		this.currentTurn = 0
	}

	/**
	 * Get the number of tracked files.
	 */
	get size(): number {
		return this.snapshots.size
	}

	/**
	 * Get all tracked paths.
	 */
	getPaths(): string[] {
		return Array.from(this.snapshots.keys())
	}

	/**
	 * Get all tracked snapshots.
	 */
	getAll(): FileReadSnapshot[] {
		return Array.from(this.snapshots.values())
	}
}

/**
 * Compare a read snapshot against current file state to detect staleness
 *
 * @param snapshot - The snapshot from when the file was last read
 * @param current - The current state of the file
 * @returns Result indicating if the file is stale and why
 */
export function checkStaleness(snapshot: FileReadSnapshot, current: CurrentFileState): StaleCheckResult {
	// Case 1: File didn't exist when read, but now exists (externally created)
	if (!snapshot.exists && current.exists) {
		return {
			isStale: true,
			reason: 'file_created',
			lastRead: snapshot,
			currentState: {
				mtimeMs: current.mtimeMs ?? null,
				size: current.size,
				exists: true
			}
		}
	}

	// Case 2: File existed when read, but now doesn't (externally deleted)
	if (snapshot.exists && !current.exists) {
		return {
			isStale: true,
			reason: 'file_deleted',
			lastRead: snapshot,
			currentState: {
				mtimeMs: null,
				size: null,
				exists: false
			}
		}
	}

	// Case 3: Both didn't exist - not stale (still doesn't exist)
	if (!snapshot.exists && !current.exists) {
		return { isStale: false }
	}

	// Case 4: Both exist - check mtime and size
	// Check mtime first (primary indicator of modification)
	if (snapshot.mtimeMs !== null && current.mtimeMs !== undefined) {
		if (current.mtimeMs > snapshot.mtimeMs) {
			return {
				isStale: true,
				reason: 'mtime_changed',
				lastRead: snapshot,
				currentState: {
					mtimeMs: current.mtimeMs,
					size: current.size,
					exists: true
				}
			}
		}
	}

	// Check size (secondary indicator - catches edge cases where mtime is same)
	if (snapshot.size !== null && snapshot.size !== current.size) {
		return {
			isStale: true,
			reason: 'size_changed',
			lastRead: snapshot,
			currentState: {
				mtimeMs: current.mtimeMs ?? null,
				size: current.size,
				exists: true
			}
		}
	}

	// File is unchanged
	return { isStale: false }
}
