/**
 * Tunnel Provider Types
 *
 * Defines the interface for tunnel providers (Cloudflare, ngrok, etc.)
 * and related configuration types.
 */
import type { ChildProcess } from 'node:child_process'

/**
 * Interface for tunnel providers.
 * Implement this to add support for new tunnel services.
 */
export interface TunnelProvider {
	/** Provider name (e.g., 'cloudflare', 'ngrok') */
	name: string

	/** Check if the tunnel binary is installed */
	isInstalled(): boolean | Promise<boolean>

	/** Install the tunnel binary */
	install(): Promise<void>

	/** Initialize tunnel configuration (optional, for static tunnels) */
	initialize?(config: TunnelProviderConfig): Promise<boolean>

	/** Start the tunnel and return the instance */
	start(url: string, config?: TunnelProviderConfig): Promise<TunnelInstance>

	/** Stop a running tunnel instance */
	stop(instance: TunnelInstance, signal?: NodeJS.Signals): Promise<void>
}

/**
 * Represents a running tunnel instance.
 */
export interface TunnelInstance {
	/** The tunnel process */
	process: ChildProcess
	/** The public tunnel URL (if available) */
	url?: string
	/** The provider that created this instance */
	provider: string
}

/**
 * Configuration for tunnel providers.
 * Contains provider-specific settings.
 */
export interface TunnelProviderConfig {
	/** Cloudflare-specific configuration */
	domain?: string
	apiKey?: string
	zoneId?: string
	accountId?: string
	tunnelId?: string
	tunnelToken?: string
	/** Origin URL the persistent tunnel should forward to */
	originUrl?: string
	/** Run tunnel process in detached mode (for background operation) */
	detached?: boolean
	/** Timeout in ms for waiting for tunnel URL (default: 30000) */
	timeout?: number
}

/**
 * Plugin tunnel configuration.
 * Used in @robojs/server plugin options.
 */
export interface TunnelConfig {
	/** Enable tunnel in dev mode (default: false, -t flag overrides) */
	enabled?: boolean
	/** Tunnel provider (default: 'cloudflare') */
	provider?: 'cloudflare' | TunnelProvider
	/** Cloudflare-specific configuration */
	cloudflare?: {
		/** Domain to use for static tunnel (falls back to CLOUDFLARE_DOMAIN env) */
		domain?: string
		/** API key (falls back to CLOUDFLARE_API_KEY env) */
		apiKey?: string
		/** Zone ID (falls back to CLOUDFLARE_ZONE_ID env) */
		zoneId?: string
		/** Account ID (falls back to CLOUDFLARE_ACCOUNT_ID env) */
		accountId?: string
	}
}
