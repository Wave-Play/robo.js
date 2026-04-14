import type { Adapter, AdapterUser } from '@auth/core/adapters'
import type { AuthConfig } from '@auth/core'
import type { CookiesOptions } from '@auth/core/types'
import type { RoboRequest, RoboReply } from '@robojs/server'
import { Server } from '@robojs/server'
import { serializeCookie } from '../utils/cookies.js'
import { verifyCsrfToken } from '../utils/csrf.js'
import { joinPath } from '../utils/path.js'
import { authLogger } from '../utils/logger.js'
import { getRequestPayload } from '../utils/request-payload.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Compact entry stored inside the httpOnly session stack cookie.
 *
 * SECURITY NOTE: Session tokens are stored in plaintext. The stack cookie has
 * identical httpOnly/secure/sameSite attributes as the session-token cookie, so
 * the incremental risk is limited to exposing non-active session tokens if the
 * cookie is leaked. If defence-in-depth is desired, encrypt the serialised JSON
 * with AES-256-GCM keyed by a SHA-256 derivation of AUTH_SECRET.
 */
export interface StackEntry {
	/** Session token */
	t: string
	/** User ID */
	u: string
	/** Cached display name */
	n?: string
	/** Cached email */
	e?: string
}

/** Public shape returned by `GET /sessions` and the `getSessions` client helper. */
export interface DeviceSession {
	userId: string
	name: string | null
	email: string | null
	image: string | null
	isActive: boolean
	isExpired: boolean
}

/** Result shape for `POST /sessions/switch`. */
export interface SwitchSessionResult {
	ok: boolean
	session?: {
		user: { id: string; name?: string | null; email?: string | null; image?: string | null }
		expires: string
	}
	error?: 'session_expired' | 'not_found' | 'forbidden'
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_STACK_SIZE = 5
const COOKIE_SIZE_WARNING_THRESHOLD = 3800

// ---------------------------------------------------------------------------
// Cookie helpers (internal)
// ---------------------------------------------------------------------------

type SameSite = 'lax' | 'strict' | 'none'

function normalizeSameSite(input: unknown): SameSite {
	return input === 'strict' || input === 'none' ? input : 'lax'
}

/** Derive the stack cookie name from the session cookie name. */
export function deriveStackCookieName(sessionCookieName: string): string {
	const derived = sessionCookieName.replace('session-token', 'session-stack')
	// If the name didn't contain 'session-token', append a suffix to avoid collision.
	return derived === sessionCookieName ? `${sessionCookieName}.stack` : derived
}

/** Build cookie options that mirror the session token cookie. */
function resolveStackCookieOptions(cookies: CookiesOptions) {
	const opts = cookies.sessionToken?.options ?? { path: '/', sameSite: 'lax' as const, secure: true, httpOnly: true }
	return {
		path: opts.path ?? '/',
		domain: opts.domain,
		httpOnly: true,
		secure: opts.secure ?? true,
		sameSite: normalizeSameSite(opts.sameSite)
	}
}

/** Extract a named cookie value from a request's Cookie header. */
function extractCookie(headers: Headers, name: string): string | null {
	const cookie = headers.get('cookie')
	if (!cookie) return null
	const match = cookie.match(new RegExp(`(?:^|;\\s*)${escapeRegex(name)}=([^;]*)`))
	return match ? decodeURIComponent(match[1]) : null
}

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Parse the session stack cookie from a request. Returns [] if absent or malformed. */
export function parseStackCookie(headers: Headers, stackCookieName: string): StackEntry[] {
	const raw = extractCookie(headers, stackCookieName)
	if (!raw) return []
	try {
		const parsed = JSON.parse(raw)
		if (!Array.isArray(parsed)) return []
		return parsed.filter(
			(e: unknown): e is StackEntry =>
				typeof e === 'object' &&
				e !== null &&
				typeof (e as StackEntry).t === 'string' &&
				(e as StackEntry).t.length > 0 &&
				typeof (e as StackEntry).u === 'string' &&
				(e as StackEntry).u.length > 0
		)
	} catch {
		return []
	}
}

/** Serialize a stack entries array into a Set-Cookie header value. */
function serializeStackCookie(
	entries: StackEntry[],
	stackCookieName: string,
	cookies: CookiesOptions,
	maxAge?: number
): string {
	const opts = resolveStackCookieOptions(cookies)
	const value = JSON.stringify(entries)

	// Warn if the encoded cookie value approaches browser size limits.
	const encoded = encodeURIComponent(value)
	if (encoded.length > COOKIE_SIZE_WARNING_THRESHOLD) {
		authLogger.warn(
			`Session stack cookie is ${encoded.length} bytes (threshold: ${COOKIE_SIZE_WARNING_THRESHOLD}). ` +
				'Consider reducing MAX_STACK_SIZE or shortening session tokens to stay under browser limits.'
		)
	}

	return serializeCookie(stackCookieName, value, {
		...opts,
		maxAge: maxAge ?? 60 * 60 * 24 * 400 // ~13 months, outlive any single session
	})
}

/** Create a Set-Cookie header that clears the stack cookie. */
function clearStackCookieHeader(stackCookieName: string, cookies: CookiesOptions): string {
	const opts = resolveStackCookieOptions(cookies)
	return serializeCookie(stackCookieName, '', { ...opts, maxAge: 0 })
}

/** Upsert a stack entry by userId, enforcing max size. */
function upsertStack(stack: StackEntry[], entry: StackEntry): StackEntry[] {
	const filtered = stack.filter((e) => e.u !== entry.u)
	filtered.push(entry)
	// Evict oldest entries if we exceed the cap.
	while (filtered.length > MAX_STACK_SIZE) {
		filtered.shift()
	}
	return filtered
}

/** Build a StackEntry from an adapter user lookup. */
function buildStackEntry(token: string, user: AdapterUser): StackEntry {
	const entry: StackEntry = { t: token, u: user.id }
	if (user.name) entry.n = user.name
	if (user.email) entry.e = user.email
	return entry
}

/** Clone a response and append a Set-Cookie header. Preserves body. */
function appendCookieToResponse(response: Response, cookieHeader: string): Response {
	const headers = new Headers(response.headers)
	headers.append('set-cookie', cookieHeader)
	return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

// ---------------------------------------------------------------------------
// Set-Cookie header parsing
// ---------------------------------------------------------------------------

/**
 * Detect whether a response's Set-Cookie headers contain a new session token.
 * Returns the token value if a sign-in is detected, or null otherwise.
 */
function detectNewSessionToken(response: Response, sessionCookieName: string): string | null {
	const setCookies = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? []
	const prefix = `${sessionCookieName}=`

	for (const header of setCookies) {
		if (!header.startsWith(prefix)) continue
		const value = header.slice(prefix.length).split(';')[0]
		const decoded = decodeURIComponent(value)
		// Empty value or Max-Age=0 means sign-out, not sign-in.
		if (!decoded) continue
		if (/Max-Age=0/i.test(header)) continue
		// Also check for Expires in the past.
		const expiresMatch = header.match(/Expires=([^;]+)/i)
		if (expiresMatch) {
			const expiresDate = new Date(expiresMatch[1])
			if (expiresDate.getTime() < Date.now()) continue
		}
		return decoded
	}
	return null
}

// ---------------------------------------------------------------------------
// Stack update logic (called from handler wrappers)
// ---------------------------------------------------------------------------

interface UpdateStackParams {
	request: Request
	response: Response
	adapter: Adapter
	cookies: CookiesOptions
	config: AuthConfig
}

/**
 * Post-processes an Auth.js handler response. If a new session token was set
 * (sign-in), updates the session stack cookie on the response.
 */
export async function updateStack(params: UpdateStackParams): Promise<Response> {
	const { request, response, adapter, cookies, config } = params
	const sessionCookieName = cookies.sessionToken?.name ?? 'authjs.session-token'
	const stackCookieName = deriveStackCookieName(sessionCookieName)

	const newToken = detectNewSessionToken(response, sessionCookieName)
	if (!newToken) return response

	try {
		// Look up the new session to get user metadata.
		const result = adapter.getSessionAndUser ? await adapter.getSessionAndUser(newToken) : null
		if (!result) return response

		const reqHeaders = new Headers(request.headers as HeadersInit)
		let stack = parseStackCookie(reqHeaders, stackCookieName)

		// Self-healing: ensure the previous active token is in the stack.
		const oldToken = extractCookie(reqHeaders, sessionCookieName)
		if (oldToken && oldToken !== newToken && !stack.some((e) => e.t === oldToken)) {
			const oldResult = adapter.getSessionAndUser ? await adapter.getSessionAndUser(oldToken) : null
			if (oldResult) {
				stack = upsertStack(stack, buildStackEntry(oldToken, oldResult.user))
			}
		}

		// Upsert the new session entry.
		stack = upsertStack(stack, buildStackEntry(newToken, result.user))

		const cookieHeader = serializeStackCookie(stack, stackCookieName, cookies)
		return appendCookieToResponse(response, cookieHeader)
	} catch (error) {
		authLogger.warn('Failed to update session stack after sign-in', { error: (error as Error)?.message })
		return response
	}
}

interface UpdateStackDirectParams {
	request: Request
	response: Response
	token: string
	userId: string
	adapter: Adapter
	cookies: CookiesOptions
}

/**
 * Directly updates the session stack when the token and userId are already
 * known (e.g. after `attachDbSessionCookie` creates a credentials session).
 */
export async function updateStackDirect(params: UpdateStackDirectParams): Promise<Response> {
	const { request, response, token, userId, adapter, cookies } = params
	const sessionCookieName = cookies.sessionToken?.name ?? 'authjs.session-token'
	const stackCookieName = deriveStackCookieName(sessionCookieName)

	try {
		const user = adapter.getUser ? await adapter.getUser(userId) : null
		const entry: StackEntry = { t: token, u: userId }
		if (user?.name) entry.n = user.name
		if (user?.email) entry.e = user.email

		const reqHeaders = new Headers(request.headers as HeadersInit)
		let stack = parseStackCookie(reqHeaders, stackCookieName)

		// Self-healing: ensure the previous active token is in the stack.
		const oldToken = extractCookie(reqHeaders, sessionCookieName)
		if (oldToken && oldToken !== token && !stack.some((e) => e.t === oldToken)) {
			const oldResult = adapter.getSessionAndUser ? await adapter.getSessionAndUser(oldToken) : null
			if (oldResult) {
				stack = upsertStack(stack, buildStackEntry(oldToken, oldResult.user))
			}
		}

		stack = upsertStack(stack, entry)

		const cookieHeader = serializeStackCookie(stack, stackCookieName, cookies)
		return appendCookieToResponse(response, cookieHeader)
	} catch (error) {
		authLogger.warn('Failed to update session stack (direct)', { error: (error as Error)?.message })
		return response
	}
}

// ---------------------------------------------------------------------------
// CSRF validation helper
// ---------------------------------------------------------------------------

async function parseAndValidateCsrf(
	request: RoboRequest,
	cookies: CookiesOptions,
	secret: string
): Promise<{ error: string | null; body: Record<string, unknown> }> {
	const csrfCookieName = cookies.csrfToken?.name ?? 'authjs.csrf-token'
	const csrfCookie = extractCookie(new Headers(request.headers as HeadersInit), csrfCookieName)
	if (!csrfCookie) return { error: 'Missing CSRF cookie', body: {} }

	// The csrf cookie is stored as "token|hash" format.
	const csrfHash = csrfCookie.split('|')[1]
	if (!csrfHash) return { error: 'Invalid CSRF cookie format', body: {} }

	// Use getRequestPayload to handle both JSON and form-encoded bodies consistently.
	const payload = await getRequestPayload(request)
	const body = payload.get()

	const csrfToken = body.csrfToken
	if (!csrfToken || typeof csrfToken !== 'string') return { error: 'Missing CSRF token in body', body }

	if (!verifyCsrfToken(csrfToken, csrfHash, secret)) return { error: 'Invalid CSRF token', body }
	return { error: null, body }
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

interface SessionStackRouteOptions {
	adapter: Adapter
	basePath: string
	cookies: CookiesOptions
	config: AuthConfig
	secret: string
}

/** Registers the session stack API routes with the Robo server. */
export function registerSessionStackRoutes(options: SessionStackRouteOptions): void {
	const { adapter, basePath, cookies, config, secret } = options
	const sessionCookieName = cookies.sessionToken?.name ?? 'authjs.session-token'
	const stackCookieName = deriveStackCookieName(sessionCookieName)

	// GET /sessions — list all device sessions
	Server.get()?.registerRoute(joinPath(basePath, '/sessions'), async (request: RoboRequest) => {
		if (request.method?.toUpperCase() !== 'GET') {
			return new Response(null, { status: 405, headers: { Allow: 'GET' } })
		}

		const reqHeaders = new Headers(request.headers as HeadersInit)
		const stack = parseStackCookie(reqHeaders, stackCookieName)
		const activeToken = extractCookie(reqHeaders, sessionCookieName)

		const sessions: DeviceSession[] = []
		let stackModified = false
		let currentStack = [...stack]

		// Self-healing: if the active token is not in the stack, add it.
		if (activeToken && !currentStack.some((e) => e.t === activeToken)) {
			try {
				const result = adapter.getSessionAndUser ? await adapter.getSessionAndUser(activeToken) : null
				if (result) {
					currentStack = upsertStack(currentStack, buildStackEntry(activeToken, result.user))
					stackModified = true
				}
			} catch {
				// Ignore self-healing failures.
			}
		}

		for (const entry of currentStack) {
			try {
				const result = adapter.getSessionAndUser ? await adapter.getSessionAndUser(entry.t) : null
				if (result) {
					sessions.push({
						userId: result.user.id,
						name: result.user.name ?? null,
						email: result.user.email ?? null,
						image: result.user.image ?? null,
						isActive: entry.t === activeToken,
						isExpired: false
					})
				} else {
					// Session expired or deleted — use cached metadata.
					sessions.push({
						userId: entry.u,
						name: entry.n ?? null,
						email: entry.e ?? null,
						image: null,
						isActive: false,
						isExpired: true
					})
				}
			} catch {
				sessions.push({
					userId: entry.u,
					name: entry.n ?? null,
					email: entry.e ?? null,
					image: null,
					isActive: false,
					isExpired: true
				})
			}
		}

		const body = JSON.stringify({ sessions })
		const headers = new Headers({ 'Content-Type': 'application/json' })

		if (stackModified) {
			headers.append('set-cookie', serializeStackCookie(currentStack, stackCookieName, cookies))
		}

		return new Response(body, { status: 200, headers })
	})

	// POST /sessions/switch — switch active session to a different user
	Server.get()?.registerRoute(joinPath(basePath, '/sessions/switch'), async (request: RoboRequest) => {
		if (request.method?.toUpperCase() !== 'POST') {
			return new Response(null, { status: 405, headers: { Allow: 'POST' } })
		}

		const { error: csrfError, body } = await parseAndValidateCsrf(request, cookies, secret)
		if (csrfError) {
			authLogger.debug('CSRF validation failed in /sessions/switch', { reason: csrfError })
			return new Response(JSON.stringify({ ok: false, error: 'forbidden' }), {
				status: 403,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		const targetUserId = body.userId as string | undefined
		if (!targetUserId) {
			return new Response(JSON.stringify({ ok: false, error: 'not_found' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		const reqHeaders = new Headers(request.headers as HeadersInit)
		let stack = parseStackCookie(reqHeaders, stackCookieName)

		// Self-healing: ensure the current active session is preserved in the stack.
		const currentActiveToken = extractCookie(reqHeaders, sessionCookieName)
		if (currentActiveToken && !stack.some((e) => e.t === currentActiveToken)) {
			try {
				const activeResult = adapter.getSessionAndUser ? await adapter.getSessionAndUser(currentActiveToken) : null
				if (activeResult) {
					stack = upsertStack(stack, buildStackEntry(currentActiveToken, activeResult.user))
				}
			} catch {
				// Ignore self-healing failures.
			}
		}

		const entry = stack.find((e) => e.u === targetUserId)
		if (!entry) {
			return new Response(JSON.stringify({ ok: false, error: 'not_found' }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Validate the session is still alive.
		const result = adapter.getSessionAndUser ? await adapter.getSessionAndUser(entry.t) : null
		if (!result) {
			return new Response(JSON.stringify({ ok: false, error: 'session_expired' }), {
				status: 410,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Refresh stack entry with current metadata from adapter.
		const refreshedEntry = buildStackEntry(entry.t, result.user)
		stack = upsertStack(stack, refreshedEntry)
		const stackHeader = serializeStackCookie(stack, stackCookieName, cookies)

		// Set the target session token as the active cookie.
		const opts = cookies.sessionToken?.options ?? { path: '/', sameSite: 'lax' as const, secure: true, httpOnly: true }
		const maxAge = config.session?.maxAge ?? 60 * 60 * 24 * 30
		const sessionCookieHeader = serializeCookie(sessionCookieName, entry.t, {
			path: opts.path ?? '/',
			domain: opts.domain,
			httpOnly: opts.httpOnly ?? true,
			secure: opts.secure ?? true,
			sameSite: normalizeSameSite(opts.sameSite),
			maxAge
		})

		const responseBody = JSON.stringify({
			ok: true,
			session: {
				user: {
					id: result.user.id,
					name: result.user.name ?? null,
					email: result.user.email ?? null,
					image: result.user.image ?? null
				},
				expires:
					result.session.expires instanceof Date ? result.session.expires.toISOString() : String(result.session.expires)
			}
		})

		const headers = new Headers({ 'Content-Type': 'application/json' })
		headers.append('set-cookie', sessionCookieHeader)
		headers.append('set-cookie', stackHeader)
		return new Response(responseBody, { status: 200, headers })
	})

	// POST /sessions/remove — remove a session from the device stack
	Server.get()?.registerRoute(joinPath(basePath, '/sessions/remove'), async (request: RoboRequest) => {
		if (request.method?.toUpperCase() !== 'POST') {
			return new Response(null, { status: 405, headers: { Allow: 'POST' } })
		}

		const { error: csrfError, body } = await parseAndValidateCsrf(request, cookies, secret)
		if (csrfError) {
			authLogger.debug('CSRF validation failed in /sessions/remove', { reason: csrfError })
			return new Response(JSON.stringify({ ok: false, error: 'forbidden' }), {
				status: 403,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		const targetUserId = body.userId as string | undefined
		if (!targetUserId) {
			return new Response(JSON.stringify({ ok: false, error: 'userId required' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		const reqHeaders = new Headers(request.headers as HeadersInit)
		const stack = parseStackCookie(reqHeaders, stackCookieName)
		const entry = stack.find((e) => e.u === targetUserId)
		const updatedStack = stack.filter((e) => e.u !== targetUserId)

		// Delete the DB session if it still exists.
		if (entry && adapter.deleteSession) {
			try {
				await adapter.deleteSession(entry.t)
			} catch {
				// Best-effort — session may already be expired.
			}
		}

		const headers = new Headers({ 'Content-Type': 'application/json' })
		let finalStack = updatedStack

		// If the removed entry was the active session, try to auto-switch or sign out.
		const activeToken = extractCookie(reqHeaders, sessionCookieName)
		if (entry && activeToken === entry.t) {
			const opts = cookies.sessionToken?.options ?? {
				path: '/',
				sameSite: 'lax' as const,
				secure: true,
				httpOnly: true
			}
			const cookieOpts = {
				path: opts.path ?? '/',
				domain: opts.domain,
				httpOnly: opts.httpOnly ?? true,
				secure: opts.secure ?? true,
				sameSite: normalizeSameSite(opts.sameSite)
			}

			// Try to auto-switch to the most recently added valid session, cleaning expired ones.
			let switched = false
			const expiredIndices: number[] = []
			for (let i = finalStack.length - 1; i >= 0; i--) {
				try {
					const candidate = finalStack[i]
					const result = adapter.getSessionAndUser ? await adapter.getSessionAndUser(candidate.t) : null
					if (result) {
						const maxAge = config.session?.maxAge ?? 60 * 60 * 24 * 30
						headers.append('set-cookie', serializeCookie(sessionCookieName, candidate.t, { ...cookieOpts, maxAge }))
						switched = true
						break
					} else {
						expiredIndices.push(i)
					}
				} catch {
					expiredIndices.push(i)
				}
			}

			// Remove expired entries discovered during the auto-switch scan.
			if (expiredIndices.length > 0) {
				finalStack = finalStack.filter((_, idx) => !expiredIndices.includes(idx))
			}

			if (!switched) {
				headers.append('set-cookie', serializeCookie(sessionCookieName, '', { ...cookieOpts, maxAge: 0 }))
			}
		}

		// Serialize the stack cookie after auto-switch so expired entries are cleaned.
		headers.append('set-cookie', serializeStackCookie(finalStack, stackCookieName, cookies))

		return new Response(JSON.stringify({ ok: true }), { status: 200, headers })
	})

	// POST /sessions/clear — remove all sessions from device
	Server.get()?.registerRoute(joinPath(basePath, '/sessions/clear'), async (request: RoboRequest) => {
		if (request.method?.toUpperCase() !== 'POST') {
			return new Response(null, { status: 405, headers: { Allow: 'POST' } })
		}

		const { error: csrfError } = await parseAndValidateCsrf(request, cookies, secret)
		if (csrfError) {
			authLogger.debug('CSRF validation failed in /sessions/clear', { reason: csrfError })
			return new Response(JSON.stringify({ ok: false, error: 'forbidden' }), {
				status: 403,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		const reqHeaders = new Headers(request.headers as HeadersInit)
		const stack = parseStackCookie(reqHeaders, stackCookieName)
		const activeToken = extractCookie(reqHeaders, sessionCookieName)

		// Delete all DB sessions in parallel (best-effort), including the active session if not in the stack.
		if (adapter.deleteSession) {
			const tokensToDelete = new Set(stack.map((entry) => entry.t))
			if (activeToken) {
				tokensToDelete.add(activeToken)
			}
			await Promise.allSettled([...tokensToDelete].map((t) => adapter.deleteSession!(t)))
		}

		const headers = new Headers({ 'Content-Type': 'application/json' })

		// Clear the stack cookie.
		headers.append('set-cookie', clearStackCookieHeader(stackCookieName, cookies))

		// Clear the active session cookie.
		const opts = cookies.sessionToken?.options ?? { path: '/', sameSite: 'lax' as const, secure: true, httpOnly: true }
		headers.append(
			'set-cookie',
			serializeCookie(sessionCookieName, '', {
				path: opts.path ?? '/',
				domain: opts.domain,
				httpOnly: opts.httpOnly ?? true,
				secure: opts.secure ?? true,
				sameSite: normalizeSameSite(opts.sameSite),
				maxAge: 0
			})
		)

		return new Response(JSON.stringify({ ok: true }), { status: 200, headers })
	})

	authLogger.debug('Session stack routes registered.', { basePath })
}
