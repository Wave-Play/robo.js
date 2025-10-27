/**
 * Manages pending tool execution digests so subsequent AI turns can ingest tool outputs.
 */
import type { ChatFunctionCall } from '@/engines/base.js'

/**
 * Represents the result of a tool execution for reinjection into the next AI turn.
 */
export interface ToolDigest {
	/** Unique identifier for this tool invocation. */
	callId: string
	/** Function name that was executed. */
	name: string
	/** Indicates whether execution completed without errors. */
	success: boolean
	/** Concise description of the result for AI context. */
	summary: string
	/** Optional full text response from the tool. */
	detail?: string | null
	/** Timestamp when the digest was created. */
	createdAt: number
	/** Optional shadow summarization response identifier. */
	shadowResponseId?: string | null
}

/**
 * Parameters required to schedule a tool execution run with success/failure callbacks.
 */
interface ScheduleOptions {
	call: ChatFunctionCall
	channelKey: string
	execute: () => Promise<ToolDigest>
	onFailure?: (digest: ToolDigest, error: unknown) => void
	onSuccess?: (digest: ToolDigest) => void
}

/** In-memory map tracking pending digests per channel until they are drained. */
const pendingDigests = new Map<string, ToolDigest[]>()

/**
 * Adds a tool digest to the pending queue for the specified channel.
 *
 * @param channelKey Channel identifier used to group digests.
 * @param digest Tool execution result to enqueue.
 */
export function enqueueDigest(channelKey: string, digest: ToolDigest) {
	const existing = pendingDigests.get(channelKey)
	if (existing) {
		// Append to existing queue if present
		existing.push(digest)

		return
	}

	// Create new queue for this channel
	pendingDigests.set(channelKey, [digest])
}

/**
 * Retrieves and removes all pending digests for a channel.
 *
 * @param channelKey Channel identifier associated with the pending digests.
 * @returns All queued digests or an empty array when none are waiting.
 */
export function drainDigests(channelKey: string): ToolDigest[] {
	const digests = pendingDigests.get(channelKey)
	if (!digests || digests.length === 0) {
		// Return empty array if no digests queued

		return []
	}

	// Remove queue after draining
	pendingDigests.delete(channelKey)

	return digests
}

/**
 * Schedules a tool execution and records the resulting digest, capturing errors as failure digests.
 *
 * @param options Execution parameters including executor and callbacks.
 * @remarks Runs asynchronously without awaiting the caller to keep chat flows responsive.
 */
export function scheduleToolRun(options: ScheduleOptions): void {
	void (async () => {
		try {
			// Execute tool and capture digest
			const digest = await options.execute()

			// Queue successful result
			enqueueDigest(options.channelKey, digest)

			options.onSuccess?.(digest)
		} catch (error) {
			const digest: ToolDigest = {
				callId: options.call.id ?? options.call.name,
				createdAt: Date.now(),
				name: options.call.name,
				success: false,
				summary: error instanceof Error ? error.message : String(error)
			}

			// Convert errors to failure digests
			enqueueDigest(options.channelKey, digest)

			options.onFailure?.(digest, error)
		}
	})()
}
