/**
 * HMR Manifest Utilities
 *
 * Helper functions for incremental manifest updates during HMR.
 * Supports multiple: true routes (like events) where multiple handlers can share a key.
 */

import path from 'node:path'
import type { HandlerSummary, RouteDefinitions } from '../../types/manifest-v1.js'
import type { HmrMapping } from './hmr-mapper.js'

/**
 * Handler entry type for manifest entries.
 * Supports multiple handlers per key (for events with multiple: true).
 */
export interface ManifestEntry {
	id: string
	key: string
	path: string
	source: string
	plugin: string | null
	pluginVersion?: string
	exports?: { default?: boolean; config?: boolean; named?: string[] }
	metadata?: Record<string, unknown>
	module?: string
	auto?: boolean
	extra?: Record<string, unknown>
	parent?: string
	index?: number
}

interface InferredExports {
	default?: boolean
	config?: boolean
	named?: string[]
}

/**
 * Convert an HmrMapping to its build path.
 * Used for matching entries by path instead of key.
 *
 * @param mapping - The HMR mapping to convert
 * @returns The build path (e.g., "events/messageCreate/chat.js")
 */
export function toBuildPath(mapping: HmrMapping): string {
	const relativePath = path
		.relative(mapping.sourceDir, mapping.filePath)
		.replace(/\.(ts|tsx|mts)$/, '.js')
	return path.join(mapping.route, relativePath).replace(/\\/g, '/')
}

/**
 * Reindex manifest entries to assign proper id and index values.
 * For routes with multiple handlers per key, entries get:
 * - id: "{key}:{globalIndex}" format
 * - index: global position in the array
 *
 * For routes with single handler per key:
 * - id: "{key}" format
 * - no index field
 *
 * @param entries - The manifest entries to reindex (modified in place)
 */
export function reindexEntries(entries: ManifestEntry[]): void {
	// Count entries per key to determine if multiple handlers share a key
	const keyCounts = new Map<string, number>()
	for (const entry of entries) {
		keyCounts.set(entry.key, (keyCounts.get(entry.key) ?? 0) + 1)
	}

	// Assign id and index based on whether key has multiple handlers
	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i]
		const count = keyCounts.get(entry.key) ?? 1

		if (count > 1) {
			// Multiple handlers share this key: use indexed id format
			entry.id = `${entry.key}:${i}`
			entry.index = i
		} else {
			// Single handler for this key: simple id format
			entry.id = entry.key
			delete entry.index
		}
	}
}

/**
 * Build lightweight exports metadata for newly-added manifest entries without importing user code.
 */
function inferEntryExports(mapping: HmrMapping, routeDefinitions?: RouteDefinitions): InferredExports {
	const routeDefinition = routeDefinitions?.[mapping.namespace]?.routes?.[mapping.route]
	const exportsConfig = routeDefinition?.exports

	return {
		default: exportsConfig?.default === 'required' ? true : undefined,
		config: exportsConfig?.config === 'required' ? true : undefined,
		named: exportsConfig?.named ?? []
	}
}

/**
 * Convert manifest entries into lightweight route summaries.
 */
export function toHandlerSummaries(entries: ManifestEntry[]): HandlerSummary[] {
	return entries.map((entry) => ({
		key: entry.key,
		path: entry.path,
		exports: {
			default: entry.exports?.default,
			config: entry.exports?.config,
			named: entry.exports?.named ?? []
		},
		metadata: entry.metadata ?? {},
		plugin: entry.plugin,
		pluginVersion: entry.pluginVersion,
		module: entry.module,
		auto: entry.auto,
		extra: entry.extra,
		index: entry.index
	}))
}

/**
 * Apply structural HMR changes to a route manifest without scanning or importing handler modules.
 */
export function applyManifestUpdates(
	entries: ManifestEntry[],
	options: {
		added?: HmrMapping[]
		removed?: HmrMapping[]
		updated?: HmrMapping[]
		routeDefinitions?: RouteDefinitions
	}
): { entries: ManifestEntry[]; summaries: HandlerSummary[] } {
	const added = options.added ?? []
	const removed = options.removed ?? []
	const updated = options.updated ?? []
	const nextEntries: ManifestEntry[] = entries.map((entry) => ({
		...entry,
		exports: entry.exports ? { ...entry.exports, ...(entry.exports.named ? { named: [...entry.exports.named] } : {}) } : undefined,
		metadata: entry.metadata ? { ...entry.metadata } : undefined,
		extra: entry.extra ? { ...entry.extra } : undefined
	}))

	const removedPaths = new Set(removed.map((mapping) => toBuildPath(mapping)))
	const filteredEntries = nextEntries.filter((entry) => !removedPaths.has(entry.path))

	for (const mapping of [...updated, ...added]) {
		const buildPath = toBuildPath(mapping)
		const existing = filteredEntries.find((entry) => entry.path === buildPath)

		if (existing) {
			existing.key = mapping.key
			existing.path = buildPath
			continue
		}

		filteredEntries.push({
			id: '',
			key: mapping.key,
			path: buildPath,
			source: 'project',
			plugin: null,
			exports: inferEntryExports(mapping, options.routeDefinitions),
			metadata: {}
		})
	}

	reindexEntries(filteredEntries)

	return {
		entries: filteredEntries,
		summaries: toHandlerSummaries(filteredEntries)
	}
}
