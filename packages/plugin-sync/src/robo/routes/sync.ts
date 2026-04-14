/**
 * Route definition for sync handlers.
 * Directory inferred from filename: /src/sync/
 *
 * Sync handlers provide server-side validation, transformation, and RPC
 * capabilities for @robojs/sync state management.
 */
import { Manifest } from 'robo.js'
import type { RouteConfig, ScannedEntry, ProcessedEntry, PortalAPI, HandlerRecord } from 'robo.js'
import {
	registerHandler,
	registerMiddleware,
	unregisterHandlerByPortalKey,
	unregisterMiddlewareByPortalKey
} from '../../server/handlers.js'
import { syncLogger } from '../../core/logger.js'
import type {
	SyncHandlerModule,
	SyncHandlerRecord,
	SyncMiddlewareModule,
	SyncMiddlewareRecord
} from '../../server/types.js'

/**
 * Reserved export names that are not RPC methods.
 */
const RESERVED_EXPORTS = ['schema', 'validate', 'transform', 'onUpdate', 'before', 'after', 'default', 'config']

/**
 * Sync handler module type.
 */
export type Handler = SyncHandlerModule

/**
 * Controller for sync handler access.
 */
export interface SyncController {
	key: string
	getHandler: () => SyncHandlerModule | null
}

/**
 * Controller factory for runtime (per-handler).
 */
export function controller(key: string, record: HandlerRecord, _pluginState: unknown): SyncController {
	return {
		key,
		getHandler() {
			return record.handler as SyncHandlerModule | null
		}
	}
}

/**
 * Namespace controller for portal.sync.syncs.
 */
export interface SyncNamespaceController {
	get(key: string): Promise<SyncHandlerModule | null>
	list(): string[]
}

/**
 * Namespace controller factory for portal access.
 */
export const NamespaceController = (portal: PortalAPI): SyncNamespaceController => ({
	async get(key: string): Promise<SyncHandlerModule | null> {
		try {
			const handler = await portal.getHandler('sync', 'sync', key)
			return handler as SyncHandlerModule | null
		} catch {
			return null
		}
	},

	list(): string[] {
		return Manifest.routeSummariesSync('sync', 'sync').map((summary) => summary.key)
	}
})

/**
 * Initialize sync handlers from loaded manifest entries.
 * Called during plugin startup.
 */
export async function initializeSyncHandlers(_portal: PortalAPI): Promise<void> {
	const summaries = await Manifest.routeSummaries('sync', 'sync')

	for (const summary of summaries) {
		registerSummary(summary)
	}
}

export async function refreshSyncHandlersFromPortal(portal: PortalAPI, keys: string[]): Promise<void> {
	await portal.ensureRoute('sync', 'sync')

	const records = portal.getByType('sync:sync') as Record<string, HandlerRecord | HandlerRecord[]>
	const uniqueKeys = [...new Set(keys)]

	for (const key of uniqueKeys) {
		const recordOrArray = records[key]

		if (!recordOrArray) {
			unregisterHandlerByPortalKey(key)
			unregisterMiddlewareByPortalKey(key)
			continue
		}

		const record = Array.isArray(recordOrArray) ? recordOrArray[0] : recordOrArray
		let module = null

		try {
			module = (await portal.getHandler('sync', 'sync', key)) as SyncHandlerModule | SyncMiddlewareModule | null
		} catch (error) {
			syncLogger.debug(`[HMR] Failed to import sync route ${key}:`, error)
			continue
		}

		registerLiveRecord(key, record, module)
	}
}

function extractParamsFromKey(key: string): string[] | undefined {
	const params = Array.from(key.matchAll(/\[([^[.\]/]+)\]/g), (match) => match[1])
	return params.length > 0 ? params : undefined
}

function isMiddlewareKey(key: string): boolean {
	return key.endsWith('/middleware') || key === 'middleware' ||
		key.endsWith('/_middleware') || key === '_middleware'
}

function middlewareDirectory(key: string): string {
	return key.replace(/\/(middleware|_middleware)$/, '').replace(/^(middleware|_middleware)$/, '') || ''
}

function registerSummary(summary: {
	key: string
	path: string
	exports: { named?: string[] }
}): void {
	const key = summary.key

	if (isMiddlewareKey(key)) {
		const middlewareRecord: SyncMiddlewareRecord = {
			path: middlewareDirectory(key),
			exports: {
				before: summary.exports.named?.includes('before'),
				after: summary.exports.named?.includes('after')
			},
			portalKey: key
		}
		registerMiddleware(middlewareRecord)
		return
	}

	const handlerRecord: SyncHandlerRecord = {
		key,
		path: summary.path,
		exports: {
			schema: summary.exports.named?.includes('schema'),
			validate: summary.exports.named?.includes('validate'),
			transform: summary.exports.named?.includes('transform'),
			onUpdate: summary.exports.named?.includes('onUpdate'),
			named: (summary.exports.named || []).filter((entry) => !RESERVED_EXPORTS.includes(entry))
		},
		params: extractParamsFromKey(key),
		portalKey: key
	}
	registerHandler(handlerRecord)
}

function registerLiveRecord(
	key: string,
	record: HandlerRecord,
	module: SyncHandlerModule | SyncMiddlewareModule | null
): void {
	if (isMiddlewareKey(key)) {
		const middlewareModule = module as SyncMiddlewareModule | null
		registerMiddleware({
			path: middlewareDirectory(key),
			exports: {
				before: typeof middlewareModule?.before === 'function' || record.exports.named.includes('before'),
				after: typeof middlewareModule?.after === 'function' || record.exports.named.includes('after')
			},
			handler: middlewareModule ?? undefined,
			portalKey: key
		})
		return
	}

	const handlerModule = module as SyncHandlerModule | null
	const namedExports = Object.keys(handlerModule ?? {}).filter((exportName) =>
		!['default', 'config', 'module'].includes(exportName)
	)

	registerHandler({
		key,
		path: record.path,
		exports: {
			schema: 'schema' in (handlerModule ?? {}) || record.exports.named.includes('schema'),
			validate: typeof handlerModule?.validate === 'function' || record.exports.named.includes('validate'),
			transform: typeof handlerModule?.transform === 'function' || record.exports.named.includes('transform'),
			onUpdate: typeof handlerModule?.onUpdate === 'function' || record.exports.named.includes('onUpdate'),
			named: (namedExports.length > 0 ? namedExports : record.exports.named).filter(
				(entry) => !RESERVED_EXPORTS.includes(entry)
			)
		},
		params: extractParamsFromKey(key),
		handler: handlerModule ?? undefined,
		portalKey: key
	})
}

/**
 * Route configuration - how to scan and process files.
 */
export const config: RouteConfig = {
	key: {
		style: 'filepath',
		separator: '/' // game/[roomId]/position.ts → "game/[roomId]/position"
	},
	nesting: {
		maxDepth: 10,
		allowIndex: true, // index.ts → ""
		dynamicSegment: /\[([^\]]+)\]/, // [param] → :param
		catchAllSegment: /\[\.\.\.\w+\]/, // [...path] → *
		optionalCatchAll: /\[\[\.\.\.(\w+)\]\]/ // [[...path]] → *?
	},
	exports: {
		// All exports we care about
		named: ['schema', 'validate', 'transform', 'onUpdate', 'before', 'after'],
		default: 'optional',
		config: 'optional'
	},
	description: 'Sync state handlers'
}

/**
 * Process each scanned sync handler entry.
 */
export default function (entry: ScannedEntry): ProcessedEntry {
	// Detect if this is a middleware file (supports both 'middleware' and '_middleware' naming)
	const isMiddleware = entry.key.endsWith('/middleware') || entry.key === 'middleware' ||
	                     entry.key.endsWith('/_middleware') || entry.key === '_middleware'

	// Get all exports (including RPC methods which are any function exports)
	const allExports = Object.keys(entry.exports).filter((k) => k !== 'default' && k !== 'config')

	// Separate reserved from RPC exports
	const reservedExports = allExports.filter((e) => RESERVED_EXPORTS.includes(e))
	const rpcExports = allExports.filter((e) => !RESERVED_EXPORTS.includes(e))

	return {
		key: entry.key,
		path: entry.filePath.replace(/\.ts$/, '.js'),
		exports: {
			default: 'default' in entry.exports,
			config: 'config' in entry.exports,
			named: [...reservedExports, ...rpcExports]
		},
		metadata: {
			isMiddleware,
			reservedExports,
			rpcExports
		},
		extra: entry.dynamicSegments
			? {
					params: entry.dynamicSegments.params,
					...(entry.dynamicSegments.catchAll && { catchAll: entry.dynamicSegments.catchAll })
				}
			: undefined
	}
}
