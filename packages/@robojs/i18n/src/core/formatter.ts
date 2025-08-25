import { IntlMessageFormat } from 'intl-messageformat'

// Tiny cache for compiled IntlMessageFormat instances
const _formatterCache = new Map<string, IntlMessageFormat>()

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

// Test helper if you hot-reload or want to reset between tests
export function __clearI18nFormatterCache() {
	_formatterCache.clear()
}
