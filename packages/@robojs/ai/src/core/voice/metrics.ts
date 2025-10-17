/**
 * In-memory counters tracking voice session metrics for monitoring and diagnostics.
 */
export interface VoiceMetricsSnapshot {
	/** Current number of active voice sessions. */
	activeSessions: number
	/** Total reconnect attempts to the realtime API. */
	realtimeReconnectAttempts: number
	/** Total transcript segments processed. */
	transcriptSegments: number
	/** Total failed frame append operations. */
	failedFrameAppends: number
}

/** Counter for realtime API reconnection attempts. */
let realtimeReconnectAttempts = 0
/** Counter for processed transcript segments. */
let transcriptSegments = 0
/** Counter for failed frame append operations. */
let failedFrameAppends = 0

/** Increments the realtime reconnect attempt counter. */
export function incrementRealtimeReconnects() {
	realtimeReconnectAttempts += 1
}

/** Increments the transcript segment counter. */
export function incrementTranscriptSegments() {
	transcriptSegments += 1
}

/** Increments the failed frame append counter. */
export function incrementFailedFrameAppends() {
	failedFrameAppends += 1
}

/** Resets all voice metrics counters to zero. */
export function resetVoiceMetrics() {
	realtimeReconnectAttempts = 0
	transcriptSegments = 0
	failedFrameAppends = 0
}

/**
 * Creates a snapshot of current voice metrics including active session count and counters.
 */
export function getVoiceMetricsSnapshot(activeSessions: number): VoiceMetricsSnapshot {
	return {
		activeSessions,
		realtimeReconnectAttempts,
		transcriptSegments,
		failedFrameAppends
	}
}
