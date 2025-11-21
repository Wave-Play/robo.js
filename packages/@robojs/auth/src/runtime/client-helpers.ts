import type { PublicProvider, Session } from '@auth/core/types'
import { ensureLeadingSlash, joinPath, stripTrailingSlash } from '../utils/path.js'

type HeadersInput = Record<string, string> | Array<[string, string]> | undefined

type FetchLike = (input: string, init?: Record<string, unknown>) => Promise<Response>

interface ClientOptions {
	basePath?: string
	baseUrl?: string
	fetch?: FetchLike
	headers?: HeadersInput
}

const DEFAULT_BASE_PATH = '/api/auth'

function resolveFetch(input?: FetchLike): FetchLike {
	if (input) return input
	if (typeof fetch === 'function') return fetch
	throw new Error('Global fetch is not available. Provide a custom fetch implementation in the client options.')
}

function resolveBasePath(options?: ClientOptions): string {
	return stripTrailingSlash(ensureLeadingSlash(options?.basePath ?? DEFAULT_BASE_PATH))
}

function resolveEndpoint(options: ClientOptions | undefined, route: string): string {
	const basePath = resolveBasePath(options)
	if (options?.baseUrl) {
		return new URL(joinPath(basePath, route), options.baseUrl).toString()
	}
	return joinPath(basePath, route)
}

type RedirectMode = boolean | 'manual'

type SignInManualResult = { ok: true; url: string }
type SignInRedirectedResult = { ok: true; redirected: true }
type SignInFetchResult = { ok: boolean; url?: string; error?: string }

function hasWindow(): boolean {
	return typeof window !== 'undefined' && typeof (window as unknown as { location?: unknown }).location !== 'undefined'
}

function resolveCallbackUrl(explicit?: string): string | undefined {
	if (explicit && typeof explicit === 'string') return explicit
	if (hasWindow()) return window.location.href
	return undefined
}

function buildAbsoluteUrl(basePath: string, route: string, baseUrl?: string): string {
	const path = joinPath(basePath, route)
	return baseUrl ? new URL(path, baseUrl).toString() : path
}

function toQuery(params: Record<string, string | undefined | null>): string {
	const url = new URL('http://local.test')
	for (const [k, v] of Object.entries(params)) {
		if (v == null || v === '') continue
		url.searchParams.set(k, v)
	}
	return url.search.replace(/^\?/, '')
}

/**
 * Initiates the Auth.js sign-in flow for the provided provider identifier.
 *
 * @param providerId - Provider configured in your Auth.js options, such as `google` or `discord`.
 * @param body - Additional payload merged into the sign-in request body; defaults to an empty object.
 * @param options - Overrides for base path, headers, or a custom fetch implementation.
 * @returns A `Response` representing the Auth.js `/signin` endpoint result.
 *
 * @example
 * ```ts
 * await signIn('google')
 * ```
 *
 * @example
 * ```ts
 * await signIn('email', { email: 'user@example.com' }, { basePath: '/custom-auth' })
 * ```
 */
export async function signIn(
	providerId: string,
	body?: Record<string, unknown>,
	options?: ClientOptions
): Promise<Response>
export async function signIn(
	providerId: string,
	options?: (Record<string, unknown> & { csrfToken?: string; callbackUrl?: string }),
	proxy?: ClientOptions,
	redirect?: RedirectMode
): Promise<SignInFetchResult | SignInManualResult | SignInRedirectedResult>
export async function signIn(
	providerId: string,
	arg2: Record<string, unknown> = {},
	arg3?: ClientOptions,
	redirect?: RedirectMode
): Promise<Response | SignInFetchResult | SignInManualResult | SignInRedirectedResult> {
	// Heuristic: if `redirect` is undefined and caller passed at most 3 args, preserve legacy behavior (return Response)
	const legacyMode = typeof redirect === 'undefined'
	const body = arg2 ?? {}
	const client = arg3

	if (legacyMode) {
		// Resolve the runtime environment before composing the Auth.js request.
		const target = resolveEndpoint(client, providerId === 'credentials' ? '/callback/credentials' : '/signin')
		const request = resolveFetch(client?.fetch)
		const init: Record<string, unknown> = {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				...(client?.headers ?? {})
			},
			credentials: 'include',
			body: JSON.stringify({ ...body, provider: providerId })
		}

		return request(target, init)
	}

	// Redirect-aware behavior
	const basePath = resolveBasePath(client)
	const baseUrl = client?.baseUrl
	const csrfToken: string | null =
		typeof body?.csrfToken === 'string' && body.csrfToken
			? (body.csrfToken as string)
			: await getCsrfToken({ ...client, fetch: resolveFetch(client?.fetch) })

	const callbackUrl = resolveCallbackUrl(typeof body?.callbackUrl === 'string' ? (body.callbackUrl as string) : undefined)
	const query = toQuery({ callbackUrl: callbackUrl, csrfToken: csrfToken ?? undefined })
	const startPath = providerId === 'credentials' ? '/callback/credentials' : joinPath('/signin', `/${providerId}`)
	const startUrl = buildAbsoluteUrl(basePath, `${startPath}${query ? `?${query}` : ''}`, baseUrl)

	if (redirect === 'manual') {
		return { ok: true, url: startUrl }
	}

	if (redirect === true) {
		if (!hasWindow()) {
			throw new Error('Cannot perform top-level navigation during SSR. Use signIn(..., "manual") to obtain a redirect URL and issue it from your framework.')
		}
		// Top-level navigation
		window.location.assign(startUrl)
		return { ok: true, redirected: true }
	}

	// redirect === false: keep fetch-based flow but normalize return shape
	const target = resolveEndpoint(client, providerId === 'credentials' ? '/callback/credentials' : '/signin')
	const request = resolveFetch(client?.fetch)
	const init: Record<string, unknown> = {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			...(client?.headers ?? {})
		},
		credentials: 'include',
		body: JSON.stringify({ ...body, provider: providerId, csrfToken: csrfToken ?? undefined })
	}

	const response = await request(target, init)
	let url: string | undefined
	let error: string | undefined
	try {
		const data = (await response.clone().json()) as { url?: string; error?: string }
		url = typeof data?.url === 'string' ? data.url : undefined
		error = typeof data?.error === 'string' ? data.error : undefined
	} catch {}
	return { ok: response.ok, url, error }
}

/**
 * Calls the Auth.js sign-out route to remove the active session.
 *
 * @param options - Overrides for base path, headers, or a custom fetch implementation.
 * @returns A `Response` emitted by the `/signout` endpoint.
 *
 * @example
 * ```ts
 * await signOut()
 * ```
 *
 * @example
 * ```ts
 * await signOut({ fetch: myEdgeSafeFetch })
 * ```
 */
export async function signOut(options?: ClientOptions): Promise<Response>
export async function signOut(
	params?: { csrfToken?: string; callbackUrl?: string },
	proxy?: ClientOptions,
	redirect?: RedirectMode
): Promise<Response | { ok: boolean; url?: string; error?: string } | { ok: true; redirected: true } | { ok: true; url: string }>
export async function signOut(
	params?: ClientOptions | { csrfToken?: string; callbackUrl?: string },
	proxy?: ClientOptions,
	redirect?: RedirectMode
): Promise<Response | { ok: boolean; url?: string; error?: string } | { ok: true; redirected: true } | { ok: true; url: string }> {
	// Legacy behavior: single argument of ClientOptions and no redirect flag
	if (typeof redirect === 'undefined' && (params === undefined || 'basePath' in (params as ClientOptions) || 'baseUrl' in (params as ClientOptions) || 'fetch' in (params as ClientOptions))) {
		const options = params as ClientOptions | undefined
		const target = resolveEndpoint(options, '/signout')
		const request = resolveFetch(options?.fetch)
		const csrfToken = await getCsrfToken({ ...options, fetch: request })
		const headers = new Headers(options?.headers as HeadersInit | undefined)
		const init: Record<string, unknown> = { method: 'POST', headers, credentials: 'include' }
		headers.set('Content-Type', 'application/json')
		init.body = JSON.stringify(csrfToken ? { csrfToken } : {})
		return request(target, init)
	}

	const args = (params as { csrfToken?: string; callbackUrl?: string }) ?? {}
	const client = proxy
	const basePath = resolveBasePath(client)
	const baseUrl = client?.baseUrl
	const callbackUrl = resolveCallbackUrl(args.callbackUrl)

	if (redirect === 'manual') {
		const query = toQuery({ callbackUrl })
		const url = buildAbsoluteUrl(basePath, `/signout${query ? `?${query}` : ''}`, baseUrl)
		return { ok: true, url }
	}

	if (redirect === true) {
		if (!hasWindow()) {
			throw new Error('Cannot perform top-level navigation during SSR. Use signOut(..., "manual") to obtain a redirect URL and issue it from your framework.')
		}
		const query = toQuery({ callbackUrl })
		const url = buildAbsoluteUrl(basePath, `/signout${query ? `?${query}` : ''}`, baseUrl)
		window.location.assign(url)
		return { ok: true, redirected: true }
	}

	// redirect === false → fetch-based signout with normalized shape
	const target = resolveEndpoint(client, '/signout')
	const request = resolveFetch(client?.fetch)
	const csrfToken = args.csrfToken ?? (await getCsrfToken({ ...client, fetch: request }))
	const headers = new Headers(client?.headers as HeadersInit | undefined)
	const init: Record<string, unknown> = { method: 'POST', headers, credentials: 'include' }
	headers.set('Content-Type', 'application/json')
	init.body = JSON.stringify(csrfToken ? { csrfToken, callbackUrl } : { callbackUrl })
	const response = await request(target, init)
	let url: string | undefined
	let error: string | undefined
	try {
		const data = (await response.clone().json()) as { url?: string; error?: string }
		url = typeof data?.url === 'string' ? data.url : undefined
		error = typeof data?.error === 'string' ? data.error : undefined
	} catch {}
	return { ok: response.ok, url, error }
}

/**
 * Retrieves the current Auth.js session object, if one exists.
 *
 * @param options - Overrides for base path, headers, or a custom fetch implementation.
 * @returns The active session payload or `null` when the user is not authenticated.
 *
 * @example
 * ```ts
 * const session = await getSession()
 * ```
 *
 * @example
 * ```ts
 * const session = await getSession({ headers: { cookie: context.cookie } })
 * ```
 */
export async function getSession<T extends Session = Session>(options?: ClientOptions): Promise<T | null> {
	// Pull the session JSON from Auth.js while preserving caller-provided headers.
	const target = resolveEndpoint(options, '/session')
	const request = resolveFetch(options?.fetch)
	const init: Record<string, unknown> = {
		headers: {
			'Content-Type': 'application/json',
			...(options?.headers ?? {})
		},
		credentials: 'include'
	}

	const response = await request(target, init)
	if (!response.ok) return null

	return (await response.json()) as T
}

/**
 * Lists OAuth, Email, and custom providers configured in Auth.js at runtime.
 *
 * @param options - Overrides for base path, headers, or a custom fetch implementation.
 * @returns A list of available providers or `null` if the response is not successful.
 *
 * @example
 * ```ts
 * const providers = await getProviders()
 * ```
 *
 * @example
 * ```ts
 * const providers = await getProviders({ headers: { cookie: request.headers.get('cookie') ?? '' } })
 * ```
 */
export async function getProviders(options?: ClientOptions): Promise<PublicProvider[] | null> {
	// Providers response is public, but we still honor caller header overrides.
	const target = resolveEndpoint(options, '/providers')
	const request = resolveFetch(options?.fetch)
	const init: Record<string, unknown> = {
		headers: options?.headers,
		credentials: 'include'
	}

	const response = await request(target, init)
	if (!response.ok) return null

	return (await response.json()) as PublicProvider[]
}

/**
 * Fetches the CSRF token used by Auth.js form submissions.
 *
 * @param options - Overrides for base path, headers, or a custom fetch implementation.
 * @returns A string token or `null` if the request fails.
 *
 * @example
 * ```ts
 * const csrf = await getCsrfToken()
 * ```
 *
 * @example
 * ```ts
 * const csrf = await getCsrfToken({ basePath: '/auth' })
 * ```
 */
export async function getCsrfToken(options?: ClientOptions): Promise<string | null> {
	// Token fetch mirrors the Auth.js REST endpoint and returns null when unavailable.
	const target = resolveEndpoint(options, '/csrf')
	const request = resolveFetch(options?.fetch)
	const init: Record<string, unknown> = {
		headers: options?.headers,
		credentials: 'include'
	}

	const response = await request(target, init)
	if (!response.ok) return null

	const data = (await response.json()) as { csrfToken?: string }
	return data?.csrfToken ?? null
}
