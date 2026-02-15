/**
 * Simple sliding-window rate limiter for Activity RPC commands.
 * Prevents Activities from spamming the host.
 *
 * Default: 100 commands per second (generous for normal use,
 * catches tight loops or runaway SDK bugs).
 */
export interface RateLimiterConfig {
	/** Maximum commands allowed within the window */
	maxCommands: number
	/** Window duration in milliseconds */
	windowMs: number
}

export const DEFAULT_RATE_LIMIT: RateLimiterConfig = {
	maxCommands: 100,
	windowMs: 1000
}

export class RpcRateLimiter {
	private timestamps: number[] = []
	private readonly config: RateLimiterConfig

	constructor(config?: Partial<RateLimiterConfig>) {
		this.config = { ...DEFAULT_RATE_LIMIT, ...config }
	}

	/**
	 * Check if a command should be rate-limited.
	 * Returns true if the command is allowed, false if rate-limited.
	 */
	check(): boolean {
		const now = Date.now()
		const cutoff = now - this.config.windowMs

		// Remove timestamps outside the window
		this.timestamps = this.timestamps.filter((t) => t > cutoff)

		if (this.timestamps.length >= this.config.maxCommands) {
			return false // Rate limited
		}

		this.timestamps.push(now)
		return true
	}

	/**
	 * Reset the limiter (e.g., on Activity close).
	 */
	reset(): void {
		this.timestamps = []
	}

	/**
	 * Get time until next allowed command (in ms), or 0 if not limited.
	 */
	retryAfterMs(): number {
		if (this.timestamps.length < this.config.maxCommands) return 0
		const oldest = this.timestamps[0]
		return Math.max(0, oldest + this.config.windowMs - Date.now())
	}
}
