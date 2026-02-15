/**
 * Per-instance_id subscription tracking.
 * Implements spec section 3.2 + 14 requirements:
 * - Idempotent subscribe/unsubscribe
 * - Scoped by event name + optional args (e.g., channel_id)
 * - Tracks what events are active for snapshot-on-subscribe
 */
export interface SubscriptionEntry {
	/** Event name (e.g., 'SPEAKING_START') */
	event_name: string

	/** Subscription scoping args (e.g., { channel_id: '123' }) */
	args: Record<string, unknown>

	/** Stable key for dedup (event_name + sorted args hash) */
	key: string

	/** When this subscription was created */
	subscribed_at: number
}

export class SubscriptionRegistry {
	/** instance_id this registry belongs to */
	readonly instance_id: string

	/** Active subscriptions keyed by stable key */
	private subscriptions: Map<string, SubscriptionEntry> = new Map()

	constructor(instance_id: string) {
		this.instance_id = instance_id
	}

	/**
	 * Subscribe to an event. Idempotent: re-subscribing with same args is a no-op.
	 * Returns true if this is a NEW subscription (caller should emit snapshot).
	 * Returns false if already subscribed (no-op).
	 */
	subscribe(event_name: string, args: Record<string, unknown> = {}): boolean {
		const key = this.buildKey(event_name, args)
		if (this.subscriptions.has(key)) {
			return false // Already subscribed
		}
		this.subscriptions.set(key, {
			event_name,
			args,
			key,
			subscribed_at: Date.now()
		})
		return true
	}

	/**
	 * Unsubscribe from an event. Idempotent: unsubscribing when not subscribed is a no-op.
	 * Returns true if a subscription was removed.
	 */
	unsubscribe(event_name: string, args: Record<string, unknown> = {}): boolean {
		const key = this.buildKey(event_name, args)
		return this.subscriptions.delete(key)
	}

	/**
	 * Check if subscribed to a specific event (optionally with specific args).
	 */
	isSubscribed(event_name: string, args?: Record<string, unknown>): boolean {
		if (args) {
			const key = this.buildKey(event_name, args)
			return this.subscriptions.has(key)
		}
		// Check if any subscription for this event exists
		for (const entry of this.subscriptions.values()) {
			if (entry.event_name === event_name) {
				return true
			}
		}
		return false
	}

	/**
	 * Get all subscriptions for a specific event name.
	 */
	getSubscriptionsForEvent(event_name: string): SubscriptionEntry[] {
		const result: SubscriptionEntry[] = []
		for (const entry of this.subscriptions.values()) {
			if (entry.event_name === event_name) {
				result.push(entry)
			}
		}
		return result
	}

	/**
	 * Get all active subscriptions.
	 */
	getAll(): SubscriptionEntry[] {
		return Array.from(this.subscriptions.values())
	}

	/**
	 * Clear all subscriptions. Called on Activity close.
	 */
	clear(): void {
		this.subscriptions.clear()
	}

	/**
	 * Get count of active subscriptions.
	 */
	get size(): number {
		return this.subscriptions.size
	}

	/**
	 * Build a stable dedup key from event name + args.
	 */
	private buildKey(event_name: string, args: Record<string, unknown>): string {
		const sortedArgs = Object.keys(args)
			.sort()
			.map((k) => `${k}=${JSON.stringify(args[k])}`)
			.join('&')
		return sortedArgs ? `${event_name}?${sortedArgs}` : event_name
	}
}
