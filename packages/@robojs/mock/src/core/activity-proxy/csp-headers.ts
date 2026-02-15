// ============================================================================
// CSP + Security Headers
// Applies Content-Security-Policy and other security headers to proxy responses
// ============================================================================

import type { ServerResponse } from 'node:http'

export type CspMode = 'discord_strict' | 'relaxed'

export interface CspContext {
	/** The proxy origin (for self references) */
	proxyOrigin: string
	/** The Stage UI origin (for frame-ancestors) */
	stageOrigin: string
	/** Session's CSP mode */
	mode: CspMode
	/** URL mapping targets (for connect-src in strict mode) */
	mappingTargets?: string[]
}

/**
 * Build the Content-Security-Policy string for a given context.
 */
export function buildCspString(ctx: CspContext): string {
	if (ctx.mode === 'relaxed') {
		// Allow everything while still restricting framing to Stage UI
		return [
			"default-src * 'unsafe-inline' 'unsafe-eval' data: blob:",
			'connect-src *',
			`frame-ancestors ${ctx.stageOrigin}`
		].join('; ')
	}

	// Discord strict mode
	const proxyHost = new URL(ctx.proxyOrigin).host
	const connectSources = ["'self'", `wss://${proxyHost}`]
	if (ctx.mappingTargets) {
		for (const target of ctx.mappingTargets) {
			// Ensure target has https:// prefix for CSP
			connectSources.push(target.includes('://') ? target : `https://${target}`)
		}
	}

	return [
		"default-src 'self'",
		"script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data: blob: https://cdn.discordapp.com",
		`connect-src ${connectSources.join(' ')}`,
		`frame-ancestors ${ctx.stageOrigin}`,
		"font-src 'self' data:",
		"media-src 'self' blob:",
		"worker-src 'self' blob:"
	].join('; ')
}

/**
 * Cross-origin isolation headers.
 * Conservative defaults to avoid breaking Activities.
 */
const CROSS_ORIGIN_HEADERS: Record<string, string> = {
	'Cross-Origin-Opener-Policy': 'same-origin',
	'Cross-Origin-Resource-Policy': 'cross-origin'
}

/**
 * Other security headers.
 */
const SECURITY_HEADERS: Record<string, string> = {
	'X-Content-Type-Options': 'nosniff',
	'Referrer-Policy': 'origin'
}

/**
 * Apply CSP + security headers to a response.
 * Only applies CSP to HTML responses (when isHtml is true).
 */
export function applyCspHeaders(res: ServerResponse, ctx: CspContext, isHtml: boolean): void {
	// CSP only for HTML responses
	if (isHtml) {
		res.setHeader('Content-Security-Policy', buildCspString(ctx))
	}

	// Cross-origin headers for all responses
	for (const [key, value] of Object.entries(CROSS_ORIGIN_HEADERS)) {
		res.setHeader(key, value)
	}

	// Security headers for all responses
	for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
		res.setHeader(key, value)
	}
}
