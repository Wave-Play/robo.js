/**
 * Route definition for tRPC handlers.
 * Directory inferred from filename: /src/trpc/
 *
 * Declares src/trpc/ as a handler directory so the build system indexes it
 * and HMR can detect changes. Actual request handling stays on the
 * api/trpc/[trpc].ts catch-all route.
 */
import type { RouteConfig, ScannedEntry, ProcessedEntry } from 'robo.js'

/**
 * Route configuration - how to scan and process files.
 */
export const config: RouteConfig = {
	key: {
		style: 'filename',
		separator: '/'
	},
	nesting: {
		maxDepth: 1,
		allowIndex: false
	},
	exports: {
		default: 'optional',
		config: 'optional'
	},
	description: 'tRPC router handlers'
}

/**
 * Process each scanned tRPC entry.
 */
export default function (entry: ScannedEntry): ProcessedEntry {
	return {
		key: entry.key,
		path: entry.filePath.replace(/\.ts$/, '.js'),
		exports: {
			default: 'default' in entry.exports,
			config: 'config' in entry.exports,
			named: Object.keys(entry.exports).filter((k) => !['default', 'config'].includes(k))
		},
		metadata: {}
	}
}
