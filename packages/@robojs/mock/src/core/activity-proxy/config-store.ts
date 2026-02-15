import { mockLogger } from '../logger.js'

// ============================================================================
// Proxy Session Configuration
// ============================================================================

/**
 * Per-session proxy configuration, keyed by session ID.
 */
export interface ProxySessionConfig {
	/** The upstream Activity server URL */
	launch_url: string
	/** Optional launch path (default "/") */
	launch_path: string
	/** URL mappings from Developer Portal semantics */
	url_mappings: UrlMapping[]
	/** CSP mode for this session */
	csp_mode: 'discord_strict' | 'relaxed'
	/** Application ID (for origin template) */
	application_id: string
	/** Whether to inject the SDK origin shim into HTML responses */
	sdk_shim_enabled?: boolean
}

/**
 * A URL mapping entry: { prefix, target }
 */
export interface UrlMapping {
	/** Path prefix (must start with /, e.g., "/firestore") */
	prefix: string
	/** Target hostname (optionally with port, e.g., "firestore.googleapis.com") */
	target: string
}

// ============================================================================
// Hostname constants
// ============================================================================

const PROXY_HOST_SUFFIX = '.discordsays.localhost'

// ============================================================================
// ProxyConfigStore
// ============================================================================

/**
 * Manages per-session proxy configurations.
 */
export class ProxyConfigStore {
	private configs: Map<string, ProxySessionConfig> = new Map()

	size(): number {
		return this.configs.size
	}

	set(sessionId: string, config: ProxySessionConfig): void {
		this.configs.set(sessionId, config)
		mockLogger.debug(`Proxy config set for session ${sessionId}: launch_url=${config.launch_url}`)
	}

	get(sessionId: string): ProxySessionConfig | undefined {
		return this.configs.get(sessionId)
	}

	delete(sessionId: string): boolean {
		const deleted = this.configs.delete(sessionId)
		if (deleted) {
			mockLogger.debug(`Proxy config deleted for session ${sessionId}`)
		}
		return deleted
	}

	updateMappings(sessionId: string, mappings: UrlMapping[]): boolean {
		const config = this.configs.get(sessionId)
		if (!config) return false
		config.url_mappings = mappings
		mockLogger.debug(`Proxy URL mappings updated for session ${sessionId}: ${mappings.length} mapping(s)`)
		return true
	}

	updateCspMode(sessionId: string, mode: 'discord_strict' | 'relaxed'): boolean {
		const config = this.configs.get(sessionId)
		if (!config) return false
		config.csp_mode = mode
		mockLogger.debug(`Proxy CSP mode updated for session ${sessionId}: ${mode}`)
		return true
	}

	updateSdkShim(sessionId: string, enabled: boolean): boolean {
		const config = this.configs.get(sessionId)
		if (!config) return false
		config.sdk_shim_enabled = enabled
		mockLogger.debug(`Proxy SDK shim ${enabled ? 'enabled' : 'disabled'} for session ${sessionId}`)
		return true
	}

	/**
	 * Resolve session from hostname.
	 * Hostname format: {sanitized_session_id}.{application_id}.discordsays.localhost
	 *
	 * Since sanitization is lossy (both '_' and '-' map to '-'), we match by
	 * comparing the sanitized form of each stored session ID against the hostname part.
	 */
	resolveFromHostname(hostname: string): { sessionId: string; config: ProxySessionConfig } | null {
		// Strip port if present
		const hostOnly = hostname.includes(':') ? hostname.split(':')[0] : hostname

		// Check for discordsays.localhost suffix
		if (!hostOnly.endsWith(PROXY_HOST_SUFFIX)) {
			return null
		}

		// Strip suffix
		const remaining = hostOnly.slice(0, -PROXY_HOST_SUFFIX.length)
		if (!remaining) return null

		// Split on first dot: [sessionPart, applicationId]
		const firstDot = remaining.indexOf('.')
		if (firstDot === -1) return null

		const sessionPart = remaining.slice(0, firstDot)

		// Match against stored sessions by comparing sanitized forms
		for (const [sessionId, config] of this.configs) {
			const sanitized = sanitizeSessionId(sessionId)
			mockLogger.debug(`[proxy resolve] Comparing: stored="${sessionId}" sanitized="${sanitized}" vs hostname="${sessionPart}" match=${sanitized === sessionPart}`)
			if (sanitized === sessionPart) {
				return { sessionId, config }
			}
		}

		mockLogger.debug(`No proxy config found for sanitized session "${sessionPart}" (from hostname ${hostname}), store has ${this.configs.size} config(s)`)
		return null
	}
}

// ============================================================================
// Hostname sanitization helpers
// ============================================================================

/**
 * Sanitize session ID for use in hostname (underscores are invalid in DNS labels).
 * Replaces underscores with hyphens. The reverse lookup uses fuzzy matching
 * since base64url session IDs can contain both '_' and '-'.
 */
export function sanitizeSessionId(sessionId: string): string {
	return sessionId.replace(/_/g, '-')
}

// ============================================================================
// Singleton
// ============================================================================

let _proxyConfigStore: ProxyConfigStore | null = null

export function getProxyConfigStore(): ProxyConfigStore {
	if (!_proxyConfigStore) {
		_proxyConfigStore = new ProxyConfigStore()
	}
	return _proxyConfigStore
}
