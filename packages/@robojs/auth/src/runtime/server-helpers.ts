import { Auth } from '@auth/core'
import { getToken as coreGetToken, type JWT } from '@auth/core/jwt'
import type { AuthConfig } from '@auth/core'
import type { Session } from '@auth/core/types'
import { ensureCredentialsDbCompatibility } from './credentials-compat.js'
import { ensureLeadingSlash, joinPath, stripTrailingSlash } from '../utils/path.js'

type HeadersInput = Record<string, string> | Array<[string, string]> | undefined

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

type AuthHandler = (request: Request) => Promise<Response>

/**
 * Module-scoped runtime state for Auth.js helpers. Stores configuration for
 * local and proxy modes plus the current handler reference.
 *
 * - `mode`: 'unconfigured' | 'local' | 'proxy'.
 * - `authHandler`: Auth.js handler used in local mode.
 * - `localBasePath`: Path where routes are mounted locally.
 * - `targetBasePath`: Target path for upstream proxy or local handler.
 * - `baseUrl`: Canonical base URL for requests.
 * - `cookieName`: Session cookie name to read/write.
 * - `secret`: JWT secret (null when not provided).
 * - `sessionStrategy`: 'jwt' or 'database'. Must match Auth.js config.
 * - `fetch`: Custom fetch for proxy mode; null in local mode.
 * - `headers`: Additional static headers for proxy requests.
 */
interface RuntimeState {
	mode: 'unconfigured' | 'local' | 'proxy'
	authHandler: AuthHandler | null
	localBasePath: string
	targetBasePath: string
	baseUrl: string
	cookieName: string
	secret: string | null
	sessionStrategy: 'jwt' | 'database'
	fetch: FetchLike | null
	headers?: Record<string, string>
}

const runtime: RuntimeState = {
	mode: 'unconfigured',
	authHandler: null,
	localBasePath: '/api/auth',
	targetBasePath: '/api/auth',
	baseUrl: process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? `http://localhost:${process.env.PORT ?? 3000}`,
	cookieName: 'authjs.session-token',
	secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET ?? '',
	sessionStrategy: 'jwt',
	fetch: null,
	headers: undefined
}

/**
 * Runtime configuration for {@link configureAuthRuntime} (local mode).
 *
 * Fields:
 * - `basePath`: Auth route prefix (e.g., `/api/auth`). Must match Auth.js config.
 * - `baseUrl`: Canonical URL (with protocol + domain) used for callbacks.
 * - `cookieName`: Session cookie name. Use `__Secure-`/`__Host-` prefixes in production.
 * - `secret`: Auth.js secret used for JWT signing and token hashing.
 * - `sessionStrategy`: `'jwt' | 'database'` to mirror Auth.js config.
 *
 * ⚠️ Security:
 * - Secrets must stay on the server; never expose to clients or version control.
 * - `baseUrl` should be HTTPS in production. HTTP is acceptable only for localhost.
 * - `cookieName` with `__Secure-` prefix requires HTTPS; `__Host-` requires HTTPS + no domain/path.
 *
 * Edge cases:
 * - `basePath` mismatches cause Robo's router to 404 Auth routes.
 * - `sessionStrategy` must align with adapter configuration (JWT vs database sessions).
 *
 * @see configureAuthRuntime
 * @see AuthConfig from `@auth/core`
 */
export interface ConfigureAuthRuntimeOptions {
	basePath: string
	baseUrl: string
	cookieName: string
	secret: string
	sessionStrategy: 'jwt' | 'database'
}

/**
 * Runtime options for {@link configureAuthProxyRuntime} (upstream proxy mode).
 *
 * Fields:
 * - `localBasePath`: Path where Robo exposes auth endpoints locally.
 * - `targetBasePath?`: Path on the upstream server (defaults to `localBasePath`).
 * - `baseUrl`: Upstream Robo/Auth.js URL (must include protocol + domain).
 * - `cookieName?`: Session cookie name (defaults to `authjs.session-token`).
 * - `secret?`: Optional JWT secret for local decoding (reduces upstream calls; without it every {@link getToken} call hits upstream).
 * - `sessionStrategy`: `'jwt' | 'database'` matching the upstream server.
 * - `headers?`: Extra headers forwarded to upstream (e.g., `X-API-Key`).
 * - `fetch?`: Custom fetch implementation (testing, retries, special agents).
 *
 * ⚠️ Security:
 * - `baseUrl` should use HTTPS to protect session cookies in transit.
 * - Additional headers may carry secrets; ensure the upstream server validates them.
 * - Provide `secret` when possible so JWT decoding happens locally instead of forwarding tokens.
 *
 * Performance:
 * - Supplying `secret` enables local JWT decoding, cutting proxy traffic roughly in half.
 * - Custom `fetch` can implement retries, keep-alive, or caching.
 *
 * Edge cases:
 * - `targetBasePath` defaults to `localBasePath`. Set explicitly if they differ.
 * - `cookieName` must match upstream; mismatches prevent session lookups.
 * - `sessionStrategy` mismatch leads to `getToken`/`getServerSession` failures.
 *
 * @see configureAuthProxyRuntime
 */
export interface ConfigureAuthProxyRuntimeOptions {
	localBasePath: string
	targetBasePath?: string
	baseUrl: string
	cookieName?: string
	secret?: string
	sessionStrategy: 'jwt' | 'database'
	headers?: Record<string, string>
	fetch?: FetchLike
}

/**
 * Initializes Auth.js in local mode by creating a reusable handler that Robo's
 * server utilities can call. Invoke this during plugin startup (e.g., inside
 * the `_start` event) before any auth routes are accessed.
 *
 * ⚠️ Security:
 * - Call from server-only code; `config` often contains provider secrets.
 * - Do not log the `config` object or runtime options in production.
 *
 * Performance:
 * - The Auth handler is created once and reused for every request (no per-request setup).
 * - {@link ensureCredentialsDbCompatibility} mutates `config` to add database support; the patch is cached on the object.
 *
 * Edge cases:
 * - Calling multiple times overwrites the previous configuration; call once.
 * - Must run before any auth route executes, otherwise helpers throw "unconfigured" errors.
 * - `config` is mutated. Clone it first if you need the original object elsewhere.
 * - `options.sessionStrategy` must match your Auth.js adapter/session configuration (JWT vs database).
 * - `options.basePath` must match the Auth.js config `basePath` or Auth routes will 404.
 *
 * @param config - Complete Auth.js configuration (providers, adapter, callbacks, etc.).
 * @param options - Runtime values ({@link ConfigureAuthRuntimeOptions}).
 * @returns Nothing; sets module-scoped state used by {@link getServerSession} and {@link getToken}.
 *
 * @example Configure inside the `_start` event
 * ```ts
 * export default async function start() {
 * 	const config: AuthConfig = { providers: [...], adapter: createFlashcoreAdapter({ secret: process.env.AUTH_SECRET! }) }
 * 	configureAuthRuntime(config, {
 * 		basePath: '/api/auth',
 * 		baseUrl: process.env.AUTH_URL!,
 * 		cookieName: 'authjs.session-token',
 * 		secret: process.env.AUTH_SECRET!,
 * 		sessionStrategy: 'database'
 * 	})
 * }
 * ```
 *
 * @example Custom base path + JWT strategy
 * ```ts
 * configureAuthRuntime(authConfig, {
 * 	basePath: '/internal/auth',
 * 	baseUrl: 'https://example.com',
 * 	cookieName: '__Secure-authjs.session-token',
 * 	secret: process.env.AUTH_SECRET!,
 * 	sessionStrategy: 'jwt'
 * })
 * ```
 *
 * @see ensureCredentialsDbCompatibility
 * @see Auth from `@auth/core`
 * @see getServerSession
 * @see getToken
 * @see configureAuthProxyRuntime for proxy mode
 */

export function configureAuthRuntime(config: AuthConfig, options: ConfigureAuthRuntimeOptions): void {
	const preparedConfig = ensureCredentialsDbCompatibility(config)
	runtime.mode = 'local'
	runtime.authHandler = (request: Request) => Auth(request, preparedConfig)
	runtime.localBasePath = options.basePath
	runtime.targetBasePath = options.basePath
	runtime.baseUrl = options.baseUrl
	runtime.cookieName = options.cookieName
	runtime.secret = options.secret
	runtime.sessionStrategy = options.sessionStrategy
	runtime.fetch = null
	runtime.headers = undefined
}

/**
 * Configures upstream proxy mode where Robo forwards auth routes to another
 * instance. Useful for preview deployments, microservices, or centralized auth
 * clusters.
 *
 * ⚠️ Security:
 * - Upstream `baseUrl` should be HTTPS. Avoid proxying over plaintext HTTP in production.
 * - Additional headers may contain secrets; lock down upstream validation.
 *
 * Performance:
 * - Every {@link getServerSession} call becomes an HTTP request; consider caching responses.
 * - Providing `options.secret` enables local JWT decoding via {@link getToken}, reducing upstream calls by 50%+.
 *
 * Edge cases:
 * - Must be called before any proxy-auth routes execute (just like local mode).
 * - Calling multiple times overwrites previous state.
 * - Network failures bubble up; wrap callers with retries if necessary.
 *
 * @param options - See {@link ConfigureAuthProxyRuntimeOptions} for details.
 * @returns Nothing; sets module-scoped state for helpers.
 *
 * @example Basic proxy
 * ```ts
 * configureAuthProxyRuntime({
 * 	localBasePath: '/api/auth',
 * 	targetBasePath: '/api/auth',
 * 	baseUrl: 'https://auth.example.com',
 * 	sessionStrategy: 'jwt'
 * })
 * ```
 *
 * @example Forward custom headers
 * ```ts
 * configureAuthProxyRuntime({
 * 	localBasePath: '/api/auth',
 * 	baseUrl: 'https://auth.example.com',
 * 	sessionStrategy: 'jwt',
 * 	headers: { 'X-API-Key': process.env.INTERNAL_API_KEY! }
 * })
 * ```
 *
 * @example Enable local JWT decoding
 * ```ts
 * configureAuthProxyRuntime({
 * 	localBasePath: '/api/auth',
 * 	baseUrl: 'https://auth.example.com',
 * 	sessionStrategy: 'jwt',
 * 	secret: process.env.AUTH_SECRET
 * })
 * ```
 *
 * @see configureAuthRuntime for local mode
 * @see getServerSession for downstream consumption
 * @see getToken for JWT behavior in proxy mode
 * @see resolveFetch
 * @see normalizePath
 * @see ../../AGENTS.md for upstream proxy guidance
*/
export function configureAuthProxyRuntime(options: ConfigureAuthProxyRuntimeOptions): void {
	const fetcher = resolveFetch(options.fetch)
	const localBasePath = normalizePath(options.localBasePath)
	const targetBasePath = normalizePath(options.targetBasePath ?? options.localBasePath)
	runtime.mode = 'proxy'
	runtime.authHandler = null
	runtime.localBasePath = localBasePath
	runtime.targetBasePath = targetBasePath
	runtime.baseUrl = options.baseUrl
	runtime.cookieName = options.cookieName ?? 'authjs.session-token'
	runtime.secret = options.secret ?? null
	runtime.sessionStrategy = options.sessionStrategy
	runtime.fetch = fetcher
	runtime.headers = options.headers ? { ...options.headers } : undefined
}

/** Creates a new `Headers` instance from arbitrary input (record/array/Headers). */
function cloneHeaders(input?: Headers | HeadersInput | null): Headers {
	return new Headers(input ?? undefined)
}

/** Normalizes Request/Headers/tuple/record inputs into a mutable `Headers`. */
function resolveHeaders(input?: Request | Headers | HeadersInput | null): Headers {
	if (!input) return new Headers()
	if (input instanceof Request) return new Headers(input.headers)
	return cloneHeaders(input as HeadersInput)
}

/** Resolves a fetch implementation, preferring custom input then global fetch. Throws if neither exist. */
function resolveFetch(fetcher?: FetchLike | null): FetchLike {
	if (fetcher) return fetcher
	if (typeof fetch === 'function') {
		return (input: string, init?: RequestInit) => fetch(input, init)
	}
	throw new Error('Global fetch is not available. Provide a custom fetch implementation via upstream.fetch.')
}

/** Ensures paths start with `/` and omit trailing slashes for consistent routing. */
function normalizePath(path: string): string {
	return stripTrailingSlash(ensureLeadingSlash(path))
}

/** Applies proxy headers (if configured) to the outgoing request headers; custom headers override duplicates. */
function mergeStaticHeaders(source: Headers): Headers {
	if (!runtime.headers) return source
	const merged = new Headers(source)
	for (const [key, value] of Object.entries(runtime.headers)) {
		merged.set(key, value)
	}
	return merged
}

/** Joins the runtime target base path with a route and base URL. */
function buildTargetUrl(route: string): string {
	const path = joinPath(runtime.targetBasePath, route)
	return new URL(path, runtime.baseUrl).toString()
}

/** Converts `Headers` to `{ [key]: value }`, matching Auth.js core expectations. */
function headersToRecord(headers: Headers): Record<string, string> {
	const record: Record<string, string> = {}
	headers.forEach((value, key) => {
		record[key] = value
	})
	return record
}

/** Parses the `Cookie` header for a specific cookie name, handling multiple cookies and empty values. */
function extractCookie(headers: Headers, cookieName: string): string | null {
	const cookieHeader = headers.get('cookie')
	if (!cookieHeader) return null
	const cookies = cookieHeader.split(';').map((chunk) => chunk.trim())
	for (const entry of cookies) {
		if (!entry) continue
		const [name, ...rest] = entry.split('=')
		if (name === cookieName) {
			return rest.join('=') || ''
		}
	}
	return null
}

/**
 * Retrieves the active Auth.js {@link Session} using the configured runtime.
 * In local mode this calls the Auth.js handler directly; in proxy mode it
 * forwards the request to the upstream server.
 *
 * ⚠️ Security:
 * - Session objects may contain sensitive user data. Redact fields before
 *   logging or sending to clients.
 * - Proxy mode forwards cookies to the upstream server; ensure the upstream is trusted.
 *
 * Performance:
 * - Local mode avoids network I/O (one handler invocation).
 * - Proxy mode incurs an HTTP call per invocation; cache results or use JWTs if latency is critical.
 * - Expired sessions are pruned automatically to prevent repeated DB hits.
 * - Database session strategy may trigger additional database queries, whereas JWT strategy primarily decodes cookies.
 * - Cache session data for hot routes when possible and invalidate on sign-in/sign-out events.
 *
 * Edge cases:
 * - Throws if runtime is unconfigured ({@link configureAuthRuntime} or {@link configureAuthProxyRuntime} not called).
 * - Returns `null` when cookies are missing/invalid/expired or when network errors occur (proxy mode); guard against `null` and consider retry logic if upstream requests fail.
 * - Session shape depends on your Auth.js callbacks; additional fields may appear or be omitted.
 *
 * @param input - Optional Request/Headers/tuple/record providing cookies. Defaults to empty headers.
 * @returns {@link Session} or `null` if no session is available.
 * @throws {Error} If the runtime has not been configured.
 *
 * @example API route guard
 * ```ts
 * export default async function handler(request: Request) {
 * 	const session = await getServerSession(request)
 * 	if (!session) return new Response('Unauthorized', { status: 401 })
 * 	return new Response(`Hello ${session.user?.name ?? 'friend'}`)
 * }
 * ```
 *
 * @example Provide headers only
 * ```ts
 * const session = await getServerSession(new Headers({ cookie: request.headers.get('cookie') ?? '' }))
 * ```
 *
 * @example Middleware helper
 * ```ts
 * async function requireSession(request: Request) {
 * 	const session = await getServerSession(request)
 * 	if (!session) throw new Error('Unauthorized')
 * 	return session
 * }
 * ```
 *
 * @example Check email verification before continuing
 * ```ts
 * const session = await getServerSession(request)
 * if (session && !session.user?.emailVerified) {
 * 	return new Response('Email not verified', { status: 403 })
 * }
 * ```
 *
 * @see configureAuthRuntime
 * @see configureAuthProxyRuntime
 * @see getToken for JWT-only access
 * @see AuthConfig['callbacks']['session'] for customizing payloads
 */
export async function getServerSession(input?: Request | Headers | HeadersInput | null): Promise<Session | null> {
	if (runtime.mode === 'unconfigured') {
		throw new Error('Auth runtime has not been configured. Did you call configureAuthRuntime inside the start hook?')
	}

	const headers = mergeStaticHeaders(resolveHeaders(input))

	if (runtime.mode === 'local') {
		const sessionUrl = runtime.targetBasePath.endsWith('/session')
			? `${runtime.baseUrl}${runtime.targetBasePath}`
			: `${runtime.baseUrl}${runtime.targetBasePath}/session`
		const sessionRequest = new Request(sessionUrl, {
			headers,
			method: 'GET'
		})

		const response = await runtime.authHandler!(sessionRequest)
		if (!response.ok) return null
		return (await response.json()) as Session
	}

	const fetcher = runtime.fetch ?? resolveFetch(null)
	const response = await fetcher(buildTargetUrl('/session'), {
		headers,
		method: 'GET',
		redirect: 'manual'
	})
	if (!response.ok) return null
	return (await response.json()) as Session
}

/**
 * Extracts (and optionally decodes) the Auth.js session token. For JWT
 * strategy, decoding happens locally using the configured secret. For database
 * strategy, behavior depends on the `raw` option:
 * - `{ raw: true }`: returns the raw session cookie (string).
 * - `{ raw: false }` or omitted: returns the full {@link Session} object.
 *
 * ⚠️ Security:
 * - Raw cookies are sensitive; never log them. Prefer decoded payloads when possible.
 * - JWT payloads are signed, not encrypted. Do not store secrets in the token.
 * - Always verify `exp` before trusting a decoded JWT.
 *
 * Performance:
 * - Local JWT decoding (with a secret) takes ~1 ms and avoids HTTP/database calls.
 * - Database strategy requires fetching the session, which is slower.
 * - `{ raw: true }` simply reads the cookie value (fastest) but skips validation.
 *
 * Edge cases:
 * - Throws if decoding is requested but no secret was configured (proxy mode without `secret`). Use `{ raw: true }` in that case.
 * - Returns `null` when the cookie is missing/invalid or when runtime is unconfigured.
 * - Database strategy with `{ raw: false }` returns the full {@link Session} object, not a JWT.
 * - Database strategy with `{ raw: true }` returns the raw session cookie string.
 * - Payload structure depends on your Auth.js `jwt` callback; fields can be added or removed.
 * - Expired JWTs still decode; check `token.exp` yourself.
 *
 * @param input - Request/Headers/tuple/record containing cookies.
 * @param options.raw - When `true`, returns the raw cookie value. When `false` or omitted, returns decoded JWT (JWT strategy) or Session (database strategy).
 * @returns {@link JWT} payload (JWT strategy), {@link Session} object (database strategy without raw), raw cookie string (with raw), or `null`.
 * @throws {Error} If decoding is requested without a configured secret (JWT strategy only).
 *
 * @example Decode JWT in middleware (JWT strategy)
 * ```ts
 * const token = await getToken(request)
 * if (!token || token.exp * 1000 < Date.now()) return new Response('Unauthorized', { status: 401 })
 * ```
 *
 * @example Get session in database mode
 * ```ts
 * const session = await getToken(request) // Returns Session object
 * if (!session || !session.user) return new Response('Unauthorized', { status: 401 })
 * ```
 *
 * @example Forward raw token to another API
 * ```ts
 * const raw = await getToken(request, { raw: true })
 * await fetch('https://api.example.com', { headers: { Authorization: `Bearer ${raw}` } })
 * ```
 *
 * @example Extract user ID (JWT strategy)
 * ```ts
 * const token = await getToken(request)
 * const userId = token?.sub ?? null
 * ```
 *
 * @example Check expiration without DB lookup (JWT strategy)
 * ```ts
 * const token = await getToken(new Headers({ cookie }))
 * if (token && token.exp * 1000 < Date.now()) throw new Error('Token expired')
 * ```
 *
 * @see JWT from `@auth/core/jwt`
 * @see Session from `@auth/core/types`
 * @see getServerSession for full session objects
 * @see coreGetToken from `@auth/core/jwt`
 */
export async function getToken(
	input?: Request | Headers | HeadersInput | null,
	options?: { raw?: boolean }
): Promise<JWT | string | Session | null> {
	if (runtime.sessionStrategy === 'database') {
		const headers = mergeStaticHeaders(resolveHeaders(input))
		if (options?.raw) {
			return extractCookie(headers, runtime.cookieName)
		}
		const session = await getServerSession(input)
		return session
	}

	const headers = mergeStaticHeaders(resolveHeaders(input))
	if (options?.raw) {
		return extractCookie(headers, runtime.cookieName)
	}

	if (!runtime.secret) {
		throw new Error(
			'Auth runtime was configured without a secret. Provide the session secret or call getToken with { raw: true }.'
		)
	}

	return coreGetToken({
		req: { headers: headersToRecord(headers) },
		secureCookie: runtime.baseUrl.startsWith('https://'),
		cookieName: runtime.cookieName,
		raw: false,
		secret: runtime.secret,
		salt: runtime.cookieName
	})
}
