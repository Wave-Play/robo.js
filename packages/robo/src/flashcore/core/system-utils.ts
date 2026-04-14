/**
 * Shared system utilities for Flashcore v1.
 */

import type { FlashcoreAdapter } from '../adapter/types.js'
import { FlashcoreError } from './errors.js'

/**
 * Assert that Flashcore is initialized.
 * Used by system methods that require an active adapter.
 *
 * @throws FlashcoreError with NOT_INITIALIZED code if not initialized
 */
export function ensureInitialized(initialized: boolean, adapter: FlashcoreAdapter | null): asserts adapter is FlashcoreAdapter {
	if (!initialized || !adapter) {
		throw new FlashcoreError(
			'Flashcore not initialized. Call Flashcore.$.init() first.',
			'NOT_INITIALIZED'
		)
	}
}
