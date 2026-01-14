/**
 * Provider exports for @robojs/code SDK
 *
 * ExecutionProvider implementations:
 * - WebContainerProvider: Primary, browser-based (requires @webcontainer/api)
 * - NodeProvider: Node.js-only, import from '@robojs/code/providers/node'
 *
 * Service Discovery:
 * - WebContainerServiceDiscovery: URL discovery for WebContainer services
 *
 * Note: NodeProvider is NOT exported here to keep this module browser-compatible.
 * For Node.js environments, import directly:
 *   import { NodeProvider } from '@robojs/code/providers/node'
 */

// WebContainer provider (works in browser with @webcontainer/api)
export {
	WebContainerProvider,
	type WebContainerProviderConfig,
	WebContainerServiceDiscovery,
	type WebContainerServiceDiscoveryConfig,
	type ServiceConfig
} from './webcontainer/index.js'

// Shared utilities
export {
	normalizePath,
	hasTraversalAttempt,
	validatePath,
	matchesDenyPath,
	validatePathWithPolicy
} from './utils/path.js'
export {
	TerminalBuffer,
	TerminalBufferManager,
	type TruncationEvent,
	type TerminalBufferStats,
	type AggregateBufferStats
} from './utils/buffer.js'
