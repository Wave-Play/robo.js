/**
 * @module plugin-ai/engines/openai/engine
 * Bridges Robo.js with OpenAI's Responses, realtime, and vector store APIs while
 * coordinating persistent conversation state, knowledge synchronization, voice
 * orchestration, tool execution, and usage tracking across chat and voice sessions.
 */
import { _PREFIX, packageJson } from '@/core/constants.js'
import { logger } from '@/core/logger.js'
import { BaseEngine, type EngineSupportedFeatures, type MCPTool } from '@/engines/base.js'
import { options as pluginOptions } from '@/events/_start.js'
import fs from 'node:fs/promises'
import type { Stats } from 'node:fs'
import path from 'node:path'
import OpenAI, { toFile } from 'openai'
import type { OpenAiRealtimeSession, RealtimeToolCall, RealtimeUsageReport } from '@/engines/openai/realtime-session.js'
import { OptionalDependencyError } from '@/core/voice/deps.js'
import { scheduleToolRun, type ToolDigest } from '@/core/tool-runner.js'
import { executeFunctionCall } from '@/core/tool-executor.js'
import type { ChatReply } from '@/core/chat/types.js'
import type {
	ChatFunction,
	ChatFunctionProperty,
	ChatFunctionCall,
	ChatMessage,
	ChatOptions,
	ChatResult,
	ConversationState,
	VoicePlaybackDelta,
	VoiceInputFrame,
	VoiceSessionHandle,
	VoiceSessionStartOptions,
	VoiceTranscriptSegment,
	MCPCall
} from '@/engines/base.js'
import type {
	Response,
	ResponseCreateParamsNonStreaming,
	ResponseFunctionToolCall,
	ResponseInputItem,
	ResponseInputMessageContentList,
	ResponseOutputItem,
	ResponseOutputMessage,
	ResponseOutputText,
	ResponseOutputRefusal
} from 'openai/resources/responses/responses'
import { Flashcore, client, color, portal } from 'robo.js'
import type { Command } from 'robo.js'
import { ImagesResponse } from 'openai/resources/images.js'
import type { ReasoningEffort, ResponsesModel } from 'openai/resources/shared.js'
import { incrementRealtimeReconnects, incrementFailedFrameAppends } from '@/core/voice/metrics.js'
import type { AudioTranscription, RealtimeSession } from 'openai/resources/realtime/realtime.js'
import { assertWithinLimit, recordUsage, TokenLimitError, type TokenLimitBreach } from '@/core/token-ledger.js'
import type { GuildMember, TextBasedChannel } from 'discord.js'

type ResponsesModelId = ResponsesModel
type ReasoningEffortLevel = Exclude<ReasoningEffort, null>
type ReasoningCapableModel = Extract<ResponsesModelId, `o${string}` | `gpt-5${string}`>

type NonReasoningChatDefaults = {
	/** Default Responses model used when reasoning extensions are not needed. */
	model?: Exclude<ResponsesModelId, ReasoningCapableModel>
	/** Per-turn cap for assistant output tokens within non-reasoning conversations. */
	maxOutputTokens?: number | 'inf'
	/** Temperature applied to conversational generations when reasoning is disabled. */
	temperature?: ResponseCreateParamsNonStreaming['temperature']
}

type ReasoningChatDefaults = {
	/** Reasoning-capable model that powers structured tool execution and deliberation. */
	model: ReasoningCapableModel
	/** Maximum output token allowance for reasoning conversations. */
	maxOutputTokens?: number | 'inf'
	/** Temperature for responses when using reasoning-capable models. */
	temperature?: ResponseCreateParamsNonStreaming['temperature']
	/** Optional reasoning budget hint forwarded to the Responses API. */
	reasoningEffort?: ReasoningEffortLevel
}

/** Shared chat defaults that may use reasoning or non-reasoning OpenAI models. */
type OpenAiChatDefaults = NonReasoningChatDefaults | ReasoningChatDefaults

type OpenAiVoiceDefaults = {
	/** Default realtime model that streams audio synthesis. */
	model?: NonNullable<RealtimeSession['model']>
	/** Optional transcription configuration for live speech recognition. */
	transcription?: AudioTranscription | null
}

type ResolvedChatDefaults = {
	model: ResponsesModelId
	maxOutputTokens?: number | 'inf'
	temperature?: ResponseCreateParamsNonStreaming['temperature']
	reasoningEffort?: ReasoningEffortLevel
}

type ResolvedVoiceDefaults = {
	model: string
	transcription?: AudioTranscription | null
}

export interface OpenAiEngineOptions {
	/** Overrides forwarded to the OpenAI SDK client constructor. */
	clientOptions?: ConstructorParameters<typeof OpenAI>[0]
	/** Default chat behaviour spanning model choice, limits, and temperature. */
	chat?: OpenAiChatDefaults
	/** Default realtime voice behaviours including model and transcription hints. */
	voice?: OpenAiVoiceDefaults
	/** Enables optional web search tool exposure to the Responses API. */
	webSearch?: boolean
	/** MCP error handling configuration. */
	mcp?: {
		/** Enable graceful degradation by removing MCP tools on persistent failures. Default: true */
		gracefulDegradation?: boolean
		/** Number of extra retry attempts before degrading. Default: 1 */
		extraRetries?: number
		/** Base delay in milliseconds for exponential backoff. Default: 500 */
		baseDelayMs?: number
		/** Maximum delay in milliseconds for exponential backoff. Default: 2000 */
		maxDelayMs?: number
	}
}

const VISION_MODEL_HINTS = ['vision', 'gpt-4o', 'gpt-4.1', 'gpt-5', 'gpt-5-codex', 'omni', 'o1', 'o3'] as const

function isVisionCapableModel(model?: string): boolean {
	if (!model) {
		return false
	}
	const normalized = model.toLowerCase()
	return VISION_MODEL_HINTS.some((hint) => normalized.includes(hint))
}

const DEFAULT_MODEL = 'gpt-4o'
const DEFAULT_REALTIME_MODEL = 'gpt-realtime'
const MAX_REALTIME_RETRIES = 3
const CONVERSATION_NAMESPACE = _PREFIX + '/conversation'
const KNOWLEDGE_NAMESPACE = _PREFIX + '/knowledge'
const KNOWLEDGE_FILES_KEY = 'files'
const KNOWLEDGE_VECTOR_STORE_KEY = 'vectorStoreId'
const DOCUMENTS_DIRNAME = 'documents'
const HISTORY_TAIL_DEFAULT = 6
const VOICE_NAMESPACE = _PREFIX + '/voice'

interface SessionState {
	/** OpenAI conversation identifier anchoring Responses API continuity. */
	conversationId: string
	/** Last response token id used to resume tool and assistant turns. */
	previousResponseId: string | null
	/** Rolling natural-language summary persisted for fast context restoration. */
	summary: {
		/** Latest condensed conversation summary snippet. */
		text: string
		/** Epoch timestamp describing the last summary refresh. */
		updatedAt: number
	}
	/** Sliding window of user/assistant utterances retained for context rebuild. */
	historyTail: {
		/** Ordered text snippets forming the retained conversation tail. */
		items: Array<{ role: 'user' | 'assistant'; text: string }>
		/** Maximum number of history items to keep in the tail buffer. */
		k: number
	}
}

interface CachedKnowledgeFile {
	/** Byte size of the local document snapshot when last indexed. */
	bytes: number
	/** Remote vector store file identifier tracking the upload. */
	fileId: string
}

interface VoiceSessionState {
	abortController: AbortController
	conversationKey: string
	options: VoiceSessionStartOptions
	realtime: OpenAiRealtimeSession
	segments: VoiceTranscriptSegment[]
	reconnecting: boolean
	sessionState: SessionState
	appendedSamples: number
	toolCallListener?: (payload: RealtimeToolCall) => void
	lastSpeakerId?: string | null
	lastSpeakerMember?: GuildMember | null
	memberCache: Map<string, GuildMember>
	activeAnnouncementIds: Set<string>
}

/**
 * Coordinates OpenAI powered chat, tool calling, voice, and media capabilities for Robo.js.
 *
 * The engine keeps Flashcore-backed conversation state in sync, mirrors knowledge documents
 * into the OpenAI vector store, brokers Responses API calls for text, images, and tools, and
 * orchestrates realtime voice sessions with usage metering across chat and audio workloads.
 */
export class OpenAiEngine extends BaseEngine {
	private readonly _client: OpenAI
	private readonly _chatDefaults: ResolvedChatDefaults
	private readonly _voiceDefaults: ResolvedVoiceDefaults
	private readonly _webSearchEnabled: boolean
	private readonly _mcpConfig: {
		gracefulDegradation: boolean
		extraRetries: number
		baseDelayMs: number
		maxDelayMs: number
	}
	private _functions: ChatFunction[] = []
	private _functionHandlers: Record<string, Command> = {}
	private _vectorStoreId: string | null = null
	private _voiceSessions = new Map<string, VoiceSessionState>()
	private _mcpServers: MCPTool[] = []

	public constructor(options: OpenAiEngineOptions = {}) {
		const clientOptions = { ...(options.clientOptions ?? {}) }
		const providedApiKey = typeof clientOptions.apiKey === 'string' ? clientOptions.apiKey.trim() : clientOptions.apiKey
		const envApiKey = typeof process.env.OPENAI_API_KEY === 'string' ? process.env.OPENAI_API_KEY.trim() : undefined
		const resolvedApiKey = providedApiKey && `${providedApiKey}`.length > 0 ? providedApiKey : envApiKey
		if (!resolvedApiKey) {
			throw new Error(
				'OpenAI API key is required to construct OpenAiEngine. Set OPENAI_API_KEY or provide clientOptions.apiKey.'
			)
		}
		clientOptions.apiKey = resolvedApiKey

		super()
		this._client = new OpenAI(clientOptions)
		const chatDefaults = options.chat ?? {}
		this._chatDefaults = {
			model: (chatDefaults.model ?? DEFAULT_MODEL) as ResponsesModelId,
			maxOutputTokens: chatDefaults.maxOutputTokens,
			temperature: chatDefaults.temperature,
			reasoningEffort: 'reasoningEffort' in chatDefaults ? chatDefaults.reasoningEffort : undefined
		}
		const voiceDefaults = options.voice ?? {}
		this._voiceDefaults = {
			model: voiceDefaults.model ?? DEFAULT_REALTIME_MODEL,
			transcription: voiceDefaults.transcription
		}
		this._webSearchEnabled = options.webSearch === true
		const mcpConfig = options.mcp ?? {}
		this._mcpConfig = {
			gracefulDegradation: mcpConfig.gracefulDegradation ?? true,
			extraRetries: mcpConfig.extraRetries ?? 1,
			baseDelayMs: mcpConfig.baseDelayMs ?? 500,
			maxDelayMs: mcpConfig.maxDelayMs ?? 2000
		}
	}

	/**
	 * Loads plugin command functions and primes the knowledge vector store so chat
	 * sessions have tool metadata and embeddings ready before handling traffic.
	 */
	public async init(): Promise<void> {
		const { functions, handlers } = await loadFunctions()
		this._functions = functions
		this._functionHandlers = handlers

		// Validate and load MCP servers
		const rawMcpServers = pluginOptions.mcpServers ?? []
		const validatedServers: MCPTool[] = []
		const seenLabels = new Set<string>()

		for (let i = 0; i < rawMcpServers.length; i++) {
			const server = rawMcpServers[i]
			const errors: string[] = []

			// Check required fields
			if (!server.type || server.type !== 'mcp') {
				errors.push('missing or invalid type (must be "mcp")')
			}
			if (!server.server_label || typeof server.server_label !== 'string') {
				errors.push('missing or invalid server_label')
			}
			if (!server.server_url || typeof server.server_url !== 'string') {
				errors.push('missing or invalid server_url')
			}

			// Check for duplicate labels
			if (server.server_label && seenLabels.has(server.server_label)) {
				errors.push(`duplicate server_label: "${server.server_label}"`)
			}

			if (errors.length > 0) {
				logger.warn(`Skipping invalid MCP server configuration at index ${i}: ${errors.join(', ')}`)
				continue
			}

			// Validate optional fields
			if (server.headers !== undefined && (typeof server.headers !== 'object' || Array.isArray(server.headers))) {
				logger.warn(
					`MCP server "${server.server_label}" has invalid headers (expected object), ignoring headers`
				)
				server.headers = undefined
			}
			if (
				server.allowed_tools !== undefined &&
				(!Array.isArray(server.allowed_tools) || !server.allowed_tools.every((tool) => typeof tool === 'string'))
			) {
				logger.warn(
					`MCP server "${server.server_label}" has invalid allowed_tools (expected string array), ignoring allowed_tools`
				)
				server.allowed_tools = undefined
			}
			if (
				server.require_approval !== undefined &&
				server.require_approval !== 'never' &&
				server.require_approval !== 'always'
			) {
				logger.warn(
					`MCP server "${server.server_label}" has invalid require_approval value "${server.require_approval}", defaulting to "never"`
				)
				server.require_approval = 'never'
			}

			validatedServers.push(server)
			seenLabels.add(server.server_label)
		}

		this._mcpServers = validatedServers
		if (this._mcpServers.length > 0) {
			logger.debug(`Loaded ${this._mcpServers.length} MCP servers for OpenAI engine`)
		} else if (rawMcpServers.length > 0) {
			logger.warn(`No valid MCP servers found after validation (${rawMcpServers.length} configured)`)
		}

		try {
			this._vectorStoreId = await this.ensureKnowledgeVectorStore()
		} catch (error) {
			logger.warn('Failed to prepare knowledge base:', error)
		}
	}

	/**
	 * Executes a chat turn against OpenAI's Responses API while maintaining Flashcore
	 * conversation state, rotating response ids around tool calls, and logging usage.
	 *
	 * @param messages - Ordered dialogue history culminating in the latest user prompt.
	 * @param options - Per-request overrides such as model, temperature, or conversation key.
	 * @returns Parsed chat result containing assistant text, tool calls, and metadata.
	 */
	public async chat(messages: ChatMessage[], options: ChatOptions): Promise<ChatResult> {
		const model = options.model ?? this._chatDefaults.model
		const temperature = options.temperature ?? this._chatDefaults.temperature
		const maxOutputTokens = this._chatDefaults.maxOutputTokens
		const conversationKey = this.getConversationKey(options)
		await assertWithinLimit(model, 'chat')

		if (messages.length === 0) {
			throw new Error('No messages provided to OpenAiEngine.chat')
		}

		const session = await this.ensureSessionState(conversationKey, options)
		const latestUserMessage = [...messages].reverse().find((message) => message.role === 'user')
		if (latestUserMessage) {
			const userText = this.extractTextFromChatMessage(latestUserMessage)
			if (userText.trim().length > 0) {
				this.appendHistory(session, { role: 'user', text: userText })
			}
		}

		// Extract system messages (e.g., surrounding context) to include in instructions
		// Exclude the main instructions system message since it's handled separately
		const mainInstructions = pluginOptions?.instructions?.trim() ?? ''
		const systemContext = messages
			.filter((m) => {
				if (m.role !== 'system') {
					return false
				}
				// Exclude the main instructions message
				const content = this.extractTextFromChatMessage(m)
				return content !== mainInstructions && content.trim().length > 0
			})
			.map((m) => this.extractTextFromChatMessage(m))
			.filter((t) => t && t.trim().length > 0)
			.join('\n\n')

		const inputItems = this.buildConversationInput(messages)
		// Build the Responses API payload for the current chat turn.
		const payload: Record<string, unknown> = {
			instructions: this.buildChatInstructions(
				session,
				systemContext
					? [mainInstructions, systemContext].filter(Boolean).join('\n\n')
					: undefined
			),
			input: inputItems,
			model,
			tools: this.buildToolset('worker')
		}
		if (maxOutputTokens !== undefined) {
			payload.max_output_tokens = maxOutputTokens
		}
		if (temperature !== undefined) {
			payload.temperature = temperature
		}
		if (this._chatDefaults.reasoningEffort) {
			payload.reasoning = { effort: this._chatDefaults.reasoningEffort }
		}

		// Send the payload to OpenAI with MCP-aware error handling and graceful degradation.
		const result = await this.createResponseWithMcpHandling(
			{ conversationId: session.conversationId, previousResponseId: session.previousResponseId },
			payload
		)
		const response = result.response
		const degradedMcpServers = result.degradedMcpServers

		// Note: If MCPs were degraded, the status note was already injected into instructions
		// during the degraded request, so the model response should already reflect this.
		// The degraded MCP servers are logged in createResponseWithMcpHandling for observability.
		void this.trackUsageFromResponse({
			model,
			response,
			kind: 'chat',
			metadata: {
				conversationId: session.conversationId,
				previousResponseId: session.previousResponseId
			}
		})
		const parsed = this.parseResponse(session.conversationId, response)
		// Include degraded MCP servers in the result for hook access
		// Merge servers degraded before request (from createResponseWithMcpHandling) 
		// with servers that failed during execution (from parseResponse)
		const allDegradedServers = new Set<string>()
		if (degradedMcpServers && degradedMcpServers.length > 0) {
			degradedMcpServers.forEach(server => allDegradedServers.add(server))
		}
		if (parsed.degradedMcpServers && parsed.degradedMcpServers.length > 0) {
			parsed.degradedMcpServers.forEach(server => allDegradedServers.add(server))
		}
		if (allDegradedServers.size > 0) {
			parsed.degradedMcpServers = Array.from(allDegradedServers)
		}
		if (parsed.toolCalls?.length) {
			// Tools must never be tied to the user-facing conversation; rotate immediately.
			session.previousResponseId = null
			session.conversationId = await this.createConversationId(options)
			await this.persistSessionState(conversationKey, session)
			return parsed
		}

		session.previousResponseId = response.id ?? null
		this.recordAssistantResponse(session, response)
		await this.persistSessionState(conversationKey, session)
		return parsed
	}

	public override supportedFeatures(): EngineSupportedFeatures {
		return {
			voice: true,
			voiceTranscription: Boolean(this._voiceDefaults.transcription),
			vision: isVisionCapableModel(this._chatDefaults.model)
		}
	}

	/**
	 * Establishes a realtime voice session, wiring audio transport, transcript capture,
	 * Flashcore state, and tool-call forwarding between Discord voice channels and OpenAI.
	 *
	 * @param options - Voice session configuration including guild context and endpoints.
	 * @returns Handle used by the runtime to stream audio frames and tear down the session.
	 */
	public async startVoiceSession(options: VoiceSessionStartOptions): Promise<VoiceSessionHandle> {
		const apiKey =
			options.configuration.realtimeApiKey || process.env.OPENAI_REALTIME_API_KEY || process.env.OPENAI_API_KEY
		if (!apiKey) {
			throw new Error('OpenAI realtime API key is required for voice sessions')
		}

		const model = options.configuration.model ?? this._voiceDefaults.model
		await assertWithinLimit(model, 'voice')
		const conversationKey = this.getVoiceSessionKey(options)
		const sessionState = await this.ensureSessionState(conversationKey, {
			conversation: options.conversation,
			model: options.configuration.model ?? this._chatDefaults.model,
			threadId: options.conversation?.id ?? null,
			userId: options.userId ?? null,
			voice: {
				sessionId: options.sessionId,
				strategy: options.configuration.endpointing
			}
		})
		const voiceInstructionOverride = pluginOptions.voice?.instructions ?? pluginOptions.instructions
		const instructions = this.buildChatInstructions(sessionState, voiceInstructionOverride)
		const abortController = new AbortController()

		const configuredTranscription = this._voiceDefaults.transcription

		const { OpenAiRealtimeSession } = await import('@/engines/openai/realtime-session.js')
		const realtimeTools = this.buildToolset('realtime')

		const realtime = new OpenAiRealtimeSession(
			{
				apiKey,
				instructions,
				model,
				strategy: options.configuration.endpointing,
				tools: realtimeTools,
				mcpTools: this.getMCPTools(),
				playbackVoice: options.configuration.playbackVoice ?? null,
				transcription: configuredTranscription
			},
			{
				onAudioDelta: async (delta) => this.forwardVoicePlayback(conversationKey, delta, options),
				onTranscript: async (segment) => this.captureVoiceTranscript(conversationKey, segment, options),
				onWarning: async (warning) => this.handleVoiceWarning(conversationKey, warning, options),
				onUsage: async (usage) => this.handleRealtimeUsage(conversationKey, usage, options)
			}
		)

		try {
			await realtime.connect()
		} catch (error) {
			if (error instanceof OptionalDependencyError) {
				const wrapped = new Error(error.message)
				;(wrapped as Error & { cause?: unknown }).cause = error
				throw wrapped
			}
			throw error
		}

		const state: VoiceSessionState = {
			abortController,
			conversationKey,
			options,
			realtime,
			segments: [],
			reconnecting: false,
			sessionState,
			appendedSamples: 0,
			lastSpeakerId: null,
			lastSpeakerMember: null,
			memberCache: new Map(),
			activeAnnouncementIds: new Set()
		}
		this._voiceSessions.set(options.sessionId, state)

		const toolListener = (payload: RealtimeToolCall) => {
			void this.handleRealtimeToolCall(options.sessionId, payload)
		}
		realtime.on('toolCall', toolListener)
		state.toolCallListener = toolListener

		realtime.on('dropped', () => {
			if (abortController.signal.aborted) {
				return
			}
			void this.handleVoiceWarning(conversationKey, new Error('Realtime session dropped'), options)
			void this.retryRealtimeSession(options.sessionId, conversationKey, abortController.signal)
		})

		try {
			// Persist live session metadata for recovery or cross-shard inspection.
			await Flashcore.set(`${VOICE_NAMESPACE}/${conversationKey}`, {
				channelId: options.channel?.id ?? null,
				guildId: options.guildId,
				sessionId: options.sessionId,
				segments: [] as VoiceTranscriptSegment[],
				status: 'active',
				textChannelId: options.textChannel?.id ?? null,
				updatedAt: Date.now()
			})
		} catch (error) {
			logger.warn('failed to persist session metadata', { conversationKey, error })
		}

		void this.consumeVoiceFrames(options.sessionId, options.frameSource, abortController.signal)

		const handle: VoiceSessionHandle = {
			channelId: options.channel?.id ?? options.sessionId,
			commitInput: async () => {
				await realtime.commit()
			},
			guildId: options.guildId,
			id: options.sessionId,
			pump: async (frame) => {
				await realtime.append(frame)
			},
			stop: async (reason?: string) => {
				await this.stopVoiceSessionInternal(options.sessionId, reason)
			},
			textChannelId: options.textChannel?.id ?? null
		}

		return handle
	}

	public async stopVoiceSession(handle: VoiceSessionHandle): Promise<void> {
		await this.stopVoiceSessionInternal(handle.id, 'stopped-by-runtime')
	}

	public async generateImage(options: { model?: string; prompt: string }) {
		const { model = 'gpt-image-1', prompt } = options
		await assertWithinLimit(model, 'image')
		logger.debug('Generating image with OpenAI', { model, prompt })
		try {
			const result: ImagesResponse = await this._client.images.generate({
				model,
				prompt
			})
			logger.debug(`Generated ${result.data?.length ?? 0} images with model ${color.bold(model)}:`, result)

			return {
				images: result.data!.map((item) => ({ base64: item.b64_json ?? '' }))
			}
		} catch (error) {
			logger.error('Error generating image with OpenAI:', error)
			throw error
		}
	}

	public getFunctionHandlers(): Record<string, Command> {
		return this._functionHandlers
	}

	public getInfo() {
		return {
			name: 'OpenAI',
			version: packageJson.version
		}
	}

	public getMCPTools(): MCPTool[] {
		return this._mcpServers
	}

	private resolveMcpServerLabel(toolName: string): string | null {
		if (!toolName || this._mcpServers.length === 0) {
			return null
		}
		const normalized = toolName.trim()
		if (!normalized) {
			return null
		}
		let directMatch: string | null = null
		const wildcardLabels: string[] = []
		for (const server of this._mcpServers) {
			if (!server || server.type !== 'mcp') {
				continue
			}
			const allowed = server.allowed_tools
			if (Array.isArray(allowed) && allowed.length > 0) {
				if (allowed.includes(normalized)) {
					if (!directMatch) {
						directMatch = server.server_label
					} else if (directMatch !== server.server_label) {
						logger.warn('tool name matches multiple MCP servers (voice)', {
							name: normalized,
							previous: directMatch,
							conflict: server.server_label
						})
					}
				}
				continue
			}
			if (allowed === undefined) {
				wildcardLabels.push(server.server_label)
			}
		}
		if (directMatch) {
			return directMatch
		}
		if (wildcardLabels.length === 1) {
			return wildcardLabels[0]
		}
		if (wildcardLabels.length > 1) {
			logger.debug('multiple wildcard MCP servers configured; unable to infer realtime match', {
				name: normalized,
				serverLabels: wildcardLabels
			})
		}
		return null
	}

	private buildToolset(context: 'worker' | 'chat' | 'realtime' = 'worker'): Array<Record<string, unknown>> {
		if (context === 'chat') {
			return []
		}

		const tools: Array<Record<string, unknown>> = []
		const includeFunctions = context === 'worker' || context === 'realtime'

		if (includeFunctions) {
			for (const fn of this._functions) {
				if (context === 'realtime') {
					tools.push({
						type: 'function',
						name: fn.name,
						description: fn.description,
						parameters: fn.parameters
					})
					continue
				}

				tools.push({
					type: 'function',
					// ---- Compatibility fields (some validators expect these): ----
					name: fn.name,
					description: fn.description,
					parameters: fn.parameters,
					// ---- Canonical Responses API function spec: ----
					function: {
						name: fn.name,
						description: fn.description,
						parameters: fn.parameters,
						strict: true
					}
				})
			}
		}

		if (this._vectorStoreId && context !== 'realtime') {
			tools.push({
				type: 'file_search',
				vector_store_ids: [this._vectorStoreId]
			})
		}

		if (this._webSearchEnabled && context === 'worker') {
			tools.push({ type: 'web_search' })
		}

		if (context === 'worker') {
			for (const mcp of this._mcpServers) {
				tools.push(mcp)
			}
		}

		return tools
	}

	private async consumeVoiceFrames(
		voiceSessionId: string,
		frames: AsyncIterable<VoiceInputFrame>,
		signal: AbortSignal
	): Promise<void> {
		try {
			for await (const frame of frames) {
				if (signal.aborted) {
					break
				}
				const state = this._voiceSessions.get(voiceSessionId)
				if (!state) {
					break
				}
				if (!frame.data || frame.data.length === 0) {
					if (frame.isSpeechEnd) {
						if (state.options.configuration.endpointing === 'manual') {
							const minSamples = Math.ceil((state.options.configuration.targetSampleRate / 1000) * 100)
							if (state.appendedSamples >= minSamples) {
								logger.debug('committing realtime buffer after manual speech end', {
									appendedSamples: state.appendedSamples,
									minSamples,
									sessionId: voiceSessionId
								})
								try {
									await state.realtime.commit()
								} catch (error) {
									logger.warn('failed to commit realtime buffer', error)
								}
							} else {
								logger.debug('skipping manual commit due to short capture', {
									appendedSamples: state.appendedSamples,
									minSamples,
									sessionId: voiceSessionId
								})
							}
						}
						state.appendedSamples = 0
					}
					continue
				}

				let appended = false
				let attempts = 0
				while (!appended && !signal.aborted && this._voiceSessions.has(voiceSessionId)) {
					try {
						await state.realtime.append(frame)
						appended = true
					} catch (error) {
						attempts += 1
						logger.warn('Failed to append audio frame, retrying', {
							attempts,
							error: (error as Error)?.message
						})
						await delay(Math.min(500, 50 * attempts))
					}
				}

				if (!appended) {
					incrementFailedFrameAppends()
					break
				}

				if (state.options.configuration.endpointing === 'manual') {
					state.appendedSamples += frame.length
				}
			}
		} catch (error) {
			logger.error('Failed to stream voice frames', error)
		}
	}

	private async forwardVoicePlayback(
		conversationKey: string,
		delta: VoicePlaybackDelta,
		options: VoiceSessionStartOptions
	): Promise<void> {
		if (options.onAudioDelta) {
			await options.onAudioDelta(delta)
		}

		if (process.env.DEBUG?.includes('ai:voice')) {
			logger.debug('playback delta', {
				conversationKey,
				length: delta.data.length,
				timestamp: delta.timestamp
			})
		}
	}

	private async captureVoiceTranscript(
		conversationKey: string,
		segment: VoiceTranscriptSegment,
		options: VoiceSessionStartOptions
	): Promise<void> {
		const state = this._voiceSessions.get(options.sessionId)
		if (state) {
			state.segments.push(segment)
			if (segment.isFinal && segment.text.trim().length > 0) {
				const inferredRole: 'assistant' | 'user' = segment.speakerId ? 'user' : 'assistant'
				this.appendHistory(state.sessionState, { role: inferredRole, text: segment.text })
				await this.persistSessionState(conversationKey, state.sessionState)
			}
			if (segment.speakerId) {
				void this.updateVoiceSessionSpeaker(state, segment.speakerId).catch((error) => {
					logger.debug('failed to update voice speaker context', {
						conversationKey,
						error,
						speakerId: segment.speakerId
					})
				})
			}
			try {
				await Flashcore.set(`${VOICE_NAMESPACE}/${conversationKey}`, {
					lastSpeakerId: segment.speakerId ?? null,
					segments: state.segments.slice(-20),
					updatedAt: Date.now()
				})
			} catch (error) {
				logger.warn('failed to persist voice transcript snapshot', { conversationKey, error })
			}
		}

		if (options.onTranscription) {
			await options.onTranscription(segment)
		}

		if (process.env.DEBUG?.includes('ai:voice')) {
			logger.debug('transcript segment', {
				conversationKey,
				segment
			})
		}
	}

	private async handleVoiceWarning(
		conversationKey: string,
		warning: Error,
		options?: VoiceSessionStartOptions
	): Promise<void> {
		logger.warn('realtime warning', { conversationKey, warning })
		if (options?.onWarning) {
			await options.onWarning(warning)
		}
	}

	private async handleRealtimeUsage(
		conversationKey: string,
		usage: RealtimeUsageReport,
		options: VoiceSessionStartOptions
	): Promise<void> {
		const tokensIn = usage.tokensIn
		const tokensOut = usage.tokensOut
		if (tokensIn === 0 && tokensOut === 0) {
			return
		}
		logger.debug('recording realtime tokens', {
			model: usage.model,
			tokensIn,
			tokensOut,
			conversationKey
		})
		const metadata: Record<string, unknown> = {
			conversationKey,
			guildId: options.guildId,
			voiceSessionId: options.sessionId,
			channelId: options.channel?.id ?? null,
			textChannelId: options.textChannel?.id ?? null,
			endpointing: options.configuration.endpointing
		}
		if (usage.responseId) {
			metadata.responseId = usage.responseId
		}
		if (usage.metadata) {
			metadata.realtime = usage.metadata
		}
		if (usage.raw) {
			metadata.rawUsage = usage.raw
		}
		try {
			const result = await recordUsage({
				model: usage.model,
				tokensIn,
				tokensOut,
				metadata,
				kind: 'voice-realtime'
			})
			if (result?.breaches.length) {
				logger.warn('voice realtime token limit reached', {
					conversationKey,
					breaches: result.breaches.map((breach) => ({
						window: breach.window,
						windowKey: breach.windowKey,
						maxTokens: breach.maxTokens,
						total: breach.total,
						mode: breach.mode
					}))
				})
				const blockingBreach = result.breaches.find((breach) => breach.mode === 'block')
				if (blockingBreach) {
					await this.handleVoiceLimitBreach(options, blockingBreach)
					await this.stopVoiceSessionInternal(options.sessionId, 'token-limit')
					return
				}
			}
		} catch (error) {
			logger.warn('failed to record realtime token usage', {
				conversationKey,
				error
			})
		}
	}

	private async updateVoiceSessionSpeaker(state: VoiceSessionState, speakerId: string | null): Promise<void> {
		if (!speakerId) {
			state.lastSpeakerId = null
			state.lastSpeakerMember = null
			return
		}

		if (state.lastSpeakerId === speakerId && state.lastSpeakerMember) {
			return
		}

		const member = await this.fetchVoiceSessionMember(state, speakerId)
		state.lastSpeakerId = speakerId
		state.lastSpeakerMember = member ?? null
	}

	private async fetchVoiceSessionMember(state: VoiceSessionState, userId: string): Promise<GuildMember | null> {
		if (!userId) {
			return null
		}

		const cached = state.memberCache.get(userId)
		if (cached) {
			return cached
		}

		const guild = state.options.channel?.guild ?? client.guilds.cache.get(state.options.guildId)
		if (!guild) {
			return null
		}

		let member: GuildMember | null = guild.members.cache.get(userId) ?? null
		if (!member) {
			try {
				member = await guild.members.fetch(userId)
			} catch (error) {
				logger.debug('failed to fetch guild member for voice session speaker', {
					guildId: guild.id,
					error,
					userId
				})
				return null
			}
		}

		if (member) {
			state.memberCache.set(userId, member)
		}
		this.trimVoiceMemberCache(state)
		return member
	}

	private trimVoiceMemberCache(state: VoiceSessionState, maxEntries = 25): void {
		while (state.memberCache.size > maxEntries) {
			const oldestKey = state.memberCache.keys().next().value as string | undefined
			if (!oldestKey) {
				break
			}
			state.memberCache.delete(oldestKey)
		}
	}

	private async handleRealtimeToolCall(sessionId: string, toolCall: RealtimeToolCall): Promise<void> {
		const state = this._voiceSessions.get(sessionId)
		if (!state) {
			logger.debug('voice tool call received for inactive session', {
				sessionId,
				toolCall: toolCall.name
			})
			return
		}

		if (toolCall.isMcp) {
			await this.handleRealtimeMcpToolCall(state, toolCall)
			return
		}

		const inferredServerLabel = this.resolveMcpServerLabel(toolCall.name)
		if (inferredServerLabel) {
			if (!toolCall.serverLabel) {
				toolCall.serverLabel = inferredServerLabel
			}
			logger.warn('MCP tool call not flagged; executing as function call', {
				callId: toolCall.callId,
				name: toolCall.name,
				serverLabel: inferredServerLabel
			})
		}

		const call: ChatFunctionCall = {
			id: toolCall.callId,
			name: toolCall.name,
			arguments: toolCall.arguments
		}

		logger.debug('voice tool call received', {
			conversationKey: state.conversationKey,
			sessionId,
			callId: toolCall.callId,
			name: toolCall.name
		})

		let acknowledgementResponseId: string | null = null
		try {
			await state.realtime.submitToolOutputs(
				[{ toolCallId: toolCall.callId, output: JSON.stringify({ status: 'queued' }) }],
				toolCall.responseId ?? undefined
			)
			acknowledgementResponseId = toolCall.responseId ?? null
		} catch (error) {
			logger.warn('failed to acknowledge realtime tool call', {
				sessionId,
				callId: toolCall.callId,
				error
			})
		}

		const startAnnouncementId = await this.announceVoiceToolStart(state, toolCall, {
			interruptTargetResponseId: acknowledgementResponseId
		})

		const channel = this.resolveVoiceToolChannel(state)
		const member = state.lastSpeakerMember ?? state.options.member ?? null
		const user =
			state.lastSpeakerMember?.user ??
			(state.lastSpeakerId ? (client.users.cache.get(state.lastSpeakerId) ?? null) : null) ??
			member?.user ??
			state.options.member?.user ??
			null
		const channelKey = this.getVoiceToolChannelKey(state, channel)

		scheduleToolRun({
			call,
			channelKey,
			isMcp: Boolean(toolCall.isMcp),
			serverLabel: toolCall.serverLabel ?? null,
			execute: async () => {
				const collectedReplies: ChatReply[] = []
				let commandResult: Awaited<ReturnType<typeof executeFunctionCall>>
				try {
					commandResult = await executeFunctionCall(this, call, channel, member, user, async (reply) => {
						collectedReplies.push(reply)
					})
				} catch (error) {
					logger.warn('voice tool execution threw', {
						sessionId,
						callId: toolCall.callId,
						error
					})
					throw error
				}

				if (channel) {
					await this.flushVoiceToolReplies(channel, collectedReplies)
					if (commandResult.reply) {
						const alreadySent = collectedReplies.some((reply) => reply.text && reply.text === commandResult.reply?.text)
						if (!alreadySent) {
							await this.flushVoiceToolReplies(channel, [commandResult.reply])
						}
					}
				}

				const callId = call.id ?? call.name
				const rawSummary = commandResult.reply?.message ?? commandResult.error ?? 'Tool completed with no summary.'
				let summary = rawSummary
				let shadowResponseId: string | null | undefined = null
				try {
					const shadowResult = await this.summarizeToolResult({
						call,
						resultText: rawSummary,
						success: commandResult.success
					})
					summary = shadowResult.summary ?? rawSummary
					shadowResponseId = shadowResult.responseId
				} catch (error) {
					logger.warn('failed to summarize voice tool result', {
						callId,
						error
					})
				}

				return {
					callId,
					createdAt: Date.now(),
					detail: commandResult.reply?.text ?? null,
					name: call.name,
					success: commandResult.success,
					summary,
					shadowResponseId
				} satisfies ToolDigest
			},
			onSuccess: (digest) => {
				void this.announceVoiceToolCompletion(state, toolCall, digest, true, {
					interruptResponseId: startAnnouncementId
				})
			},
			onFailure: (digest, error) => {
				logger.warn('voice tool execution failed', {
					callId: digest.callId,
					error
				})
				void this.announceVoiceToolCompletion(state, toolCall, digest, false, {
					interruptResponseId: startAnnouncementId
				})
			}
		})
	}

	private async handleRealtimeMcpToolCall(state: VoiceSessionState, toolCall: RealtimeToolCall): Promise<void> {
		const resolvedLabel = toolCall.serverLabel ?? this.resolveMcpServerLabel(toolCall.name)
		logger.debug('realtime MCP tool call received (server-side execution)', {
			callId: toolCall.callId,
			conversationKey: state.conversationKey,
			name: toolCall.name,
			serverLabel: resolvedLabel ?? null,
			sessionId: state.options.sessionId
		})

		let acknowledgementResponseId: string | null = null
		try {
			await state.realtime.submitToolOutputs(
				[
					{
						toolCallId: toolCall.callId,
						output: JSON.stringify({
							note: 'MCP tool executed server-side by OpenAI',
							status: 'completed'
						})
					}
				],
				toolCall.responseId ?? undefined
			)
			acknowledgementResponseId = toolCall.responseId ?? null
		} catch (error) {
			logger.warn('failed to acknowledge realtime MCP tool call', {
				callId: toolCall.callId,
				error,
				name: toolCall.name,
				sessionId: state.options.sessionId
			})
		}

		const digest: ToolDigest = {
			callId: toolCall.callId,
			createdAt: Date.now(),
			detail: null,
			isMcp: true,
			name: toolCall.name,
			success: true,
			summary: resolvedLabel
				? `MCP tool executed server-side via ${resolvedLabel}`
				: 'MCP tool executed server-side',
			serverLabel: resolvedLabel ?? null
		}

		await this.announceVoiceToolCompletion(state, toolCall, digest, true, {
			interruptResponseId: acknowledgementResponseId
		})
	}

	private resolveVoiceToolChannel(state: VoiceSessionState): TextBasedChannel | null {
		const textChannel = state.options.textChannel
		if (textChannel && typeof (textChannel as { isSendable?: () => boolean }).isSendable === 'function') {
			try {
				if ((textChannel as unknown as { isSendable(): boolean }).isSendable()) {
					return textChannel
				}
			} catch {
				return textChannel
			}
		}

		const voiceChannel = state.options.channel
		if (voiceChannel && typeof (voiceChannel as { send?: unknown }).send === 'function') {
			return voiceChannel as unknown as TextBasedChannel
		}

		return null
	}

	private getVoiceToolChannelKey(state: VoiceSessionState, channel: TextBasedChannel | null): string {
		return channel?.id ?? state.options.channel?.id ?? state.options.sessionId ?? state.conversationKey
	}

	private buildVoiceAudioConfig(state: VoiceSessionState): Record<string, unknown> | undefined {
		const voice = state.options.configuration?.playbackVoice
		return voice ? { voice } : undefined
	}

	private formatToolName(raw: string): string {
		return raw
			.replace(/[_:-]+/g, ' ')
			.replace(/\s+/g, ' ')
			.trim()
	}

	private async announceVoiceToolStart(
		state: VoiceSessionState,
		toolCall: RealtimeToolCall,
		options?: { interruptTargetResponseId?: string | null }
	): Promise<string | null> {
		const toCancel = new Set(state.activeAnnouncementIds)
		const targetResponseId = options?.interruptTargetResponseId ?? null
		if (targetResponseId) {
			toCancel.add(targetResponseId)
		}
		for (const id of toCancel) {
			try {
				await state.realtime.interrupt(id)
			} catch (e) {
				logger.warn('failed to interrupt realtime for tool start announcement', { error: e, responseId: id })
			}
			state.activeAnnouncementIds.delete(id)
		}

		const prompt = `Speak one short sentence to confirm you're starting the ${this.formatToolName(
			toolCall.name
		)} tool now. Keep it under 8 words.`
		return await this.enqueueRealtimeAnnouncement(state, prompt, {
			responseId: `tool-start:${toolCall.callId}:${Date.now().toString(36)}`
		})
	}

	private async announceVoiceToolCompletion(
		state: VoiceSessionState,
		toolCall: RealtimeToolCall,
		digest: ToolDigest,
		success: boolean,
		options?: { interruptResponseId?: string | null }
	): Promise<void> {
		const targets = new Set<string>()
		if (options?.interruptResponseId) {
			targets.add(options.interruptResponseId)
		}
		if (targets.size === 0) {
			for (const id of state.activeAnnouncementIds) {
				targets.add(id)
			}
		} else {
			for (const id of state.activeAnnouncementIds) {
				targets.add(id)
			}
		}
		for (const id of targets) {
			try {
				await state.realtime.interrupt(id)
			} catch (e) {
				logger.warn('failed to interrupt realtime before completion announcement', { error: e, responseId: id })
			}
			state.activeAnnouncementIds.delete(id)
		}

		const statusWord = success ? 'finished successfully' : 'failed'
		const trimmed = digest.summary.length > 180 ? `${digest.summary.slice(0, 177)}…` : digest.summary
		await this.enqueueRealtimeAnnouncement(
			state,
			`Announce in one short sentence that the ${this.formatToolName(
				toolCall.name
			)} tool ${statusWord}. Mention: ${trimmed}`
		)
	}

	private async enqueueRealtimeAnnouncement(
		state: VoiceSessionState,
		userPrompt: string,
		options?: { responseId?: string; metadata?: Record<string, unknown> }
	): Promise<string | null> {
		const responseId =
			options?.responseId ?? `voice-annc:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`
		try {
			await state.realtime.createConversationItem({
				role: 'user',
				content: [{ type: 'input_text', text: userPrompt }]
			})
			await state.realtime.createResponse({
				modalities: ['audio', 'text'],
				responseId,
				metadata: options?.metadata
			})
			state.activeAnnouncementIds.add(responseId)
			return responseId
		} catch (error) {
			logger.warn('failed to queue realtime announcement', { conversationKey: state.conversationKey, error })
			return null
		}
	}

	private async flushVoiceToolReplies(channel: TextBasedChannel, replies: ChatReply[]): Promise<void> {
		for (const reply of replies) {
			if (!reply) {
				continue
			}
			const hasContent = Boolean(reply.text) || Boolean(reply.embeds?.length) || Boolean(reply.files?.length)
			if (!hasContent) {
				continue
			}
			try {
				if (channel.isSendable()) {
					await channel.send({
						content: reply.text ?? undefined,
						embeds: reply.embeds,
						components: reply.components,
						files: reply.files
					})
				}
			} catch (error) {
				logger.warn('failed to forward tool reply to voice channel', {
					channelId: channel.id,
					error
				})
			}
		}
	}

	private async retryRealtimeSession(sessionId: string, conversationKey: string, signal: AbortSignal): Promise<void> {
		if (signal.aborted) {
			return
		}

		const state = this._voiceSessions.get(sessionId)
		if (!state || state.reconnecting) {
			return
		}

		state.reconnecting = true

		try {
			for (let attempt = 1; attempt <= MAX_REALTIME_RETRIES; attempt++) {
				if (signal.aborted || !this._voiceSessions.has(sessionId)) {
					break
				}

				const delayMs = Math.min(5000, 1000 * Math.pow(2, attempt - 1))
				await delay(delayMs)

				if (signal.aborted || !this._voiceSessions.has(sessionId)) {
					break
				}

				try {
					incrementRealtimeReconnects()
					const currentState = this._voiceSessions.get(sessionId)
					if (!currentState) {
						break
					}
					await currentState.realtime.connect()
					logger.info('Reconnected realtime session', { conversationKey, attempt })
					return
				} catch (error) {
					logger.error('Failed to reconnect realtime session', { conversationKey, attempt, error })
					if (attempt === MAX_REALTIME_RETRIES) {
						await this.stopVoiceSessionInternal(sessionId, 'realtime-reconnect-failed')
					}
				}
			}
		} finally {
			const current = this._voiceSessions.get(sessionId)
			if (current) {
				current.reconnecting = false
			}
		}
	}

	private async handleVoiceLimitBreach(options: VoiceSessionStartOptions, breach: TokenLimitBreach): Promise<void> {
		const message = breach.message ?? `Voice usage limit reached for ${breach.model} (${breach.window}).`
		const sentChannels = new Set<string>()
		const targets = [options.textChannel, options.transcriptTarget].filter((channel): channel is TextBasedChannel =>
			Boolean(channel)
		)
		for (const channel of targets) {
			if (sentChannels.has(channel.id)) {
				continue
			}
			sentChannels.add(channel.id)
			try {
				if (channel.isSendable()) {
					await channel.send({ content: message })
				}
			} catch (error) {
				logger.warn('failed to post voice token limit notice', {
					channelId: channel.id,
					error
				})
			}
		}
		if (options.onWarning) {
			try {
				await options.onWarning(new Error(message))
			} catch (error) {
				logger.warn('failed to forward voice token limit warning', error)
			}
		}
	}

	private async stopVoiceSessionInternal(sessionId: string, reason?: string): Promise<void> {
		const state = this._voiceSessions.get(sessionId)
		if (!state) {
			return
		}

		state.abortController.abort()
		if (reason && reason !== 'stopped-by-runtime' && state.options.onWarning) {
			await state.options.onWarning(new Error(reason))
		}
		try {
			if (state.toolCallListener) {
				state.realtime.off('toolCall', state.toolCallListener)
				state.toolCallListener = undefined
			}
			await state.realtime.dispose(reason)
		} catch (error) {
			logger.warn('failed to dispose realtime session', {
				reason,
				error
			})
		}
		try {
			// Capture the final transcript snapshot before tearing down the session.
			await Flashcore.set(`${VOICE_NAMESPACE}/${state.conversationKey}`, {
				channelId: state.options.channel?.id ?? null,
				guildId: state.options.guildId,
				sessionId,
				segments: state.segments.slice(-20),
				status: 'inactive',
				textChannelId: state.options.textChannel?.id ?? null,
				updatedAt: Date.now()
			})
		} catch (error) {
			logger.warn('failed to persist final voice snapshot', {
				conversationKey: state.conversationKey,
				error
			})
		}

		if (this._voiceSessions.get(sessionId) === state) {
			this._voiceSessions.delete(sessionId)
		}
	}

	private getVoiceSessionKey(options: VoiceSessionStartOptions): string {
		if (options.conversationKey) {
			return options.conversationKey
		}
		if (options.conversation?.id) {
			return options.conversation.id
		}
		const channelId = options.textChannel?.id ?? options.channel?.id ?? options.sessionId
		return `voice:${options.guildId}:${channelId}`
	}

	/**
	 * Ensures the OpenAI vector store mirrors local knowledge documents and caches the
	 * resulting store id for follow-up tool-enabled conversations.
	 *
	 * @returns The vector store id when knowledge sync is enabled; otherwise null.
	 */
	private async ensureKnowledgeVectorStore(): Promise<string | null> {
		if (!pluginOptions?.insight) {
			return null
		}

		const documentsDir = path.join(process.cwd(), DOCUMENTS_DIRNAME)
		let stats: Stats
		try {
			stats = await fs.stat(documentsDir)
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				return null
			}
			throw error
		}

		if (!stats.isDirectory()) {
			return null
		}

		let vectorStoreId = await Flashcore.get<string>(KNOWLEDGE_VECTOR_STORE_KEY, {
			namespace: KNOWLEDGE_NAMESPACE
		})

		if (!vectorStoreId) {
			const created = await this._client.vectorStores.create({
				name: 'Robo.js Knowledge Base',
				metadata: {
					plugin: packageJson.name,
					pluginVersion: packageJson.version
				}
			})
			vectorStoreId = created.id
			await Flashcore.set(KNOWLEDGE_VECTOR_STORE_KEY, vectorStoreId, {
				namespace: KNOWLEDGE_NAMESPACE
			})
		}

		await this.syncKnowledgeFiles(vectorStoreId, documentsDir)
		return vectorStoreId
	}

	/**
	 * Differs local documents against the cached vector store manifest and uploads or
	 * removes files to keep embeddings synchronized.
	 *
	 * @param vectorStoreId - Target OpenAI vector store identifier.
	 * @param documentsDir - Absolute path to the local documents directory.
	 */
	private async syncKnowledgeFiles(vectorStoreId: string, documentsDir: string) {
		const cachedFiles =
			(await Flashcore.get<Record<string, CachedKnowledgeFile>>(KNOWLEDGE_FILES_KEY, {
				namespace: KNOWLEDGE_NAMESPACE
			})) ?? {}
		const localEntries = await fs.readdir(documentsDir)
		const toUpload: string[] = []
		const currentCache: Record<string, CachedKnowledgeFile> = { ...cachedFiles }

		for (const entry of localEntries) {
			const filePath = path.join(documentsDir, entry)
			const fileStats = await fs.stat(filePath)
			if (fileStats.isDirectory()) {
				continue
			}

			const cached = cachedFiles[entry]
			if (!cached || cached.bytes !== fileStats.size) {
				toUpload.push(entry)
			}
		}

		if (toUpload.length > 0) {
			for (const fileName of toUpload) {
				const filePath = path.join(documentsDir, fileName)
				const fileBuffer = await fs.readFile(filePath)
				const uploadable = await toFile(fileBuffer, fileName)

				// Upload fresh or changed documents into the OpenAI vector store.
				const stored = await this._client.vectorStores.files.uploadAndPoll(vectorStoreId, uploadable)
				currentCache[fileName] = {
					bytes: fileBuffer.byteLength,
					fileId: stored.id
				}
				logger.info(`Indexed document ${color.bold(fileName)} into vector store ${color.bold(vectorStoreId)}`)
			}
		}

		const localSet = new Set(localEntries)
		for (const cachedFileName of Object.keys(currentCache)) {
			if (!localSet.has(cachedFileName)) {
				const cached = currentCache[cachedFileName]
				// Prune remote entries when the source document disappears locally.
				await this._client.vectorStores.files.delete(cached.fileId, { vector_store_id: vectorStoreId })
				delete currentCache[cachedFileName]
				logger.debug(
					`Removed stale document ${color.bold(cachedFileName)} from vector store ${color.bold(vectorStoreId)}`
				)
			}
		}

		await Flashcore.set(KNOWLEDGE_FILES_KEY, currentCache, {
			namespace: KNOWLEDGE_NAMESPACE
		})
	}

	private async ensureSessionState(conversationKey: string, options: ChatOptions): Promise<SessionState> {
		const explicitConversationId = options.conversation?.id ?? null
		// Restore the existing Flashcore-backed conversation record, if any.
		const rawState = await Flashcore.get<unknown>(conversationKey, {
			namespace: CONVERSATION_NAMESPACE
		})
		const stateObject = typeof rawState === 'object' && rawState !== null ? (rawState as Record<string, unknown>) : null
		const normalizeSummary = (value: unknown): SessionState['summary'] => {
			if (value && typeof value === 'object' && typeof (value as { text?: unknown }).text === 'string') {
				const updatedAt =
					typeof (value as { updatedAt?: unknown }).updatedAt === 'number'
						? (value as { updatedAt: number }).updatedAt
						: Date.now()
				return { text: (value as { text: string }).text, updatedAt }
			}
			return { text: '', updatedAt: Date.now() }
		}
		const normalizeHistory = (value: unknown): SessionState['historyTail'] => {
			if (value && typeof value === 'object') {
				const source = value as Record<string, unknown>
				const rawItems = Array.isArray(source.items) ? (source.items as unknown[]) : []
				const items: Array<{ role: 'user' | 'assistant'; text: string }> = []
				for (const entry of rawItems) {
					if (!entry || typeof entry !== 'object') {
						continue
					}
					const record = entry as Record<string, unknown>
					const roleValue = record.role
					const textValue = record.text
					const role = roleValue === 'assistant' ? 'assistant' : roleValue === 'user' ? 'user' : null
					const text = typeof textValue === 'string' ? textValue : ''
					if (!role || !text) {
						continue
					}
					items.push({ role, text })
				}
				const kValue = (value as { k?: unknown }).k
				const k = typeof kValue === 'number' ? kValue : HISTORY_TAIL_DEFAULT
				return { items, k }
			}
			return { items: [], k: HISTORY_TAIL_DEFAULT }
		}

		let conversationId: string | null = null
		let previousResponseId: string | null = null
		const summary = normalizeSummary(stateObject ? stateObject['summary'] : undefined)
		const historyTail = normalizeHistory(stateObject ? stateObject['historyTail'] : undefined)
		let needsPersist = false

		if (stateObject) {
			const conversationIdValue = stateObject['conversationId']
			if (typeof conversationIdValue === 'string') {
				conversationId = conversationIdValue
				const previousResponseValue = stateObject['previousResponseId']
				if (typeof previousResponseValue === 'string') {
					previousResponseId = previousResponseValue
				}
			} else {
				const workerValue = stateObject['worker']
				if (workerValue && typeof workerValue === 'object') {
					const workerRecord = workerValue as Record<string, unknown>
					const workerId = workerRecord['id']
					if (typeof workerId === 'string') {
						conversationId = workerId
					}
					const workerPrevious = workerRecord['previousResponseId']
					if (typeof workerPrevious === 'string') {
						previousResponseId = workerPrevious
					}
				}
			}
			if (!conversationId) {
				const legacyId = stateObject['id']
				if (typeof legacyId === 'string') {
					conversationId = legacyId
				}
				const legacyPrevious = stateObject['previousResponseId']
				if (typeof legacyPrevious === 'string') {
					previousResponseId = legacyPrevious
				}
			}
		}

		if (!conversationId) {
			conversationId = explicitConversationId ?? (await this.createConversationId(options))
			needsPersist = true
		}
		if (explicitConversationId && conversationId !== explicitConversationId) {
			conversationId = explicitConversationId
			previousResponseId = null
			needsPersist = true
		}

		const session: SessionState = {
			conversationId,
			previousResponseId: previousResponseId ?? null,
			summary,
			historyTail
		}
		if (needsPersist) {
			await this.persistSessionState(conversationKey, session)
		}
		return session
	}
	private async persistSessionState(conversationKey: string, state: SessionState) {
		// Persist the normalized session snapshot so follow-up turns resume seamlessly.
		await Flashcore.set(conversationKey, state, {
			namespace: CONVERSATION_NAMESPACE
		})
	}

	private buildConversationInput(messages: ChatMessage[]): ResponseInputItem[] {
		const latest = messages[messages.length - 1]
		if (!latest) {
			return []
		}
		if (latest.role === 'function' || latest.role === 'assistant') {
			return []
		}
		return this.mapMessageToResponseInput(latest)
	}

	private recordAssistantResponse(state: SessionState, response: Response) {
		const assistantText = this.extractAssistantText(response)
		if (!assistantText) {
			return
		}
		this.appendHistory(state, { role: 'assistant', text: assistantText })
		this.updateSummary(state, assistantText)
	}

	private appendHistory(state: SessionState, entry: { role: 'user' | 'assistant'; text: string | undefined }) {
		const text = entry.text?.trim() ?? ''
		if (!text) {
			return
		}
		state.historyTail.items.push({ role: entry.role, text })
		const excess = state.historyTail.items.length - state.historyTail.k
		if (excess > 0) {
			state.historyTail.items.splice(0, excess)
		}
	}

	private buildChatInstructions(
		state: SessionState,
		override?: string | null,
		mcpStatusNote?: string | null
	): string | undefined {
		const instructions: string[] = []
		const directive = (override ?? pluginOptions?.instructions)?.trim()
		if (directive) {
			instructions.push(directive)
		}
		if (state.summary.text.trim().length > 0) {
			instructions.push(`Conversation summary:\n${state.summary.text.trim()}`)
		}
		if (mcpStatusNote) {
			instructions.push(mcpStatusNote)
		}
		instructions.push('Respond immediately and conversationally.')
		return instructions.filter(Boolean).join('\n\n') || undefined
	}

	private updateSummary(state: SessionState, addition: string) {
		const text = addition.trim()
		if (!text) {
			return
		}
		const combined = state.summary.text ? `${state.summary.text}\n${text}` : text
		state.summary.text = combined.length > 1800 ? combined.slice(combined.length - 1800) : combined
		state.summary.updatedAt = Date.now()
	}

	private extractAssistantText(response: Response): string {
		if (typeof response.output_text === 'string' && response.output_text.trim().length > 0) {
			return response.output_text.trim()
		}
		let aggregated = ''
		if (Array.isArray(response.output)) {
			for (const item of response.output) {
				if (isOutputMessage(item)) {
					const text = collectMessageText(item)
					if (text) {
						aggregated = aggregated ? `${aggregated}\n${text}` : text
					}
				}
			}
		}
		return aggregated.trim()
	}

	private extractTextFromChatMessage(message?: ChatMessage): string {
		if (!message) {
			return ''
		}
		const { content } = message
		if (typeof content === 'string') {
			return content
		}
		if (Array.isArray(content)) {
			for (const part of content) {
				if (typeof part?.text === 'string' && part.text.trim().length > 0) {
					return part.text
				}
			}
		}
		return ''
	}

	/**
	 * Checks if the tools array contains any MCP tools.
	 */
	private hasMcpTools(tools: unknown[]): boolean {
		return tools.some((tool) => {
			if (typeof tool === 'object' && tool !== null) {
				return (tool as { type?: unknown }).type === 'mcp'
			}
			return false
		})
	}

	/**
	 * Classifies whether an error is a retryable network/transient error.
	 * Conservative classification to avoid degrading MCPs on semantic/provider errors.
	 */
	private isRetryableNetworkError(error: unknown): boolean {
		// Check for network-level errors
		if (error instanceof Error) {
			const code = (error as Error & { code?: string }).code
			const message = error.message.toLowerCase()

			// Network connection errors
			if (
				code === 'ECONNRESET' ||
				code === 'ETIMEDOUT' ||
				code === 'ECONNREFUSED' ||
				code === 'ENOTFOUND' ||
				code === 'EAI_AGAIN' ||
				message.includes('network') ||
				message.includes('timeout') ||
				message.includes('connection') ||
				message.includes('dns') ||
				message.includes('mcp server') // MCP-specific errors
			) {
				return true
			}
		}

		// Check for OpenAI SDK error types with retryable status codes
		if (error && typeof error === 'object') {
			const status = (error as { status?: number }).status
			if (status !== undefined) {
				// Retryable HTTP status codes (matching OpenAI SDK behavior)
				// Include 424 (Failed Dependency) for MCP server failures
				return status === 408 || status === 409 || status === 424 || status === 429 || status >= 500
			}
		}

		return false
	}

	/**
	 * Gets the server labels for all configured MCP servers.
	 */
	private getDegradedMcpServerLabels(): string[] {
		return this._mcpServers
			.filter((server) => server.type === 'mcp' && server.server_label)
			.map((server) => server.server_label as string)
	}

	/**
	 * Creates a Responses API call with MCP-aware error handling and graceful degradation.
	 * Returns the response along with any degraded MCP server labels.
	 */
	private async createResponseWithMcpHandling(
		context: { conversationId: string; previousResponseId: string | null },
		body: Record<string, unknown>
	): Promise<{ response: Response; degradedMcpServers: string[] | null }> {
		// Clone the request body so we can append conversation threading metadata.
		const payload = { ...body }
		if (context.previousResponseId) {
			payload.previous_response_id = context.previousResponseId
		} else {
			Object.assign(payload, {
				conversation: { id: context.conversationId }
			})
		}

		const tools = Array.isArray(payload.tools) ? payload.tools : []
		const hasMcps = this.hasMcpTools(tools)
		const model = typeof payload.model === 'string' ? payload.model : 'unknown'

		try {
			// Let the OpenAI SDK handle its built-in retries first
			const response = await this._client.responses.create(payload)
			logger.debug(
				`Conversation response for ${color.bold(context.conversationId)} (prev=${context.previousResponseId ?? 'none'}):`,
				response
			)
			return { response, degradedMcpServers: null }
		} catch (error) {
			// If no MCPs present or error is not retryable, rethrow immediately
			if (!hasMcps || !this.isRetryableNetworkError(error)) {
				throw error
			}

			logger.debug('MCP+network error detected, attempting extra retries', {
				conversationId: context.conversationId,
				error: error instanceof Error ? error.message : String(error)
			})

			// Perform extra retries with exponential backoff (still including MCPs)
			let lastError = error
			for (let attempt = 1; attempt <= this._mcpConfig.extraRetries; attempt++) {
				const delay = Math.min(
					this._mcpConfig.maxDelayMs,
					this._mcpConfig.baseDelayMs * Math.pow(2, attempt - 1)
				)

				logger.debug(`MCP retry attempt ${attempt}/${this._mcpConfig.extraRetries} after ${delay}ms`, {
					conversationId: context.conversationId
				})

				await new Promise((resolve) => setTimeout(resolve, delay))

				try {
					const response = await this._client.responses.create(payload)
					logger.debug(
						`Conversation response after MCP retry for ${color.bold(context.conversationId)}:`,
						response
					)
					return { response, degradedMcpServers: null }
				} catch (retryError) {
					lastError = retryError
					if (!this.isRetryableNetworkError(retryError)) {
						// Non-retryable error, stop retrying
						break
					}
				}
			}

			// All retries failed - attempt graceful degradation if enabled
			if (!this._mcpConfig.gracefulDegradation) {
				throw lastError
			}

			// Remove MCP tools from payload
			const degradedPayload = { ...payload }
			degradedPayload.tools = tools.filter((tool) => {
				if (typeof tool === 'object' && tool !== null) {
					return (tool as { type?: unknown }).type !== 'mcp'
				}
				return true
			})

			const degradedMcpServers = this.getDegradedMcpServerLabels()

			// Inject MCP status note into instructions so the model can inform the user
			const mcpStatusNote = `MCP status: The following external tools were unavailable this turn and were not used: ${degradedMcpServers.join(', ')}. If these tools were required to answer the question fully, you MUST tell the user that some external tools were temporarily unavailable.`
			const existingInstructions = typeof degradedPayload.instructions === 'string' ? degradedPayload.instructions : ''
			degradedPayload.instructions = existingInstructions
				? `${existingInstructions}\n\n${mcpStatusNote}`
				: mcpStatusNote

			logger.warn('MCP graceful degradation: removing MCP tools and retrying', {
				conversationId: context.conversationId,
				model,
				error: lastError instanceof Error ? lastError.message : String(lastError),
				degradedMcpServers
			})

			try {
				// Final attempt without MCPs
				const response = await this._client.responses.create(degradedPayload)
				logger.debug(
					`Conversation response after MCP degradation for ${color.bold(context.conversationId)}:`,
					response
				)
				return { response, degradedMcpServers }
			} catch (degradedError) {
				// Even without MCPs, the request failed - rethrow
				logger.error('Request failed even after MCP degradation', {
					conversationId: context.conversationId,
					error: degradedError instanceof Error ? degradedError.message : String(degradedError)
				})
				throw degradedError
			}
		}
	}

	private async createResponse(
		context: { conversationId: string; previousResponseId: string | null },
		body: Record<string, unknown>
	): Promise<Response> {
		// Clone the request body so we can append conversation threading metadata.
		const payload = { ...body }
		if (context.previousResponseId) {
			payload.previous_response_id = context.previousResponseId
		} else {
			Object.assign(payload, {
				conversation: { id: context.conversationId }
			})
		}
		// Issue the Responses API call to generate assistant output or tool directives.
		const response = await this._client.responses.create(payload)
		logger.debug(
			`Conversation response for ${color.bold(context.conversationId)} (prev=${context.previousResponseId ?? 'none'}):`,
			response
		)
		return response
	}

	private async createShadowResponse(body: Record<string, unknown>): Promise<Response> {
		// Mirror the payload for background processing outside the primary thread.
		const payload = { ...body }
		// Trigger a shadow Responses API call for background summarization.
		const response = await this._client.responses.create(payload)
		logger.debug('Shadow response created for tool processing', {
			model: payload.model,
			responseId: response.id
		})
		return response
	}

	private async trackUsageFromResponse(params: {
		model: string
		response: Response
		kind: string
		metadata?: Record<string, unknown>
	}): Promise<void> {
		const usage = (params.response as { usage?: Record<string, unknown> }).usage
		if (!usage) {
			return
		}
		const readNumber = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0)
		const tokensIn = readNumber(usage['input_tokens'] ?? usage['prompt_tokens'])
		let tokensOut = readNumber(usage['output_tokens'] ?? usage['completion_tokens'])
		if (tokensIn === 0 && tokensOut === 0) {
			const total = readNumber(usage['total_tokens'])
			if (total > 0) {
				// Assume total tokens were output if no breakdown is available.
				tokensOut = total
			}
		}
		if (tokensIn === 0 && tokensOut === 0) {
			return
		}
		let metadata: Record<string, unknown> | undefined = params.metadata ? { ...params.metadata } : undefined
		if (params.response.id) {
			metadata = metadata ? { ...metadata, responseId: params.response.id } : { responseId: params.response.id }
		}
		try {
			const result = await recordUsage({
				model: params.model,
				tokensIn,
				tokensOut,
				metadata,
				kind: params.kind
			})
			if (result?.breaches.length) {
				logger.warn('token limit reached', {
					model: params.model,
					kind: params.kind,
					breaches: result.breaches.map((breach) => ({
						window: breach.window,
						windowKey: breach.windowKey,
						maxTokens: breach.maxTokens,
						total: breach.total
					}))
				})
			}
		} catch (error) {
			logger.warn('failed to record token usage', error)
		}
	}

	public async summarizeToolResult(params: {
		call: ChatFunctionCall
		model?: string
		resultText: string
		success: boolean
	}): Promise<{ summary: string; responseId: string | null }> {
		const { call, model, resultText, success } = params
		const instructions =
			'You are assisting Robo.js by summarizing background tool executions. Provide a concise status message for the user. Do not mention tools, function names, or implementation details unless necessary.'
		const argumentsPreview = JSON.stringify(call.arguments ?? {}, null, 2)
		const statusLine = success ? 'The tool completed successfully.' : 'The tool failed.'
		const prompt = `Tool name: ${call.name}\nArguments: ${argumentsPreview}\n${statusLine}\nObserved output:\n${resultText}\n\nCraft a short response (max two sentences) summarizing the outcome for a conversation.`
		const defaultModel = model ?? this._chatDefaults.model
		// Build a lightweight Responses API prompt to summarize tool output.
		const payload: Record<string, unknown> = {
			instructions,
			model: defaultModel,
			input: [
				{
					role: 'user',
					type: 'message',
					content: [{ type: 'input_text', text: prompt }]
				}
			]
		}
		if (this._chatDefaults.temperature !== undefined) {
			payload.temperature = this._chatDefaults.temperature
		}
		if (this._chatDefaults.maxOutputTokens !== undefined) {
			payload.max_output_tokens = this._chatDefaults.maxOutputTokens
		}
		const usedModel = typeof payload.model === 'string' ? (payload.model as string) : this._chatDefaults.model
		try {
			await assertWithinLimit(usedModel, 'tool-summary')
		} catch (error) {
			if (error instanceof TokenLimitError) {
				logger.warn('Skipping tool summary due to token limit', {
					model: error.model,
					usageKind: error.usageKind
				})
				return {
					summary: resultText,
					responseId: null
				}
			}
			throw error
		}
		try {
			// Send the summarization payload without mutating the active conversation.
			const response = await this.createShadowResponse(payload)
			await this.trackUsageFromResponse({
				model: usedModel,
				response,
				kind: 'tool-summary',
				metadata: {
					toolCall: call.name
				}
			})
			const summary = this.extractAssistantText(response) || resultText
			return {
				summary,
				responseId: response.id ?? null
			}
		} catch (error) {
			logger.warn('Failed to create shadow summary for tool result; falling back to raw output.', error)
			return {
				summary: resultText,
				responseId: null
			}
		}
	}

	private async createConversationId(options: ChatOptions): Promise<string> {
		const metadata: Record<string, string> = {}
		if (options.threadId) {
			metadata.threadId = options.threadId
		}
		if (options.userId) {
			metadata.userId = options.userId
		}
		const conversation = await this._client.conversations.create(Object.keys(metadata).length ? { metadata } : {})
		logger.debug(`Created conversation ${color.bold(conversation.id)} with metadata`, metadata)
		return conversation.id
	}

	private buildResponseInput(messages: ChatMessage[]): {
		inputItems: ResponseInputItem[]
		isToolOutput: boolean
	} {
		const latest = messages[messages.length - 1]
		if (!latest) {
			return { inputItems: [], isToolOutput: false }
		}

		if (latest.role === 'function') {
			const functionMessages: ChatMessage[] = []
			for (let index = messages.length - 1; index >= 0; index--) {
				const candidate = messages[index]
				if (candidate.role !== 'function') {
					break
				}
				functionMessages.unshift(candidate)
			}
			if (functionMessages.length > 1) {
				logger.debug('Bundling tool outputs for submission', {
					count: functionMessages.length
				})
			}
			const items = functionMessages.flatMap((message) => this.mapMessageToResponseInput(message))
			logger.debug('Aggregated function message inputs', {
				messages: functionMessages.length,
				items: items.map((item) =>
					'type' in item && item.type === 'function_call_output'
						? {
								callId: item.call_id,
								outputPreview: summarizeOutput(item.output)
							}
						: { type: (item as { type?: string }).type }
				)
			})
			return {
				inputItems: items,
				isToolOutput: items.length > 0 && items.every((item) => 'type' in item && item.type === 'function_call_output')
			}
		}

		const items = this.mapMessageToResponseInput(latest)
		return {
			inputItems: items,
			isToolOutput: items.length > 0 && items.every((item) => 'type' in item && item.type === 'function_call_output')
		}
	}

	private mapMessageToResponseInput(message: ChatMessage): ResponseInputItem[] {
		if (message.role === 'function' || message.role === 'assistant') {
			return []
		}

		let role: 'user' | 'system' | 'developer' | null = null
		if (message.role === 'system') {
			role = 'system'
		} else if (message.role === 'user') {
			role = 'user'
		}

		if (!role) {
			return []
		}

		const content = this.normalizeContentToInput(message)
		if (content.length === 0) {
			return []
		}
		const previewChunk = content.find(
			(chunk): chunk is { type: 'input_text'; text: string } => chunk.type === 'input_text'
		)
		logger.debug('Mapped chat message to input', {
			role,
			chunks: content.length,
			preview: previewChunk?.text?.slice(0, 160) ?? null
		})

		return [
			{
				role,
				type: 'message' as const,
				content
			} satisfies ResponseInputItem
		]
	}

	private parseResponse(conversationId: string, response: Response): ChatResult {
		const toolCalls: ChatFunctionCall[] = []
		const mcpCalls: MCPCall[] = []
		const failedMcpServers = new Set<string>() // Track failed MCP servers from response output
		const citationContext = createCitationContext()
		const messageFragments: string[] = []
	if (Array.isArray(response.output)) {
		for (const item of response.output) {
			if (isOutputMessage(item)) {
				const text = collectMessageText(item, citationContext)
				if (text) {
					messageFragments.push(text)
				}
			} else if (isFunctionCall(item)) {
				toolCalls.push({
					id: item.call_id ?? item.id,
					name: item.name,
					arguments: safeParseArguments(item.arguments)
				})
			} else if (isMcpCall(item)) {
				const status = item.status ?? 'completed'
				const hasError = item.error !== undefined && item.error !== null
				const isFailed = status === 'failed' || hasError
				const basePayload = {
					conversationId,
					serverLabel: item.server_label ?? null,
					toolName: item.name ?? null,
					status,
					resultPreview: summarizeMcpResult(item.result),
					result: item.result,
					arguments: item.arguments
				}
				if (isFailed) {
					// Track failed MCP server for hook notification
					if (item.server_label && typeof item.server_label === 'string') {
						failedMcpServers.add(item.server_label)
					}
					logger.warn('MCP tool call failed', {
						...basePayload,
						error: item.error ?? null
					})
				} else {
					const { name, arguments: args, server_label } = item
					
					// MCP tools are executed server-side by OpenAI; results already
					// influence the assistant message, so we only log them instead of
					// scheduling local execution.
					logger.debug(
						`MCP tool call completed server-side:`,
						name,
						server_label ? `(via ${server_label})` : '(unknown server)'
					)

					mcpCalls.push({
						name: name ?? 'unknown',
						arguments: typeof args === 'string' ? safeParseArguments(args) : (args as Record<string, unknown>),
						serverLabel: server_label ?? null
					})
				}
			}
		}
	}

		let messageText = normalizeInlineCitations(messageFragments.join('\n').trim())
		if (!messageText && response.output_text) {
			messageText = normalizeInlineCitations(response.output_text)
		}

		const sourcesLine = formatSourcesLine(citationContext)
		if (sourcesLine) {
			messageText = messageText ? `${messageText}\n\n${sourcesLine}` : sourcesLine
		}

		const finishReason = toolCalls.length > 0 ? 'function_call' : (response.status ?? 'stop')

		const chatResult: ChatResult = {
			conversation: {
				id: conversationId,
				previousResponseId: response.id,
				provider: 'openai'
			} satisfies ConversationState,
			finish_reason: finishReason,
			message: {
				content: messageText,
				role: 'assistant'
			},
			rawResponse: response,
			toolCalls: toolCalls,
			mcpCalls: mcpCalls,
			// Include failed MCP servers if any were detected in the response output
			degradedMcpServers: failedMcpServers.size > 0 ? Array.from(failedMcpServers) : undefined
		}
		logger.debug('Parsed OpenAI response summary', {
			conversationId,
			finishReason,
			messagePreview: typeof chatResult.message?.content === 'string' ? chatResult.message.content.slice(0, 200) : null,
			toolCalls: toolCalls.map((call) => ({
				id: call.id,
				name: call.name,
				arguments: call.arguments
			}))
		})

		if (toolCalls.length > 0) {
			chatResult.message = {
				content: [],
				function_call: toolCalls[0],
				role: 'assistant'
			}
		}

		return chatResult
	}

	private getConversationKey(options: ChatOptions): string {
		if (options.conversation?.id) {
			return options.conversation.id
		}
		if (options.threadId) {
			return `thread:${options.threadId}`
		}
		if (options.userId) {
			return `user:${options.userId}`
		}
		return 'anonymous'
	}
	private normalizeContentToInput(message: ChatMessage): ResponseInputMessageContentList {
		const chunks: ResponseInputMessageContentList = []
		const pushText = (text: string) => {
			chunks.push({ type: 'input_text', text })
		}
		if (typeof message.content === 'string') {
			pushText(message.content)
			return chunks
		}

		if (Array.isArray(message.content)) {
			for (const part of message.content) {
				if (!part || typeof part !== 'object') {
					continue
				}
				if (part.type === 'text' && typeof part.text === 'string') {
					if (part.text.trim().length > 0) {
						pushText(part.text)
					}
				} else if (
					part.type === 'image_url' &&
					typeof part.image_url === 'string' &&
					part.image_url.trim().length > 0
				) {
					chunks.push({ type: 'input_image', image_url: part.image_url, detail: 'auto' })
				}
			}
		}

		if (chunks.length === 0) {
			pushText('')
		}

		return chunks
	}
}

async function loadFunctions() {
	const functions: ChatFunction[] = []
	const handlers: Record<string, Command> = {}

	let whitelistedCommands = Array.isArray(pluginOptions?.commands) ? pluginOptions?.commands : []
	whitelistedCommands = whitelistedCommands.map((command) => {
		let key = command
		if (key.startsWith('/')) {
			key = key.slice(1)
		}
		return key.replaceAll('/', ' ')
	})

	portal?.commands
		.filter((command) => {
			if (Array.isArray(pluginOptions?.commands)) {
				return whitelistedCommands.includes(command.key.replaceAll('/', ' '))
			}
			return !!pluginOptions?.commands
		})
		.forEach((command) => {
			const parameters = {
				properties: {} as ChatFunction['parameters']['properties'],
				required: [] as string[],
				type: 'object' as const
			}

			command.handler.config?.options?.forEach((option) => {
				const optionType = option.type ?? 'string'
				const schemaType: ChatFunctionProperty['type'] =
					optionType === 'boolean'
						? 'boolean'
						: optionType === 'integer'
							? 'integer'
							: optionType === 'number'
								? 'number'
								: 'string'
				const property: ChatFunctionProperty = {
					description: option.description ?? '',
					type: schemaType
				}
				if (option.choices?.length) {
					property.enum = option.choices.map((choice) => choice.value)
				}
				if ((schemaType === 'integer' || schemaType === 'number') && typeof option.min === 'number') {
					property.minimum = option.min
				}
				if ((schemaType === 'integer' || schemaType === 'number') && typeof option.max === 'number') {
					property.maximum = option.max
				}
				parameters.properties[option.name] = property
				if (option.required) {
					parameters.required?.push(option.name)
				}
			})

			const name = command.key.replaceAll('/', '_')
			functions.push({
				description: command.description ?? '',
				name,
				parameters
			})
			handlers[name] = command.handler
		})

	logger.debug(`Loaded ${functions.length} GPT functions for OpenAI engine`)

	return {
		functions,
		handlers
	}
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms)
	})
}

function isOutputMessage(item: ResponseOutputItem): item is ResponseOutputMessage {
	return item?.type === 'message' && item?.role === 'assistant'
}

function isFunctionCall(item: ResponseOutputItem): item is ResponseFunctionToolCall {
	return item?.type === 'function_call'
}

type McpCallItem = ResponseOutputItem & {
	type: 'mcp_call'
	server_label?: string
	name?: string
	arguments?: unknown
	status?: string
	result?: unknown
	error?: unknown
}

function isMcpCall(item: ResponseOutputItem): item is McpCallItem {
	return item?.type === 'mcp_call'
}

type CitationEntry = {
	index: number
	label: string
	url: string | null
}

interface CitationContext {
	entries: CitationEntry[]
	register(annotation: ResponseOutputText.URLCitation): number
}

function collectMessageText(message: ResponseOutputMessage, context?: CitationContext): string {
	const fragments: string[] = []
	if (Array.isArray(message.content)) {
		for (const chunk of message.content) {
			if (isOutputText(chunk)) {
				fragments.push(injectCitationMarkers(chunk, context))
			}
		}
	}

	return fragments.join('\n').trim()
}

function isOutputText(
	chunk: ResponseOutputItem | ResponseOutputText | ResponseOutputRefusal
): chunk is ResponseOutputText {
	return (chunk as ResponseOutputText)?.type === 'output_text'
}

function createCitationContext(): CitationContext {
	const entries: CitationEntry[] = []
	const dedupe = new Map<string, number>()
	return {
		entries,
		register(annotation) {
			const key = `${annotation.url ?? ''}|${annotation.title ?? ''}`
			const existing = dedupe.get(key)
			if (existing) {
				return existing
			}
			const label = sanitizeCitationLabel(annotation.title, annotation.url)
			const index = entries.length + 1
			entries.push({ index, label, url: annotation.url ?? null })
			dedupe.set(key, index)
			return index
		}
	}
}

function injectCitationMarkers(chunk: ResponseOutputText, context?: CitationContext): string {
	const { text } = chunk
	const annotations = Array.isArray(chunk.annotations)
		? chunk.annotations.filter(
				(annotation): annotation is ResponseOutputText.URLCitation => annotation.type === 'url_citation'
			)
		: []
	if (!context || annotations.length === 0) {
		return text
	}
	const ordered = [...annotations].sort((a, b) => a.start_index - b.start_index)
	let cursor = 0
	let result = ''
	for (const annotation of ordered) {
		const start = clampIndex(annotation.start_index, text.length)
		let end = clampIndex(annotation.end_index, text.length)
		if (end < start) {
			end = start
		}
		if (end === start && end < text.length) {
			end = Math.min(text.length, end + 1)
		}
		if (cursor < start) {
			result += text.slice(cursor, start)
			cursor = start
		}
		result += text.slice(cursor, end)
		const markerIndex = context.register(annotation)
		result += ` [${markerIndex}]`
		cursor = end
	}
	result += text.slice(cursor)
	return result
}

function formatSourcesLine(context: CitationContext): string | null {
	if (!context.entries.length) {
		return null
	}
	const parts = context.entries.map((entry) => {
		if (entry.url) {
			return `[${entry.label}](${entry.url})`
		}
		return `[${entry.label}]`
	})
	return parts.length ? `Sources: ${parts.join(', ')}` : null
}

function sanitizeCitationLabel(title?: string | null, url?: string | null): string {
	const trimmedTitle = title?.trim()
	if (trimmedTitle) {
		return limitLength(trimmedTitle, 60)
	}
	if (url) {
		try {
			const hostname = new URL(url).hostname
			return limitLength(hostname.replace(/^www\./, ''), 60)
		} catch {
			return 'Source'
		}
	}
	return 'Source'
}

function limitLength(value: string, max: number): string {
	return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

function clampIndex(index: number, length: number): number {
	if (Number.isNaN(index) || !Number.isFinite(index)) {
		return length
	}
	const clamped = Math.max(0, Math.min(length, Math.floor(index)))
	return clamped
}

function safeParseArguments(input: string): Record<string, unknown> {
	try {
		return JSON.parse(input)
	} catch (error) {
		logger.warn('Failed to parse function call arguments as JSON:', error)
		return { raw: input }
	}
}

function normalizeInlineCitations(text: string): string {
	if (!text) {
		return text
	}
	return text.replace(/\]\(([^)\]]*?) \[(\d+)\]\)/g, ']($1) [$2]')
}

function summarizeOutput(output: unknown) {
	if (typeof output === 'string') {
		return output.slice(0, 160)
	}
	if (Array.isArray(output)) {
		const first = output[0]
		if (first && typeof first === 'object' && 'text' in first && typeof first.text === 'string') {
			return first.text.slice(0, 160)
		}
		return `array(${output.length})`
	}
	return typeof output
}

function summarizeMcpResult(result: unknown): string | null {
	if (result === null || typeof result === 'undefined') {
		return null
	}
	if (typeof result === 'string') {
		return result.slice(0, 200)
	}
	try {
		return JSON.stringify(result).slice(0, 200)
	} catch (error) {
		logger.debug('Failed to serialize MCP result for preview', { error })
		return '[unserializable result]'
	}
}
