import type { CookieOption, CookiesOptions } from '@auth/core/types'

/** Individual chunk produced while splitting large cookie values. */
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
	// Provide sensible defaults mirroring Auth.js expectations.
	return {
		name,
		options: {
			...DEFAULT_COOKIE_OPTIONS,
			httpOnly,
			secure
		}
	}
}

/** Builds Auth.js default cookie configuration, including names and flags. */
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

/** Lazily-evaluated default cookie set shared across runtime helpers. */
export const defaultCookies = buildDefaultCookies()

/** Applies `__Secure-` or `__Host-` prefixes required by certain cookie policies. */
export function applyCookiePrefix(name: string, secure = true, hostOnly = false): string {
	if (hostOnly) {
		return `__Host-${name}`
	}
	return secure ? `__Secure-${name}` : name
}

/** Deep merges cookie definitions, preserving nested option objects. */
export function mergeCookieOption(
	defaultOption: Partial<CookieOption>,
	override?: Partial<CookieOption>
): Partial<CookieOption> {
	// Merge nested option objects without mutating the original references.
	return {
		...defaultOption,
		...override,
		options: {
			...(defaultOption?.options ? { ...defaultOption.options } : undefined),
			...(override?.options ? { ...override.options } : undefined)
		}
	}
}

/** Combines user-provided cookie overrides with the plugin defaults. */
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

/** Splits oversized cookie payloads into smaller chunks for transmission. */
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
		// Emit deterministic chunk names so we can reassemble the value later on.
		const chunk = value.slice(i, i + chunkSize)
		chunks.push({ name: `${name}.${index++}`, value: chunk })
	}

	return chunks
}

/** Reassembles a cookie value previously split with `chunkCookieValue`. */
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

/** Serializes a cookie header string following Auth.js expectations. */
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
