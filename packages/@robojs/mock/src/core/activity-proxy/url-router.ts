// ============================================================================
// URL Mapping Router
// Routes incoming requests to the correct upstream based on path
// ============================================================================

import { URL } from 'node:url'
import type { ProxySessionConfig, UrlMapping } from './config-store.js'

const PROXY_PREFIX = '/.proxy'

/**
 * Result of resolving a route for a proxy request.
 */
export interface RouteResult {
	/** The upstream URL to proxy to */
	targetUrl: URL
	/** Whether this is a /.proxy route (vs mapping route) */
	isProxyRoute: boolean
	/** Whether HTML rewriting should be applied */
	rewriteHtml: boolean
	/** The matched mapping (if any) */
	mapping?: UrlMapping
}

/**
 * Special result indicating the request should be redirected.
 */
export interface RedirectResult {
	redirect: true
	location: string
	statusCode: number
}

export type ResolveRouteResult = RouteResult | RedirectResult | null

/**
 * Check if a result is a redirect.
 */
export function isRedirectResult(result: ResolveRouteResult): result is RedirectResult {
	return result !== null && 'redirect' in result
}

/**
 * Resolve the upstream route for an incoming proxy request.
 *
 * Routing rules (order of evaluation):
 * 1. /.proxy/* -> strip prefix, proxy to launch_url + launch_path + remaining
 * 2. URL mapping routes -> longest prefix match, proxy to https://target/remaining
 * 3. Root path "/" -> redirect to /.proxy/
 * 4. No match -> null (404)
 */
export function resolveRoute(
	requestPath: string,
	queryString: string,
	config: ProxySessionConfig
): ResolveRouteResult {
	// Rule 1: /.proxy/* route
	if (requestPath === PROXY_PREFIX || requestPath.startsWith(PROXY_PREFIX + '/')) {
		const remainingPath = requestPath === PROXY_PREFIX ? '/' : requestPath.slice(PROXY_PREFIX.length)
		const targetUrl = buildProxyTargetUrl(config.launch_url, config.launch_path, remainingPath, queryString)

		return {
			targetUrl,
			isProxyRoute: true,
			rewriteHtml: true
		}
	}

	// Rule 2: URL mapping routes (longest prefix match)
	if (config.url_mappings.length > 0) {
		const mappingResult = findMappingMatch(requestPath, queryString, config.url_mappings)
		if (mappingResult) {
			return mappingResult
		}
	}

	// Rule 3: Root path "/" -> redirect to /.proxy/
	if (requestPath === '/') {
		return {
			redirect: true,
			location: PROXY_PREFIX + '/',
			statusCode: 302
		}
	}

	// Rule 4: No match
	return null
}

/**
 * Find the longest matching URL mapping for a request path.
 */
function findMappingMatch(
	requestPath: string,
	queryString: string,
	mappings: UrlMapping[]
): RouteResult | null {
	let bestMatch: { mapping: UrlMapping; remainingPath: string } | null = null
	let longestPrefix = 0

	for (const mapping of mappings) {
		// Normalize: remove trailing slash from prefix (except for "/" itself)
		const normalizedPrefix = mapping.prefix.length > 1 && mapping.prefix.endsWith('/')
			? mapping.prefix.slice(0, -1)
			: mapping.prefix

		if (requestPath === normalizedPrefix || requestPath.startsWith(normalizedPrefix + '/')) {
			if (normalizedPrefix.length > longestPrefix) {
				longestPrefix = normalizedPrefix.length
				const remaining = requestPath === normalizedPrefix ? '/' : requestPath.slice(normalizedPrefix.length)
				bestMatch = { mapping, remainingPath: remaining }
			}
		}
	}

	if (!bestMatch) {
		return null
	}

	const { mapping, remainingPath } = bestMatch

	// Build target URL: default to https:// if no protocol
	const targetBase = mapping.target.includes('://') ? mapping.target : `https://${mapping.target}`
	const targetUrl = buildMappingTargetUrl(targetBase, remainingPath, queryString)

	return {
		targetUrl,
		isProxyRoute: false,
		rewriteHtml: false,
		mapping
	}
}

/**
 * Build the upstream target URL for a /.proxy/* request.
 */
function buildProxyTargetUrl(
	launchUrl: string,
	launchPath: string,
	remainingPath: string,
	queryString: string
): URL {
	const base = new URL(launchUrl)
	const fullPath = joinPaths(base.pathname, joinPaths(launchPath, remainingPath))
	base.pathname = fullPath
	if (queryString) {
		base.search = queryString.startsWith('?') ? queryString : `?${queryString}`
	}
	return base
}

/**
 * Build the upstream target URL for a mapping route.
 */
function buildMappingTargetUrl(
	targetBase: string,
	remainingPath: string,
	queryString: string
): URL {
	const base = new URL(targetBase)
	base.pathname = joinPaths(base.pathname, remainingPath)
	if (queryString) {
		base.search = queryString.startsWith('?') ? queryString : `?${queryString}`
	}
	return base
}

/**
 * Join two path segments, avoiding double slashes.
 */
function joinPaths(base: string, path: string): string {
	if (!base || base === '/') {
		return path || '/'
	}
	if (!path || path === '/') {
		return base
	}
	const baseClean = base.endsWith('/') ? base.slice(0, -1) : base
	const pathClean = path.startsWith('/') ? path : '/' + path
	return baseClean + pathClean
}
