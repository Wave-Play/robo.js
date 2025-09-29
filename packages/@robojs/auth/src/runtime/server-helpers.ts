import { Auth } from '@auth/core'
import { getToken as coreGetToken, type JWT } from '@auth/core/jwt'
import type { AuthConfig } from '@auth/core'
import type { Session } from '@auth/core/types'
import { ensureCredentialsDbCompatibility } from './credentials-compat.js'
import { ensureLeadingSlash, joinPath, stripTrailingSlash } from '../utils/path.js'

type HeadersInput = Record<string, string> | Array<[string, string]> | undefined

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

type AuthHandler = (request: Request) => Promise<Response>

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
	baseUrl: process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? 'http://localhost:3000',
	cookieName: 'authjs.session-token',
	secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET ?? '',
	sessionStrategy: 'jwt',
	fetch: null,
	headers: undefined
}

/** Describes the runtime parameters Robo uses to emulate the Auth.js handler environment. */
export interface ConfigureAuthRuntimeOptions {
	basePath: string
	baseUrl: string
	cookieName: string
	secret: string
	sessionStrategy: 'jwt' | 'database'
}

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
 * Prepares a reusable Auth.js request handler for the Robo runtime utilities.
 *
 * @param config - Full Auth.js configuration object used when invoking `Auth()`.
 * @param options - Runtime environment values such as base path, base URL, and cookie settings.
 * @returns Nothing; sets module-scoped runtime state for subsequent helper calls.
 *
 * @example
 * ```ts
 * configureAuthRuntime(authConfig, {
 *   basePath: '/api/auth',
 *   baseUrl: 'https://example.com',
 *   cookieName: 'authjs.session-token',
 *   secret: process.env.AUTH_SECRET!,
 *   sessionStrategy: 'jwt'
 * })
 * ```
 *
 * @example
 * ```ts
 * configureAuthRuntime(authConfig, {
 *   basePath: '/internal/auth',
 *   baseUrl: request.url,
 *   cookieName: 'custom-auth-token',
 *   secret: env.AUTH_SECRET,
 *   sessionStrategy: 'database'
 * })
 * ```
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

function cloneHeaders(input?: Headers | HeadersInput | null): Headers {
	return new Headers(input ?? undefined)
}

function resolveHeaders(input?: Request | Headers | HeadersInput | null): Headers {
	if (!input) return new Headers()
	if (input instanceof Request) return new Headers(input.headers)
	return cloneHeaders(input as HeadersInput)
}

function resolveFetch(fetcher?: FetchLike | null): FetchLike {
	if (fetcher) return fetcher
	if (typeof fetch === 'function') {
		return (input: string, init?: RequestInit) => fetch(input, init)
	}
	throw new Error('Global fetch is not available. Provide a custom fetch implementation via upstream.fetch.')
}

function normalizePath(path: string): string {
	return stripTrailingSlash(ensureLeadingSlash(path))
}

function mergeStaticHeaders(source: Headers): Headers {
	if (!runtime.headers) return source
	const merged = new Headers(source)
	for (const [key, value] of Object.entries(runtime.headers)) {
		merged.set(key, value)
	}
	return merged
}

function buildTargetUrl(route: string): string {
	const path = joinPath(runtime.targetBasePath, route)
	return new URL(path, runtime.baseUrl).toString()
}

function headersToRecord(headers: Headers): Record<string, string> {
	const record: Record<string, string> = {}
	headers.forEach((value, key) => {
		record[key] = value
	})
	return record
}

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
 * Resolves the current Auth.js session by invoking the session route directly.
 *
 * @param input - Request or headers used to infer cookies; defaults to an empty header set.
 * @returns The active Auth.js session or `null` when no session is available.
 *
 * @example
 * ```ts
 * const session = await getServerSession(request)
 * ```
 *
 * @example
 * ```ts
 * const session = await getServerSession(new Request(url, { headers: myHeaders }))
 * ```
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
 * Extracts the Auth.js session token derived from the provided context.
 *
 * @param input - Incoming request or headers whose cookies contain the Auth.js session token.
 * @param options - Set `raw` to `true` to receive the unparsed cookie value instead of a decoded JWT payload.
 * @returns The decoded JWT, the raw cookie value, or `null` if no token could be resolved.
 *
 * @example
 * ```ts
 * const token = await getToken(request, { raw: true })
 * ```
 *
 * @example
 * ```ts
 * const payload = await getToken(headers, { raw: false })
 * ```
 */
export async function getToken(
	input?: Request | Headers | HeadersInput | null,
	options?: { raw?: boolean }
): Promise<JWT | string | null> {
	if (runtime.sessionStrategy === 'database') {
		const session = await getServerSession(input)
		return (session as unknown as JWT) ?? null
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
