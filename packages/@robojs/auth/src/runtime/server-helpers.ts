import { Auth } from '@auth/core'
import { getToken as coreGetToken, type JWT } from '@auth/core/jwt'
import type { AuthConfig } from '@auth/core'
import type { Session } from '@auth/core/types'
import { ensureCredentialsDbCompatibility } from './credentials-compat.js'

type HeadersInput = Record<string, string> | Array<[string, string]> | undefined

type AuthHandler = (request: Request) => Promise<Response>

interface RuntimeState {
	authHandler: AuthHandler | null
	basePath: string
	baseUrl: string
	cookieName: string
	secret: string
	sessionStrategy: 'jwt' | 'database'
}

const runtime: RuntimeState = {
	authHandler: null,
	basePath: '/api/auth',
	baseUrl: process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? 'http://localhost:3000',
	cookieName: 'authjs.session-token',
	secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET ?? '',
	sessionStrategy: 'jwt'
}

export interface ConfigureAuthRuntimeOptions {
	basePath: string
	baseUrl: string
	cookieName: string
	secret: string
	sessionStrategy: 'jwt' | 'database'
}

/**
 * Prepares a reusable Auth.js request handler for server-side helpers.
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
 */
export function configureAuthRuntime(config: AuthConfig, options: ConfigureAuthRuntimeOptions): void {
	const preparedConfig = ensureCredentialsDbCompatibility(config)
	runtime.authHandler = (request: Request) => Auth(request, preparedConfig)
	runtime.basePath = options.basePath
	runtime.baseUrl = options.baseUrl
	runtime.cookieName = options.cookieName
	runtime.secret = options.secret
	runtime.sessionStrategy = options.sessionStrategy
}

function cloneHeaders(input?: Headers | HeadersInput | null): Headers {
	return new Headers(input ?? undefined)
}

function resolveHeaders(input?: Request | Headers | HeadersInput | null): Headers {
	if (!input) return new Headers()
	if (input instanceof Request) return new Headers(input.headers)
	return cloneHeaders(input as HeadersInput)
}

/**
 * Resolves the current Auth.js session by invoking the session route directly.
 *
 * @example
 * ```ts
 * const session = await getServerSession(request.headers)
 * ```
 */
export async function getServerSession(input?: Request | Headers | HeadersInput | null): Promise<Session | null> {
	if (!runtime.authHandler) {
		throw new Error('Auth runtime has not been configured. Did you call configureAuthRuntime inside the plugin start hook?')
	}

	const headers = resolveHeaders(input)
	const sessionUrl = runtime.basePath.endsWith('/session')
		? `${runtime.baseUrl}${runtime.basePath}`
		: `${runtime.baseUrl}${runtime.basePath}/session`
	const sessionRequest = new Request(sessionUrl, {
		headers,
		method: 'GET'
	})
	const response = await runtime.authHandler(sessionRequest)
	if (!response.ok) return null
	return (await response.json()) as Session
}

/**
 * Extracts the Auth.js session token from the provided request context.
 *
 * @example
 * ```ts
 * const token = await getToken(request, { raw: true })
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

	const headers = resolveHeaders(input)
	const headerRecord: Record<string, string> = {}
	;(headers as unknown as { forEach?: (cb: (value: string, key: string) => void) => void }).forEach?.(
		(value, key) => {
			headerRecord[key] = value
		}
	)

	return coreGetToken({
		req: { headers: headerRecord },
		secureCookie: runtime.baseUrl.startsWith('https://'),
		cookieName: runtime.cookieName,
		raw: options?.raw ?? false,
		secret: runtime.secret,
		salt: runtime.cookieName
	})
}
