// ============================================================================
// HTML Rewriter
// Rewrites root-relative URLs in HTML so they route through /.proxy/*
// ============================================================================

import { buildSdkShimScript } from './sdk-shim.js'

const PROXY_PREFIX = '/.proxy'

export interface HtmlRewriteOptions {
	/** Mapping prefixes to skip (existing behavior) */
	mappingPrefixes: string[]
	/** CSP mode (used for optional diagnostics injection) */
	cspMode?: 'discord_strict' | 'relaxed'
	/** Whether to inject the SDK origin shim script */
	sdkShimEnabled?: boolean
	/** Proxy origin for the SDK shim (e.g., "http://sess.app.discordsays.localhost:50002") */
	proxyOrigin?: string
}

/**
 * Rewrite root-relative URLs in HTML responses so they go through /.proxy/*.
 *
 * Targets: src, href, action attributes on HTML tags, plus srcset values.
 * Skips: URLs already starting with /.proxy, absolute URLs, data: URLs,
 *        fragment-only URLs, and URLs matching a registered mapping prefix.
 */
export function rewriteHtml(html: string, mappingPrefixes: string[]): string {
	let result = html

	// Rewrite src, href, action attributes
	// Pattern: attr="/" or attr='/' - captures the attribute, quote, and path
	for (const attr of ['src', 'href', 'action']) {
		result = result.replace(
			new RegExp(`(${attr}\\s*=\\s*)(["'])(\\/[^"']*?)\\2`, 'gi'),
			(match, prefix: string, quote: string, path: string) => {
				if (shouldSkipUrl(path, mappingPrefixes)) {
					return match
				}
				return `${prefix}${quote}${PROXY_PREFIX}${path}${quote}`
			}
		)
	}

	// Rewrite srcset attribute values
	// srcset contains comma-separated entries: "url descriptor, url descriptor"
	result = result.replace(
		/(srcset\s*=\s*)(["'])(.*?)\2/gi,
		(_match, prefix: string, quote: string, value: string) => {
			const rewritten = value
				.split(',')
				.map((entry) => {
					const trimmed = entry.trim()
					// Each entry is "url [descriptor]"
					const spaceIndex = trimmed.indexOf(' ')
					const url = spaceIndex === -1 ? trimmed : trimmed.slice(0, spaceIndex)
					const descriptor = spaceIndex === -1 ? '' : trimmed.slice(spaceIndex)

					if (url.startsWith('/') && !shouldSkipUrl(url, mappingPrefixes)) {
						return `${PROXY_PREFIX}${url}${descriptor}`
					}
					return trimmed
				})
				.join(', ')
			return `${prefix}${quote}${rewritten}${quote}`
		}
	)

	return result
}

/**
 * Extended HTML rewrite with SDK shim injection support.
 * Falls back to base rewriteHtml for URL rewriting, then optionally injects shim.
 */
export function rewriteHtmlAdvanced(html: string, options: HtmlRewriteOptions): string {
	let result = rewriteHtml(html, options.mappingPrefixes)

	const injections: string[] = []

	// Inject CSP violation reporter in strict mode (helps agents debug why loads fail).
	// Emits a small diagnostic postMessage that the Stage UI bridge can capture.
	if (options.cspMode === 'discord_strict') {
		injections.push(`
<script data-mock-csp-violations="true">
(function(){
  try {
    window.addEventListener('securitypolicyviolation', function(e) {
      try {
        window.parent && window.parent.postMessage({
          __robo_mock: 'csp_violation',
          blockedURI: e.blockedURI,
          violatedDirective: e.violatedDirective,
          effectiveDirective: e.effectiveDirective,
          originalPolicy: e.originalPolicy,
          disposition: e.disposition,
          sourceFile: e.sourceFile,
          lineNumber: e.lineNumber,
          columnNumber: e.columnNumber,
          sample: e.sample
        }, '*');
      } catch(_) {}
    });
  } catch(_) {}
})();
</script>`)
	}

	// Inject URL mapping prefixes for @robojs/patch (Discord proxy compatibility)
	// This simulates the SDK/Developer Portal providing mappings to the page runtime.
	injections.push(`
<script data-mock-url-mappings="true">
(function(){
  try {
    var prefixes = ${JSON.stringify(options.mappingPrefixes)};
    var patch = globalThis['@robojs/patch'] || (globalThis['@robojs/patch'] = {});
    patch.mappings = prefixes;
  } catch(e) {}
})();
</script>`)

	// Inject SDK shim if enabled
	if (options.sdkShimEnabled && options.proxyOrigin) {
		injections.push(buildSdkShimScript(options.proxyOrigin))
	}

	// Inject after <head> tag (or <head ...> with attributes)
	if (injections.length > 0) {
		result = result.replace(/<head([^>]*)>/i, `<head$1>${injections.join('')}`)
	}

	return result
}

/**
 * Check whether a URL should NOT be rewritten.
 */
function shouldSkipUrl(url: string, mappingPrefixes: string[]): boolean {
	// Already proxied
	if (url.startsWith(PROXY_PREFIX)) return true

	// Protocol-relative or absolute
	if (url.startsWith('//')) return true

	// Shouldn't appear in attribute values, but be safe
	if (url.startsWith('http:') || url.startsWith('https:')) return true

	// Data or blob URLs
	if (url.startsWith('data:') || url.startsWith('blob:')) return true

	// Fragment-only
	if (url.startsWith('#')) return true

	// Matches a registered URL mapping prefix
	for (const prefix of mappingPrefixes) {
		const normalized = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix
		if (url === normalized || url.startsWith(normalized + '/')) {
			return true
		}
	}

	return false
}
