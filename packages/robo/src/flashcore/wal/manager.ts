/**
 * Flashcore v1 (spec rev 4.3) WAL Manager — Global Singleton Shim
 *
 * The WriteAheadLog implementation has moved to @robojs/flashcore-extras.
 * This file provides only the global singleton accessors used by CRUD files
 * and system.ts.
 */

import type { WalManager } from './types.js'

// ─────────────────────────────────────────────────────────────
// Global WAL Manager Instance
// ─────────────────────────────────────────────────────────────

let globalWalManager: WalManager | null = null
let walPendingEntriesCount = 0

/**
 * Set the global WAL manager instance.
 * Called during Flashcore.$.init().
 */
export function setWALManager(manager: WalManager | null): void {
	globalWalManager = manager
}

/**
 * Get the global WAL manager instance.
 * Returns null if WAL is not initialized or disabled.
 */
export function getWALManager(): WalManager | null {
	return globalWalManager
}

/**
 * Check if WAL is globally enabled.
 */
export function isWALEnabled(): boolean {
	return globalWalManager?.isEnabled() ?? false
}

export function getWalPendingEntriesCount(): number {
	return walPendingEntriesCount
}

export function setWalPendingEntriesCount(count: number): void {
	walPendingEntriesCount = Math.max(0, count)
}
