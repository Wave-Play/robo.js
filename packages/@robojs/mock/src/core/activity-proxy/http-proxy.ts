// ============================================================================
// HTTP Proxy Engine
// Handles HTTP proxying for all methods with streaming body support
// ============================================================================

import http from 'node:http'
import https from 'node:https'
import zlib from 'node:zlib'
import { URL } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { mockLogger } from '../logger.js'
import type { ProxySessionConfig } from './config-store.js'
import { rewriteHtmlAdvanced } from './html-rewriter.js'
import { rewriteRedirectLocation } from './redirect-rewriter.js'
import { CookieJar } from './cookie-handler.js'
import { applyCspHeaders } from './csp-headers.js'
import type { CspContext } from './csp-headers.js'
import { emitProxyNetworkEntry, generateEntryId, recordProxyHttpAction } from './observability.js'

// ============================================================================
// Constants
// ============================================================================

const HOP_BY_HOP_HEADERS = new Set([
	'connection',
	'keep-alive',
	'proxy-authenticate',
	'proxy-authorization',
	'te',
	'trailer',
	'transfer-encoding',
	'upgrade'
])

/** Default upstream timeout in milliseconds */
const UPSTREAM_TIMEOUT = 30_000

// ============================================================================
// Per-session cookie jars (keyed by sessionId)
// ============================================================================

const sessionCookieJars = new Map<string, CookieJar>()

function buildCookieJarKey(sessionId: string, applicationId: string): string {
	return `${sessionId}::${applicationId}`
}

function getOrCreateCookieJar(sessionId: string, applicationId: string): CookieJar {
	const key = buildCookieJarKey(sessionId, applicationId)
	let jar = sessionCookieJars.get(key)
	if (!jar) {
		jar = new CookieJar()
		sessionCookieJars.set(key, jar)
	}
	return jar
}

export function clearCookieJar(sessionId: string, applicationId: string): void {
	sessionCookieJars.delete(buildCookieJarKey(sessionId, applicationId))
}

// ============================================================================
// Proxy Request Options
// ============================================================================

export interface ProxyRequestOptions {
	/** Incoming request */
	req: IncomingMessage
	/** Outgoing response */
	res: ServerResponse
	/** Target upstream URL (full, including path) */
	targetUrl: URL
	/** Session config for header rewriting */
	sessionConfig: ProxySessionConfig
	/** Session ID for cookie jar + observability */
	sessionId: string
	/** Whether to rewrite HTML (only for launch_url responses) */
	rewriteHtml: boolean
	/** The proxy origin (for rewriting) */
	proxyOrigin: string
	/** Whether this is a /.proxy route */
	isProxyRoute: boolean
	/** Matched mapping prefix (for observability) */
	mappingPrefix?: string
}

// ============================================================================
// Main Proxy Function
// ============================================================================

export async function proxyHttpRequest(options: ProxyRequestOptions): Promise<void> {
	const { req, res, targetUrl, sessionConfig, sessionId, proxyOrigin, isProxyRoute, mappingPrefix } = options
	const startTime = Date.now()
	const entryId = generateEntryId()

	const cookieJar = getOrCreateCookieJar(sessionId, sessionConfig.application_id)

	// Build upstream request options
	const isHttps = targetUrl.protocol === 'https:'
	const requestModule = isHttps ? https : http

	const upstreamHeaders: Record<string, string | string[]> = {}

	// Copy end-to-end headers from incoming request (skip hop-by-hop)
	if (req.rawHeaders) {
		for (let i = 0; i < req.rawHeaders.length; i += 2) {
			const key = req.rawHeaders[i]
			const value = req.rawHeaders[i + 1]
			if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
				// Do not forward browser cookies to mapping targets; mapping cookies are managed server-side
				// via CookieJar keyed by upstream domain. This prevents cross-target cookie leakage.
				if (!isProxyRoute && key.toLowerCase() === 'cookie') continue
				upstreamHeaders[key] = value
			}
		}
	}

	// Preserve original Host for /.proxy routes so dev servers (e.g. Vite HMR)
	// see the proxied origin. For URL-mapping routes, target host is required.
	if (!isProxyRoute) {
		upstreamHeaders['Host'] = targetUrl.host
	}

	// Forward cookies from cookie jar
	const jarCookies = cookieJar.getCookieHeader(targetUrl)
	if (jarCookies) {
		const existingCookies = upstreamHeaders['Cookie'] as string | undefined
		upstreamHeaders['Cookie'] = existingCookies ? `${existingCookies}; ${jarCookies}` : jarCookies
	}

	// Remove Accept-Encoding for HTML responses that need rewriting
	// (we'll decompress ourselves to rewrite, then serve uncompressed)
	// For non-HTML responses, keep Accept-Encoding for passthrough
	if (options.rewriteHtml) {
		// Accept compressed response so we can decompress and rewrite
		upstreamHeaders['Accept-Encoding'] = 'gzip, deflate, br'
	}

	const requestOptions: http.RequestOptions & { rejectUnauthorized?: boolean } = {
		hostname: targetUrl.hostname,
		port: targetUrl.port || (isHttps ? 443 : 80),
		path: targetUrl.pathname + targetUrl.search,
		method: req.method || 'GET',
		headers: upstreamHeaders,
		timeout: UPSTREAM_TIMEOUT
	}

	// Allow self-signed certs for dev servers
	if (isHttps) {
		requestOptions.rejectUnauthorized = false
	}

	return new Promise<void>((resolve) => {
		const upstreamReq = requestModule.request(requestOptions, (upstreamRes) => {
			const contentType = upstreamRes.headers['content-type'] ?? ''
			const isHtmlResponse = contentType.includes('text/html')
			const shouldRewriteBody = options.rewriteHtml && isHtmlResponse
			const statusCode = upstreamRes.statusCode ?? 200

			// Build CSP context
			const stagePort = process.env.PORT ?? '3000'
			const stageOrigin = [
				process.env.MOCK_STAGE_ORIGIN,
				`http://localhost:${stagePort}`,
				`http://127.0.0.1:${stagePort}`
			].filter(Boolean).join(' ')
			const cspContext: CspContext = {
				proxyOrigin,
				stageOrigin,
				mode: sessionConfig.csp_mode
			}

			// Apply CSP + security headers
			applyCspHeaders(res, cspContext, isHtmlResponse)

			// Copy end-to-end headers from upstream (skip hop-by-hop)
			for (const [key, value] of Object.entries(upstreamRes.headers)) {
				if (!value) continue
				const lowerKey = key.toLowerCase()
				if (HOP_BY_HOP_HEADERS.has(lowerKey)) continue
				// Skip content-encoding and content-length if we're rewriting HTML
				if (shouldRewriteBody && (lowerKey === 'content-encoding' || lowerKey === 'content-length')) continue
				// Skip CSP from upstream (we set our own)
				if (lowerKey === 'content-security-policy' || lowerKey === 'content-security-policy-report-only') continue
				// Skip COOP/CORP from upstream (we set our own)
				if (lowerKey === 'cross-origin-opener-policy' || lowerKey === 'cross-origin-resource-policy') continue

				try {
					res.setHeader(key, value)
				} catch {
					// Ignore header set errors
				}
			}

			// Handle Set-Cookie:
			// - Always store cookies in jar for upstream domain replay.
			// - Only forward Set-Cookie to the browser for /.proxy routes (Activity upstream).
			//   For mapping routes, cookies should remain server-side to avoid leaking third-party cookies
			//   into the Activity's document.cookie (proxy origin).
			const setCookieHeaders = upstreamRes.headers['set-cookie']
			if (setCookieHeaders) {
				cookieJar.addFromSetCookie(setCookieHeaders, targetUrl)
				if (isProxyRoute) {
					const proxyHostname = new URL(proxyOrigin).hostname
					const rewritten = cookieJar.rewriteSetCookieHeaders(setCookieHeaders, proxyHostname)
					try {
						res.setHeader('Set-Cookie', rewritten)
					} catch {
						// Ignore
					}
				}
			}

			// Handle redirect Location header rewriting
			if (statusCode >= 300 && statusCode < 400 && upstreamRes.headers['location']) {
				const upstreamOrigin = `${targetUrl.protocol}//${targetUrl.host}`
				const rewrittenLocation = rewriteRedirectLocation(
					upstreamRes.headers['location'],
					upstreamOrigin,
					proxyOrigin,
					isProxyRoute,
					sessionConfig.url_mappings
				)
				res.setHeader('Location', rewrittenLocation)
			}

			if (shouldRewriteBody) {
				// Decompress, rewrite HTML, serve uncompressed
				handleHtmlRewrite(upstreamRes, res, statusCode, sessionConfig, entryId, sessionId, startTime, targetUrl, req, proxyOrigin, mappingPrefix, resolve)
			} else {
				// Stream response body directly (binary-safe pipe)
				res.writeHead(statusCode)
				upstreamRes.pipe(res)
				upstreamRes.on('end', () => {
					emitEntry(entryId, sessionId, req, targetUrl, statusCode, startTime, contentType, false, mappingPrefix)
					resolve()
				})
				upstreamRes.on('error', (err) => {
					mockLogger.debug(`Upstream response error: ${err.message}`)
					resolve()
				})
			}
		})

		// Handle upstream connection errors
		upstreamReq.on('error', (err: NodeJS.ErrnoException) => {
			const duration = Date.now() - startTime
			mockLogger.debug(`Upstream request error to ${targetUrl.href}: ${err.message} (${err.code})`)

			const statusCode = err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET' ? 502 : 504
			if (!res.headersSent) {
				sendProxyError(res, statusCode, statusCode === 502 ? 'Bad Gateway' : 'Gateway Timeout',
					`Failed to connect to upstream: ${err.message}`)
			}

			emitProxyNetworkEntry(sessionId, {
				id: entryId,
				timestamp: startTime,
				method: req.method ?? 'GET',
				proxyUrl: req.url ?? '/',
				upstreamUrl: targetUrl.href,
				statusCode,
				duration,
				error: err.message,
				type: 'http',
				mappingPrefix
			})
			resolve()
		})

		upstreamReq.on('timeout', () => {
			upstreamReq.destroy()
			if (!res.headersSent) {
				sendProxyError(res, 504, 'Gateway Timeout', 'Upstream server did not respond in time')
			}
			resolve()
		})

		// Pipe incoming request body to upstream
		req.pipe(upstreamReq)
	})
}

// ============================================================================
// HTML Rewrite Handler
// ============================================================================

function handleHtmlRewrite(
	upstreamRes: IncomingMessage,
	res: ServerResponse,
	statusCode: number,
	sessionConfig: ProxySessionConfig,
	entryId: string,
	sessionId: string,
	startTime: number,
	targetUrl: URL,
	req: IncomingMessage,
	proxyOrigin: string,
	mappingPrefix: string | undefined,
	resolve: () => void
): void {
	const encoding = upstreamRes.headers['content-encoding']
	const chunks: Buffer[] = []

	// Build decompression stream if needed
	let decompressStream: NodeJS.ReadableStream = upstreamRes
	if (encoding === 'gzip') {
		decompressStream = upstreamRes.pipe(zlib.createGunzip())
	} else if (encoding === 'br') {
		decompressStream = upstreamRes.pipe(zlib.createBrotliDecompress())
	} else if (encoding === 'deflate') {
		decompressStream = upstreamRes.pipe(zlib.createInflate())
	}

	decompressStream.on('data', (chunk: Buffer) => {
		chunks.push(chunk)
	})

	decompressStream.on('end', () => {
		const html = Buffer.concat(chunks).toString('utf-8')
		const mappingPrefixes = sessionConfig.url_mappings.map((m) => m.prefix)
		const rewritten = rewriteHtmlAdvanced(html, {
			mappingPrefixes,
			cspMode: sessionConfig.csp_mode,
			sdkShimEnabled: sessionConfig.sdk_shim_enabled ?? false,
			proxyOrigin
		})

		const body = Buffer.from(rewritten, 'utf-8')
		res.setHeader('Content-Length', body.length)
		res.writeHead(statusCode)
		res.end(body)

		emitEntry(entryId, sessionId, req, targetUrl, statusCode, startTime, 'text/html', true, mappingPrefix)
		resolve()
	})

	decompressStream.on('error', (err) => {
		mockLogger.debug(`Decompression error: ${err.message}`)
		if (!res.headersSent) {
			sendProxyError(res, 502, 'Bad Gateway', 'Failed to decompress upstream response')
		}
		resolve()
	})
}

// ============================================================================
// Helpers
// ============================================================================

function emitEntry(
	entryId: string,
	sessionId: string,
	req: IncomingMessage,
	targetUrl: URL,
	statusCode: number,
	startTime: number,
	contentType: string,
	htmlRewritten: boolean,
	mappingPrefix?: string
): void {
	const duration = Date.now() - startTime
	emitProxyNetworkEntry(sessionId, {
		id: entryId,
		timestamp: startTime,
		method: req.method ?? 'GET',
		proxyUrl: req.url ?? '/',
		upstreamUrl: targetUrl.href,
		statusCode,
		duration,
		contentType: contentType || undefined,
		htmlRewritten: htmlRewritten || undefined,
		mappingPrefix,
		type: 'http'
	})

	// Record in session recorder (instance_id resolved lazily)
	import('../../activity/index.js')
		.then(({ getActivityHostManager }) => {
			const record = getActivityHostManager().getRecord(sessionId)
			if (record) {
				recordProxyHttpAction(sessionId, {
					instance_id: record.instance_id,
					method: req.method ?? 'GET',
					url: req.url ?? '/',
					upstream_url: targetUrl.href,
					status_code: statusCode,
					duration_ms: duration,
					content_type: contentType || undefined,
					mapping_prefix: mappingPrefix ?? null
				})
			}
		})
		.catch(() => {
			// Activity host may not be available
		})
}

/**
 * Send a styled HTML error page for proxy failures.
 * Matches the Discord dark theme aesthetic used by the Stage UI.
 */
export function sendProxyError(
	res: ServerResponse,
	statusCode: number,
	message: string,
	details?: string
): void {
	const isNotFound = statusCode === 404
	const isBadGateway = statusCode === 502
	const isTimeout = statusCode === 504

	// Pick an icon and hint based on the error type
	let icon: string
	let hint: string
	if (isNotFound) {
		icon = `<svg width="64" height="64" viewBox="0 0 24 24" fill="none"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-4h2v2h-2v-2zm0-10h2v7h-2V6z" fill="#ed4245"/></svg>`
		hint = 'The requested path does not match any configured route on this Activity Proxy.'
	} else if (isBadGateway) {
		icon = `<svg width="64" height="64" viewBox="0 0 24 24" fill="none"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" fill="#fee75c"/><path d="M11 7h2v6h-2V7zm0 8h2v2h-2v-2z" fill="#fee75c"/></svg>`
		hint = 'The upstream server refused the connection. Make sure your dev server is running.'
	} else if (isTimeout) {
		icon = `<svg width="64" height="64" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#fee75c" stroke-width="2" fill="none"/><path d="M12 6v6l4 2" stroke="#fee75c" stroke-width="2" stroke-linecap="round"/></svg>`
		hint = 'The upstream server did not respond in time.'
	} else {
		icon = `<svg width="64" height="64" viewBox="0 0 24 24" fill="none"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-4h2v2h-2v-2zm0-10h2v7h-2V6z" fill="#ed4245"/></svg>`
		hint = ''
	}

	const escapedDetails = details ? escapeHtml(details) : ''

	const body = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${statusCode} ${message}</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;width:100%}
body{
	background:#1a1a1e;
	color:#b5bac1;
	font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen,Ubuntu,Cantarell,sans-serif;
	display:flex;
	align-items:center;
	justify-content:center;
	-webkit-font-smoothing:antialiased;
}
.container{
	text-align:center;
	max-width:460px;
	padding:48px 32px;
}
.icon{
	margin-bottom:24px;
	opacity:.9;
}
.status-code{
	font-size:72px;
	font-weight:800;
	letter-spacing:-2px;
	line-height:1;
	background:linear-gradient(135deg,#5865f2 0%,#eb459e 100%);
	-webkit-background-clip:text;
	-webkit-text-fill-color:transparent;
	background-clip:text;
	margin-bottom:8px;
}
.message{
	font-size:20px;
	font-weight:600;
	color:#f2f3f5;
	margin-bottom:16px;
}
.hint{
	font-size:14px;
	color:#949ba4;
	line-height:1.5;
	margin-bottom:20px;
}
.details{
	background:#111214;
	border:1px solid rgba(79,84,92,.48);
	border-radius:8px;
	padding:12px 16px;
	font-family:'Consolas','Monaco','Courier New',monospace;
	font-size:12px;
	color:#dbdee1;
	text-align:left;
	word-break:break-all;
	line-height:1.6;
	margin-bottom:24px;
	max-height:120px;
	overflow-y:auto;
}
.details::-webkit-scrollbar{width:6px}
.details::-webkit-scrollbar-track{background:transparent}
.details::-webkit-scrollbar-thumb{background:#4e5058;border-radius:3px}
.divider{
	width:100%;
	height:1px;
	background:rgba(79,84,92,.48);
	margin:24px 0 16px;
}
.footer{
	display:flex;
	align-items:center;
	justify-content:center;
	gap:8px;
	font-size:12px;
	color:#4e5058;
}
.footer svg{flex-shrink:0}
.mock-link{
	color:#949ba4;
	text-decoration:none;
	transition:color .15s ease;
}
.mock-link:hover{
	color:#5865f2;
	text-decoration:underline;
}
.badge{
	display:inline-flex;
	align-items:center;
	gap:4px;
	background:#2b2d31;
	border:1px solid rgba(79,84,92,.32);
	border-radius:4px;
	padding:2px 8px;
	font-size:11px;
	font-weight:500;
	color:#949ba4;
	letter-spacing:.02em;
}
</style>
</head>
<body>
<div class="container">
	<div class="icon">${icon}</div>
	<div class="status-code">${statusCode}</div>
	<div class="message">${escapeHtml(message)}</div>
	${hint ? `<div class="hint">${hint}</div>` : ''}
	${escapedDetails ? `<div class="details">${escapedDetails}</div>` : ''}
	<div class="divider"></div>
	<div class="footer">
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 00-.48-.41h-3.84a.48.48 0 00-.48.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87a.48.48 0 00.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.26.41.48.41h3.84c.24 0 .44-.17.48-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1112 8.4a3.6 3.6 0 010 7.2z" fill="#4e5058"/></svg>
		<span class="badge">Activity Proxy</span>
		<span>&middot;</span>
		<a href="https://mock.robojs.dev" target="_blank" rel="noopener noreferrer" class="mock-link">@robojs/mock</a>
	</div>
</div>
</body>
</html>`

	res.writeHead(statusCode, {
		'Content-Type': 'text/html; charset=utf-8',
		'Content-Length': Buffer.byteLength(body)
	})
	res.end(body)
}

function escapeHtml(str: string): string {
	return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
