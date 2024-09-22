// Hostnames from which activities are proxied
const ProxyHosts = ['discordsays.com', 'discordsez.com']

export const ProxyPrefix = '/.proxy'

export function isDiscordActivity() {
	const queryParams = new URLSearchParams(window.location.search)
	return queryParams.get('frame_id') != null
}

export function patchUrl(url: string | RequestInfo | URL, prefix = ProxyPrefix): URL {
	const base = typeof url === 'string' ? window.location.origin : undefined
	const newUrl = new URL(url.toString(), base)

	const isProxied = ProxyHosts.some((host) => newUrl.hostname.endsWith(host))
	if (isProxied && !newUrl.pathname.startsWith(prefix)) {
		newUrl.pathname = prefix + newUrl.pathname
	}

	return newUrl
}
