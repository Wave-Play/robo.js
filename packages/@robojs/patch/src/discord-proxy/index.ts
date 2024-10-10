import { patchFetch } from './patch/fetch.js'
import { patchWebSocket } from './patch/websocket.js'
import { isDiscordActivity } from './utils.js'
import { VitePlugin } from './vite-plugin.js'

export const DiscordProxy = {
	patch,
	Vite: VitePlugin
}

/**
 * Automatically patches all internal requests when in a Discord Activity.
 * This updates the `fetch` and `WebSocket` APIs to always include the `/.proxy` prefix.
 *
 * Run this at the very beginning of your app to ensure all requests are proxied.
 */
function patch() {
	if (isDiscordActivity()) {
		console.log('@robojs/patch: Applying patch for Discord Proxy')
		patchFetch()
		patchWebSocket()
	} else {
		console.log('@robojs/patch: Not in Discord Activity, skipping patch')
	}
}
