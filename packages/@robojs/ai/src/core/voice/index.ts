/**
 * Public API surface for the voice subsystem, re-exporting the manager, configuration helpers,
 * and metrics utilities so plugins can orchestrate voice features without touching internals.
 */
/**
 * Singleton voice manager overseeing session lifecycle across all guilds.
 */
export { voiceManager } from './manager.js'

/**
 * Typed event payload mapping for voice lifecycle events emitted by the manager.
 */
export type { VoiceEventMap } from './manager.js'

/**
 * Voice configuration utilities for deriving effective settings and merging per-guild overrides.
 */
export {
	getDefaultVoiceConfig,
	mergeVoiceConfig,
	mergeVoiceConfigPatch,
	type VoiceConfigPatch,
	type VoiceRuntimeConfig
} from './config.js'

/**
 * Voice metrics helpers tracking session telemetry for dashboards and diagnostics.
 */
export {
	getVoiceMetricsSnapshot,
	incrementFailedFrameAppends,
	incrementRealtimeReconnects,
	incrementTranscriptSegments,
	resetVoiceMetrics,
	type VoiceMetricsSnapshot
} from './metrics.js'
