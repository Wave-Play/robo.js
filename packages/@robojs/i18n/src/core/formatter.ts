import { IntlMessageFormat } from 'intl-messageformat'

// Tiny cache for compiled IntlMessageFormat instances
const _formatterCache = new Map<string, IntlMessageFormat>()

/**
 * Returns a cached IntlMessageFormat for (locale|key|sanitizedMsg); compiles and stores if missing.
 * @param locale Locale string; @param key Translation key; @param sanitizedMsg ICU message with dotted args sanitized.
 * @returns Reusable IntlMessageFormat instance.
 */
export function getFormatter(locale: string, key: string, sanitizedMsg: string): IntlMessageFormat {
	// Keyed by locale|key|message to be robust to dynamic text changes
	const cacheKey = `${locale}||${key}||${sanitizedMsg}`
	let fmt = _formatterCache.get(cacheKey)

	if (!fmt) {
		fmt = new IntlMessageFormat(sanitizedMsg, locale)
		_formatterCache.set(cacheKey, fmt)
	}

	return fmt
}

/**
 * Clears the in-memory IntlMessageFormat cache (useful for tests and hot reloads).
 * Call after reloading locales/messages to avoid stale formatters.
 * @returns void
 */
export function clearFormatterCache() {
	_formatterCache.clear()
}
