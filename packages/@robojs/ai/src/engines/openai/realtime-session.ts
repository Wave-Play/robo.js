/**
 * @module plugin-ai/engines/openai/realtime-session
 * Manages OpenAI realtime WebSocket sessions, bidirectional audio streaming,
 * transcript assembly, tool-call buffering, and usage accounting for Robo.js voice flows.
 */
import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import type WebSocket from 'ws'
import type { RawData } from 'ws'
import { logger } from '@/core/logger.js'
import type {
	VoiceEndpointingStrategy,
	VoiceInputFrame,
	VoicePlaybackDelta,
	VoiceTranscriptSegment
} from '@/engines/base.js'
import type { AudioTranscription } from 'openai/resources/realtime/realtime.js'
import { loadWs, OptionalDependencyError } from '@/core/voice/deps.js'

export interface RealtimeToolCall {
	arguments: Record<string, unknown>
	argumentsText: string
	callId: string
	name: string
	responseId?: string | null
}

interface ToolCallBufferEntry {
	argumentsChunks: string[]
	callId: string
	name?: string
	responseId?: string
	emitted?: boolean
}

type ConversationRole = 'user' | 'assistant'

interface ConversationItemPayload {
	role: ConversationRole
	content: Array<{ type: 'input_text'; text: string }>
}

interface ResponseCreatePayload {
	modalities: Array<'audio' | 'text'>
	audio?: Record<string, unknown>
	responseId?: string
	instructions?: string
	metadata?: Record<string, unknown>
}

interface OutputFunctionBuffer {
	callId: string
	responseId?: string
	name?: string
	argsChunks: string[]
	emitted?: boolean
	itemId?: string
}

interface SessionCallbacks {
	onAudioDelta?: (delta: VoicePlaybackDelta) => void | Promise<void>
	onTranscript?: (segment: VoiceTranscriptSegment) => void | Promise<void>
	onWarning?: (error: Error) => void | Promise<void>
	onUsage?: (payload: RealtimeUsageReport) => void | Promise<void>
}

interface SessionConfig {
	apiKey: string
	endpoint?: string
	instructions?: string
	model: string
	strategy: VoiceEndpointingStrategy
	tools?: Array<Record<string, unknown>>
	playbackVoice?: string | null
	transcription?: AudioTranscription | null
}

interface RealtimeEnvelope {
	type: string
	[key: string]: unknown
}

interface ResponseOutputFunctionCallItem {
	id?: string
	call_id?: string
	name?: unknown
	arguments?: unknown
	type?: unknown
}

interface ResponseOutputFunctionCallEnvelope extends RealtimeEnvelope {
	item?: ResponseOutputFunctionCallItem
	response?: { id?: unknown }
	delta?: { name?: unknown; arguments?: unknown }
}

interface ResponseFunctionCallEnvelopeData {
	item: ResponseOutputFunctionCallItem
	response?: { id?: unknown }
	delta?: { name?: unknown; arguments?: unknown }
}

const DEFAULT_ENDPOINT = 'wss://api.openai.com/v1/realtime'
const DEFAULT_TRANSCRIPTION: AudioTranscription = { language: 'en', model: 'gpt-4o-transcribe' }

export interface RealtimeUsageReport {
	model: string
	tokensIn: number
	tokensOut: number
	responseId?: string
	metadata?: Record<string, unknown>
	raw?: Record<string, unknown>
}

type WebSocketConstructor = (typeof import('ws'))['default']

let cachedWebSocketCtor: WebSocketConstructor | null = null

/**
 * Lazy-loads and caches the WebSocket constructor from the optional `ws` dependency.
 *
 * Handles both default and named exports from `@/core/voice/deps` to accommodate
 * different module resolution strategies. The constructor is cached after first load
 * to avoid repeated dynamic imports.
 *
 * @returns The WebSocket constructor ready for instantiation.
 * @throws Error if the `ws` module lacks a recognizable WebSocket export.
 */
async function ensureWebSocketCtor(): Promise<WebSocketConstructor> {
	if (cachedWebSocketCtor) {
		return cachedWebSocketCtor
	}
	const wsModule = await loadWs()
	const ctor =
		(wsModule as { default?: WebSocketConstructor }).default ??
		(wsModule as { WebSocket?: WebSocketConstructor }).WebSocket
	if (!ctor) {
		throw new Error('ws module does not export a WebSocket constructor')
	}
	cachedWebSocketCtor = ctor
	return cachedWebSocketCtor
}

/**
 * Wraps the OpenAI realtime WebSocket, coordinating lifecycle, audio streaming,
 * incremental transcripts, buffered tool calls, and deduplicated usage reports for voice sessions.
 */
export class OpenAiRealtimeSession extends EventEmitter {
	public readonly id = randomUUID()
	private readonly _callbacks: SessionCallbacks
	private readonly _config: SessionConfig
	private _audioSequence = 0
	private _socket: WebSocket | null = null
	private _stopped = false
	private _lastSpeakerId: string | null = null
	private readonly _usageResponses = new Set<string>()
	private readonly _toolCallBuffers = new Map<string, ToolCallBufferEntry>()
	private readonly _outputFnBuffers = new Map<string, OutputFunctionBuffer>()

	public constructor(config: SessionConfig, callbacks: SessionCallbacks) {
		super()
		this._config = config
		this._callbacks = callbacks
	}

	/**
	 * Opens the realtime WebSocket, applies the negotiated session settings, and starts
	 * streaming envelopes back into the event pipeline.
	 */
	public async connect(): Promise<void> {
		if (this._socket) {
			return
		}
		this._stopped = false
		this._audioSequence = 0
		this._lastSpeakerId = null

		const url = new URL(this._config.endpoint ?? DEFAULT_ENDPOINT)
		url.searchParams.set('model', this._config.model)

		return new Promise((resolve, reject) => {
			ensureWebSocketCtor()
				.then((WebSocketCtor) => {
					const socket = new WebSocketCtor(url, {
						headers: {
							Authorization: `Bearer ${this._config.apiKey}`,
							'OpenAI-Beta': 'realtime=v1'
						}
					})
					this._socket = socket

					socket.once('open', () => {
						socket.send(JSON.stringify({ type: 'input_audio_buffer.clear' }))
						logger.debug(`Realtime session ${this.id} connected`)
						this.emit('ready')
						const transcription =
							this._config.transcription === undefined ? DEFAULT_TRANSCRIPTION : this._config.transcription

						const sessionUpdate: Record<string, unknown> = {
							instructions: this._config.instructions ?? '',
							turn_detection:
								this._config.strategy === 'server-vad'
									? {
											type: 'server_vad',
											threshold: 0.5,
											prefix_padding_ms: 300,
											silence_duration_ms: 200,
											create_response: true,
											interrupt_response: true
										}
									: { type: 'none' },
							input_audio_format: 'pcm16',
							output_audio_format: 'pcm16',
							tools: this._config.tools,
							voice: this._config.playbackVoice ?? undefined,
							modalities: ['text', 'audio']
						}
						if (transcription !== undefined) {
							sessionUpdate.input_audio_transcription = transcription
						}
						logger.debug(`Starting realtime session with config: ${JSON.stringify(sessionUpdate)}`)

						// Push the session.update handshake so OpenAI applies our voice and tool configuration.
						socket.send(
							JSON.stringify({
								type: 'session.update',
								session: sessionUpdate
							})
						)

						resolve()
					})

					socket.once('error', (error: Error) => {
						logger.error(`Realtime session ${this.id} error`, error)
						if (socket.readyState !== socket.OPEN) {
							reject(error)
						}
					})

					socket.on('close', (code: number, reason: Buffer) => {
						logger.debug(`Realtime session ${this.id} closed`, {
							code,
							reason: reason.toString()
						})
						this._socket = null
						if (!this._stopped) {
							this.emit('dropped')
						}
					})

					socket.on('message', (data: RawData) => {
						try {
							const payload = JSON.parse(data.toString()) as RealtimeEnvelope
							this.handleEnvelope(payload)
						} catch (error) {
							logger.warn(`Failed to parse realtime payload`, error)
						}
					})
				})
				.catch((error) => {
					if (error instanceof OptionalDependencyError) {
						reject(error)
						return
					}
					reject(error)
				})
		})
	}

	private ensureOutputFnBuf(key: string): OutputFunctionBuffer {
		let b = this._outputFnBuffers.get(key)
		if (!b) {
			b = { callId: key, argsChunks: [] }
			this._outputFnBuffers.set(key, b)
		}
		return b
	}
	private tryEmitOutputFnBuf(b: OutputFunctionBuffer) {
		if (b.emitted || !b.name) {
			return
		}
		const argsText = b.argsChunks.join('')
		let args: Record<string, unknown> = {}
		try {
			args = argsText ? JSON.parse(argsText) : {}
		} catch {
			args = { __raw: argsText }
		}
		this.emit('toolCall', {
			name: b.name,
			callId: b.callId,
			arguments: args,
			argumentsText: argsText,
			responseId: b.responseId ?? null
		})
		b.emitted = true
	}

	/**
	 * Cancels an in-progress assistant response to allow immediate user interruption.
	 *
	 * When `responseId` is provided, only that specific turn is canceled; otherwise,
	 * the server halts the current response stream.
	 *
	 * @param responseId - Optional response id to target a specific turn for cancellation.
	 */
	public async interrupt(responseId?: string): Promise<void> {
		const payload = responseId ? { type: 'response.cancel', response_id: responseId } : { type: 'response.cancel' }
		await this.sendEvent(payload)
	}

	/**
	 * Pushes an encoded PCM audio frame to the realtime input buffer while tracking
	 * speaker attribution for downstream announcements.
	 *
	 * @param frame - Voice frame payload containing PCM data and metadata.
	 */
	public async append(frame: VoiceInputFrame): Promise<void> {
		const socket = this._socket
		if (!socket || socket.readyState !== socket.OPEN) {
			throw new Error('Realtime session is not connected')
		}

		if (frame.speakerId) {
			this._lastSpeakerId = frame.speakerId
		}

		const encoded = frame.data.toString('base64')
		const event = {
			event_id: String(++this._audioSequence),
			type: 'input_audio_buffer.append',
			audio: encoded
		}

		try {
			await new Promise<void>((resolve, reject) => {
				socket.send(JSON.stringify(event), (err: unknown) => (err ? reject(err) : resolve()))
			})
		} catch (error) {
			logger.error(`Realtime session ${this.id} send error`, error)
		}
	}

	/**
	 * Commits the current audio buffer so OpenAI begins inference on the accumulated frames.
	 */
	public async commit(): Promise<void> {
		const socket = this._socket
		if (!socket || socket.readyState !== socket.OPEN) {
			throw new Error('Realtime session is not connected')
		}

		try {
			await new Promise<void>((resolve, reject) => {
				socket.send(JSON.stringify({ type: 'input_audio_buffer.commit' }), (err: unknown) =>
					err ? reject(err) : resolve()
				)
			})
		} catch (error) {
			logger.error(`Realtime session ${this.id} commit error`, error)
		}
	}

	/**
	 * Closes the realtime WebSocket and releases session resources.
	 *
	 * Marks the session as stopped to prevent reconnection attempts. If the socket
	 * is open, sends a graceful close frame with the provided reason.
	 *
	 * @param reason - Optional closure reason string sent to the server.
	 */
	public async dispose(reason?: string): Promise<void> {
		this._stopped = true
		const socket = this._socket
		if (socket && socket.readyState === socket.OPEN) {
			try {
				socket.close(1000, reason ?? 'normal-closure')
			} catch (error) {
				logger.warn(`Realtime session ${this.id} close error`, error)
			}
		}
	}

	/**
	 * Routes server envelopes to the appropriate handler, coordinating transcripts,
	 * audio playback, tool buffering, and usage reporting with dedup safeguards.
	 */
	private async handleEnvelope(envelope: RealtimeEnvelope) {
		switch (envelope.type) {
			case 'input_audio_buffer.committed': {
				break
			}
			case 'response.function_call_arguments.done': {
				this.handleFunctionCallArgumentsDone(envelope)
				break
			}
			case 'response.function_call_arguments.delta': {
				this.handleFunctionCallDelta(envelope)
				break
			}
			case 'response.function_call.completed': {
				this.handleFunctionCallCompleted(envelope)
				break
			}
			case 'response.required_action': {
				this.handleRequiredAction(envelope)
				break
			}
			case 'response.output_text.delta': {
				await this.pushTranscriptDelta(envelope)
				break
			}
			case 'response.output_text.done': {
				await this.pushTranscriptCompleted(envelope)
				break
			}
			case 'response.content_part.delta': {
				await this.pushContentPartTranscript(envelope, false)
				break
			}
			case 'response.content_part.done': {
				await this.pushContentPartTranscript(envelope, true)
				break
			}
			case 'conversation.item.input_audio_transcription.delta': {
				await this.pushInputTranscript(envelope, false)
				break
			}
			case 'conversation.item.input_audio_transcription.completed': {
				await this.pushInputTranscript(envelope, true)
				break
			}
			case 'response.audio.delta': {
				await this.pushAudioDelta(envelope)
				break
			}
			// NEW: finalize playback when the server says audio is done
			case 'response.audio.done': {
				// Reuse your existing teardown path by sending an empty, final delta
				const sr = typeof envelope.sample_rate === 'number' ? envelope.sample_rate : 24_000
				await this._callbacks.onAudioDelta?.({
					channels: 1,
					data: Buffer.alloc(0), // no payload, just “finalize”
					encoding: 'pcm16',
					isFinal: true,
					sampleRate: sr,
					timestamp: Date.now()
				})
				await this.captureUsage(envelope)
				break
			}

			// (Optional but nice): if you ever miss audio.done, also finalize on response.done
			case 'response.done': {
				const sr = 24_000
				await this._callbacks.onAudioDelta?.({
					channels: 1,
					data: Buffer.alloc(0),
					encoding: 'pcm16',
					isFinal: true,
					sampleRate: sr,
					timestamp: Date.now()
				})
				await this.captureUsage(envelope)
				break
			}
			case 'response.completed': {
				logger.debug('response completed', {
					response: (envelope as { response?: Record<string, unknown> }).response ?? null
				})
				await this.captureUsage(envelope)
				break
			}
			case 'response.finished': {
				await this.captureUsage(envelope)
				break
			}
			case 'response.error': {
				await this.handleWarning(new Error(JSON.stringify(envelope)))
				break
			}
			case 'rate_limits.updated': {
				// Not currently used
				break
			}
			case 'response.output_item.added': {
				const fnEnvelope = this.extractFunctionCallEnvelope(envelope)
				if (fnEnvelope) {
					const { item, response } = fnEnvelope
					const rawKey = item.call_id ?? item.id
					if (rawKey === undefined || rawKey === null) {
						break
					}
					const key = String(rawKey)
					const buffer = this.ensureOutputFnBuf(key)
					if (typeof item.id === 'string') {
						buffer.itemId = item.id
					}
					buffer.callId = key
					if (typeof item.name === 'string') {
						buffer.name = item.name
					}
					if (typeof item.arguments === 'string') {
						buffer.argsChunks.push(item.arguments)
					}
					const responseId = typeof response?.id === 'string' ? response.id : undefined
					if (responseId) {
						buffer.responseId = responseId
					}
				}
				break
			}
			case 'response.output_item.delta': {
				const fnEnvelope = this.extractFunctionCallEnvelope(envelope)
				if (fnEnvelope) {
					const { item, delta } = fnEnvelope
					const rawKey = item.call_id ?? item.id
					if (rawKey === undefined || rawKey === null) {
						break
					}
					const key = String(rawKey)
					const buffer = this.ensureOutputFnBuf(key)
					if (delta && typeof delta.name === 'string') {
						buffer.name = delta.name
					}
					if (delta && typeof delta.arguments === 'string') {
						buffer.argsChunks.push(delta.arguments)
					}
				}
				break
			}
			case 'response.output_item.done': {
				const fnEnvelope = this.extractFunctionCallEnvelope(envelope)
				if (fnEnvelope) {
					const { item, response } = fnEnvelope
					const rawKey = item.call_id ?? item.id
					if (rawKey === undefined || rawKey === null) {
						break
					}
					const key = String(rawKey)
					const buffer = this.ensureOutputFnBuf(key)
					if (typeof item.name === 'string') {
						buffer.name = item.name
					}
					if (typeof item.arguments === 'string') {
						buffer.argsChunks.push(item.arguments)
					}
					const responseId = typeof response?.id === 'string' ? response.id : undefined
					if (responseId) {
						buffer.responseId = responseId
					}
					this.tryEmitOutputFnBuf(buffer)
				}
				break
			}
			default: {
				// Ignore unknown events but surface debugging when needed
				if (process.env.DEBUG?.includes('ai:voice')) {
					logger.debug('unhandled realtime envelope', envelope)
				}
			}
		}
	}

	private extractFunctionCallEnvelope(envelope: RealtimeEnvelope): ResponseFunctionCallEnvelopeData | null {
		const candidate = envelope as ResponseOutputFunctionCallEnvelope
		const item = candidate?.item
		if (!item || typeof item.type !== 'string' || item.type !== 'function_call') {
			return null
		}
		return {
			item,
			response: candidate.response,
			delta: candidate.delta
		}
	}

	// realtime-session.ts
	/**
	 * Finalizes a tool call buffer when the server signals completion of argument streaming.
	 *
	 * @param envelope - Realtime envelope describing the final arguments chunk.
	 */
	private handleFunctionCallArgumentsDone(envelope: RealtimeEnvelope) {
		const callId = this.extractCallId(envelope)
		if (!callId) {
			return
		}

		const entry = this.ensureToolBuffer(callId)

		// capture responseId if present
		const response = (envelope as { response?: Record<string, unknown> }).response
		if (response && typeof response === 'object' && typeof response.id === 'string') {
			entry.responseId = response.id
		}

		// final args/name may also be present here; pull them if available
		const fn = (envelope as { function_call?: Record<string, unknown> }).function_call
		if (fn && typeof fn === 'object') {
			const name = fn.name
			if (typeof name === 'string') {
				entry.name = name
			}
			const argsText = this.readArguments(fn as Record<string, unknown>)
			if (argsText) {
				entry.argumentsChunks.push(argsText)
			}
		}

		if (entry.name) {
			this.emitBufferedToolCall(entry)
		}
	}

	/**
	 * Appends streaming argument/name deltas to the in-flight tool call buffer.
	 *
	 * @param envelope - Realtime envelope containing the incremental function call delta.
	 */
	private handleFunctionCallDelta(envelope: RealtimeEnvelope) {
		const callId = this.extractCallId(envelope)
		if (!callId) {
			return
		}
		const delta = (envelope as { delta?: Record<string, unknown> }).delta
		if (!delta || typeof delta !== 'object') {
			return
		}

		const entry = this.ensureToolBuffer(callId)
		const response = (envelope as { response?: Record<string, unknown> }).response
		if (response && typeof response === 'object' && typeof response.id === 'string') {
			entry.responseId = response.id
		}
		const name = typeof delta.name === 'string' ? (delta.name as string) : undefined
		if (name) {
			entry.name = name
		}
		const args = typeof delta.arguments === 'string' ? (delta.arguments as string) : ''
		if (args) {
			entry.argumentsChunks.push(args)
		}
	}

	/**
	 * Flushes tool call details once OpenAI confirms the function call response item is done.
	 *
	 * @param envelope - Realtime envelope representing a finalized function call output item.
	 */
	private handleFunctionCallCompleted(envelope: RealtimeEnvelope) {
		const callId = this.extractCallId(envelope)
		if (!callId) {
			return
		}
		const functionCall = (envelope as { function_call?: Record<string, unknown> }).function_call
		if (!functionCall || typeof functionCall !== 'object') {
			return
		}

		const entry = this.ensureToolBuffer(callId)
		const response = (envelope as { response?: Record<string, unknown> }).response
		if (response && typeof response === 'object' && typeof response.id === 'string') {
			entry.responseId = response.id
		}

		const name = typeof functionCall.name === 'string' ? (functionCall.name as string) : undefined
		if (name) {
			entry.name = name
		}

		const argsText = this.readArguments(functionCall)
		if (argsText) {
			entry.argumentsChunks.push(argsText)
		}

		this.emitBufferedToolCall(entry)
	}

	/**
	 * Emits buffered tool calls when the server requests external action and prevents
	 * duplicate emissions by tracking argument chunks.
	 *
	 * @param envelope - Realtime envelope describing the required action payload.
	 */
	private handleRequiredAction(envelope: RealtimeEnvelope) {
		const required = (envelope as { required_action?: Record<string, unknown> }).required_action
		if (!required || typeof required !== 'object') {
			return
		}
		const type = typeof required.type === 'string' ? (required.type as string) : undefined
		if (type !== 'submit_tool_outputs') {
			return
		}
		const payload = (required as { submit_tool_outputs?: Record<string, unknown> }).submit_tool_outputs
		const toolCalls = payload && typeof payload === 'object' ? (payload.tool_calls as unknown) : undefined
		if (!Array.isArray(toolCalls)) {
			return
		}
		const response = (envelope as { response?: Record<string, unknown> }).response
		const responseId =
			response && typeof response === 'object' && typeof response.id === 'string' ? (response.id as string) : undefined

		for (const rawCall of toolCalls) {
			if (!rawCall || typeof rawCall !== 'object') {
				continue
			}
			const callRecord = rawCall as Record<string, unknown>
			const callId = typeof callRecord.id === 'string' ? (callRecord.id as string) : this.extractCallId(callRecord)
			if (!callId) {
				continue
			}
			const entry = this.ensureToolBuffer(callId)
			entry.responseId = responseId ?? entry.responseId
			const name = typeof callRecord.name === 'string' ? (callRecord.name as string) : undefined
			if (name) {
				entry.name = name
			}
			const argumentsText = this.readArguments(callRecord)
			if (argumentsText) {
				entry.argumentsChunks.push(argumentsText)
			}
			this.emitBufferedToolCall(entry)
		}
	}

	/**
	 * Normalizes and emits usage reports while deduplicating by response id.
	 *
	 * @param envelope - Envelope potentially containing usage metadata.
	 */
	private async captureUsage(envelope: RealtimeEnvelope): Promise<void> {
		const usage = this.normalizeUsage(envelope)
		if (!usage) {
			if (process.env.DEBUG?.includes('ai:voice')) {
				logger.debug('realtime usage missing on terminal envelope', {
					type: envelope.type
				})
			}
			return
		}
		const responseId = typeof usage.responseId === 'string' ? usage.responseId : undefined
		if (responseId && this._usageResponses.has(responseId)) {
			return
		}
		if (responseId) {
			this._usageResponses.add(responseId)
		}
		const tokensIn = usage.tokensIn
		const tokensOut = usage.tokensOut
		if (tokensIn === 0 && tokensOut === 0) {
			return
		}
		logger.debug('realtime usage', {
			responseId,
			tokensIn,
			tokensOut,
			envelopeType: envelope.type
		})
		try {
			// Notify listeners about deduplicated realtime token accounting.
			await this._callbacks.onUsage?.({
				model: this._config.model,
				tokensIn,
				tokensOut,
				responseId,
				metadata: usage.metadata,
				raw: usage.raw
			})
		} catch (error) {
			logger.warn('realtime usage callback failed', error)
		}
	}

	/**
	 * Extracts and normalizes token usage from realtime envelopes for ledger recording.
	 *
	 * Attempts to read usage from the top-level `usage` field or nested `response.usage`.
	 * Field names are normalized across variants: `input_tokens`/`prompt_tokens`,
	 * `output_tokens`/`completion_tokens`, and `total_tokens` as a fallback when
	 * individual counts are absent.
	 *
	 * @param envelope - Realtime envelope potentially containing usage metadata.
	 * @returns Normalized usage payload with token counts and response context, or null if unavailable.
	 */
	private normalizeUsage(envelope: RealtimeEnvelope): {
		raw: Record<string, unknown>
		responseId?: unknown
		metadata?: Record<string, unknown>
		tokensIn: number
		tokensOut: number
	} | null {
		const envelopeUsage = envelope && typeof envelope === 'object' ? (envelope as { usage?: unknown }).usage : null
		const response = (envelope as { response?: unknown }).response
		let usageSource: unknown = envelopeUsage
		if ((!usageSource || typeof usageSource !== 'object') && response && typeof response === 'object') {
			usageSource = (response as Record<string, unknown>)['usage'] ?? null
		}
		if (!usageSource || typeof usageSource !== 'object') {
			return null
		}
		const readNumber = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0)
		const usageRaw = usageSource as Record<string, unknown>
		const tokensIn = readNumber(usageRaw['input_tokens'])
		const tokensOut = readNumber(usageRaw['output_tokens'])
		const total = readNumber(usageRaw['total_tokens'])
		const resolvedTokensIn = tokensIn > 0 ? tokensIn : readNumber(usageRaw['prompt_tokens'])
		let resolvedTokensOut = tokensOut > 0 ? tokensOut : readNumber(usageRaw['completion_tokens'])
		if (resolvedTokensIn === 0 && resolvedTokensOut === 0 && total > 0) {
			resolvedTokensOut = total
		}
		let responseId: unknown
		let metadata: Record<string, unknown> | undefined
		if (response && typeof response === 'object') {
			responseId = (response as Record<string, unknown>)['id']
			const metaCandidate = (response as Record<string, unknown>)['metadata']
			if (metaCandidate && typeof metaCandidate === 'object') {
				metadata = metaCandidate as Record<string, unknown>
			}
		}
		return {
			raw: usageRaw,
			responseId,
			metadata,
			tokensIn: resolvedTokensIn,
			tokensOut: resolvedTokensOut
		}
	}

	private ensureToolBuffer(callId: string): ToolCallBufferEntry {
		let entry = this._toolCallBuffers.get(callId)
		if (!entry) {
			entry = {
				callId,
				argumentsChunks: []
			}
			this._toolCallBuffers.set(callId, entry)
		}
		return entry
	}

	private emitBufferedToolCall(entry: ToolCallBufferEntry) {
		if (entry.emitted) {
			return
		}
		const argumentsText = entry.argumentsChunks.join('')
		const parsedArguments = this.parseArguments(argumentsText)
		if (!entry.name) {
			logger.warn('tool call missing name; skipping emission', {
				callId: entry.callId
			})
			return
		}
		const payload: RealtimeToolCall = {
			arguments: parsedArguments,
			argumentsText,
			callId: entry.callId,
			name: entry.name,
			responseId: entry.responseId ?? null
		}
		entry.emitted = true
		this.emit('toolCall', payload)
	}

	private parseArguments(text: string): Record<string, unknown> {
		if (!text) {
			return {}
		}
		try {
			const parsed = JSON.parse(text)
			return typeof parsed === 'object' && parsed ? (parsed as Record<string, unknown>) : {}
		} catch (error) {
			logger.debug('failed to parse realtime tool arguments; returning raw string', {
				error,
				preview: text.slice(0, 200)
			})
			return { __raw: text }
		}
	}

	private extractCallId(source: RealtimeEnvelope | Record<string, unknown>): string | null {
		if (!source || typeof source !== 'object') {
			return null
		}
		const record = source as Record<string, unknown>
		const direct = record['call_id']
		if (typeof direct === 'string' && direct) {
			return direct
		}
		const delta = record['delta']
		if (delta && typeof delta === 'object') {
			const deltaCallId = (delta as Record<string, unknown>)['call_id']
			if (typeof deltaCallId === 'string' && deltaCallId) {
				return deltaCallId
			}
		}
		const fn = record['function_call']
		if (fn && typeof fn === 'object') {
			const fnId = (fn as Record<string, unknown>)['id']
			if (typeof fnId === 'string' && fnId) {
				return fnId
			}
		}
		const id = record['id']
		if (typeof id === 'string' && id) {
			return id
		}
		return null
	}

	private readArguments(source: Record<string, unknown>): string {
		if (!source) {
			return ''
		}
		const value = source['arguments']
		if (typeof value === 'string') {
			return value
		}
		if (value && typeof value === 'object') {
			try {
				return JSON.stringify(value)
			} catch (error) {
				logger.debug('failed to stringify tool arguments object', {
					error,
					keys: Object.keys(value as Record<string, unknown>)
				})
			}
		}
		return ''
	}

	/**
	 * Sends a JSON payload to the realtime WebSocket, wrapping socket errors for caller handling.
	 *
	 * @param payload - Arbitrary realtime event payload conforming to OpenAI's protocol.
	 * @throws Error if the socket is not connected or the send operation fails.
	 */
	private async sendEvent(payload: Record<string, unknown>): Promise<void> {
		const socket = this._socket
		if (!socket || socket.readyState !== socket.OPEN) {
			throw new Error('Realtime session is not connected')
		}
		await new Promise<void>((resolve, reject) => {
			socket.send(JSON.stringify(payload), (err: unknown) => (err ? reject(err) : resolve()))
		})
	}

	/**
	 * Pushes a conversation item into the realtime session context.
	 *
	 * Used to inject synthetic user or assistant messages before invoking `createResponse`.
	 * The payload includes role and content array describing text or audio parts.
	 *
	 * @param item - Conversation item structure with role and content.
	 */
	public async createConversationItem(item: ConversationItemPayload): Promise<void> {
		await this.sendEvent({
			type: 'conversation.item.create',
			item: {
				type: 'message',
				role: item.role,
				content: item.content
			}
		})
	}

	/**
	 * Triggers a new assistant response using the current conversation context.
	 *
	 * Modalities control whether the response includes text, audio, or both. Optional
	 * instructions override session-level prompts for this turn only.
	 *
	 * @param payload - Response creation options including modalities and optional instructions.
	 */
	public async createResponse(payload: ResponseCreatePayload): Promise<void> {
		await this.sendEvent({
			type: 'response.create',
			response: {
				modalities: payload.modalities,
				instructions: payload.instructions,
				metadata: payload.metadata
			}
		})
	}

	/**
	 * Submits tool execution results back to the realtime session, resuming assistant inference.
	 *
	 * Each output pairs a tool call id with its result string. If `responseId` is provided,
	 * the server associates these outputs with a specific multi-turn flow for context continuity.
	 *
	 * @param outputs - Array of tool call results mapping call ids to output strings.
	 * @param responseId - Optional response id to link outputs to a specific turn.
	 */
	public async submitToolOutputs(
		outputs: Array<{ toolCallId: string; output: string }>,
		responseId?: string | null
	): Promise<void> {
		if (!outputs.length) {
			return
		}

		const payload: Record<string, unknown> = {
			type: 'response.create',
			response: {
				tool_outputs: outputs.map((e) => ({
					tool_call_id: e.toolCallId,
					output: e.output
				}))
			}
		}
		if (responseId) {
			;(payload.response as Record<string, unknown>).response_id = responseId
		}
		await this.sendEvent(payload)
	}

	/**
	 * Streams incremental assistant transcript text to consumers as output arrives.
	 *
	 * @param envelope - Envelope carrying the partial transcript delta from OpenAI.
	 */
	private async pushTranscriptDelta(envelope: RealtimeEnvelope): Promise<void> {
		const text =
			typeof envelope.text === 'string' ? (envelope.text as string) : ((envelope.delta as string | undefined) ?? '')
		if (!text) {
			return
		}

		// Forward partial transcript chunks to downstream observers.
		await this._callbacks.onTranscript?.({
			isFinal: false,
			position: {
				start: typeof envelope.start === 'number' ? (envelope.start as number) : Date.now(),
				end: typeof envelope.end === 'number' ? (envelope.end as number) : Date.now()
			},
			speakerId: typeof envelope.speaker === 'string' ? (envelope.speaker as string) : null,
			text
		})
	}

	/**
	 * Emits the final assistant transcript chunk for a turn and flags it as complete.
	 *
	 * @param envelope - Envelope containing the terminal transcript payload.
	 */
	private async pushTranscriptCompleted(envelope: RealtimeEnvelope): Promise<void> {
		const text = typeof envelope.text === 'string' ? (envelope.text as string) : ''
		if (!text) {
			return
		}

		// Deliver the completed transcript segment to listeners.
		await this._callbacks.onTranscript?.({
			isFinal: true,
			position: {
				start: typeof envelope.start === 'number' ? (envelope.start as number) : Date.now(),
				end: typeof envelope.end === 'number' ? (envelope.end as number) : Date.now()
			},
			speakerId: typeof envelope.speaker === 'string' ? (envelope.speaker as string) : null,
			text
		})
	}

	/**
	 * Handles multimodal transcript parts, forwarding partial or final text segments.
	 *
	 * @param envelope - Envelope naming the content part and text delta.
	 * @param isFinal - Indicates whether the snippet closes the content part.
	 */
	private async pushContentPartTranscript(envelope: RealtimeEnvelope, isFinal: boolean): Promise<void> {
		const part = (envelope as { part?: Record<string, unknown> }).part
		if (!part || typeof part !== 'object') {
			return
		}

		const partType = typeof part.type === 'string' ? (part.type as string) : undefined
		if (partType !== 'audio') {
			return
		}

		let transcript: string | undefined
		const maybeDelta = part.delta as Record<string, unknown> | undefined
		if (maybeDelta && typeof maybeDelta === 'object' && typeof maybeDelta.transcript === 'string') {
			transcript = maybeDelta.transcript
		}
		if (!transcript && typeof part.transcript === 'string') {
			transcript = part.transcript as string
		}
		if (!transcript) {
			return
		}

		const start =
			typeof part.start === 'number'
				? (part.start as number)
				: typeof envelope.start === 'number'
					? (envelope.start as number)
					: Date.now()
		const end =
			typeof part.end === 'number'
				? (part.end as number)
				: typeof envelope.end === 'number'
					? (envelope.end as number)
					: Date.now()
		const speaker =
			typeof part.speaker === 'string'
				? (part.speaker as string)
				: typeof envelope.speaker === 'string'
					? (envelope.speaker as string)
					: null

		// Emit the multimodal transcript slice with timing metadata.
		await this._callbacks.onTranscript?.({
			isFinal,
			position: {
				start,
				end
			},
			speakerId: speaker,
			text: transcript
		})
	}

	/**
	 * Relays user speech recognition results, syncing interim or final transcripts upstream.
	 *
	 * @param envelope - Envelope containing the server-vad transcript payload.
	 * @param isFinal - True when the server marks the input transcript complete.
	 */
	private async pushInputTranscript(envelope: RealtimeEnvelope, isFinal: boolean): Promise<void> {
		let transcript: string | undefined
		if (typeof envelope.transcript === 'string') {
			transcript = envelope.transcript
		} else if (typeof envelope.delta === 'string') {
			transcript = envelope.delta
		}
		if (!transcript) {
			return
		}

		const start = typeof envelope.audio_start === 'number' ? envelope.audio_start : Date.now()
		const end = typeof envelope.audio_end === 'number' ? envelope.audio_end : Date.now()
		const participantRaw = (envelope as { participant?: Record<string, unknown> }).participant
		let participantUserId: string | undefined
		if (participantRaw && typeof participantRaw.user_id === 'string') {
			participantUserId = participantRaw.user_id
		}
		const speaker = typeof envelope.speaker === 'string' ? envelope.speaker : (participantUserId ?? this._lastSpeakerId)

		// Publish the interim or final user speech transcript to observers.
		await this._callbacks.onTranscript?.({
			isFinal,
			position: {
				start,
				end
			},
			speakerId: speaker ?? null,
			text: transcript
		})
	}

	/**
	 * Streams synthesized audio packets to playback listeners while tracking format metadata.
	 *
	 * @param envelope - Envelope carrying PCM chunk data for the audio response.
	 */
	private async pushAudioDelta(envelope: RealtimeEnvelope): Promise<void> {
		const base64 = (envelope.delta as string | undefined) ?? ''
		if (!base64) {
			return
		}
		const data = Buffer.from(base64, 'base64')
		const sampleRate = typeof envelope.sample_rate === 'number' ? (envelope.sample_rate as number) : 24_000
		// Stream synthesized PCM audio to the active playback target.
		await this._callbacks.onAudioDelta?.({
			channels: 1,
			data,
			encoding: 'pcm16',
			isFinal: Boolean(envelope.is_final),
			sampleRate,
			timestamp: Date.now()
		})
	}

	/**
	 * Forwards realtime warnings to session callbacks without interrupting flows.
	 *
	 * @param error - Warning or error raised by the realtime service.
	 */
	private async handleWarning(error: Error): Promise<void> {
		// Surface realtime warnings so the runtime can notify clients.
		await this._callbacks.onWarning?.(error)
	}
}
