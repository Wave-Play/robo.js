import { patchUrl, ProxyPrefix } from '../utils.js'

export function patchFetch() {
	interface RoboRequestInit extends RequestInit {
		prefix?: string
	}

	const _fetch = globalThis.fetch

	globalThis.fetch = function (url: string | RequestInfo | URL, options?: RoboRequestInit): Promise<Response> {
		const { prefix = ProxyPrefix, ...nativeOptions } = options ?? {}
		const patchedUrl = patchUrl(url, prefix)

		return _fetch(patchedUrl, nativeOptions)
	}
}
