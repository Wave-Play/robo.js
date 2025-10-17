/**
 * Central voice manager orchestrating session lifecycle, configuration resolution, and event
 * emission for every guild voice channel. Provides the coordination layer between Discord state,
 * Flashcore persistence, and the AI engine's voice capabilities.
 */
import { EventEmitter } from 'node:events'
import { logger } from '@/core/logger.js'
import { getEngine } from '@/core/ai.js'
import { _PREFIX } from '@/core/constants.js'
import type { GuildBasedChannel, TextBasedChannel, VoiceBasedChannel, VoiceState } from 'discord.js'
import { VoiceSession } from './session.js'
import { Flashcore } from 'robo.js'
import { TokenLimitError } from '@/core/token-ledger.js'
import {
	getDefaultVoiceConfig,
	mergeVoiceConfig,
	mergeVoiceConfigPatch,
	type VoiceConfigPatch,
	type VoiceRuntimeConfig
} from './config.js'
import type { VoiceTranscriptSegment } from '@/engines/base.js'
import { loadDiscordVoice } from './deps.js'

/**
 * Guard to avoid repeatedly logging engine availability warnings when voice support is missing.
 */
let missingVoiceEngineWarningLogged = false

/**
 * Builds a deterministic session identifier combining guild and channel identifiers.
 */
function buildSessionId(guildId: string, channelId: string): string {
	return `${guildId}:${channelId}`
}

/**
 * Flashcore namespace used to persist per-guild voice configuration patches.
 */
const VOICE_CONFIG_NAMESPACE = _PREFIX + 'voice-config'

/**
 * Mapping of voice lifecycle event names to their typed payloads emitted by {@link VoiceManager}.
 *
 * @property 'session:start' Snapshot when a session starts streaming audio for a channel.
 * @property 'session:stop' Snapshot when a session stops along with an optional reason.
 * @property 'config:change' Effective configuration that changed, optionally scoped to a guild.
 * @property 'transcript:segment' Transcript segment emitted for a session from the AI engine.
 */
export type VoiceEventMap = {
	'session:start': ReturnType<VoiceSession['getStatus']>
	'session:stop': ReturnType<VoiceSession['getStatus']> & { reason?: string }
	'config:change': { guildId?: string; config: VoiceRuntimeConfig }
	'transcript:segment': { session: ReturnType<VoiceSession['getStatus']>; segment: VoiceTranscriptSegment }
}

/**
 * Manages voice session lifecycle across all guilds, resolving configuration overlays, enforcing
 * concurrency limits, and broadcasting lifecycle events for observers.
 *
 * @remarks Guild-specific configuration overrides persist via Flashcore and are merged against the
 * global base configuration. Concurrent session limits are enforced per guild to protect engine
 * quotas.
 */
export class VoiceManager {
	/** Active sessions indexed by the guild/channel session identifier. */
	private readonly sessions = new Map<string, VoiceSession>()
	/** Cached configuration patches set at the guild level. */
	private readonly overridePatches = new Map<string, VoiceConfigPatch>()
	/** Cached resolved configurations combining base config and overrides. */
	private readonly resolvedConfigs = new Map<string, VoiceRuntimeConfig>()
	/** Baseline configuration applied to every guild before overrides. */
	private baseConfig: VoiceRuntimeConfig
	/** Event emitter broadcasting voice lifecycle notifications. */
	private readonly emitter = new EventEmitter()
	/** Deduplication cache preventing repeat limit notifications. */
	private readonly notifiedLimits = new Map<string, string>()

	/**
	 * Creates a new manager with an optional base configuration patch to merge with defaults.
	 */
	public constructor(config?: VoiceConfigPatch) {
		this.baseConfig = mergeVoiceConfig(getDefaultVoiceConfig(), config)
	}

	/**
	 * Retrieves the active voice session for a given session identifier, if it exists.
	 */
	public getSession(sessionId: string): VoiceSession | undefined {
		return this.sessions.get(sessionId)
	}

	/**
	 * Updates the global base configuration, clears derived caches, and propagates the resolved
	 * configuration to all active sessions across every guild.
	 */
	public async setBaseConfig(config: VoiceConfigPatch): Promise<void> {
		this.baseConfig = mergeVoiceConfig(getDefaultVoiceConfig(), config)
		this.resolvedConfigs.clear()

		// Collect unique guild IDs from active sessions.
		const guildIds = new Set<string>()
		for (const session of this.sessions.values()) {
			guildIds.add(session.getStatus().guildId)
		}

		// Propagate config changes to active sessions.
		for (const guildId of guildIds) {
			const resolved = await this.resolveConfig(guildId)
			for (const session of this.sessions.values()) {
				const status = session.getStatus()
				if (status.guildId === guildId) {
					session.updateConfig(resolved)
				}
			}
		}

		this.emitter.emit('config:change', { guildId: undefined, config: this.baseConfig })
		logger.debug('base voice config updated', {
			model: this.baseConfig.model ?? null,
			endpointing: this.baseConfig.endpointing,
			maxConcurrentChannels: this.baseConfig.maxConcurrentChannels
		})
	}

	/**
	 * Merges and persists a per-guild configuration patch, updates caches, applies the resolved
	 * configuration to active sessions in that guild, and emits a change event.
	 */
	public async setGuildConfig(guildId: string, config: VoiceConfigPatch): Promise<void> {
		// Merge with existing guild patch.
		const mergedPatch = mergeVoiceConfigPatch(this.overridePatches.get(guildId), config)
		this.overridePatches.set(guildId, mergedPatch)
		const resolved = mergeVoiceConfig(this.baseConfig, mergedPatch)
		this.resolvedConfigs.set(guildId, resolved)

		for (const session of this.sessions.values()) {
			const status = session.getStatus()
			if (status.guildId === guildId) {
				session.updateConfig(resolved)
			}
		}

		// Persist to storage for next session.
		await Flashcore.set(guildId, mergedPatch, { namespace: VOICE_CONFIG_NAMESPACE })
		this.emitter.emit('config:change', { guildId, config: resolved })
		logger.debug('guild voice config updated', {
			guildId,
			model: resolved.model ?? null,
			endpointing: resolved.endpointing,
			transcriptEnabled: resolved.transcript.enabled
		})
	}

	/**
	 * Produces a snapshot of active sessions, resolved configurations, and base settings. When a
	 * guild ID is provided the result is scoped to that guild.
	 */
	public async getStatus(guildId?: string) {
		const sessions = [...this.sessions.values()]
		const filteredSessions = guildId ? sessions.filter((session) => session.getStatus().guildId === guildId) : sessions
		const sessionStatuses = filteredSessions.map((session) => session.getStatus())
		const guildIds = guildId ? [guildId] : Array.from(new Set(sessionStatuses.map((status) => status.guildId)))
		const guildConfigs: Record<string, VoiceRuntimeConfig> = {}
		for (const id of guildIds) {
			guildConfigs[id] = await this.resolveConfig(id)
		}

		return {
			baseConfig: this.baseConfig,
			guildConfigs,
			sessions: sessionStatuses
		}
	}

	/** Returns the total number of active voice sessions across all guilds. */
	public getActiveSessionCount(): number {
		return this.sessions.size
	}

	/** Registers an event listener for the provided voice lifecycle event. */
	public on<T extends keyof VoiceEventMap>(event: T, listener: (payload: VoiceEventMap[T]) => void) {
		this.emitter.on(event, listener as (...args: unknown[]) => void)
	}

	/** Removes a previously registered voice lifecycle event listener. */
	public off<T extends keyof VoiceEventMap>(event: T, listener: (payload: VoiceEventMap[T]) => void) {
		this.emitter.off(event, listener as (...args: unknown[]) => void)
	}

	/**
	 * Processes Discord voice state changes to determine when the bot enters, leaves, or moves
	 * between channels. Delegates to channel start/stop handlers for lifecycle orchestration.
	 */
	public async handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
		// Identify the bot user ID.
		const botId = newState.client.user?.id ?? oldState.client.user?.id
		if (!botId) {
			return
		}

		// Filter to events involving the bot.
		const involvesBot = oldState.member?.id === botId || newState.member?.id === botId
		if (!involvesBot) {
			return
		}

		// Handle bot joining a voice channel.
		if (!oldState.channelId && newState.channel) {
			await this.startForChannel(newState.channel)

			return
		}

		// Handle bot leaving a voice channel.
		if (oldState.channel && !newState.channelId) {
			await this.stopForChannel(oldState.channel)

			return
		}

		// Handle bot moving between channels.
		if (oldState.channel && newState.channel && oldState.channelId !== newState.channelId) {
			await this.stopForChannel(oldState.channel)
			await this.startForChannel(newState.channel)
		}
	}

	/**
	 * Starts a voice session for the provided channel after validating configuration, connection
	 * availability, engine support, and concurrent session limits. Handles transcript channel
	 * resolution and propagates start failures, including token limit breaches with user-friendly
	 * notifications.
	 */
	public async startForChannel(
		channel: VoiceBasedChannel,
		options?: { transcriptChannelId?: string | null }
	): Promise<void> {
		// Validate voice is enabled for this guild.
		const config = await this.resolveConfig(channel.guild.id)
		if (!config.enabled) {
			logger.debug('voice disabled for guild', { guildId: channel.guild.id })

			return
		}

		// Prevent duplicate sessions.
		const sessionKey = buildSessionId(channel.guild.id, channel.id)
		if (this.sessions.has(sessionKey)) {
			logger.debug('voice session already running', { sessionKey })

			return
		}

		// Verify voice connection exists.
		const { getVoiceConnection } = await loadDiscordVoice()
		const connection = getVoiceConnection(channel.guild.id)
		if (!connection) {
			logger.warn('no voice connection available for channel', {
				channelId: channel.id,
				guildId: channel.guild.id
			})

			return
		}

		// Validate engine supports voice.
		const engine = getEngine()
		const features = engine?.supportedFeatures()
		if (!engine || !features?.voice) {
			if (!missingVoiceEngineWarningLogged) {
				logger.warn('voice support unavailable; skipping voice session start')
				missingVoiceEngineWarningLogged = true
			}

			return
		}

		// Enforce concurrent channel limit.
		const activeCount = [...this.sessions.keys()].filter((key) => key.startsWith(`${channel.guild.id}:`)).length
		if (activeCount >= config.maxConcurrentChannels) {
			logger.warn('max concurrent voice sessions reached for guild', {
				guildId: channel.guild.id,
				maxConcurrentChannels: config.maxConcurrentChannels
			})

			return
		}

		let sessionRef: VoiceSession | null = null
		const transcriptEnabled = config.transcript.enabled
		const preferredTranscriptChannel = options?.transcriptChannelId ?? null
		const transcriptChannel = transcriptEnabled
			? this.resolveTranscriptChannel(channel, config, preferredTranscriptChannel)
			: null

		// Create session with resolved configuration.
		const session = new VoiceSession({
			channel,
			config,
			connection,
			conversationKey: this.buildConversationKey(channel),
			engine,
			guildId: channel.guild.id,
			member: channel.guild.members.me,
			sessionId: sessionKey,
			textChannel: transcriptChannel,
			onTranscript: (segment) => {
				if (!sessionRef) {
					return
				}
				this.emitter.emit('transcript:segment', {
					session: sessionRef.getStatus(),
					segment
				})
			}
		})
		sessionRef = session

		this.sessions.set(sessionKey, session)

		try {
			// Start audio capture and engine session.
			await session.start()
			this.emitter.emit('session:start', session.getStatus())
		} catch (error) {
			this.sessions.delete(sessionKey)
			try {
				await session.stop('startup-failure')
			} catch (stopError) {
				logger.warn('failed to stop voice session after startup failure', {
					error: stopError
				})
			}

			// Handle token limit breaches gracefully.
			if (error instanceof TokenLimitError) {
				logger.warn('voice token limit prevented session start', {
					guildId: channel.guild.id,
					channelId: channel.id,
					model: error.model,
					window: error.window,
					windowKey: error.windowKey
				})
				await this.notifyLimitBreach(channel, transcriptChannel, error)
			} else {
				logger.error('failed to start voice session', { error })
			}

			throw error
		}
	}

	/**
	 * Stops the active session for the given channel, cleans up Discord voice connections, and emits
	 * a stop event including the optional reason.
	 */
	public async stopForChannel(channel: VoiceBasedChannel, reason?: string): Promise<void> {
		const sessionKey = buildSessionId(channel.guild.id, channel.id)
		const session = this.sessions.get(sessionKey)
		if (!session) {
			return
		}

		this.sessions.delete(sessionKey)
		const status = session.getStatus()
		await session.stop(reason ?? 'guild-request')

		try {
			// Destroy Discord voice connection.
			const { getVoiceConnection } = await loadDiscordVoice()
			getVoiceConnection(channel.guild.id)?.destroy()
		} catch (error) {
			logger.warn('failed to destroy voice connection on stop', {
				channelId: channel.id,
				guildId: channel.guild.id,
				error
			})
		}

		this.emitter.emit('session:stop', { ...status, reason })
	}

	/**
	 * Resolves the effective configuration for a guild by merging the base configuration with any
	 * cached or persisted patch overrides.
	 */
	private async resolveConfig(guildId: string): Promise<VoiceRuntimeConfig> {
		// Return cached config if available.
		if (this.resolvedConfigs.has(guildId)) {
			return this.resolvedConfigs.get(guildId)!
		}

		let patch = this.overridePatches.get(guildId)
		if (!patch) {
			try {
				// Load persisted guild config from storage.
				const stored = await Flashcore.get<VoiceConfigPatch>(guildId, { namespace: VOICE_CONFIG_NAMESPACE })
				if (stored) {
					patch = stored
					this.overridePatches.set(guildId, stored)
				}
			} catch (error) {
				logger.warn('failed to read stored guild voice config', { guildId, error })
			}
		}

		// Merge base config with guild patch.
		const resolved = mergeVoiceConfig(this.baseConfig, patch)
		this.resolvedConfigs.set(guildId, resolved)

		return resolved
	}

	/**
	 * Constructs a conversation key used to persist context in Flashcore across session restarts.
	 */
	private buildConversationKey(channel: VoiceBasedChannel): string {
		return `voice:${channel.guild.id}:${channel.id}`
	}

	/**
	 * Resolves the channel used for transcript embeds, preferring the explicit override, configured
	 * channel, the voice channel (if text-capable), and finally the guild system channel.
	 */
	private resolveTranscriptChannel(
		channel: VoiceBasedChannel,
		config: VoiceRuntimeConfig,
		overrideChannelId: string | null
	): TextBasedChannel | null {
		if (!config.transcript.enabled) {
			return null
		}

		// Helper to validate channel is text-based and sendable.
		const ensureSendable = (candidate: GuildBasedChannel | undefined | null): TextBasedChannel | null => {
			if (!candidate) {
				return null
			}

			return typeof candidate.isSendable === 'function' && candidate.isSendable() ? candidate : null
		}

		// Try explicit override first.
		if (overrideChannelId) {
			const override = channel.guild.channels.cache.get(overrideChannelId)
			const sendableOverride = ensureSendable(override)
			if (sendableOverride) {
				return sendableOverride
			}
		}

		// Try configured target channel.
		if (config.transcript.targetChannelId) {
			const configured = channel.guild.channels.cache.get(config.transcript.targetChannelId)
			const sendableConfigured = ensureSendable(configured)
			if (sendableConfigured) {
				return sendableConfigured
			}
		}

		// Try voice channel if it's text-based.
		const voiceAsText = ensureSendable(channel)
		if (voiceAsText) {
			return voiceAsText
		}

		// Fall back to guild system channel.
		return ensureSendable(channel.guild.systemChannel)
	}

	/**
	 * Notifies guild members that a token limit blocked voice usage by sending messages to transcript
	 * or fallback text channels while deduplicating repeated notifications.
	 */
	private async notifyLimitBreach(
		voiceChannel: VoiceBasedChannel,
		transcriptChannel: TextBasedChannel | null,
		error: TokenLimitError
	): Promise<void> {
		const message = error.displayMessage
		const noticeKey = `${error.model}:${error.windowKey}`
		const cacheKey = `${voiceChannel.guild.id}:${voiceChannel.id}:${noticeKey}`

		// Deduplicate notifications per guild/channel/limit.
		if (this.notifiedLimits.has(cacheKey)) {
			return
		}
		const sentChannels = new Set<string>()
		const targets: TextBasedChannel[] = []

		// Build list of eligible notification channels.
		if (transcriptChannel?.isSendable()) {
			targets.push(transcriptChannel)
		}
		if (targets.length === 0) {
			// Find any sendable text channel as fallback.
			const fallback = voiceChannel.guild.channels.cache.find((candidate) => {
				return (
					candidate.isTextBased() &&
					typeof (candidate as TextBasedChannel).isSendable === 'function' &&
					(candidate as TextBasedChannel).isSendable()
				)
			}) as TextBasedChannel | undefined
			if (fallback && fallback.isSendable()) {
				targets.push(fallback)
			}
		}

		// Send notification to each target channel.
		for (const channel of targets) {
			if (sentChannels.has(channel.id)) {
				continue
			}
			try {
				if (channel.isSendable()) {
					await channel.send({ content: message })
					sentChannels.add(channel.id)
				}
			} catch (sendError) {
				logger.warn('failed to send voice limit message', {
					channelId: channel.id,
					guildId: voiceChannel.guild.id,
					sendError
				})
			}
		}
		if (sentChannels.size === 0) {
			logger.warn('no eligible channel to announce voice limit breach', {
				guildId: voiceChannel.guild.id,
				voiceChannelId: voiceChannel.id,
				model: error.model
			})

			return
		}

		this.notifiedLimits.set(cacheKey, noticeKey)
	}
}

export const voiceManager = new VoiceManager()
