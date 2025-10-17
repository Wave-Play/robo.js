import { logger } from '@/core/logger.js'
import { drainDigests } from '@/core/tool-runner.js'
import { scheduleToolExecution } from '@/core/tool-executor.js'
import {
	getActiveTasks as getActiveTaskSnapshots,
	getChannelKey,
	stripTaskContext,
	withTaskContext,
	type BackgroundTaskSnapshot
} from '@/core/chat/background-tasks.js'
import type { ChatOptions, ChatReply } from '@/core/chat/types.js'
import { options as pluginOptions } from '@/events/_start.js'
import { voiceManager, type VoiceEventMap, getVoiceMetricsSnapshot, type VoiceConfigPatch } from '@/core/voice/index.js'
import { tokenLedger, TokenLimitError } from '@/core/token-ledger.js'
import { client } from 'robo.js'
import { loadDiscordVoice, OptionalDependencyError } from '@/core/voice/deps.js'
import type {
	BaseEngine,
	ChatMessage,
	ChatMessageContent,
	GenerateImageOptions,
	GenerateImageResult
} from '@/engines/base.js'
import type { TextBasedChannel, VoiceBasedChannel, Guild } from 'discord.js'
import type {
	TokenSummaryQuery,
	TokenSummaryResult,
	TokenWindowTotals,
	UsageEventListener,
	UsageEventName
} from '../core/token-ledger.js'

export type { BackgroundTaskSnapshot } from '@/core/chat/background-tasks.js'

/**
 * Primary runtime facade for the Robo AI plugin. Provides chat completions, voice orchestration,
 * image generation, and detailed usage tracking through a single cohesive interface. Import this
 * singleton when integrating AI features inside commands, web handlers, or other Robo plugins.
 *
 * @example Chat with Discord context
 * ```ts
 * import { AI } from '@robojs/ai'
 *
 * await AI.chat({
 *   messages: [
 *     { role: 'system', content: 'Provide concise answers.' },
 *     { role: 'user', content: 'Summarize the changelog.' }
 *   ],
 *   channel,
 *   member,
 *   onReply: ({ text }) => channel.send(text)
 * })
 * ```
 *
 * @example Voice session lifecycle
 * ```ts
 * import { AI } from '@robojs/ai'
 *
 * await AI.startVoice({ guildId: guild.id, channelId: voiceChannel.id })
 *
 * AI.onVoiceEvent('playback', ({ delta }) => {
 *   console.log('Streaming voice chunk', delta.timestamp)
 * })
 *
 * await AI.stopVoice({ guildId: guild.id })
 * ```
 *
 * @example Usage tracking and limit monitoring
 * ```ts
 * import { AI } from '@robojs/ai'
 *
 * const summary = await AI.getUsageSummary({ window: 'day' })
 * console.log('Prompt tokens today', summary.windowTotals.prompt)
 *
 * AI.onUsageEvent('usage.limitReached', (event) => {
 *   console.warn('Token limit exceeded for', event.breach.model)
 * })
 *
 * AI.onUsageEvent('usage.recorded', (event) => {
 *   console.log('Token usage recorded:', event.usage.tokens)
 * })
 * ```
 *
 * @remarks Engines lazily initialize. Call {@link AI.isReady | AI.isReady()} before executing
 * intensive workloads or await project startup hooks to guarantee availability.
 *
 * @see BaseEngine
 * @see tokenLedger
 * @see ChatOptions
 * @see VoiceSessionStartOptions
 */
export const AI = {
	chat,
	chatSync,
	generateImage,
	getActiveTasks,
	isReady: () => _initialized,
	startVoice,
	stopVoice,
	setVoiceConfig,
	getVoiceStatus,
	getVoiceMetrics,
	onVoiceEvent,
	offVoiceEvent,
	getUsageSummary,
	getLifetimeUsage,
	onUsageEvent,
	onceUsageEvent,
	offUsageEvent
}

/** Tracks active reply handles for each user to enforce concurrency safeguards. */
interface UserReplying {
	originalMessage: ChatMessageContent
}

/** Records which users currently have in-flight replies so we avoid overlapping responses. */
const replying: Record<string, Set<UserReplying>> = {}

/**
 * Indicates whether the AI is actively composing a response for the specified user.
 */
export function isReplyingToUser(userId: string): boolean {
	return !!replying[userId]?.size
}

/** Holds the registered engine implementation backing the AI facade. */
let _engine: BaseEngine | null = null

/** Tracks whether the engine has finished its asynchronous initialization. */
let _initialized = false

/** Ensures we only log the missing engine warning a single time. */
let missingEngineLogged = false

/**
 * Registers the engine instance that powers AI interactions and resets lifecycle flags.
 */
export function setEngine(engine: BaseEngine) {
	_engine = engine
	missingEngineLogged = false
	_initialized = false
}

/** Marks the engine as ready to accept requests. */
export function setEngineReady() {
	_initialized = true
}

/** Retrieves the currently registered engine instance. */
export function getEngine(): BaseEngine | null {
	return _engine
}

/**
 * Validates that an engine has been configured for the provided context, logging a warning once
 * when unavailable and returning `null` so callers can short-circuit gracefully.
 */
function ensureEngine(context: string): BaseEngine | null {
	if (_engine) {
		return _engine
	}

	if (!missingEngineLogged) {
		// Log once to avoid spam if multiple subsystems race the engine initialization
		logger.warn(`No engine configured; skipping ${context} request.`)
		missingEngineLogged = true
	}

	return null
}

interface StartVoiceOptions {
	channelId: string
	deaf?: boolean
	guildId: string
	mute?: boolean
	textChannelId?: string | null
}

interface StopVoiceOptions {
	channelId?: string
	guildId: string
}

interface SetVoiceConfigOptions {
	guildId?: string
	patch: VoiceConfigPatch
}

/**
 * Starts the shared voice manager in a Discord guild, joining the specified voice channel and
 * configuring transcription playback streams.
 *
 * @param options Voice join options including guild and channel identifiers.
 * @throws OptionalDependencyError Wrapped when the Discord voice dependency is absent.
 */
export async function startVoice(options: StartVoiceOptions): Promise<void> {
	let voice
	try {
		// Load Discord voice dependencies dynamically so the plugin works without optional installs
		voice = await loadDiscordVoice()
	} catch (error) {
		if (error instanceof OptionalDependencyError) {
			const wrapped = new Error(error.message)
			;(wrapped as Error & { cause?: unknown }).cause = error

			throw wrapped
		}

		throw error
	}

	// Resolve and validate the target voice channel
	const guild = await resolveGuild(options.guildId)
	const channel = guild.channels.resolve(options.channelId)
	if (!channel || !channel.isVoiceBased()) {
		throw new Error(`Voice channel ${options.channelId} not found in guild ${options.guildId}`)
	}

	const voiceChannel = channel as VoiceBasedChannel
	// Join the voice channel with specified options
	const connection = voice.joinVoiceChannel({
		channelId: voiceChannel.id,
		guildId: guild.id,
		adapterCreator: guild.voiceAdapterCreator,
		selfDeaf: options.deaf ?? false,
		selfMute: options.mute ?? false
	})

	const joinRequestedAt = Date.now()
	// Wait for connection to be ready with 15s timeout
	await voice.entersState(connection, voice.VoiceConnectionStatus.Ready, 15_000)
	logger.debug('connected to voice channel', {
		guildId: guild.id,
		channelId: voiceChannel.id,
		latencyMs: Date.now() - joinRequestedAt
	})

	// Start voice session manager for this channel
	await voiceManager.startForChannel(voiceChannel, {
		transcriptChannelId: options.textChannelId ?? null
	})
}

/**
 * Stops the voice manager within the given guild and disconnects from the active channel.
 *
 * @param options Guild identifier and optional channel override.
 * @throws Error When no voice connection exists for the guild.
 */
export async function stopVoice(options: StopVoiceOptions): Promise<void> {
	let voice
	try {
		voice = await loadDiscordVoice()
	} catch (error) {
		if (error instanceof OptionalDependencyError) {
			const wrapped = new Error(error.message)
			;(wrapped as Error & { cause?: unknown }).cause = error

			throw wrapped
		}

		throw error
	}

	// Find active voice connection for this guild
	const guild = await resolveGuild(options.guildId)
	const connection = voice.getVoiceConnection(guild.id)
	const channelId = options.channelId ?? connection?.joinConfig.channelId

	if (!channelId) {
		throw new Error('No active voice connection found for this guild')
	}

	// Resolve channel and stop voice manager
	const channel = guild.channels.resolve(channelId)
	if (channel?.isVoiceBased()) {
		await voiceManager.stopForChannel(channel as VoiceBasedChannel, 'manual-stop')
	}

	logger.debug('disconnecting from voice channel', {
		guildId: guild.id,
		channelId
	})
	// Destroy the voice connection
	connection?.destroy()
}

/**
 * Applies a voice configuration patch either globally or for a specific guild.
 */
export async function setVoiceConfig(options: SetVoiceConfigOptions): Promise<void> {
	if (options.guildId) {
		await voiceManager.setGuildConfig(options.guildId, options.patch)
	} else {
		await voiceManager.setBaseConfig(options.patch)
	}
}

/**
 * Retrieves voice subsystem status for the optional guild.
 */
export async function getVoiceStatus(guildId?: string) {
	return voiceManager.getStatus(guildId)
}

/**
 * Returns aggregate metrics describing active voice sessions.
 */
export function getVoiceMetrics() {
	return getVoiceMetricsSnapshot(voiceManager.getActiveSessionCount())
}

/**
 * Registers a voice event listener on the shared voice manager.
 */
export function onVoiceEvent<T extends keyof VoiceEventMap>(event: T, listener: (payload: VoiceEventMap[T]) => void) {
	voiceManager.on(event, listener)
}

/**
 * Removes a previously registered voice event listener.
 */
export function offVoiceEvent<T extends keyof VoiceEventMap>(event: T, listener: (payload: VoiceEventMap[T]) => void) {
	voiceManager.off(event, listener)
}

/**
 * Resolves summary statistics for token usage within the configured ledger windows.
 */
function getUsageSummary(query?: TokenSummaryQuery): Promise<TokenSummaryResult> {
	return tokenLedger.getSummary(query)
}

/**
 * Retrieves lifetime token totals aggregated by model.
 */
function getLifetimeUsage(model?: string): Promise<Record<string, TokenWindowTotals>> {
	return tokenLedger.getLifetimeTotals(model)
}

/**
 * Attaches a usage event listener to the token ledger.
 */
function onUsageEvent<T extends UsageEventName>(event: T, listener: UsageEventListener<T>) {
	tokenLedger.on(event, listener)
}

/**
 * Attaches a one-time usage event listener to the token ledger.
 */
function onceUsageEvent<T extends UsageEventName>(event: T, listener: UsageEventListener<T>) {
	tokenLedger.once(event, listener)
}

/**
 * Removes a usage event listener from the token ledger.
 */
function offUsageEvent<T extends UsageEventName>(event: T, listener: UsageEventListener<T>) {
	tokenLedger.off(event, listener)
}

/**
 * Fetches a guild either from the local cache or, if absent, via the Discord REST API.
 */
async function resolveGuild(guildId: string): Promise<Guild> {
	// Fetch from cache first to reduce API traffic
	const cached = client.guilds.cache.get(guildId)
	if (cached) {
		return cached
	}

	// Fall back to REST fetch when the guild is not cached locally

	return client.guilds.fetch(guildId)
}

/**
 * Executes a chat completion using the registered engine. Handles typing indicators, task context,
 * tool invocation scheduling, and token limit errors.
 *
 * @param messages Message history including system prompts and user turns.
 * @param options Chat execution options including Discord context and callbacks.
 * @returns Resolves when the chat flow has completed and replies (if any) were dispatched.
 * @remarks Tool calls are scheduled asynchronously through the tool executor. Token limit errors are
 * surfaced to the caller via `onReply` to provide user-friendly messaging.
 */
async function chat(messages: ChatMessage[], options: ChatOptions): Promise<void> {
	const engine = ensureEngine('chat')
	// Validate engine is configured
	if (!engine) {
		return
	}

	const { channel, member, onReply, showTyping = true, user } = options

	// Clone messages to avoid mutation
	let aiMessages = [...messages]
	const channelKey = getChannelKey(channel)

	// Retrieve completed tool results for context injection
	const digests = drainDigests(channelKey)

	if (aiMessages[0]?.role !== 'system' && pluginOptions.instructions) {
		// Prepend system instructions if not already present
		aiMessages.unshift({
			role: 'system',
			content: pluginOptions.instructions
		})
	}

	const replyingUserId = member?.user.id ?? user?.id ?? null
	const replyHandle = replyingUserId ? { originalMessage: messages[messages.length - 1]?.content } : null
	if (replyingUserId && replyHandle) {
		// Track this user as receiving a reply for concurrency checks
		let entries = replying[replyingUserId]
		if (!entries) {
			entries = new Set()
			replying[replyingUserId] = entries
		}

		entries.add(replyHandle)
	}

	try {
		const contextPrepUserId = member?.user.id ?? user?.id ?? null

		// Inject background task context into message history
		let workingMessages = withTaskContext(aiMessages, channel, contextPrepUserId, digests)

		// Execute engine hooks for message preprocessing
		workingMessages = await engine.callHooks(
			'chat',
			{
				channel,
				member,
				messages: workingMessages
			},
			0
		)

		// Remove task context markers for logging
		aiMessages = stripTaskContext(workingMessages)
		logger.debug(`Constructed GPT messages:`, aiMessages)

		if (showTyping && canSendTyping(channel)) {
			// Show typing indicator if enabled and channel supports it
			await channel.sendTyping()
		}

		// Execute chat completion with full context
		const reply = await engine.chat(withTaskContext(aiMessages, channel, contextPrepUserId, digests), {
			...options,
			threadId: channel?.id as string,
			userId: member?.user.id ?? user?.id ?? undefined
		})

		if (!reply) {
			logger.error(`No response from engine`)

			return
		}

		if (typeof reply.message?.content === 'string') {
			// Extract and clean the assistant's text response
			let content = reply.message.content
			const clientUsername = client?.user?.username ?? 'mock'

			if (content.toLowerCase().startsWith(clientUsername.toLowerCase() + ':')) {
				// Remove bot username prefix if present
				content = content.slice(clientUsername.length + 1).trim()
			}

			await onReply?.({
				text: content
			})
		}

		// Extract function calls from response
		const toolCalls = reply.toolCalls?.length
			? reply.toolCalls
			: reply.message?.function_call && reply.finish_reason === 'function_call'
				? [reply.message.function_call]
				: []

		if (toolCalls.length > 0) {
			logger.debug(
				`Tool calls to execute`,
				toolCalls.map((call) => ({
					id: call.id,
					name: call.name,
					arguments: call.arguments
				}))
			)

			for (const call of toolCalls) {
				// Schedule each tool call for background execution
				scheduleToolExecution(engine, { call, channel, member, onReply, user })
			}
		} else {
			logger.debug(`No tool calls returned for reply`, {
				finishReason: reply.finish_reason,
				hasMessage: !!reply.message
			})
		}
	} catch (error) {
		// Handle token limit errors gracefully
		if (error instanceof TokenLimitError) {
			try {
				await onReply({ text: error.displayMessage })
			} catch (replyError) {
				logger.warn('Failed to send token limit notification reply', replyError)
			}

			return
		}

		throw error
	} finally {
		// Clean up reply tracking regardless of outcome
		if (replyingUserId && replyHandle) {
			const entries = replying[replyingUserId]
			if (entries) {
				entries.delete(replyHandle)
				if (entries.size === 0) {
					delete replying[replyingUserId]
				}
			}
		}
	}
}

/**
 * Helper that wraps {@link chat} and resolves with the first reply payload.
 *
 * @param messages Message array provided to {@link chat}.
 * @param options Chat options excluding `onReply`.
 * @returns Resolves with the reply emitted by the engine or rejects on error.
 */
async function chatSync(messages: ChatMessage[], options: Omit<ChatOptions, 'onReply'>): Promise<ChatReply> {
	if (!ensureEngine('chat')) {
		return Promise.reject(new Error('AI engine is not configured'))
	}

	// Wrap chat() in a Promise that resolves on first reply
	return new Promise((resolve, reject) => {
		// Prevent multiple resolutions
		let settled = false
		chat(messages, {
			...options,
			onReply: (reply) => {
				if (settled) {
					return
				}

				settled = true
				resolve(reply)
			}
		}).catch((error) => {
			if (settled) {
				return
			}

			settled = true
			reject(error)
		})
	})
}

/**
 * Generates an image by delegating to the configured engine.
 *
 * @param options Image prompt and configuration.
 * @returns Image generation result containing URLs or base64 payloads.
 */
async function generateImage(options: GenerateImageOptions): Promise<GenerateImageResult> {
	const engine = ensureEngine('generate-image')
	if (!engine) {
		throw new Error('AI engine is not configured')
	}

	// Delegate to engine's image generation
	return engine.generateImage(options)
}

/**
 * Retrieves background task snapshots associated with the optional channel.
 */
function getActiveTasks(channelId?: string): BackgroundTaskSnapshot[] {
	// Retrieve background task snapshots
	return getActiveTaskSnapshots(channelId)
}

/**
 * Type guard that verifies the channel exposes `sendTyping`, allowing typing indicators.
 */
function canSendTyping(
	channel: TextBasedChannel | null | undefined
): channel is TextBasedChannel & { sendTyping: () => Promise<void> } {
	return !!channel && typeof (channel as { sendTyping?: unknown }).sendTyping === 'function'
}
