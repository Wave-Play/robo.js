import type { CookieOption, CookiesOptions } from '@auth/core/types'

export interface ChunkedCookieValue {
	name: string
	value: string
}

const DEFAULT_COOKIE_OPTIONS = {
	path: '/',
	sameSite: 'lax' as const,
	secure: true
}

function createCookieOption({
	name,
	secure = true,
	httpOnly = true
}: {
	name: string
	secure?: boolean
	httpOnly?: boolean
}): Partial<CookieOption> {
	return {
		name,
		options: {
			...DEFAULT_COOKIE_OPTIONS,
			httpOnly,
			secure
		}
	}
}

export function buildDefaultCookies(): CookiesOptions {
	return {
		callbackUrl: createCookieOption({ name: 'authjs.callback-url', httpOnly: false }),
		csrfToken: createCookieOption({ name: 'authjs.csrf-token' }),
		nonce: createCookieOption({ name: 'authjs.nonce' }),
		pkceCodeVerifier: createCookieOption({ name: 'authjs.pkce.code_verifier' }),
		sessionToken: createCookieOption({ name: 'authjs.session-token' }),
		state: createCookieOption({ name: 'authjs.state' }),
		webauthnChallenge: createCookieOption({ name: 'authjs.webauthn.challenge', httpOnly: false })
	}
}

export const defaultCookies = buildDefaultCookies()

export function applyCookiePrefix(name: string, secure = true, hostOnly = false): string {
	if (hostOnly) {
		return `__Host-${name}`
	}
	return secure ? `__Secure-${name}` : name
}

export function mergeCookieOption(
	defaultOption: Partial<CookieOption>,
	override?: Partial<CookieOption>
): Partial<CookieOption> {
	return {
		...defaultOption,
		...override,
		options: {
			...(defaultOption?.options ? { ...defaultOption.options } : undefined),
			...(override?.options ? { ...override.options } : undefined)
		}
	}
}

export function applyCookieOverrides(
	defaults: CookiesOptions,
	overrides?: Partial<CookiesOptions>
): CookiesOptions {
	return {
		sessionToken: mergeCookieOption(defaults.sessionToken, overrides?.sessionToken),
		callbackUrl: mergeCookieOption(defaults.callbackUrl, overrides?.callbackUrl),
		csrfToken: mergeCookieOption(defaults.csrfToken, overrides?.csrfToken),
		pkceCodeVerifier: mergeCookieOption(defaults.pkceCodeVerifier, overrides?.pkceCodeVerifier),
		state: mergeCookieOption(defaults.state, overrides?.state),
		nonce: mergeCookieOption(defaults.nonce, overrides?.nonce),
		webauthnChallenge: mergeCookieOption(defaults.webauthnChallenge, overrides?.webauthnChallenge)
	}
}

const DEFAULT_CHUNK_SIZE = 3800

export function chunkCookieValue(
	name: string,
	value: string,
	chunkSize: number = DEFAULT_CHUNK_SIZE
): ChunkedCookieValue[] {
	if (value.length <= chunkSize) {
		return [{ name, value }]
	}

	const chunks: ChunkedCookieValue[] = []
	let index = 0

	for (let i = 0; i < value.length; i += chunkSize) {
		const chunk = value.slice(i, i + chunkSize)
		chunks.push({ name: `${name}.${index++}`, value: chunk })
	}

	return chunks
}

export function unchunkCookieValue(name: string, values: Record<string, string>): string | null {
	if (values[name]) return values[name]

	let index = 0
	let buffer = ''

	while (true) {
		const key = `${name}.${index}`
		if (!(key in values)) {
			break
		}
		buffer += values[key]
		index += 1
	}

	return index === 0 ? null : buffer
}

/**
 * Serializes a cookie header string following Auth.js expectations.
 */
export function serializeCookie(
	name: string,
	value: string,
	options?: {
		path?: string
		domain?: string
		httpOnly?: boolean
		secure?: boolean
		sameSite?: 'lax' | 'strict' | 'none'
		expires?: Date
		maxAge?: number
	}
): string {
	const parts = [`${name}=${encodeURIComponent(value)}`]
	if (options?.path) parts.push(`Path=${options.path}`)
	if (options?.domain) parts.push(`Domain=${options.domain}`)
	if (options?.httpOnly !== false) parts.push('HttpOnly')
	if (options?.secure) parts.push('Secure')
	if (options?.sameSite) {
		const s = options.sameSite
		const mapped = s === 'lax' ? 'Lax' : s === 'strict' ? 'Strict' : 'None'
		parts.push(`SameSite=${mapped}`)
	}
	if (options?.expires) parts.push(`Expires=${options.expires.toUTCString()}`)
	if (typeof options?.maxAge === 'number') parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`)
	return parts.join('; ')
}
