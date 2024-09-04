export const ProxyPrefix = '/.proxy'

export function isDiscordActivity() {
	const queryParams = new URLSearchParams(window.location.search)
	return queryParams.get('frame_id') != null
}

export function patchUrl(url: string | RequestInfo | URL, prefix = ProxyPrefix): URL {
	const base = typeof url === 'string' ? window.location.origin : undefined
	const newUrl = new URL(url.toString(), base)

	if (!newUrl.pathname.startsWith(prefix)) {
		newUrl.pathname = prefix + newUrl.pathname
	}

	return newUrl
}
