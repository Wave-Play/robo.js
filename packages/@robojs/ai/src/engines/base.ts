/**
 * Defines the engine contract, chat data structures, and voice streaming primitives used by the
 * {@link @robojs/ai} plugin. Custom engines should extend {@link BaseEngine} and rely on the
 * exported interfaces to ensure compatibility with Robo's runtime expectations.
 */
import type { ChatReply } from '../core/chat/types.js'
import type { GuildMember, TextBasedChannel, User, VoiceBasedChannel } from 'discord.js'
import type { Command } from 'robo.js'

/**
 * Enumerates feature flags describing the optional capabilities an engine exposes.
 *
 * @property voice Indicates whether the engine can join and respond within voice sessions.
 * @property voiceTranscription True when the engine can perform speech-to-text transcription.
 * @property vision Signals that the model can consume multimodal inputs such as images.
 */
export interface EngineSupportedFeatures {
	/** Indicates whether the engine can join and respond within voice sessions. */
	voice: boolean
	/** True when the engine can perform speech-to-text transcription. */
	voiceTranscription: boolean
	/** Signals that the model can consume multimodal inputs such as images. */
	vision: boolean
}

/**
 * Hook function invoked during message orchestration. Hooks can adjust the message array before each
 * attempt, enabling preprocessing, safety filters, or analytics.
 *
 */
export interface ChatHookContext {
	channel: TextBasedChannel | null
	member: GuildMember | null
	messages: ChatMessage[]
	user: User | null
}

export interface ReplyHookContext {
	channel: TextBasedChannel | null
	member: GuildMember | null
	mcpCalls?: MCPCall[]
	/** MCP server labels that were degraded (removed) due to persistent failures. */
	degradedMcpServers?: string[] | null
	response: ChatResult
	user: User | null
}

export type ChatHook = (context: ChatHookContext) => Promise<void | ChatMessage[]> | void | ChatMessage[]

export type ReplyHook = (context: ReplyHookContext) => Promise<ChatReply | void> | ChatReply | void

export type Hook = ChatHook | ReplyHook

export type HookEvent = 'chat' | 'reply'

/**
 * Normalized representation of a chat message exchanged with an engine.
 *
 * @example User text message
 * ```ts
 * const message: ChatMessage = {
 *   role: 'user',
 *   content: 'How do I deploy my Robo project?'
 * }
 * ```
 *
 * @example Assistant tool invocation
 * ```ts
 * const message: ChatMessage = {
 *   role: 'assistant',
 *   content: '',
 *   function_call: {
 *     name: 'deployProject',
 *     arguments: { target: 'production' }
 *   }
 * }
 * ```
 */
export interface ChatMessage {
	/** Raw or structured message payload. */
	content: ChatMessageContent
	/** Function call issued by the assistant for tool execution. */
	function_call?: ChatFunctionCall
	/** Optional author name useful for function-originated replies. */
	name?: string
	/** Role describing the source of the message. */
	role: 'assistant' | 'function' | 'system' | 'user'
}

/**
 * Structured content block used when a message contains multimodal payloads.
 */
interface ChatMessageContentObject {
	/** Remote URL describing an image to include in the prompt. */
	image_url?: string
	/** Text snippet included alongside other content entries. */
	text?: string
	/** Type discriminator describing the entry shape. */
	type: 'image_url' | 'text'
}

/**
 * Union representing plain text or an array of structured content entries.
 */
export type ChatMessageContent = string | ChatMessageContentObject[]

/**
 * Definition describing an available tool or function call that an engine may invoke.
 */
export interface ChatFunction {
	/** Programmatic identifier for the function. */
	name: string
	/** Human-readable description surfaced to the model. */
	description: string
	/** JSON schema describing the function arguments. */
	parameters: ChatFunctionParameters
}

/**
 * Configuration for an MCP (Model Context Protocol) server tool.
 * MCP tools are server-side proxied by OpenAI, requiring no local execution logic.
 */
export interface MCPTool extends Record<string, unknown> {
	/** Tool type discriminator, must be 'mcp'. */
	type: 'mcp'
	/** Human-readable label identifying the MCP server. */
	server_label: string
	/** Base URL of the MCP server endpoint. */
	server_url: string
	/** Optional HTTP headers to include in MCP requests (e.g., API keys). */
	headers?: Record<string, string>
	/** Optional whitelist of tool names allowed from this server. */
	allowed_tools?: string[]
	/** Approval requirement for tool calls: 'never' (auto-approve) or 'always' (require approval). */
	require_approval?: 'never' | 'always'
}

/**
 * JSON schema snippet describing function parameters accepted by a chat tool.
 */
export interface ChatFunctionParameters {
	/** Dictionary of property names to schema definitions. */
	properties: Record<string, ChatFunctionProperty>
	/** Required property names that must be supplied. */
	required?: string[]
	/** Top-level schema type, defaults to `object`. */
	type?: 'array' | 'object'
}

/**
 * Invocation payload provided when an engine requests tool execution.
 */
export interface ChatFunctionCall {
	/** Identifier supplied when the model tracks a tool call across responses. */
	id?: string
	/** Name of the function to execute. */
	name: string
	/** Parsed arguments adhering to {@link ChatFunctionParameters}. */
	arguments: Record<string, unknown>
}

export interface MCPCall {
	name: string
	arguments: Record<string, unknown>
	serverLabel: string | null
}

/**
 * Schema fragment representing a property definition within {@link ChatFunctionParameters}.
 */
export interface ChatFunctionProperty {
	/** Human-readable description exposed to the model. */
	description?: string
	/** Enumerated accepted values, if applicable. */
	enum?: Array<string | number | boolean>
	/** Nested schema for array item validation. */
	items?: ChatFunctionProperty
	/** Minimum numeric value when `type` is numeric. */
	minimum?: number
	/** Maximum numeric value when `type` is numeric. */
	maximum?: number
	/** Primitive JSON schema type. */
	type: 'array' | 'string' | 'number' | 'integer' | 'boolean'
}

/**
 * Optional conversation metadata supplied when invoking {@link BaseEngine.chat}.
 */
export interface ConversationInput {
	/** Stable conversation identifier used for threading. */
	id?: string | null
	/** Arbitrary metadata persisted alongside conversation state. */
	metadata?: Record<string, unknown>
}

/**
 * Snapshot describing an active or previous conversation.
 */
export interface ConversationState {
	/** Identifier assigned by the engine for subsequent interactions. */
	id: string
	/** Metadata persisted across turns for custom engines. */
	metadata?: Record<string, unknown>
	/** Identifier of the last response returned to the caller. */
	previousResponseId?: string | null
	/** Provider key describing the backing engine implementation. */
	provider?: string
}

/**
 * Options controlling a chat invocation.
 *
 * @example Basic text chat
 * ```ts
 * const options: ChatOptions = {
 *   model: 'gpt-4o-mini',
 *   showTyping: true
 * }
 * ```
 *
 * @example Voice-enabled chat
 * ```ts
 * const options: ChatOptions = {
 *   userId: '123',
 *   voice: {
 *     sessionId: 'abc',
 *     strategy: 'server-vad'
 *   }
 * }
 * ```
 */
export interface ChatOptions {
	/** Existing conversation context to continue. */
	conversation?: ConversationInput
	/** List of available functions the engine may call. */
	functions?: ChatFunction[]
	/** Preferred model identifier. */
	model?: string
	/** Toggle for Discord typing indicator. */
	showTyping?: boolean
	/** Temperature applied to sampling, when supported. */
	temperature?: number
	/** Discord thread identifier for context. */
	threadId?: string | null
	/** Discord user identifier for analytics attribution. */
	userId?: string | null
	/** Voice chat configuration enabling hybrid sessions. */
	voice?: VoiceChatOptions
}

/**
 * Additional configuration applied when orchestrating a voice-enabled chat.
 */
export interface VoiceChatOptions {
	/** Number of audio channels supplied by the caller. */
	channels?: number
	/** Conversation identifier for persisted voice transcripts. */
	conversationId?: string | null
	/** Sample rate of inbound audio frames. */
	sampleRate?: number
	/** Identifier of the active voice session. */
	sessionId?: string | null
	/** Endpointing strategy controlling speech detection. */
	strategy?: VoiceEndpointingStrategy
	/** Existing transcript segments to seed the session. */
	transcript?: VoiceTranscriptSegment[]
}

/**
 * Parameters accepted by {@link BaseEngine.generateImage} requests.
 */
export interface GenerateImageOptions {
	/** Image-capable model identifier. */
	model?: string
	/** Text prompt describing the desired image. */
	prompt: string
}

/**
 * Result returned by {@link BaseEngine.generateImage}.
 */
export interface GenerateImageResult {
	/** Array of either base64 encoded payloads or remote URLs. */
	images: Array<
		| {
				/** Base64 encoded image data. */
				base64: string
		  }
		| {
				/** Remote URL pointing to the generated asset. */
				url: string
		  }
	>
}

/**
 * Normalized chat response structure returned by engines.
 */
export interface ChatResult {
	/** Updated conversation state to persist for future calls. */
	conversation?: ConversationState
	/** Reason provided by the API for ending the completion. */
	finish_reason: string
	/** Assistant message when no tool call was issued. */
	message?: ChatMessage
	/** Provider-specific payload for debugging or auditing. */
	rawResponse?: unknown
	/** Any tool calls emitted during the completion. */
	toolCalls?: ChatFunctionCall[]
	/** Any MCP calls emitted during the completion. */
	mcpCalls?: MCPCall[]
	/** MCP server labels that were degraded (removed) due to persistent failures. */
	degradedMcpServers?: string[] | null
	/** Voice response metadata, when applicable. */
	voice?: VoiceChatResult
}

/**
 * Strategy describing how voice endpointing should occur.
 */
export type VoiceEndpointingStrategy = 'server-vad' | 'manual'

/**
 * Audio frame delivered to the engine when streaming microphone input.
 */
export interface VoiceInputFrame {
	/** Number of audio channels encoded within the frame. */
	channels: number
	/** Raw PCM data for the frame. */
	data: Buffer
	/** Encoding used for `data`. */
	encoding: 'pcm16'
	/** Signals when the caller believes speech content has ended. */
	isSpeechEnd?: boolean
	/** Frame length in PCM samples. */
	length: number
	/** Optional speaker identifier for diarization-aware engines. */
	speakerId?: string | null
	/** Sample rate applied to the frame. */
	sampleRate: number
	/** Timestamp in milliseconds when the frame was captured. */
	timestamp: number
}

/**
 * Transcription segment produced during a voice session.
 */
export interface VoiceTranscriptSegment {
	/** Indicates whether the transcript text is final. */
	isFinal: boolean
	/** Millisecond offsets covering the speech segment. */
	position: {
		/** Exclusive end timestamp in milliseconds. */
		end: number
		/** Inclusive start timestamp in milliseconds. */
		start: number
	}
	/** Optional speaker identifier, if diarization is enabled. */
	speakerId?: string | null
	/** Recognized transcript text. */
	text: string
}

/**
 * Delta describing audio playback data streamed to the caller.
 */
export interface VoicePlaybackDelta {
	/** Number of channels contained in the audio chunk. */
	channels: number
	/** Audio payload encoded as specified by {@link VoicePlaybackDelta.encoding}. */
	data: Buffer
	/** Encoding of the playback data. */
	encoding: 'pcm16' | 'opus'
	/** Indicates whether this is the final chunk for the response. */
	isFinal: boolean
	/** Sample rate of the playback chunk. */
	sampleRate: number
	/** Timestamp (ms) establishing playback ordering. */
	timestamp: number
}

/**
 * Supplemental metadata describing a voice interaction.
 */
export interface VoiceChatMetadata {
	/** Transcript segments accumulated thus far. */
	segments?: VoiceTranscriptSegment[]
	/** Voice endpointing strategy used in the session. */
	strategy?: VoiceEndpointingStrategy
	/** Indicates whether the input stream was committed. */
	wasCommitted?: boolean
}

/**
 * Voice-specific response envelope accompanying chat results.
 */
export interface VoiceChatResult {
	/** Async iterator streaming audio playback deltas. */
	audio?: AsyncIterable<VoicePlaybackDelta>
	/** Additional metadata describing the voice session. */
	metadata?: VoiceChatMetadata
	/** Identifier of the active voice session. */
	sessionId: string
}

/**
 * Configuration structure used when starting a managed voice session.
 *
 * @example Starting a voice session
 * ```ts
 * await engine.startVoiceSession({
 *   guildId: '123',
 *   sessionId: 'voice-1',
 *   channel: voiceChannel,
 *   frameSource: microphoneStream,
 *   configuration: {
 *     endpointing: 'server-vad',
 *     targetSampleRate: 16000
 *   }
 * })
 * ```
 */
export interface VoiceSessionStartOptions {
	/** Voice channel to join for playback. */
	channel: VoiceBasedChannel | null
	/** Engine-specific configuration describing voice runtime behavior. */
	configuration: {
		/** Endpointing strategy to use for speech detection. */
		endpointing: VoiceEndpointingStrategy
		/** Maximum silence tolerated before auto-stopping (ms). */
		maxSilenceMs?: number
		/** Optional override for the realtime model identifier. */
		model?: string
		/** Voice name used for playback responses. */
		playbackVoice?: string | null
		/** API key for realtime services when required. */
		realtimeApiKey?: string | null
		/** Sample rate expected by the engine. */
		targetSampleRate: number
	}
	/** Conversation metadata shared with chat flows. */
	conversation?: ConversationInput
	/** Cache key used to resume prior voice sessions. */
	conversationKey?: string
	/** Streaming source of microphone frames. */
	frameSource: AsyncIterable<VoiceInputFrame>
	/** Discord guild identifier hosting the session. */
	guildId: string
	/** Guild member initiating the session, if any. */
	member?: GuildMember | null
	/** Unique session identifier generated by the caller. */
	sessionId: string
	/** Text channel used for transcription updates. */
	textChannel?: TextBasedChannel | null
	/** Target text channel for transcripts or summaries. */
	transcriptTarget?: TextBasedChannel | null
	/** Discord user identifier associated with the session. */
	userId?: string | null
	/** Callback invoked with generated playback audio chunks. */
	onAudioDelta?: (delta: VoicePlaybackDelta) => Promise<void> | void
	/** Callback invoked whenever a new transcript segment is available. */
	onTranscription?: (segment: VoiceTranscriptSegment) => Promise<void> | void
	/** Callback invoked when the engine emits a warning. */
	onWarning?: (warning: Error) => Promise<void> | void
}

/**
 * Handle returned by {@link BaseEngine.startVoiceSession} to control an active session.
 */
export interface VoiceSessionHandle {
	/** Voice channel identifier associated with the session. */
	channelId: string
	/** Requests that buffered audio be committed for processing. */
	commitInput?: () => Promise<void>
	/** Guild identifier for the session. */
	guildId: string
	/** Unique identifier assigned to the session. */
	id: string
	/** Pump additional audio frames into the session. */
	pump?: (frame: VoiceInputFrame) => Promise<void>
	/** Stop the session and optionally provide a reason. */
	stop?: (reason?: string) => Promise<void>
	/** Related text channel identifier, when applicable. */
	textChannelId?: string | null
}

/**
 * Abstract base class to be extended by AI engine implementations. Provides hook orchestration,
 * default capability flags, and optional voice-session helpers.
 *
 * @example Implementing a custom engine
 * ```ts
 * class MyEngine extends BaseEngine {
 *   public async chat(messages: ChatMessage[], options: ChatOptions) {
 *     // Call provider API and translate the result to ChatResult
 *     return provider.complete(messages, options)
 *   }
 *
 *   public getFunctionHandlers() {
 *     return {}
 *   }
 *
 *   public getInfo() {
 *     return { name: 'my-engine', version: '1.0.0' }
 *   }
 * }
 * ```
 *
 * @example Registering a preprocessing hook
 * ```ts
 * engine.on('chat', async (ctx) => {
 *   return ctx.messages.filter(Boolean)
 * })
 * ```
 *
 * @example Inspecting supported features
 * ```ts
 * if (engine.supportedFeatures().voice) {
 *   await engine.startVoiceSession(options)
 * }
 * ```
 *
 * @remarks Subclasses must implement {@link BaseEngine.chat}, {@link BaseEngine.generateImage},
 * {@link BaseEngine.getFunctionHandlers}, and {@link BaseEngine.getInfo}. Override optional voice
 * methods when providing realtime functionality.
 */
export abstract class BaseEngine {
	/** Registered hooks keyed by event type. */
	protected _hooks: Map<HookEvent, Hook[]> = new Map()

	/**
	 * Returns the supported feature flags for the engine. Override to enable capabilities.
	 */
	public supportedFeatures(): EngineSupportedFeatures {
		return {
			voice: false,
			voiceTranscription: false,
			vision: false
		}
	}

	/**
	 * Sequentially executes registered hooks for the given event while allowing each hook to mutate
	 * the message array.
	 *
	 * @param event Hook event name.
	 * @param context Mutable hook context.
	 * @param iteration Current retry iteration.
	 * @returns Latest message array after all hooks have run.
	 */
	public async callHooks(event: 'chat', context: ChatHookContext): Promise<void>
	public async callHooks(event: 'reply', context: ReplyHookContext): Promise<ChatReply | void>
	public async callHooks(event: HookEvent, context: ChatHookContext | ReplyHookContext): Promise<ChatReply | void> {
		const hooks = this._hooks.get(event) ?? []
		for (const hook of hooks) {
			if (event === 'chat') {
				const result = await (hook as ChatHook)(context as ChatHookContext)
				if (Array.isArray(result)) {
					;(context as ChatHookContext).messages = result
				}
			} else if (event === 'reply') {
				const reply = await (hook as ReplyHook)(context as ReplyHookContext)
				if (reply) {
					return reply
				}
			}
		}
	}

	/**
	 * Produces a conversational response based on supplied messages and options.
	 *
	 * @param messages Message history presented to the engine.
	 * @param options Additional configuration for the completion request.
	 * @returns Chat response including tool calls, conversation state, and voice metadata.
	 */
	public abstract chat(messages: ChatMessage[], options: ChatOptions): Promise<ChatResult>

	/**
	 * Generates an image using the backing provider.
	 *
	 * @param options Prompt and configuration for the image request.
	 * @returns Generated images represented as base64 payloads or URLs.
	 */
	public abstract generateImage(options: GenerateImageOptions): Promise<GenerateImageResult>

	/**
	 * Returns a mapping of function names to Robo command handlers invoked during tool execution.
	 */
	public abstract getFunctionHandlers(): Record<string, Command>

	/**
	 * Provides descriptive information about the engine for diagnostics or inspection tooling.
	 */
	public abstract getInfo(): Record<string, unknown>

	/**
	 * Optionally returns MCP (Model Context Protocol) tool configurations for this engine.
	 * Engines that support MCP should override this method to return their configured MCP servers.
	 *
	 * @returns Array of MCP tool configurations, or empty array if MCP is not supported.
	 */
	public getMCPTools?(): MCPTool[] {
		return []
	}

	/**
	 * Optionally summarize tool execution results for provider-specific follow-up prompts.
	 *
	 * @param _params Details describing the tool invocation to summarize.
	 * @returns Summary text and an optional response identifier for traceability.
	 */
	public async summarizeToolResult?(_params: {
		call: ChatFunctionCall
		model?: string
		resultText: string
		success: boolean
	}): Promise<{ summary: string; responseId: string | null }> {
		return {
			summary: _params.resultText,
			responseId: null
		}
	}

	/**
	 * Perform asynchronous initialization prior to handling requests. Override for custom setup.
	 */
	public async init(): Promise<void> {
		// Do nothing by default
	}

	/**
	 * Starts a realtime voice session. Engines without voice capabilities should override
	 * {@link BaseEngine.supportedFeatures} or this method to avoid throwing.
	 *
	 * @param _options Voice session options supplied by the caller.
	 * @throws Always throws when not overridden by subclasses.
	 */
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public async startVoiceSession(_options: VoiceSessionStartOptions): Promise<VoiceSessionHandle> {
		throw new Error(`${this.constructor.name} does not support voice sessions`)
	}

	/**
	 * Stops a realtime voice session previously started by {@link BaseEngine.startVoiceSession}.
	 *
	 * @param _handle Voice session handle.
	 * @throws Always throws when voice is unsupported.
	 */
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public async stopVoiceSession(_handle: VoiceSessionHandle): Promise<void> {
		throw new Error(`${this.constructor.name} does not support voice sessions`)
	}

	/**
	 * Removes a previously registered hook from the engine.
	 *
	 * @param event Hook event name.
	 * @param hook Hook callback to remove.
	 */
	public off(event: HookEvent, hook: Hook) {
		const hooks = this._hooks.get(event)
		if (hooks) {
			const index = hooks.indexOf(hook)
			if (index !== -1) {
				hooks.splice(index, 1)
			}
		}
	}

	/**
	 * Registers a hook to run during specific engine orchestration events.
	 *
	 * @param event Hook event name.
	 * @param hook Hook callback to register.
	 */
	public on(event: HookEvent, hook: Hook) {
		if (!this._hooks.has(event)) {
			this._hooks.set(event, [])
		}
		this._hooks.get(event)?.push(hook)
	}
}
