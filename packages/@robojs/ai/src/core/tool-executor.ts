/**
 * Bridges GPT function calls with Discord command execution. Converts function payloads into mock
 * interactions, manages deferred replies, tracks background tasks, and serializes results for AI
 * context re-ingestion.
 */
import { logger } from '@/core/logger.js'
import { enqueueDigest, scheduleToolRun, type ToolDigest } from '@/core/tool-runner.js'
import {
	buildDeferredNotice,
	completeBackgroundTask,
	getChannelKey,
	registerBackgroundTask
} from '@/core/chat/background-tasks.js'
import { formatCommandDisplayName, getPrimaryArgumentSummary } from '@/core/chat/message-utils.js'
import type { ChatOptions, ChatReply } from '@/core/chat/types.js'
import type { BaseEngine, ChatFunctionCall } from '@/engines/base.js'
import type {
	APIEmbed,
	GuildMember,
	GuildTextBasedChannel,
	InteractionDeferReplyOptions,
	InteractionReplyOptions,
	TextBasedChannel,
	User
} from 'discord.js'
import { ComponentType } from 'discord.js'
import { Command, color, getConfig } from 'robo.js'
import type { SageOptions } from 'robo.js'
import { extractCommandOptions } from 'robo.js/utils.js'
import { mockInteraction } from '@/utils/discord-utils.js'

/**
 * Extends {@link ChatReply} with command execution metadata for downstream processing.
 */
interface CommandReply extends ChatReply {
	deferred: boolean
	ephemeral: boolean
	message: string
}

/**
 * Collects all contextual inputs required to execute a tool function call.
 */
interface ToolExecutionParams {
	call: ChatFunctionCall
	channel: TextBasedChannel | null | undefined
	member: GuildMember | null | undefined
	onReply: ChatOptions['onReply']
	user: User | null | undefined
}

/**
 * Schedules a tool call for asynchronous execution, handling complex reply payloads and producing
 * digests that can be re-injected into later AI turns.
 *
 * @param engine AI engine capable of optional result summarization.
 * @param params Tool execution context including Discord objects and reply callback.
 * @remarks Executes asynchronously via {@link scheduleToolRun}; errors are captured and converted
 * into digests to keep the conversation flowing.
 */
export function scheduleToolExecution(engine: BaseEngine, params: ToolExecutionParams) {
	const { call, channel, member, onReply, user } = params
	const channelKey = getChannelKey(channel)
	const mcpMeta = resolveMcpCall(engine, call)
	if (mcpMeta) {
		logger.warn('MCP tool call reached scheduleToolExecution; skipping local execution', {
			callId: call.id ?? call.name,
			name: call.name,
			serverLabel: mcpMeta.serverLabel ?? null
		})
		enqueueDigest(channelKey, {
			callId: call.id ?? call.name,
			createdAt: Date.now(),
			detail: null,
			name: call.name,
			success: true,
			summary: 'MCP tool executed server-side',
			shadowResponseId: null,
			isMcp: true,
			serverLabel: mcpMeta.serverLabel ?? null
		})
		return
	}

	// Queue tool execution with digest generation
	scheduleToolRun({
		call,
		channelKey,
		isMcp: false,
		execute: async () => {
			const result = await executeFunctionCall(engine, call, channel, member, user, onReply)
			if (result.reply?.components?.length || result.reply?.files?.length || result.reply?.embeds?.length) {
				// Send embeds, components, and files immediately if present
				logger.debug(`Sending special data ahead of time...`)
				try {
					await onReply({
						components: result.reply.components,
						embeds: result.reply.embeds,
						files: result.reply.files
					})
				} catch (error: unknown) {
					logger.warn(`Failed to send tool attachment reply:`, error)
				}
			}

			if (result.reply?.text) {
				// Send text content separately
				try {
					await onReply({ text: result.reply.text })
				} catch (error: unknown) {
					logger.warn(`Failed to send tool text reply:`, error)
				}
			} else if (result.error) {
				// Send error message if execution failed
				try {
					await onReply({ text: result.error })
				} catch (error: unknown) {
					logger.warn(`Failed to send tool error reply:`, error)
				}
			}

			const callId = call.id ?? call.name
			const rawSummary = result.reply?.message ?? result.error ?? 'Tool completed with no summary.'
			let summary = rawSummary
			let shadowResponseId: string | null | undefined = null
			if (engine?.summarizeToolResult) {
				// Optionally summarize result via shadow session for cleaner context
				try {
					const shadowResult = await engine.summarizeToolResult({
						call,
						resultText: rawSummary,
						success: result.success
					})
					summary = shadowResult.summary ?? rawSummary
					shadowResponseId = shadowResult.responseId
				} catch (error: unknown) {
					logger.warn('Failed to summarize tool result via shadow session', error)
				}
			}

			// Build digest for next AI turn context injection
			return {
				callId,
				createdAt: Date.now(),
				detail: result.reply?.text ?? null,
				name: call.name,
				success: result.success,
				summary,
				shadowResponseId
			} satisfies ToolDigest
		},
		onFailure: (digest, error) => {
			logger.warn(`Failed to execute tool ${call.name}`, { digest, error })
		},
		onSuccess: (digest) => {
			logger.debug(`Tool execution completed`, { digest })
		}
	})
}

/**
 * Executes a GPT function call via the Discord command layer. Validates channel permissions,
 * translates arguments, invokes the command through a mock interaction, and manages deferred
 * responses so the AI can reference task progress.
 *
 * @param engine Engine instance providing the command handler map.
 * @param call Tool call payload received from GPT.
 * @param channel Discord channel context used for replies and permission evaluation.
 * @param member Guild member context for permission checks (may be null for DM usage).
 * @param user Fallback user context when member information is unavailable.
 * @param onReply Optional callback to send intermediate replies to the user.
 * @returns Promise resolving with success flag and reply/error details.
 * @remarks Respects Sage deferral settings and registers background tasks for long-running flows.
 */
export async function executeFunctionCall(
	engine: BaseEngine,
	call: ChatFunctionCall,
	channel: TextBasedChannel | null | undefined,
	member: GuildMember | null | undefined,
	user: User | null | undefined,
	onReply?: ChatOptions['onReply']
) {
	// Resolve function name to command handler
	const gptFunctionHandler = engine.getFunctionHandlers()[call.name]
	logger.debug(`Executing function call:`, call.name, call.arguments)
	const mcpMeta = resolveMcpCall(engine, call)
	if (mcpMeta) {
		if (gptFunctionHandler) {
			logger.warn('tool name matches both Discord command and MCP tool', {
				name: call.name,
				serverLabel: mcpMeta.serverLabel ?? null
			})
		}
		logger.debug('MCP tool call detected in executor; skipping Discord execution', {
			callId: call.id ?? call.name,
			name: call.name,
			serverLabel: mcpMeta.serverLabel ?? null
		})
		const contextHint = mcpMeta.serverLabel ? ` via ${mcpMeta.serverLabel}` : ''
		const summary = `The MCP tool "${call.name}" was executed server-side${contextHint}. Summarize any visible results for the user.`
		const placeholderReply: CommandReply = {
			components: [],
			deferred: false,
			embeds: [],
			ephemeral: true,
			files: [],
			message: summary,
			text: summary
		}
		return {
			success: true,
			reply: placeholderReply
		}
	}

	if (!gptFunctionHandler) {
		return {
			success: false,
			error: `Don't know how to ${call.name}`
		}
	}

	// Validate DM permission if command restricts it
	if (!gptFunctionHandler.config?.dmPermission && channel?.isDMBased()) {
		return {
			success: false,
			error: `I can't ${call.name} in DMs`
		}
	}

	// Validate member has required permissions
	if (gptFunctionHandler.config?.defaultMemberPermissions) {
		if (!member) {
			return {
				success: false,
				error: `I could not find your member information`
			}
		}

		let defaultMemberPermissions = gptFunctionHandler.config.defaultMemberPermissions
		if (typeof defaultMemberPermissions !== 'string') {
			defaultMemberPermissions = defaultMemberPermissions + ''
		}
		defaultMemberPermissions = defaultMemberPermissions.replace('n', '')
		const commandPermissions = BigInt(defaultMemberPermissions)
		const memberPermissions = member.permissionsIn(channel as GuildTextBasedChannel)

		if ((memberPermissions.bitfield & commandPermissions) !== commandPermissions) {
			return {
				success: false,
				error: `Member does not have permission to do that`
			}
		}
	}

	// Convert GPT arguments to command-compatible format
	const normalizedArgs = normalizeArguments(call.arguments)

	// Format command name for user-facing messages
	const commandDisplayName = formatCommandDisplayName(
		(gptFunctionHandler.config as { name?: string })?.name ?? call.name
	)
	const summary = getPrimaryArgumentSummary(gptFunctionHandler, normalizedArgs)
	const requesterUser = member?.user ?? user ?? null
	const requesterId = requesterUser?.id ?? null
	const requesterLabel = member?.displayName ?? requesterUser?.username ?? 'the requester'
	const requesterMention = requesterId ? `<@${requesterId}>` : requesterLabel
	const channelIsDM = channel?.isDMBased() ?? false
	const taskId = call.id ?? `${call.name}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
	let deferredNoticeSent = false
	let taskHandle: { channelKey: string; id: string } | null = null
	let lastDeferredOptions: InteractionDeferReplyOptions | undefined

	/**
	 * Lazily registers a background task on first deferral to avoid creating tasks for instant replies.
	 */
	const ensureTaskRegistered = (isEphemeral: boolean) => {
		if (taskHandle) {
			return
		}

		// Prepare background task tracking for deferred operations
		taskHandle = registerBackgroundTask({
			channel,
			commandDisplayName,
			ephemeral: isEphemeral,
			id: taskId,
			requesterId,
			requesterLabel,
			summary
		})
	}

	/**
	 * Sends a placeholder message when the command defers, registering the task if not already tracked.
	 */
	const notifyDeferred = async (options?: InteractionDeferReplyOptions) => {
		if (options) {
			lastDeferredOptions = options
		}

		const isEphemeral = lastDeferredOptions?.ephemeral ?? options?.ephemeral ?? false
		ensureTaskRegistered(isEphemeral)
		if (deferredNoticeSent || !onReply) {
			return
		}

		deferredNoticeSent = true
		const notice = buildDeferredNotice({
			channelIsDM,
			commandDisplayName,
			isEphemeral,
			requesterMention,
			summary
		})
		try {
			await onReply({
				text: notice
			})
		} catch (error: unknown) {
			logger.warn(`Failed to send deferred placeholder for ${call.name}:`, error)
		}
	}

	try {
		// Execute command through mock interaction
		const reply = await getCommandReply(gptFunctionHandler, channel, member, normalizedArgs, {
			onDeferred: notifyDeferred
		})
		logger.debug(`Command function reply:`, reply)

		if (reply.deferred) {
			// Send placeholder message if command deferred
			await notifyDeferred(lastDeferredOptions)
		}

		return {
			success: true,
			reply
		}
	} catch (err) {
		// Capture and format execution errors
		logger.debug(color.red(`Error executing AI function:`), err)

		return {
			success: false,
			error: `Error executing function: ${err}`
		}
	} finally {
		// Mark background task as complete
		if (taskHandle) {
			completeBackgroundTask(taskHandle)
		}
	}
}

/**
 * Executes a Discord command through a mock interaction, applying Sage auto-deferral rules and
 * serializing the reply (text, embeds, components, files) into a format suitable for AI digests.
 *
 * @param command Command handler invoked for the function call.
 * @param channel Discord channel context for message capabilities.
 * @param member Guild member context for permission-aware execution.
 * @param args Normalized arguments passed to the command.
 * @param callbacks Optional hooks used to notify when the command defers.
 * @returns Promise resolving to a {@link CommandReply} with structured payload details.
 * @remarks Auto-defers after `Sage.deferBuffer` milliseconds unless disabled.
 */
async function getCommandReply(
	command: Command,
	channel: TextBasedChannel | null | undefined,
	member: GuildMember | null | undefined,
	args: Record<string, string>,
	callbacks?: {
		onDeferred?: (options?: InteractionDeferReplyOptions) => Promise<void> | void
	}
): Promise<CommandReply> {
	logger.debug(`Executing command:`, command.config, args)

	// Create mock interaction for command execution
	const { interaction, replyPromise, wasDeferred, wasReplied, getDeferredOptions } = await mockInteraction(
		channel,
		member,
		args,
		{
			commandOptions: command.config?.options,
			callbacks: {
				onDeferred: callbacks?.onDeferred
			}
		}
	)

	// Resolve Sage options from command and global config
	const sage = resolveSageOptions(command)
	const autoDeferAfter =
		sage.defer === false ? 0 : typeof sage.deferBuffer === 'number' && sage.deferBuffer > 0 ? sage.deferBuffer : 3_000
	const shouldAutoDefer = sage.defer !== false && autoDeferAfter > 0
	const autoDeferOptions = sage.ephemeral ? { ephemeral: true } : undefined
	let autoDeferTimer: NodeJS.Timeout | null = null

	// Set up auto-deferral timer if enabled
	if (shouldAutoDefer) {
		autoDeferTimer = setTimeout(() => {
			if (wasDeferred() || wasReplied()) {
				return
			}

			void (async () => {
				try {
					await interaction.deferReply(autoDeferOptions)
				} catch (error: unknown) {
					logger.debug(`Auto defer failed`, error)
				}
			})()
		}, autoDeferAfter)
	}

	// Extract command options from interaction payload
	const commandOptions = extractCommandOptions(interaction, command.config?.options)
	let functionResult: unknown
	try {
		// Execute command handler with mock interaction
		functionResult = await command.default(interaction, commandOptions)

		// Fall back to reply promise if handler returns undefined
		if (functionResult === undefined) {
			functionResult = await replyPromise
		}
	} finally {
		// Clear auto-defer timer
		if (autoDeferTimer) {
			clearTimeout(autoDeferTimer)
		}
	}

	// Build structured reply from command result
	const result: CommandReply = {
		components: [],
		deferred: wasDeferred(),
		ephemeral: !!getDeferredOptions()?.ephemeral,
		embeds: [],
		files: [],
		message: '',
		text: ''
	}

	// Handle simple string responses
	if (typeof functionResult === 'string') {
		result.message = functionResult
		result.text = functionResult
	} else if (typeof functionResult === 'object' && functionResult !== null) {
		// Handle complex reply objects with embeds/components
		const reply = functionResult as InteractionReplyOptions
		const replyEmbeds = (reply.embeds as APIEmbed[]) ?? []

		result.components = reply.components
		result.embeds = replyEmbeds
		result.files = reply.files
		result.text = reply.content ?? ''

		// Serialize embeds for AI context
		const embedSummary = formatEmbeds(replyEmbeds)

		// Serialize components for AI context
		const componentSummary = formatComponents(reply.components)
		const summarySections = [reply.content, embedSummary, componentSummary]
			.map((section) => (typeof section === 'string' ? section.trim() : ''))
			.filter((section) => section.length > 0)

		logger.debug('serialize tool reply payload', {
			contentPresent: Boolean(reply.content && reply.content.trim().length),
			embedCount: replyEmbeds.length,
			componentRows: Array.isArray(reply.components) ? reply.components.length : 0,
			embedSummaryPreview: embedSummary ? embedSummary.slice(0, 400) : null,
			componentSummaryPreview: componentSummary ? componentSummary.slice(0, 400) : null
		})

		result.message =
			summarySections.join('\n\n') || reply.content || replyEmbeds?.[0]?.title || replyEmbeds?.[0]?.description || ''

		logger.debug('constructed tool reply summary', {
			hasMessage: result.message.length > 0,
			messagePreview: result.message.slice(0, 400)
		})
	}

	// Provide default message for file-only replies
	if (!result.message && result.files?.length) {
		result.message = `The file processing task is complete. (do not include file references in reply)`
	}

	return result
}

/**
 * Converts GPT function arguments into Discord command-compatible string values, JSON encoding
 * objects as needed.
 */
function normalizeArguments(input: Record<string, unknown>): Record<string, string> {
	const entries = Object.entries(input ?? {})

	return entries.reduce<Record<string, string>>((acc, [key, value]) => {
		if (value === undefined || value === null) {
			return acc
		}

		if (typeof value === 'object') {
			acc[key] = JSON.stringify(value)
		} else {
			acc[key] = String(value)
		}

		return acc
	}, {})
}

const DEFAULT_SAGE_OPTIONS: Required<Pick<SageOptions, 'defer' | 'deferBuffer' | 'ephemeral' | 'errorReplies'>> = {
	defer: true,
	deferBuffer: 3_000,
	ephemeral: false,
	errorReplies: true
}

/**
 * Merges global and command-level Sage configuration, giving precedence to command overrides.
 */
function resolveSageOptions(command: Command): SageOptions {
	const config = getConfig()
	const commandSage = command.config?.sage
	const configSage = config?.sage

	if (commandSage === false || (commandSage === undefined && configSage === false)) {
		return {
			defer: false,
			deferBuffer: 0,
			ephemeral: false,
			errorReplies: false
		}
	}

	const configOverrides = configSage === false ? {} : (configSage ?? {})
	const commandOverrides = commandSage ?? {}

	return {
		...DEFAULT_SAGE_OPTIONS,
		...(configOverrides as SageOptions),
		...(commandOverrides as SageOptions)
	}
}

/**
 * Serializes Discord embed objects into human-readable text for AI context injection, covering
 * titles, descriptions, fields, footers, authors, timestamps, and URLs.
 */
function formatEmbeds(embeds?: readonly APIEmbed[] | null): string {
	if (!embeds || embeds.length === 0) {
		return ''
	}

	// Process each embed into structured text
	const sections = embeds
		.map((embed, index) => {
			if (!embed) {
				return null
			}

			const lines: string[] = []
			const ordinal = index + 1
			const headerParts: string[] = [`Embed ${ordinal}`]
			if (embed.title) {
				headerParts.push(`title "${embed.title}"`)
			}
			lines.push(headerParts.join(' · '))

			if (embed.description) {
				lines.push(`Description: ${embed.description}`)
			}

			if (Array.isArray(embed.fields)) {
				// Format embed fields as key-value pairs
				for (const field of embed.fields) {
					if (!field) {
						continue
					}

					const name = field.name ?? '(no name)'
					const value = field.value ?? ''
					lines.push(`Field — ${name}: ${value}`)
				}
			}

			if (embed.footer?.text) {
				lines.push(`Footer: ${embed.footer.text}`)
			}
			if (embed.author?.name) {
				lines.push(`Author: ${embed.author.name}`)
			}
			if (embed.timestamp) {
				lines.push(`Timestamp: ${embed.timestamp}`)
			}
			if (embed.url) {
				lines.push(`URL: ${embed.url}`)
			}

			return lines.join('\n')
		})
		// Remove empty sections
		.filter((section): section is string => Boolean(section && section.trim().length))

	if (!sections.length) {
		return ''
	}

	return ['Embed Content:', ...sections].join('\n')
}

/**
 * Serializes Discord message components (buttons, selects, etc.) into human-readable descriptions
 * for AI context.
 */
function formatComponents(components: InteractionReplyOptions['components']): string {
	if (!components || components.length === 0) {
		return ''
	}

	const rows: string[] = []

	// Process each action row
	components.forEach((row, rowIndex) => {
		if (!row) {
			return
		}

		const rowComponents = (row as { components?: Array<Record<string, unknown>> }).components ?? []
		if (rowComponents.length === 0) {
			return
		}

		// Describe each component in the row
		const parts = rowComponents.map(describeComponent).filter((part): part is string => Boolean(part && part.length))

		if (parts.length === 0) {
			return
		}

		rows.push(`Row ${rowIndex + 1}: ${parts.join(', ')}`)
	})

	if (rows.length === 0) {
		return ''
	}

	return ['Interactive Components:', ...rows].join('\n')
}

/**
 * Generates a human-readable description of a single component including type, labels, identifiers,
 * placeholders, URLs, option counts, emoji, and disabled state.
 */
function describeComponent(component: Record<string, unknown>): string {
	const rawType = component.type
	const typeName =
		typeof rawType === 'number'
			? ((ComponentType as Record<number, string>)[rawType] ?? `type:${rawType}`)
			: typeof rawType === 'string'
				? rawType
				: 'component'

	const details: string[] = []

	const label = typeof component.label === 'string' ? component.label.trim() : ''
	if (label) {
		details.push(`label="${label}"`)
	}

	const customId =
		(typeof (component as { custom_id?: unknown }).custom_id === 'string' &&
			(component as { custom_id?: string }).custom_id) ||
		(typeof (component as { customId?: unknown }).customId === 'string' &&
			(component as { customId?: string }).customId)
	if (customId) {
		details.push(`id=${customId}`)
	}

	const placeholder =
		typeof (component as { placeholder?: unknown }).placeholder === 'string'
			? ((component as { placeholder?: string }).placeholder as string)
			: ''
	if (placeholder) {
		details.push(`placeholder="${placeholder}"`)
	}

	const url = typeof (component as { url?: unknown }).url === 'string' ? (component as { url?: string }).url : ''
	if (url) {
		details.push(`url=${url}`)
	}

	const options = (component as { options?: Array<Record<string, unknown>> }).options
	if (Array.isArray(options) && options.length > 0) {
		details.push(`${options.length} options`)
	}

	const emojiRecord = (component as { emoji?: { name?: string } }).emoji
	if (emojiRecord?.name) {
		details.push(`emoji:${emojiRecord.name}`)
	}

	if ((component as { disabled?: boolean }).disabled) {
		details.push('disabled')
	}

	return [typeName, ...details].join(' ')
}

interface McpMatchMetadata {
	serverLabel?: string | null
}

function resolveMcpCall(engine: BaseEngine | null | undefined, call: ChatFunctionCall): McpMatchMetadata | null {
	if (!engine || typeof engine.getMCPTools !== 'function') {
		return null
	}
	const mcpServers = engine.getMCPTools()
	if (!Array.isArray(mcpServers) || mcpServers.length === 0) {
		return null
	}
	const toolName = call.name?.trim()
	if (!toolName) {
		return null
	}
	let match: McpMatchMetadata | null = null
	const wildcardServers: string[] = []
	for (const server of mcpServers) {
		if (!server || server.type !== 'mcp') {
			continue
		}
		const allowed = server.allowed_tools
		if (Array.isArray(allowed) && allowed.length > 0) {
			if (allowed.includes(toolName)) {
				match = match ?? { serverLabel: server.server_label }
				if (match.serverLabel && match.serverLabel !== server.server_label) {
					logger.warn('tool name matches multiple MCP servers', {
						name: toolName,
						existing: match.serverLabel,
						conflict: server.server_label
					})
				}
			}
			continue
		}
		if (allowed === undefined) {
			wildcardServers.push(server.server_label)
		}
	}
	if (!match) {
		if (wildcardServers.length === 1) {
			match = { serverLabel: wildcardServers[0] ?? null }
		} else if (wildcardServers.length > 1) {
			logger.warn('MCP wildcard server ambiguity detected', {
				name: toolName,
				serverLabels: wildcardServers
			})
		}
	}
	return match
}
