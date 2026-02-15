// ============================================================================
// Redirect Rewriter
// Rewrites Location headers so redirects stay inside the proxy
// ============================================================================

import type { UrlMapping } from './config-store.js'

const PROXY_PREFIX = '/.proxy'

/**
 * Rewrite a Location header value so redirects stay inside the proxy.
 *
 * Rules:
 * 1. If Location points to the upstream origin: rewrite to proxy origin + /.proxy + path
 * 2. If Location is root-relative and came from /.proxy route: prepend /.proxy
 * 3. If Location points to a host matching a URL mapping target: rewrite to mapping prefix
 * 4. Otherwise: pass through unchanged
 */
export function rewriteRedirectLocation(
	locationHeader: string,
	upstreamOrigin: string,
	proxyOrigin: string,
	isProxyRoute: boolean,
	urlMappings?: UrlMapping[]
): string {
	// Try to parse as absolute URL
	try {
		const locationUrl = new URL(locationHeader)
		const upstreamUrl = new URL(upstreamOrigin)

		// Rule 1: Points to upstream origin
		if (locationUrl.origin === upstreamUrl.origin) {
			return `${proxyOrigin}${PROXY_PREFIX}${locationUrl.pathname}${locationUrl.search}${locationUrl.hash}`
		}

		// Rule 3: Points to a URL mapping target host
		if (urlMappings) {
			for (const mapping of urlMappings) {
				const targetHost = mapping.target.includes('://') ? new URL(mapping.target).host : mapping.target
				if (locationUrl.host === targetHost) {
					const prefix = mapping.prefix.endsWith('/') ? mapping.prefix.slice(0, -1) : mapping.prefix
					return `${proxyOrigin}${prefix}${locationUrl.pathname}${locationUrl.search}${locationUrl.hash}`
				}
			}
		}

		// Rule 4: Different host entirely, pass through
		return locationHeader
	} catch {
		// Not a valid absolute URL - treat as relative
	}

	// Rule 2: Root-relative path
	if (locationHeader.startsWith('/') && isProxyRoute) {
		if (!locationHeader.startsWith(PROXY_PREFIX)) {
			return `${PROXY_PREFIX}${locationHeader}`
		}
	}

	// Rule 4: Pass through unchanged
	return locationHeader
}
