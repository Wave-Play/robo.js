import type { PublicProvider, Session } from '@auth/core/types'

type HeadersInput = Record<string, string> | Array<[string, string]> | undefined

type FetchLike = (input: string, init?: Record<string, unknown>) => Promise<Response>

interface ClientOptions {
	basePath?: string
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
	return options?.basePath ?? DEFAULT_BASE_PATH
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
	body: Record<string, unknown> = {},
	options?: ClientOptions
): Promise<Response> {
	// Resolve the runtime environment before composing the Auth.js request.
	const basePath = resolveBasePath(options)
	const request = resolveFetch(options?.fetch)
	const init: Record<string, unknown> = {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			...(options?.headers ?? {})
		},
		credentials: 'include',
		body: JSON.stringify({ ...body, provider: providerId })
	}

	return request(`${basePath}/signin`, init)
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
export async function signOut(options?: ClientOptions): Promise<Response> {
	// Always speak to the same base path the plugin configured.
	const basePath = resolveBasePath(options)
	const request = resolveFetch(options?.fetch)
	const init: Record<string, unknown> = {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			...(options?.headers ?? {})
		},
		credentials: 'include'
	}

	return request(`${basePath}/signout`, init)
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
	const basePath = resolveBasePath(options)
	const request = resolveFetch(options?.fetch)
	const init: Record<string, unknown> = {
		headers: {
			'Content-Type': 'application/json',
			...(options?.headers ?? {})
		},
		credentials: 'include'
	}
	const response = await request(`${basePath}/session`, init)
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
	const basePath = resolveBasePath(options)
	const request = resolveFetch(options?.fetch)
	const init: Record<string, unknown> = {
		headers: options?.headers,
		credentials: 'include'
	}
	const response = await request(`${basePath}/providers`, init)
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
	const basePath = resolveBasePath(options)
	const request = resolveFetch(options?.fetch)
	const init: Record<string, unknown> = {
		headers: options?.headers,
		credentials: 'include'
	}
	const response = await request(`${basePath}/csrf`, init)
	if (!response.ok) return null
	const data = (await response.json()) as { csrfToken?: string }
	return data?.csrfToken ?? null
}
