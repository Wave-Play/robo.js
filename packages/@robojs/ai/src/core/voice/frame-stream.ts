/** Async frame stream used to bridge Discord audio capture with engine consumption. */
import type { VoiceInputFrame } from '@/engines/base.js'

/** Stores resolver callbacks when consumers await the next queued frame. */
interface PendingResolver {
	resolve: (value: IteratorResult<VoiceInputFrame>) => void
	reject: (reason?: unknown) => void
}

/**
 * Async iterable queue for streaming audio frames with backpressure support via pending promises.
 *
 * @remarks When the queue is empty, awaiting consumers block until a new frame arrives or the
 * stream ends. Multiple producers can safely push frames concurrently.
 */
export class VoiceFrameStream implements AsyncIterable<VoiceInputFrame> {
	/** Internal frame queue when no consumer is waiting. */
	private readonly queue: VoiceInputFrame[] = []
	/** Pending resolver for the next awaited frame. */
	private pending: PendingResolver | null = null
	/** Flag indicating the stream has been ended. */
	private ended = false

	/**
	 * Pushes a new frame, resolving any waiting consumer immediately or enqueuing otherwise.
	 */
	public push(frame: VoiceInputFrame) {
		// Skip if stream has ended.
		if (this.ended) {
			return
		}

		// Resolve pending consumer immediately.
		if (this.pending) {
			this.pending.resolve({ done: false, value: frame })
			this.pending = null
		} else {
			// Queue frame for later consumption.
			this.queue.push(frame)
		}
	}

	/**
	 * Marks the stream as ended and resolves any awaiting consumer with a done result.
	 */
	public end() {
		// Skip if already ended.
		if (this.ended) {
			return
		}
		this.ended = true

		// Resolve pending consumer with done result.
		if (this.pending) {
			this.pending.resolve({ done: true, value: undefined as unknown as VoiceInputFrame })
			this.pending = null
		}
	}

	/** Returns an async iterator for consuming frames in for-await-of loops. */
	public [Symbol.asyncIterator](): AsyncIterator<VoiceInputFrame> {
		return {
			next: () => this.next()
		}
	}

	/**
	 * Retrieves the next frame, waiting for a producer when the queue is empty or the stream ended.
	 */
	private next(): Promise<IteratorResult<VoiceInputFrame>> {
		// Return queued frame immediately if available.
		if (this.queue.length > 0) {
			const value = this.queue.shift()!

			return Promise.resolve({ done: false, value })
		}

		// Return done result if stream ended.
		if (this.ended) {
			return Promise.resolve({ done: true, value: undefined as unknown as VoiceInputFrame })
		}

		// Create pending promise for next frame.
		return new Promise<IteratorResult<VoiceInputFrame>>((resolve, reject) => {
			this.pending = { resolve, reject }
		})
	}
}
