/**
 * Shared session resolution for terminal commands.
 *
 * Resolves which session to operate on:
 * 1. Explicitly selected session (via /mock use)
 * 2. Dev mode session (default)
 * 3. null if neither exists
 */
import { getMockModeSession } from '../start.js'
import { sessionManager } from '../../core/manager.js'
import type { Session } from '../../types/index.js'

/**
 * Module-level state for the "selected" session.
 * null = use the dev session (default behavior).
 */
let _selectedSessionId: string | null = null

/**
 * Returns the currently selected session ID, or null if using the dev session.
 */
export function getSelectedSessionId(): string | null {
	return _selectedSessionId
}

/**
 * Sets the selected session ID. Pass null to revert to the dev session.
 */
export function setSelectedSessionId(id: string | null): void {
	_selectedSessionId = id
}

/**
 * Resolves the session to use for terminal commands.
 *
 * Priority:
 * 1. Explicitly selected session (if still valid)
 * 2. Dev mode session
 * 3. null
 */
export function resolveTargetSession(): Session | null {
	// If an explicit selection exists, try to look it up
	if (_selectedSessionId) {
		const selected = sessionManager.get(_selectedSessionId)
		if (selected) {
			return selected
		}

		// Session expired or was deleted — clear stale selection
		_selectedSessionId = null
	}

	// Fall back to the dev mode session
	return getMockModeSession()
}
