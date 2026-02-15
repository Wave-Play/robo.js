/**
 * Activity module for @robojs/mock.
 */

// Schema types
export type { RpcManifest, RpcCommandDefinition, RpcEventDefinition } from './schema/manifest-types.js'

// Schema extraction
export { extractManifest, ExtractorError } from './schema/extractor.js'
export type { ExtractorErrorCode } from './schema/extractor.js'

// Manifest loader
export { loadManifest, getManifest, isManifestLoaded, getCommandMap, getEventMap } from './schema/manifest-loader.js'

// Host manager (Phase 2)
export {
	ActivityHostManager,
	getActivityHostManager,
	resetActivityHostManager
} from './host/activity-host-manager.js'
export type { LaunchActivityOptions, HandleInboundResult } from './host/activity-host-manager.js'

// Session record
export type { ActivitySessionRecord, ActivityAuthState } from './host/activity-session-record.js'
export { createActivitySessionRecord } from './host/activity-session-record.js'

// Subscription registry
export { SubscriptionRegistry } from './host/subscription-registry.js'

// RPC envelope
export {
	parseInboundEnvelope,
	buildCommandResponse,
	buildErrorResponse,
	buildEventDispatch,
	RpcValidationError
} from './host/rpc-envelope.js'
export type { InboundRpcMessage } from './host/rpc-envelope.js'

// Error codes
export { RpcErrorCode } from './host/error-codes.js'
