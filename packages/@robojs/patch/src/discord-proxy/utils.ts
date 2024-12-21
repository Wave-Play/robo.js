// Hostnames from which activities are proxied
const ProxyHosts = ['discordsays.com', 'discordsez.com']

export const ProxyPrefix = '/.proxy'

export function isDiscordActivity() {
	const queryParams = new URLSearchParams(window.location.search)
	return queryParams.get('frame_id') != null
}

export function patchUrl(url: string | RequestInfo | URL, prefix = ProxyPrefix): Request | URL {
	// @ts-expect-error - Patch mappings are injected by Vite
	const mappedPrefixes: string[] = globalThis['@robojs/patch']?.mappings ?? []
	const base = typeof url === 'string' ? window.location.origin : undefined
	const newUrl = new URL(url instanceof Request ? url.url : String(url), base)

	const isProxied =
		ProxyHosts.some((host) => newUrl.hostname.endsWith(host)) &&
		!mappedPrefixes.find((prefix) => newUrl.pathname.startsWith(prefix))

	if (isProxied && !newUrl.pathname.startsWith(prefix)) {
		newUrl.pathname = prefix + newUrl.pathname
	}

	if (url instanceof Request) {
		return new Request(newUrl, {
			method: url.method,
			headers: url.headers,
			body: url.bodyUsed ? null : url.body,
			mode: url.mode,
			credentials: url.credentials,
			// @ts-expect-error - `duplex` is part of the Fetch spec
			duplex: url.body instanceof ReadableStream ? 'half' : undefined,
			cache: url.cache,
			redirect: url.redirect,
			referrer: url.referrer,
			referrerPolicy: url.referrerPolicy,
			integrity: url.integrity,
			keepalive: url.keepalive,
			signal: url.signal
		})
	} else {
		return newUrl
	}
}
