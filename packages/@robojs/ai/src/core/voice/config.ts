/**
 * Voice configuration types and helpers for merging base settings with guild-specific overrides.
 */

/**
 * VAD strategy for user speech detection: server-managed VAD or manual endpointing.
 */
export type VoiceEndpointStrategy = 'server-vad' | 'manual'

/**
 * Controls transcript embed behaviour for voice sessions.
 */
export interface VoiceTranscriptConfig {
	/** Whether to publish transcript embeds. */
	enabled: boolean
	/** Optional channel override for transcripts. */
	targetChannelId?: string | null
}

/** Playback configuration for assistant audio rendered in Discord. */
export interface VoicePlaybackConfig {
	/** Target playback sample rate (typically 48 kHz). */
	sampleRate: number
}

/** User audio capture configuration forwarded to the engine. */
export interface VoiceCaptureConfig {
	/** Number of capture channels (mono recommended). */
	channels: number
	/** Sample rate forwarded to the engine. */
	sampleRate: number
	/** Silence duration before treating speech as ended (ms). */
	silenceDurationMs: number
	/** Voice activity detection threshold for client-VAD. */
	vadThreshold: number
}

/** Fully resolved voice configuration applied at runtime. */
export interface VoiceRuntimeConfig {
	/** Whether voice features are enabled. */
	enabled: boolean
	/** Endpointing strategy used for speech detection. */
	endpointing: VoiceEndpointStrategy
	/** Optional model override for voice sessions. */
	model?: string
	/** Assistant playback configuration. */
	playback: VoicePlaybackConfig
	/** Optional TTS voice identifier. */
	playbackVoice: string | null
	/** Transcript configuration. */
	transcript: VoiceTranscriptConfig
	/** User capture configuration. */
	capture: VoiceCaptureConfig
	/** Maximum concurrent voice channels per guild. */
	maxConcurrentChannels: number
}

/** Partial configuration used to override runtime settings per guild. */
export interface VoiceConfigPatch extends Partial<Omit<VoiceRuntimeConfig, 'capture' | 'playback' | 'transcript'>> {
	/** Partial capture overrides. */
	capture?: Partial<VoiceCaptureConfig>
	/** Partial playback overrides. */
	playback?: Partial<VoicePlaybackConfig>
	/** Partial transcript overrides. */
	transcript?: Partial<VoiceTranscriptConfig>
}

/**
 * Returns the default voice configuration with sensible defaults (server-vad, 48 kHz playback,
 * 24 kHz capture, 300 ms silence duration, and two concurrent channels).
 */
export function getDefaultVoiceConfig(): VoiceRuntimeConfig {
	return {
		enabled: true,
		endpointing: 'server-vad',
		playbackVoice: null,
		maxConcurrentChannels: 2,
		playback: {
			sampleRate: 48_000
		},
		transcript: {
			enabled: false,
			targetChannelId: null
		},
		capture: {
			channels: 1,
			sampleRate: 24_000,
			silenceDurationMs: 300,
			vadThreshold: 0.01
		}
	}
}

/**
 * Merges a base voice configuration with an optional patch, performing deep merges of nested
 * objects so undefined fields fall back to base values.
 */
export function mergeVoiceConfig(base: VoiceRuntimeConfig, patch?: VoiceConfigPatch): VoiceRuntimeConfig {
	if (!patch) {
		return { ...base }
	}

	// Deep merge nested objects while spreading top-level properties.
	return {
		...base,
		...patch,
		capture: {
			...base.capture,
			...patch.capture
		},
		playback: {
			...base.playback,
			...patch.playback
		},
		transcript: {
			...base.transcript,
			...patch.transcript
		}
	}
}

/**
 * Merges two configuration patches, combining nested capture/playback/transcript fields while
 * allowing the new patch to override top-level values.
 */
export function mergeVoiceConfigPatch(base: VoiceConfigPatch | undefined, patch: VoiceConfigPatch): VoiceConfigPatch {
	// Deep merge nested patch objects.
	return {
		...(base ?? {}),
		...patch,
		capture: {
			...(base?.capture ?? {}),
			...(patch.capture ?? {})
		},
		playback: {
			...(base?.playback ?? {}),
			...(patch.playback ?? {})
		},
		transcript: {
			...(base?.transcript ?? {}),
			...(patch.transcript ?? {})
		}
	}
}
