/**
 * Implements the lifecycle for a single voice session, handling Discord audio capture, PCM
 * processing, streaming frames to the AI engine, orchestrating playback of assistant responses, and
 * emitting transcript events.
 */
import { PassThrough, Readable } from 'node:stream'
import type { AudioPlayer, AudioReceiveStream, VoiceConnection, VoiceReceiver } from '@discordjs/voice'
import { logger } from '@/core/logger.js'
import type { BaseEngine, VoicePlaybackDelta, VoiceSessionHandle, VoiceTranscriptSegment } from '@/engines/base.js'
import { VoiceFrameStream } from './frame-stream.js'
import { bufferToInt16, calculateRms, downsample, int16ToBuffer, toMono, upsample } from './audio-utils.js'
import { incrementTranscriptSegments } from './metrics.js'
import type { VoiceRuntimeConfig } from './config.js'
import { Colors } from 'discord.js'
import type { GuildMember, TextBasedChannel, VoiceBasedChannel } from 'discord.js'
import fs from 'node:fs'
import path from 'node:path'
import type { DiscordVoiceModule, PrismMediaModule } from './deps.js'
import { loadDiscordVoice, loadPrism } from './deps.js'

/** Prism Opus encoder instance used for assistant playback encoding. */
type PrismOpusEncoder = InstanceType<PrismMediaModule['opus']['Encoder']>

/**
 * Dependencies and configuration required to construct a {@link VoiceSession}.
 */
interface VoiceSessionProps {
	/** Discord voice channel backing the session. */
	channel: VoiceBasedChannel
	/** Fully resolved voice configuration for the guild. */
	config: VoiceRuntimeConfig
	/** Active voice connection for the guild/channel. */
	connection: VoiceConnection
	/** Flashcore conversation key for persistence. */
	conversationKey: string
	/** Engine instance providing voice processing. */
	engine: BaseEngine
	/** Guild identifier containing the session. */
	guildId: string
	/** Bot guild member for permissions and metadata. */
	member?: GuildMember | null
	/** Unique session identifier (guild:channel). */
	sessionId: string
	/** Optional text channel for transcript embeds. */
	textChannel: TextBasedChannel | null
	/** Callback invoked when transcript segments are produced. */
	onTranscript?: (segment: VoiceTranscriptSegment, session: VoiceSession) => void
}

/** Engine voice session handle extended with optional interrupt capability. */
type InterruptableHandle = VoiceSessionHandle & {
	interrupt?: (reason?: string) => Promise<void>
}

/**
 * Tracks metadata for an active user audio capture stream.
 */
interface ActiveCapture {
	/** Cleanup routine tearing down stream listeners and pipes. */
	cleanup: () => void
	/** Flag indicating capture has been finalized. */
	ended: boolean
	/** Timestamp of last detected speech energy. */
	lastSpeechAt: number
	/** Discord user ID associated with the capture. */
	userId: string
	/** Total buffered PCM samples forwarded to the engine. */
	bufferedSamples: number
	/** Optional PCM dump stream handle for debugging. */
	dumpStream: fs.WriteStream | null
}

/** Discord's Opus encoded audio sample rate (48 kHz). */
const OPUS_SAMPLE_RATE = 48_000

/**
 * Manages a single voice session for a Discord voice channel, orchestrating capture, PCM
 * processing, engine streaming, assistant playback, and transcript emission.
 *
 * @remarks Supports persistent playback pipelines, user barge-in by interrupting the engine, and
 * multiple endpointing strategies (server-vad, manual, client-vad with silence padding).
 */
export class VoiceSession {
	/** Unique identifier for this session (guild:channel). */
	public readonly sessionId: string
	/** Discord voice channel backing the session. */
	private readonly channel: VoiceBasedChannel
	/** Current effective voice configuration. */
	private config: VoiceRuntimeConfig
	/** Active Discord voice connection used for capture/playback. */
	private readonly connection: VoiceConnection
	/** Engine instance responsible for voice processing. */
	private readonly engine: BaseEngine
	/** Stream of PCM frames consumed by the engine. */
	private frameStream = new VoiceFrameStream()
	/** Lazily created audio player for assistant playback. */
	private player: AudioPlayer | null = null
	/** Lazily loaded @discordjs/voice module reference. */
	private voiceModule: DiscordVoiceModule | null = null
	/** Lazily loaded prism-media module reference. */
	private prismModule: PrismMediaModule | null = null
	/** Optional transcript target channel. */
	private readonly textChannel: TextBasedChannel | null
	/** Flashcore conversation key for persistence. */
	private readonly conversationKey: string
	/** Bot guild member used for metadata and permissions. */
	private readonly member: GuildMember | null
	/** Tracks whether the assistant is currently speaking to support barge-in. */
	private assistantSpeaking = false

	/** Handle to the active engine voice session. */
	private engineHandle: VoiceSessionHandle | null = null
	/** Flag indicating the session has been stopped. */
	private destroyed = false
	/** Active user audio captures keyed by user ID. */
	private captures = new Map<string, ActiveCapture>()
	/** Listener registered for Discord speaking start events. */
	private speakingStartListener: ((userId: string) => void) | null = null
	/** Listener registered for Discord speaking end events. */
	private speakingEndListener: ((userId: string) => void) | null = null
	/** Transcript segment history retained for status reporting. */
	private segments: VoiceTranscriptSegment[] = []
	/** Optional callback invoked on transcript segments. */
	private readonly onTranscript?: (segment: VoiceTranscriptSegment, session: VoiceSession) => void
	/** Timestamp when the session started. */
	private startedAt = Date.now()

	/** Persistent PCM ingress stream for assistant playback. */
	private persistentPcmIn: PassThrough | null = null
	/** Persistent Opus encoder for assistant playback. */
	private persistentEncoder: PrismOpusEncoder | null = null
	/** Persistent audio resource fed into the Discord audio player. */
	private persistentResource: ReturnType<DiscordVoiceModule['createAudioResource']> | null = null

	/**
	 * Creates a voice session from the provided dependencies and configuration snapshot.
	 */
	public constructor(props: VoiceSessionProps) {
		this.sessionId = props.sessionId
		this.channel = props.channel
		this.config = props.config
		this.connection = props.connection
		this.engine = props.engine
		this.textChannel = props.textChannel
		this.conversationKey = props.conversationKey
		this.member = props.member ?? null
		this.onTranscript = props.onTranscript
	}

	/**
	 * Determines whether the assistant playback pipeline has been destroyed or ended and requires a
	 * rebuild.
	 */
	private isPlaybackDead(): boolean {
		const encDead = !this.persistentEncoder || this.persistentEncoder.destroyed || this.persistentEncoder.readableEnded

		const pcmDead = !this.persistentPcmIn || this.persistentPcmIn.destroyed || this.persistentPcmIn.writableEnded

		const resDead = !this.persistentResource

		return encDead || pcmDead || resDead
	}

	/**
	 * Safely ends the existing frame stream and replaces it with a fresh instance for new audio
	 * captures.
	 */
	private resetFrameStream() {
		try {
			// Safely end old stream.
			this.frameStream.end()
		} catch (e) {
			logger.warn('error ending old frame stream', e)
		}

		this.frameStream = new VoiceFrameStream()
	}

	/**
	 * Tears down stale playback components and recreates the PassThrough → Opus encoder → Audio	on
	 * resource pipeline, ensuring the player resumes with the fresh resource.
	 */
	private async rebuildPlaybackPipeline() {
		const prism = await this.ensurePrismModule()
		const voice = await this.ensureVoiceModule()
		const player = await this.ensurePlayer()

		// Tear down stale pipeline components.
		try {
			this.persistentPcmIn?.destroy()
		} catch (e) {
			logger.warn('error destroying persistent pcm stream', e)
		}
		try {
			this.persistentEncoder?.destroy()
		} catch (e) {
			logger.warn('error destroying persistent encoder', e)
		}
		this.persistentPcmIn = null
		this.persistentEncoder = null
		this.persistentResource = null

		// Recreate fresh PassThrough → Opus encoder → AudioResource pipeline.
		this.persistentPcmIn = new PassThrough({ highWaterMark: 1 << 20 })
		this.persistentEncoder = new prism.opus.Encoder({
			frameSize: 960,
			rate: this.config.playback.sampleRate, // 48000
			channels: 1
		})

		const opusOut = this.persistentPcmIn.pipe(this.persistentEncoder) as unknown as Readable

		this.persistentResource = voice.createAudioResource(opusOut, {
			inputType: voice.StreamType.Opus,
			silencePaddingFrames: 5
		})

		// Start playback with new resource.
		player.play(this.persistentResource)
	}

	/**
	 * Ensures the persistent playback pipeline exists, rebuilding it if any component has been
	 * destroyed.
	 */
	private async ensurePersistentPlayback() {
		if (!this.isPlaybackDead()) {
			return
		}

		await this.rebuildPlaybackPipeline()
	}

	/**
	 * Extracts and validates the configured silence duration, defaulting to zero for invalid values.
	 */
	private getSilenceDurationMs(): number {
		const raw = Number(this.config.capture.silenceDurationMs ?? 0)
		if (!Number.isFinite(raw) || raw < 0) {
			return 0
		}

		return raw
	}

	/**
	 * Lazily loads the @discordjs/voice module, caching the result.
	 */
	private async ensureVoiceModule(): Promise<DiscordVoiceModule> {
		if (!this.voiceModule) {
			this.voiceModule = await loadDiscordVoice()
		}

		return this.voiceModule
	}

	/**
	 * Lazily loads the prism-media module, caching the result.
	 */
	private async ensurePrismModule(): Promise<PrismMediaModule> {
		if (!this.prismModule) {
			this.prismModule = await loadPrism()
		}

		return this.prismModule
	}

	/**
	 * Lazily creates the Discord audio player, wiring up state change recovery and error logging.
	 */
	private async ensurePlayer(): Promise<AudioPlayer> {
		if (!this.player) {
			const voice = await this.ensureVoiceModule()
			this.player = voice.createAudioPlayer({
				behaviors: {
					noSubscriber: voice.NoSubscriberBehavior.Pause
				}
			})

			// Handle player state transitions.
			this.player.on('stateChange', (_oldS, newS) => {
				const voice = this.voiceModule!
				if (newS.status === voice.AudioPlayerStatus.Idle) {
					// Recover from Idle state by rebuilding or restarting.
					if (this.isPlaybackDead()) {
						this.rebuildPlaybackPipeline().catch((e) => logger.warn('failed to rebuild after Idle', e))
					} else if (this.persistentResource) {
						try {
							this.player!.play(this.persistentResource)
						} catch (e) {
							logger.warn('failed to restart playback after Idle', e)
						}
					}
				}
			})

			// Log player errors.
			this.player.on('error', (e) => logger.error('player error', e))
		}

		return this.player
	}

	/** Returns the transcript segment history produced during the session. */
	public getTranscriptSegments(): VoiceTranscriptSegment[] {
		return this.segments
	}

	/**
	 * Marks playback as idle and stops writing to the pipeline without destroying persistent
	 * resources, enabling subsequent turns to reuse the encoder.
	 */
	private stopPlayback(reason: string) {
		// Stop writing to pipeline without destroying it for future turns.
		this.assistantSpeaking = false
		logger.debug('playback stopped', { sessionId: this.sessionId, reason })
	}

	/**
	 * Initializes the session by subscribing playback, ensuring persistent pipeline, resetting the
	 * frame stream, starting the engine session, and binding Discord speaking events.
	 */
	public async start(): Promise<void> {
		this.destroyed = false
		logger.debug('starting session', {
			channelId: this.channel.id,
			guildId: this.channel.guild.id,
			model: this.config.model ?? null,
			endpointing: this.config.endpointing
		})

		// Subscribe player to voice connection.
		const player = await this.ensurePlayer()
		this.connection.subscribe(player)

		// Ensure playback pipeline is ready.
		await this.ensurePersistentPlayback()

		// Reset frame stream for fresh capture.
		this.resetFrameStream()

		// Prepare engine voice session.
		await this.prepareEngine()

		// Bind Discord speaking event handlers.
		this.bindSpeakingEvents()
	}

	/**
	 * Tears down the session by unbinding events, finishing captures, clearing subscriptions,
	 * destroying playback components, and stopping the engine voice session.
	 */
	public async stop(reason?: string): Promise<void> {
		// Skip if already stopped.
		if (this.destroyed) {
			return
		}
		this.destroyed = true

		logger.debug('stopping session', {
			channelId: this.channel.id,
			guildId: this.channel.guild.id,
			reason: reason ?? 'unknown'
		})

		// Unbind speaking event handlers.
		this.unbindSpeakingEvents()

		// Finish all active user captures.
		for (const userId of [...this.captures.keys()]) {
			this.finishCapture(userId)
		}

		// Destroy all subscriptions.
		this.clearReceiverSubscriptions()

		try {
			this.persistentPcmIn?.destroy()
		} catch (e) {
			logger.warn('error destroying persistent pcm stream', e)
		}
		try {
			this.persistentEncoder?.destroy()
		} catch (e) {
			logger.warn('error destroying persistent encoder', e)
		}
		this.persistentPcmIn = null
		this.persistentEncoder = null
		this.persistentResource = null
		this.player?.stop(true)

		// Stop playback pipeline without tearing it down.
		this.stopPlayback('session-stop')

		if (this.engineHandle) {
			try {
				// Stop engine voice session.
				await this.engine.stopVoiceSession(this.engineHandle)
			} catch (error) {
				logger.error('failed to stop engine session', error)
			}
			this.engineHandle = null
		}
	}

	/**
	 * Starts the engine voice session with full configuration, frame source, and callbacks for audio
	 * deltas, transcriptions, and warnings.
	 */
	private async prepareEngine() {
		// Start engine session with full configuration.
		this.engineHandle = await this.engine.startVoiceSession({
			channel: this.channel,
			configuration: {
				endpointing: this.config.endpointing,
				maxSilenceMs: this.getSilenceDurationMs(),
				model: this.config.model,
				playbackVoice: this.config.playbackVoice,
				realtimeApiKey: null,
				targetSampleRate: this.config.capture.sampleRate
			},
			conversation: {
				id: this.conversationKey
			},
			conversationKey: this.conversationKey,
			frameSource: this.frameStream,
			guildId: this.channel.guild.id,
			member: this.member,
			sessionId: this.sessionId,
			textChannel: this.textChannel,
			onAudioDelta: async (delta) => this.handleAudioDelta(delta),
			onTranscription: async (segment) => this.handleTranscriptSegment(segment),
			onWarning: async (warning) => {
				logger.warn('engine warning', warning)
			}
		})
	}

	/** Registers speaking event handlers on the voice receiver to track user audio activity. */
	private bindSpeakingEvents() {
		const speaking = this.connection.receiver.speaking
		// Register speaking event handlers.
		this.speakingStartListener = (userId: string) => {
			this.handleSpeakingStart(userId).catch((error) => {
				logger.error('failed to handle speaking start', error)
			})
		}
		this.speakingEndListener = (userId: string) => {
			this.handleSpeakingEnd(userId)
		}
		speaking.on('start', this.speakingStartListener)
		speaking.on('end', this.speakingEndListener)
	}

	/** Removes speaking event handlers from the voice receiver during teardown. */
	private unbindSpeakingEvents() {
		const speaking = this.connection.receiver.speaking
		if (this.speakingStartListener) {
			// Remove speaking event handlers.
			speaking.off('start', this.speakingStartListener)
			this.speakingStartListener = null
		}
		if (this.speakingEndListener) {
			speaking.off('end', this.speakingEndListener)
			this.speakingEndListener = null
		}
	}

	/**
	 * Handles a user speaking event by validating state, performing barge-in when assistant audio is
	 * active, subscribing to the user's Opus stream, decoding to PCM, and tracking capture metadata.
	 */
	private async handleSpeakingStart(userId: string): Promise<void> {
		// Ignore duplicate speaking start events.
		const existing = this.captures.get(userId)
		if (existing && !existing.ended) {
			// already capturing this user; ignore spurious 'start'
			logger.debug('ignoring duplicate speaking start', {
				sessionId: this.sessionId,
				userId
			})

			return
		}

		// Ignore bot's own speaking events.
		if (userId === this.channel.client.user?.id) {
			logger.debug('ignoring self speaking start', {
				sessionId: this.sessionId,
				userId
			})

			return
		}

		// Ignore events on destroyed sessions.
		if (this.destroyed) {
			logger.debug('ignoring speaking start on destroyed session', {
				sessionId: this.sessionId,
				userId
			})

			return
		}

		logger.debug('user speaking start', {
			sessionId: this.sessionId,
			userId
		})

		const voice = await this.ensureVoiceModule()
		const prism = await this.ensurePrismModule()

		// Implement barge-in: stop playback and interrupt engine.
		if (this.assistantSpeaking) {
			this.stopPlayback('user-interrupt')
			try {
				const h = this.engineHandle as InterruptableHandle | null
				await h?.interrupt?.('user-interrupt')
			} catch (error) {
				logger.warn('failed to interrupt engine on user barge-in', error)
			}
		}

		// Persistent subscription when using server-vad.
		const endBehavior =
			this.config.endpointing === 'server-vad' ? voice.EndBehaviorType.Manual : voice.EndBehaviorType.AfterSilence
		const afterSilenceMs = this.getSilenceDurationMs()

		// Subscribe to user's Opus audio stream.
		const opusStream = this.connection.receiver.subscribe(userId, {
			end:
				endBehavior === voice.EndBehaviorType.Manual
					? { behavior: voice.EndBehaviorType.Manual }
					: {
							behavior: voice.EndBehaviorType.AfterSilence,
							duration: afterSilenceMs
						}
		})

		opusStream.on('end', () => {
			logger.debug('opus stream end', {
				sessionId: this.sessionId,
				userId
			})
		})
		opusStream.on('close', () => {
			logger.debug('opus stream close', {
				sessionId: this.sessionId,
				userId
			})
		})
		opusStream.on('error', (error) => {
			logger.warn('opus stream error', {
				sessionId: this.sessionId,
				userId,
				error
			})
		})

		// Create Opus decoder for PCM conversion.
		const decoder = new prism.opus.Decoder({
			rate: OPUS_SAMPLE_RATE,
			channels: 2,
			frameSize: 960
		})

		const pcmStream = opusStream.pipe(decoder)

		// Create capture tracking object.
		const capture: ActiveCapture = {
			cleanup: () => {
				logger.debug('cleaning capture', {
					sessionId: this.sessionId,
					userId
				})
				opusStream.removeAllListeners()
				pcmStream.removeAllListeners()
				try {
					opusStream.unpipe(decoder)
				} catch (e) {
					logger.warn('error unpiping opus from decoder', e)
				}
				try {
					opusStream.destroy()
				} catch (e) {
					logger.warn('error destroying opus stream', e)
				}
				// Important: do NOT destroy the decoder when opusscript is in use
			},
			ended: false,
			lastSpeechAt: Date.now(),
			userId,
			bufferedSamples: 0,
			dumpStream: null
		}

		// Optionally create PCM dump stream for debugging.
		if (process.env.DEBUG?.includes('ai:voice:pcm')) {
			const dumpDir = path.resolve(process.cwd(), 'temp', 'voice-dumps')
			try {
				fs.mkdirSync(dumpDir, { recursive: true })
				const filePath = path.join(dumpDir, `${this.sessionId}-${userId}-${Date.now()}.pcm`)
				capture.dumpStream = fs.createWriteStream(filePath)
				logger.debug('opened pcm dump stream', {
					filePath,
					sessionId: this.sessionId,
					userId
				})
			} catch (error) {
				logger.warn('failed to open pcm dump stream', error)
			}
		}

		// Process incoming PCM chunks.
		pcmStream.on('data', (buffer: Buffer) => {
			this.processPcmChunk(userId, buffer, capture)
		})

		pcmStream.on('end', () => {
			logger.debug('pcm stream end', { userId })
			this.finishCapture(userId)
		})

		pcmStream.on('error', (error) => {
			logger.warn('pcm stream error', { userId, error })
			this.captures.delete(userId)
		})

		this.captures.set(userId, capture)
	}

	/**
	 * Handles speaking end events, acting as a no-op for server-vad and scheduling capture finish for
	 * client-vad strategies to allow trailing silence.
	 */
	private handleSpeakingEnd(userId: string): void {
		logger.debug('user speaking end', {
			sessionId: this.sessionId,
			userId
		})

		// Server-vad uses persistent subscriptions; no action needed.
		if (this.config.endpointing === 'server-vad') {
			return
		}

		// Skip if no active capture.
		const cap = this.captures.get(userId)
		if (!cap || cap.ended) {
			logger.debug('no active capture to end', {
				sessionId: this.sessionId,
				userId
			})
			return
		}

		// Delay capture finish to allow AfterSilence to complete.
		const wait = Math.max(0, this.getSilenceDurationMs() + 300)
		setTimeout(() => {
			const c = this.captures.get(userId)
			const grace = this.getSilenceDurationMs() + 250
			if (c && !c.ended && Date.now() - c.lastSpeechAt > grace) {
				this.finishCapture(userId)
			}
		}, wait)
	}

	/**
	 * Processes raw PCM data by converting buffers to Int16, collapsing to mono, downsampling to the
	 * target rate, applying VAD thresholding, and pushing frames to the engine stream.
	 */
	private processPcmChunk(userId: string, buffer: Buffer, capture: ActiveCapture) {
		if (this.destroyed) {
			return
		}

		// Convert buffer to Int16 samples.
		const samples = bufferToInt16(buffer)

		// Convert stereo to mono.
		const mono = toMono(samples, 2)

		// Downsample from 48kHz to target rate.
		const downsampled = downsample(mono, OPUS_SAMPLE_RATE, this.config.capture.sampleRate)
		if (downsampled.length === 0) {
			logger.debug('discarded empty downsampled frame', {
				sessionId: this.sessionId,
				userId
			})

			return
		}

		// Apply VAD threshold for client-vad.
		const energy = calculateRms(downsampled)
		if (this.config.endpointing !== 'server-vad' && energy < (this.config.capture.vadThreshold ?? 0.01)) {
			logger.debug('discarded low-energy frame', {
				sessionId: this.sessionId,
				userId,
				energy
			})

			return
		}

		capture.lastSpeechAt = Date.now()
		capture.bufferedSamples += downsampled.length
		capture.dumpStream?.write(int16ToBuffer(downsampled))
		/*logger.debug('accepted audio chunk', {
			sessionId: this.sessionId,
			userId,
			samples: downsampled.length,
			bufferedSamples: capture.bufferedSamples
		})*/

		// Push frame to engine stream.
		this.frameStream.push({
			channels: 1,
			data: int16ToBuffer(downsampled),
			encoding: 'pcm16',
			length: downsampled.length,
			sampleRate: this.config.capture.sampleRate,
			speakerId: userId,
			timestamp: Date.now()
		})
	}

	/**
	 * Finalizes a user capture by appending appropriate end markers, cleaning up resources, and
	 * destroying the receiver subscription.
	 */
	private finishCapture(userId: string) {
		const capture = this.captures.get(userId)
		if (!capture || capture.ended) {
			return
		}
		capture.ended = true

		// Server-vad: no synthetic end marker needed.
		if (this.config.endpointing === 'server-vad') {
			// just cleanup; the server handles turn detection on its side
		} else if (this.config.endpointing === 'manual') {
			// Manual endpointing: send explicit speech end marker.
			this.frameStream.push({
				channels: 1,
				data: Buffer.alloc(0),
				encoding: 'pcm16',
				isSpeechEnd: true,
				length: 0,
				sampleRate: this.config.capture.sampleRate,
				speakerId: userId,
				timestamp: Date.now()
			})
		} else {
			// Client-vad: append trailing silence for clean cutoff.
			const trailingMs = Math.max(this.getSilenceDurationMs(), 200)
			const silenceSamples = Math.ceil((this.config.capture.sampleRate * trailingMs) / 1000)
			logger.debug('appending trailing silence for client-vad', {
				sessionId: this.sessionId,
				userId,
				silenceSamples,
				trailingMs
			})
			if (silenceSamples > 0) {
				const silence = new Int16Array(silenceSamples)
				this.frameStream.push({
					channels: 1,
					data: int16ToBuffer(silence),
					encoding: 'pcm16',
					length: silenceSamples,
					sampleRate: this.config.capture.sampleRate,
					speakerId: userId,
					timestamp: Date.now()
				})
			}
		}

		// Clean up capture resources.
		try {
			capture.cleanup()
		} catch (error) {
			logger.warn('error cleaning capture on finish', error)
		}
		if (capture.dumpStream) {
			capture.dumpStream.end()
		}

		// Destroy receiver subscription.
		this.destroyReceiverSubscription(userId)

		logger.debug('finished capture', {
			sessionId: this.sessionId,
			userId,
			bufferedSamples: capture.bufferedSamples
		})
		this.captures.delete(userId)
	}

	/** Destroys a specific user's audio receive stream subscription. */
	private destroyReceiverSubscription(userId: string) {
		const receiver = this.connection.receiver as VoiceReceiver & {
			subscriptions?: Map<string, AudioReceiveStream>
		}
		const subscriptions = receiver.subscriptions
		const stream = subscriptions?.get(userId)
		if (!subscriptions || !stream) {
			return
		}
		try {
			// Destroy and remove subscription.
			stream.destroy()
		} catch (error) {
			logger.warn('error destroying audio receive stream', {
				sessionId: this.sessionId,
				userId,
				error
			})
		}
		subscriptions.delete(userId)
	}

	/** Destroys all receiver subscriptions during session teardown. */
	private clearReceiverSubscriptions() {
		const receiver = this.connection.receiver as VoiceReceiver & {
			subscriptions?: Map<string, AudioReceiveStream>
		}
		const subscriptions = receiver.subscriptions
		if (!subscriptions || subscriptions.size === 0) {
			return
		}

		// Destroy all subscriptions.
		for (const [userId, stream] of subscriptions.entries()) {
			try {
				stream.destroy()
			} catch (error) {
				logger.warn('error destroying audio receive stream during cleanup', {
					sessionId: this.sessionId,
					userId,
					error
				})
			}
			subscriptions.delete(userId)
		}
	}

	/**
	 * Processes assistant audio deltas by ensuring playback readiness, resampling to the playback
	 * rate, writing frames to the persistent PCM stream, and padding final deltas to avoid abrupt
	 * cutoffs.
	 */
	private async handleAudioDelta(delta: VoicePlaybackDelta): Promise<void> {
		// Ensure playback pipeline is alive.
		await this.ensurePersistentPlayback()
		const pcmIn = this.persistentPcmIn
		if (!pcmIn || pcmIn.writableEnded) {
			return
		}

		const voice = await this.ensureVoiceModule()
		const player = await this.ensurePlayer()
		// Start playback if player is idle.
		if (player.state.status === voice.AudioPlayerStatus.Idle) {
			if (this.persistentResource) {
				player.play(this.persistentResource)
			}
		}

		if (delta.data.length > 0) {
			// Resample and write audio data.
			const pcmSamples = bufferToInt16(delta.data)
			const resampled = upsample(pcmSamples, delta.sampleRate, this.config.playback.sampleRate)
			const buf = int16ToBuffer(resampled)
			if (!pcmIn.write(buf)) {
				await new Promise<void>((resolve) => pcmIn.once('drain', resolve))
			}
			if (!this.assistantSpeaking) {
				this.assistantSpeaking = true
			}
		}

		if (delta.isFinal) {
			// Append silence padding to prevent audio cutoff.
			const padMs = 120
			const padSamples = Math.ceil((this.config.playback.sampleRate * padMs) / 1000)
			const silence = new Int16Array(padSamples)
			if (!pcmIn.write(int16ToBuffer(silence))) {
				await new Promise<void>((resolve) => pcmIn.once('drain', resolve))
			}

			this.assistantSpeaking = false
		}
	}

	/**
	 * Processes transcript segments from the engine, updating metrics, retaining history, invoking
	 * callbacks, and publishing embeds to the transcript channel when enabled.
	 */
	private async handleTranscriptSegment(segment: VoiceTranscriptSegment): Promise<void> {
		// Increment transcript segment counter.
		incrementTranscriptSegments()
		// Store in segment history with 200-item limit.
		this.segments.push(segment)
		if (this.segments.length > 200) {
			this.segments.splice(0, this.segments.length - 200)
		}

		// Invoke transcript callback if registered.
		this.onTranscript?.(segment, this)

		if (segment.isFinal && this.textChannel?.isSendable() && this.config.transcript.enabled) {
			try {
				// Resolve speaker member from cache or API.
				let speaker = segment.speakerId ? (this.channel.guild.members.cache.get(segment.speakerId) ?? null) : null
				if (!speaker && segment.speakerId) {
					try {
						speaker = await this.channel.guild.members.fetch(segment.speakerId)
					} catch (error) {
						logger.warn('failed to fetch speaker for transcript segment', { error })
					}
				}

				// Build and send transcript embed.
				const assistantUser = this.channel.client.user
				const footerText = speaker
					? speaker.displayName
					: (assistantUser?.displayName ?? assistantUser?.username ?? 'Assistant')
				const footerIcon = speaker
					? speaker.displayAvatarURL({ size: 64 })
					: (assistantUser?.displayAvatarURL({ size: 64 }) ?? undefined)
				const embedColor =
					speaker && speaker.displayColor !== undefined && speaker.displayColor !== 0
						? speaker.displayColor
						: Colors.Blurple
				const title = speaker ? `${speaker.displayName} said` : `${footerText} replied`
				await this.textChannel.send({
					embeds: [
						{
							color: embedColor,
							description: segment.text,
							timestamp: new Date(segment.position.end).toISOString(),
							title,
							footer: {
								text: footerText,
								icon_url: footerIcon
							}
						}
					]
				})
				logger.debug('published transcript embed', {
					sessionId: this.sessionId,
					channelId: this.textChannel.id,
					speakerId: segment.speakerId ?? null
				})
			} catch (error) {
				logger.warn('failed to publish transcript embed', error)
			}
		}
	}

	/**
	 * Updates the session configuration in place, warning about changes that require restarts or only
	 * affect subsequent turns.
	 */
	public updateConfig(config: VoiceRuntimeConfig) {
		// Warn about model changes requiring restart.
		if (config.model !== this.config.model) {
			logger.warn('switching realtime model requires session restart; change will apply on next reconnect', {
				from: this.config.model ?? null,
				to: config.model ?? null
			})
		}

		// Warn about silence duration applying to new turns.
		if (config.capture.silenceDurationMs !== this.config.capture.silenceDurationMs) {
			logger.warn('silence duration update will apply to new speaking turns', {
				from: this.config.capture.silenceDurationMs,
				to: config.capture.silenceDurationMs
			})
		}

		this.config = config
	}

	/** Returns a snapshot of the session status including identifiers, config, and timestamps. */
	public getStatus() {
		return {
			channelId: this.channel.id,
			config: this.config,
			guildId: this.channel.guild.id,
			sessionId: this.sessionId,
			startedAt: this.startedAt,
			textChannelId: this.textChannel?.id ?? null
		}
	}
}
