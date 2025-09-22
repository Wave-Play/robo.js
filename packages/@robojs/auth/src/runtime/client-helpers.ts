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
 * Posts to the plugin's `/signin` endpoint with the chosen provider.
 *
 * @example
 * ```ts
 * await signIn('google')
 * ```
 */
export async function signIn(
	providerId: string,
	body: Record<string, unknown> = {},
	options?: ClientOptions
): Promise<Response> {
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
 * Posts to the plugin's `/signout` endpoint and clears session cookies.
 *
 * @example
 * ```ts
 * await signOut()
 * ```
 */
export async function signOut(options?: ClientOptions): Promise<Response> {
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
 * Fetches the active session JSON from `/session`.
 *
 * @example
 * ```ts
 * const session = await getSession()
 * ```
 */
export async function getSession<T extends Session = Session>(options?: ClientOptions): Promise<T | null> {
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
 * Lists providers exposed by Auth.js at runtime.
 *
 * @example
 * ```ts
 * const providers = await getProviders()
 * ```
 */
export async function getProviders(options?: ClientOptions): Promise<PublicProvider[] | null> {
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
 * Retrieves the CSRF token required for form-based POSTs to `/signin` or `/signout`.
 *
 * @example
 * ```ts
 * const csrf = await getCsrfToken()
 * ```
 */
export async function getCsrfToken(options?: ClientOptions): Promise<string | null> {
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
