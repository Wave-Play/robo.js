/**
 * HMR Hook for @robojs/discordjs
 *
 * Automatically re-registers Discord commands when their definitions change
 * during development. This enables instant command updates without restart.
 *
 * Since HMR is opt-in (via `robo dev --hmr`), this hook always runs when
 * HMR is enabled - users who enable HMR want instant updates.
 */
import crypto from 'node:crypto'
import { portal } from 'robo.js'
import { discordLogger } from '../core/logger.js'
import { registerCommandsAtRuntime } from '../core/commands.js'
import type { HmrContext, HmrHookConfig } from 'robo.js'

/**
 * Config export to filter HMR events.
 * Only triggers for discordjs namespace, commands and context routes.
 */
export const config: HmrHookConfig = {
	namespaces: ['discordjs'],
	routes: ['commands', 'context']
}

/**
 * Cache of previous command hashes to detect definition changes.
 * Key format: "{namespace}:{route}:{key}" -> hash
 */
const previousHashes = new Map<string, string>()

/**
 * Compute a hash of command metadata for change detection.
 */
function computeMetadataHash(metadata: Record<string, unknown>): string {
	// Sort keys for deterministic output
	const sorted = JSON.stringify(sortObjectKeys(metadata))
	return crypto.createHash('sha256').update(sorted).digest('hex').slice(0, 16)
}

/**
 * Recursively sorts object keys for deterministic JSON output.
 */
function sortObjectKeys(obj: unknown): unknown {
	if (obj === null || typeof obj !== 'object') {
		return obj
	}
	if (Array.isArray(obj)) {
		return obj.map(sortObjectKeys)
	}
	const sorted: Record<string, unknown> = {}
	for (const key of Object.keys(obj).sort()) {
		sorted[key] = sortObjectKeys((obj as Record<string, unknown>)[key])
	}
	return sorted
}

/**
 * HMR hook - detects command definition changes and re-registers with Discord.
 */
export default async function (context: HmrContext): Promise<void> {
	const changedKeys: string[] = []

	// Check each affected route for definition changes
	for (const route of context.routes) {
		for (const handler of route.handlers) {
			const cacheKey = `${route.namespace}:${route.route}:${handler.key}`

			// Get the current handler record from portal
			const record = portal.getRecord(route.namespace, route.route, handler.key)

			// Handler was removed - still need to re-register so Discord reflects the deletion
			if (!record) {
				if (context.changeType === 'remove') {
					changedKeys.push(handler.key)
					previousHashes.delete(cacheKey)
					discordLogger.debug(`[HMR] Command removed: ${handler.key}`)
				}
				continue
			}

			// Ensure handler is imported
			await portal.importHandler(route.namespace, route.route, handler.key)

			// Get metadata from handler's config export
			const metadata = (record.metadata ?? {}) as Record<string, unknown>
			const currentHash = computeMetadataHash(metadata)
			const previousHash = previousHashes.get(cacheKey)

			// Check if definition changed (not just handler code)
			// On first HMR for this command, previousHash is undefined - treat as change
			// since the user explicitly modified this file
			if (!previousHash || previousHash !== currentHash) {
				changedKeys.push(handler.key)
				discordLogger.debug(`[HMR] Command definition changed: ${handler.key}`)
			}

			// Update cache
			previousHashes.set(cacheKey, currentHash)
		}
	}

	// If no definition changes, nothing to do
	if (changedKeys.length === 0) {
		discordLogger.debug('[HMR] No command definition changes detected')
		return
	}

	// Re-register commands in the background using shared registration logic
	discordLogger.info(`[HMR] Re-registering ${changedKeys.length} changed command(s)...`)
	registerCommandsAtRuntime({
		changedKeys,
		timeout: 10000, // Short timeout for HMR
		force: false // Don't force delete existing commands during HMR
	}).catch((error) => {
		discordLogger.warn('[HMR] Failed to update commands on Discord:', error)
	})
}
