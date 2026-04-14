/**
 * Flashcore v1 WAL Context Helper
 *
 * Assembles a WalContext from the global WAL manager singleton
 * and the extension registry's delta builders.
 */

import type { WalContext } from './types.js'
import { getWALManager } from './manager.js'
import { getExtensions } from '../core/extensions.js'

/**
 * Get a WalContext if both the WAL manager and extension are available.
 *
 * Returns undefined when WAL is disabled or @robojs/flashcore-extras
 * is not installed, in which case CRUD operations skip WAL protection.
 */
export function getWalContext(): WalContext | undefined {
	const manager = getWALManager()
	if (!manager) return undefined
	const walExt = getExtensions().wal
	if (!walExt) return undefined
	return { manager, deltas: walExt.deltaBuilders }
}
