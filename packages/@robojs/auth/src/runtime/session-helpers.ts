import type { Adapter } from '@auth/core/adapters'
import type { AuthConfig } from '@auth/core'
import type { CookiesOptions } from '@auth/core/types'
import { serializeCookie } from '../utils/cookies.js'
import { nanoid } from 'nanoid'

/** Detects whether an Auth.js response redirects to a success destination. */
export function isSuccessRedirect(response: Response): boolean {
	const status = response.status
	if (status < 300 || status >= 400) return false
	const location = response.headers.get('location') ?? ''
	return !/[?&]error=/.test(location)
}

/** Checks if the supplied response contains a Set-Cookie header for the session token. */
export function hasSessionCookie(response: Response, cookieName: string): boolean {
	// Headers may contain multiple Set-Cookie values; get() returns a comma-joined list in some runtimes.
	const header = response.headers.get('set-cookie')
	if (!header) return false
	return header.includes(`${cookieName}=`)
}

type SameSite = 'lax' | 'strict' | 'none'

function normalizeSameSite(input: unknown): SameSite {
	return input === 'strict' || input === 'none' ? input : 'lax'
}

/** Appends a database session cookie to the response so credentials providers stay logged in. */
export async function attachDbSessionCookie(params: {
	response: Response
	adapter: Adapter
	cookies: CookiesOptions
	config: AuthConfig
	userId: string
}): Promise<Response> {
	const { response, adapter, cookies, config, userId } = params

	const cookieName = cookies.sessionToken?.name ?? 'authjs.session-token'

	const token = nanoid(32)
	const maxAge = config.session?.maxAge ?? 60 * 60 * 24 * 30
	const expires = new Date(Date.now() + maxAge * 1000)

	await adapter.createSession?.({ sessionToken: token, userId, expires })

	const opts = cookies.sessionToken?.options ?? { path: '/', sameSite: 'lax' as const, secure: true, httpOnly: true }
	const headerValue = serializeCookie(cookieName, token, {
		path: opts.path ?? '/',
		domain: opts.domain,
		httpOnly: opts.httpOnly ?? true,
		secure: opts.secure ?? true,
		sameSite: normalizeSameSite(opts.sameSite),
		expires,
		maxAge
	})

	const headers = new Headers(response.headers)
	// Always append our cookie so the database strategy has a matching token.
	// If Auth.js also set a session cookie (e.g., JWT), the browser will honor the last one.
	headers.append('set-cookie', headerValue)
	return new Response(null, { status: response.status, headers })
}
