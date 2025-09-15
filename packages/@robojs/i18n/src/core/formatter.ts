import { MessageFormat } from 'messageformat'

// Tiny cache for compiled MessageFormat instances
const _formatterCache = new Map<string, MessageFormat>()

/**
 * Returns a cached MessageFormat for (locale|key|sanitizedMsg); compiles and stores if missing.
 * @param locale Locale string; @param key Translation key; @param sanitizedMsg MF2 message with dotted args sanitized.
 * @returns Reusable MessageFormat instance.
 */
export function getFormatter(locale: string, key: string, sanitizedMsg: string): MessageFormat {
	// Keyed by locale|key|message to be robust to dynamic text changes
	const cacheKey = `${locale}||${key}||${sanitizedMsg}`
	let mf = _formatterCache.get(cacheKey)

	if (!mf) {
		mf = new MessageFormat(locale, sanitizedMsg)
		_formatterCache.set(cacheKey, mf)
	}

	return mf
}

/** Clears the in-memory MessageFormat cache (useful for tests and hot reloads). */
export function clearFormatterCache() {
	_formatterCache.clear()
}
