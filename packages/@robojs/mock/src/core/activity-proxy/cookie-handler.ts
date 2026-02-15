// ============================================================================
// Cookie Handler
// Per-session cookie jar for maintaining state with upstream servers
// ============================================================================

interface CookieEntry {
	name: string
	value: string
	domain?: string
	path?: string
	expires?: Date
	httpOnly?: boolean
	secure?: boolean
	sameSite?: 'Strict' | 'Lax' | 'None'
}

/**
 * Simple per-session cookie jar.
 * Stores cookies from upstream Set-Cookie headers and replays them on outgoing requests.
 */
export class CookieJar {
	/** domain -> cookies */
	private cookies: Map<string, CookieEntry[]> = new Map()

	/**
	 * Store cookies from Set-Cookie response headers.
	 */
	addFromSetCookie(setCookieHeaders: string[], requestUrl: URL): void {
		for (const header of setCookieHeaders) {
			const entry = parseSetCookie(header, requestUrl)
			if (!entry) continue

			const domain = entry.domain ?? requestUrl.hostname
			const existing = this.cookies.get(domain) ?? []

			// Replace if same name + path
			const idx = existing.findIndex((c) => c.name === entry.name && c.path === entry.path)
			if (idx !== -1) {
				existing[idx] = entry
			} else {
				existing.push(entry)
			}
			this.cookies.set(domain, existing)
		}
	}

	/**
	 * Get Cookie header value for an outgoing request.
	 */
	getCookieHeader(requestUrl: URL): string | undefined {
		const now = new Date()
		const matching: CookieEntry[] = []

		for (const [domain, entries] of this.cookies) {
			for (const entry of entries) {
				// Check expiration
				if (entry.expires && entry.expires < now) continue

				// Check domain match
				if (!domainMatches(requestUrl.hostname, domain)) continue

				// Check path match
				const cookiePath = entry.path ?? '/'
				if (!requestUrl.pathname.startsWith(cookiePath)) continue

				matching.push(entry)
			}
		}

		if (matching.length === 0) return undefined

		return matching.map((c) => `${c.name}=${c.value}`).join('; ')
	}

	/**
	 * Rewrite Set-Cookie headers for the proxy origin.
	 * Adjusts Domain, Secure, and SameSite attributes.
	 */
	rewriteSetCookieHeaders(setCookieHeaders: string[], _proxyHostname: string): string[] {
		return setCookieHeaders.map((header) => {
			let result = header

			// Remove/replace Domain attribute
			result = result.replace(/;\s*Domain=[^;]*/i, '')

			// Strip Secure flag (proxy is HTTP on localhost)
			result = result.replace(/;\s*Secure/i, '')

			// Set SameSite=Lax unless the original was None
			if (/SameSite\s*=\s*None/i.test(header)) {
				// Keep SameSite=None removed (since we stripped Secure, None won't work)
				result = result.replace(/;\s*SameSite=[^;]*/i, '; SameSite=Lax')
			} else if (!/SameSite/i.test(result)) {
				result += '; SameSite=Lax'
			}

			return result
		})
	}

	clear(): void {
		this.cookies.clear()
	}
}

// ============================================================================
// Parsing helpers
// ============================================================================

function parseSetCookie(header: string, _requestUrl: URL): CookieEntry | null {
	const parts = header.split(';').map((s) => s.trim())
	if (parts.length === 0) return null

	// First part is name=value
	const nameValue = parts[0]
	const eqIdx = nameValue.indexOf('=')
	if (eqIdx === -1) return null

	const name = nameValue.slice(0, eqIdx).trim()
	const value = nameValue.slice(eqIdx + 1).trim()
	if (!name) return null

	const entry: CookieEntry = { name, value }

	for (let i = 1; i < parts.length; i++) {
		const part = parts[i]
		const attrEq = part.indexOf('=')
		const attrName = (attrEq === -1 ? part : part.slice(0, attrEq)).trim().toLowerCase()
		const attrValue = attrEq === -1 ? '' : part.slice(attrEq + 1).trim()

		switch (attrName) {
			case 'domain':
				entry.domain = attrValue.startsWith('.') ? attrValue.slice(1) : attrValue
				break
			case 'path':
				entry.path = attrValue || '/'
				break
			case 'expires':
				try {
					entry.expires = new Date(attrValue)
				} catch {
					// ignore invalid dates
				}
				break
			case 'max-age': {
				const seconds = parseInt(attrValue, 10)
				if (!isNaN(seconds)) {
					entry.expires = new Date(Date.now() + seconds * 1000)
				}
				break
			}
			case 'httponly':
				entry.httpOnly = true
				break
			case 'secure':
				entry.secure = true
				break
			case 'samesite':
				entry.sameSite = attrValue as 'Strict' | 'Lax' | 'None'
				break
		}
	}

	// Default path to request URL
	if (!entry.path) {
		entry.path = '/'
	}

	return entry
}

function domainMatches(requestHost: string, cookieDomain: string): boolean {
	if (requestHost === cookieDomain) return true
	if (requestHost.endsWith('.' + cookieDomain)) return true
	return false
}
