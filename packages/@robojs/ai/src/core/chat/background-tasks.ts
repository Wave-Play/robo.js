/**
 * Background task registry and utilities used by the AI chat subsystem. Tracks long-running
 * commands, manages typing indicators, and injects context messages so the AI can acknowledge
 * ongoing work.
 */
import { logger } from '@/core/logger.js'
import type { ChatMessage } from '@/engines/base.js'
import type { ToolDigest } from '@/core/tool-runner.js'
import type { TextBasedChannel } from 'discord.js'
import { truncateArgument } from './message-utils.js'

/**
 * Represents an active background task, capturing metadata required for UX feedback and AI context
 * injection.
 */
export interface BackgroundTask {
	channelId: string | null
	channelIsDM: boolean
	commandDisplayName: string
	ephemeral: boolean
	id: string
	requesterId: string | null
	requesterLabel: string
	summary: string | null
	startedAt: number
}

/** Read-only snapshot of a background task at a point in time. */
export type BackgroundTaskSnapshot = BackgroundTask

/** Handle returned when registering a background task, used for completion. */
export interface BackgroundTaskHandle {
	channelKey: string
	id: string
}

/** Message name used for the synthetic system message that carries task context. */
export const TASK_CONTEXT_MESSAGE_NAME = '__robo_task_context'
/** Fallback channel key used when no channel context is available. */
const DEFAULT_CHANNEL_KEY = 'global'
/** Interval (ms) for refreshing typing indicators while tasks are active. */
const TYPING_INTERVAL = 7_000

/** Active background tasks grouped by channel key. */
const backgroundTasks = new Map<string, Map<string, BackgroundTask>>()
/** Discord channel references used to keep typing indicators alive. */
const channelRefs = new Map<string, TextBasedChannel>()
/** Interval handles for ongoing typing indicator loops. */
const typingLoops = new Map<string, NodeJS.Timeout>()

/**
 * Registers a new background task for a channel, creating task tracking structures and starting a
 * typing indicator loop when applicable.
 */
export function registerBackgroundTask(params: {
	channel: TextBasedChannel | null | undefined
	commandDisplayName: string
	ephemeral: boolean
	id: string
	requesterId: string | null
	requesterLabel: string
	summary: string | null
}): BackgroundTaskHandle {
	const channelKey = getChannelKey(params.channel)
	const record: BackgroundTask = {
		channelId: params.channel?.id ?? null,
		channelIsDM: params.channel?.isDMBased() ?? false,
		commandDisplayName: params.commandDisplayName,
		ephemeral: params.ephemeral,
		id: params.id,
		requesterId: params.requesterId,
		requesterLabel: params.requesterLabel,
		summary: params.summary,
		startedAt: Date.now()
	}

	// Retrieve or create task map for this channel
	let tasks = backgroundTasks.get(channelKey)
	if (!tasks) {
		tasks = new Map()
		backgroundTasks.set(channelKey, tasks)
	}

	// Store the task record
	tasks.set(record.id, record)

	if (params.channel) {
		// Cache channel reference for typing loop
		channelRefs.set(channelKey, params.channel)
		// Start typing indicator if channel supports it
		ensureTypingLoop(channelKey, params.channel)
	}

	return {
		channelKey,
		id: record.id
	}
}

/**
 * Removes a completed task from tracking and cleans up typing indicators when no tasks remain for
 * the channel.
 */
export function completeBackgroundTask(handle: BackgroundTaskHandle): void {
	const tasks = backgroundTasks.get(handle.channelKey)
	if (!tasks) {
		return
	}

	// Remove this specific task
	tasks.delete(handle.id)
	if (tasks.size === 0) {
		backgroundTasks.delete(handle.channelKey)
		channelRefs.delete(handle.channelKey)
		const loop = typingLoops.get(handle.channelKey)
		if (loop) {
			// Stop typing loop when no tasks remain
			clearInterval(loop)
			typingLoops.delete(handle.channelKey)
		}
	}
}

/**
 * Retrieves snapshots of active background tasks, optionally filtered by channel identifier.
 */
export function getActiveTasks(channelId?: string): BackgroundTaskSnapshot[] {
	if (channelId) {
		// Filter to specific channel if provided
		const tasks = backgroundTasks.get(channelId)
		if (!tasks) {
			return []
		}

		return Array.from(tasks.values()).map((task) => ({ ...task }))
	}

	const results: BackgroundTaskSnapshot[] = []
	// Collect tasks from all channels
	for (const tasks of backgroundTasks.values()) {
		for (const task of tasks.values()) {
			results.push({ ...task })
		}
	}

	return results
}

/**
 * Injects a system message describing active background tasks and recent tool digests so the AI can
 * acknowledge forward progress when responding.
 */
export function withTaskContext(
	messages: ChatMessage[],
	channel: TextBasedChannel | null | undefined,
	viewerUserId: string | null,
	digests: ToolDigest[] = []
): ChatMessage[] {
	const contextMessage = buildTaskContextMessage(channel, viewerUserId, digests)
	if (!contextMessage) {
		return [...messages]
	}

	// Prepend context message if tasks or digests exist
	return [contextMessage, ...messages]
}

/** Removes task context system messages from a message array, useful for logging. */
export function stripTaskContext(messages: ChatMessage[]): ChatMessage[] {
	return messages.filter((message) => message.name !== TASK_CONTEXT_MESSAGE_NAME)
}

/**
 * Formats a placeholder message shown to users when a command defers, adjusting tone for DMs,
 * ephemeral visibility, and whether a summary is available.
 */
export function buildDeferredNotice(params: {
	channelIsDM: boolean
	commandDisplayName: string
	isEphemeral: boolean
	requesterMention: string
	summary: string | null
}): string {
	const detail = getTaskDetail({
		commandDisplayName: params.commandDisplayName,
		summary: params.summary
	})

	let subject: string
	// Determine appropriate subject based on visibility and context
	if (params.isEphemeral && !params.channelIsDM) {
		subject = `a private request for ${params.requesterMention}`
	} else if (params.summary) {
		subject = detail
	} else if (params.commandDisplayName === 'request') {
		subject = 'your request'
	} else {
		subject = `the ${params.commandDisplayName} command`
	}

	// Format final notice message
	return `Hang tight, I'm working on ${subject}. I'll report back once it's ready.`
}

/** Derives the channel key for grouping tasks, falling back to a global scope. */
export function getChannelKey(channel: TextBasedChannel | null | undefined): string {
	return channel?.id ?? DEFAULT_CHANNEL_KEY
}

/**
 * Ensures a typing indicator loop is running for the channel, sending a typing event every seven
 * seconds until all tasks complete.
 */
function ensureTypingLoop(channelKey: string, channel: TextBasedChannel) {
	if (canSendTyping(channel)) {
		// Send initial typing indicator
		channel
			.sendTyping()
			.catch((error: unknown) => logger.debug(`Failed to send typing indicator for channel ${channelKey}:`, error))
	}

	// Skip if loop already exists
	if (typingLoops.has(channelKey)) {
		return
	}

	// Create periodic typing refresh
	const interval = setInterval(() => {
		const ref = channelRefs.get(channelKey)
		// Stop loop if channel reference was removed
		if (!ref) {
			clearInterval(interval)
			typingLoops.delete(channelKey)

			return
		}
		if (!canSendTyping(ref)) {
			return
		}
		ref
			.sendTyping()
			.catch((error: unknown) => logger.debug(`Failed to send typing indicator for channel ${channelKey}:`, error))
	}, TYPING_INTERVAL)

	typingLoops.set(channelKey, interval)
}

/**
 * Builds a system message describing active background tasks and recent tool results, formatted for
 * AI consumption while respecting viewer visibility rules.
 */
function buildTaskContextMessage(
	channel: TextBasedChannel | null | undefined,
	viewerUserId: string | null,
	digests: ToolDigest[]
): ChatMessage | null {
	const channelKey = getChannelKey(channel)
	const tasks = backgroundTasks.get(channelKey)
	const channelIsDM = channel?.isDMBased() ?? false
	const taskLines: string[] = []

	// Collect active task descriptions
	if (tasks && tasks.size > 0) {
		for (const task of tasks.values()) {
			const line = describeTaskForContext(task, viewerUserId, channelIsDM)
			if (line) {
				taskLines.push(`- ${line}`)
			}
		}
	}

	// Format tool result summaries
	const digestLines = digests.map((digest) => `- ${describeDigestForContext(digest)}`)

	if (!taskLines.length && !digestLines.length) {
		return null
	}

	// Build message sections
	const sections: string[] = []
	if (taskLines.length) {
		const header = taskLines.length === 1 ? 'Active background task:' : 'Active background tasks:'
		sections.push(`${header}\n${taskLines.join('\n')}`)
	}
	if (digestLines.length) {
		const header = digestLines.length === 1 ? 'Recent tool result:' : 'Recent tool results:'
		sections.push(`${header}\n${digestLines.join('\n')}`)
	}
	sections.push('Use this information if users ask about ongoing or recent work.')

	// Construct final system message
	return {
		role: 'system',
		name: TASK_CONTEXT_MESSAGE_NAME,
		content: sections.join('\n\n')
	}
}

/** Formats a tool digest into a concise status line for AI context. */
function describeDigestForContext(digest: ToolDigest): string {
	const statusLabel = digest.success ? 'completed' : 'failed'
	const summary = truncateArgument(digest.summary ?? '')

	return `${digest.name} ${statusLabel}: ${summary}`
}

/**
 * Generates a task description for AI context while respecting viewer permissions and privacy
 * requirements.
 */
function describeTaskForContext(
	task: BackgroundTask,
	viewerUserId: string | null,
	channelIsDM: boolean
): string | null {
	// Check if viewer is the task requester
	const viewerIsRequester = task.requesterId !== null && task.requesterId === viewerUserId
	// Determine if full details should be shown
	const revealDetails = !task.ephemeral || channelIsDM
	const detail = revealDetails
		? getTaskDetail(task)
		: viewerIsRequester
			? 'your private request'
			: `a private request for ${task.requesterLabel}`

	// Format based on viewer relationship and visibility
	if (viewerIsRequester) {
		if (task.ephemeral && !channelIsDM) {
			return 'Your private request is still running.'
		}

		return `Your ${detail} is still running.`
	}

	if (task.ephemeral && !channelIsDM) {
		return `Working on a private request for ${task.requesterLabel}.`
	}

	const ownerSuffix = task.requesterId ? ` for ${task.requesterLabel}` : ''

	return `Working on ${detail}${ownerSuffix}.`
}

/** Derives a human-readable task description from the command and optional summary. */
function getTaskDetail(task: Pick<BackgroundTask, 'commandDisplayName' | 'summary'>): string {
	if (task.summary) {
		if (task.commandDisplayName === 'request') {
			return `request "${task.summary}"`
		}

		return `"${task.summary}" via the ${task.commandDisplayName} command`
	}
	if (task.commandDisplayName === 'request') {
		return 'request'
	}

	return `the ${task.commandDisplayName} command`
}

/** Type guard ensuring the channel exposes the `sendTyping` helper. */
function canSendTyping(
	channel: TextBasedChannel | null | undefined
): channel is TextBasedChannel & { sendTyping: () => Promise<void> } {
	return !!channel && typeof (channel as { sendTyping?: unknown }).sendTyping === 'function'
}
