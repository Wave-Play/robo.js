import { patchUrl } from '../utils.js'

export function patchWebSocket() {
	const RoboWebSocket = new Proxy(window.WebSocket, {
		construct(WebSocketTarget, args) {
			const url = patchUrl(args[0])
			const protocols = args[1]

			return new WebSocketTarget(url, protocols)
		}
	})

	// eslint-disable-next-line no-global-assign
	WebSocket = RoboWebSocket
}
