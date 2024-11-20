import { normalizeKey } from './utils.js'
import React, { createContext, useEffect, useRef, useState } from 'react'
import type { MessagePayload } from './types.js'

export const SyncContext = createContext<ReturnType<typeof setupSyncState>>({
	cache: {},
	connected: false,
	registerCallback: () => '',
	unregisterCallback: () => {
		/* no-op */
	},
	ws: null as WebSocket | null
})

interface SyncContextProviderProps {
	children: React.ReactNode
	loadingScreen?: React.ReactNode
}
export function SyncContextProvider(props: SyncContextProviderProps) {
	const { children, loadingScreen = null } = props
	const context = setupSyncState()

	if (loadingScreen && (!context.connected || !context.ws)) {
		return <>{loadingScreen}</>
	}

	return <SyncContext.Provider value={context}>{children}</SyncContext.Provider>
}

type CallbackEntry = { key: string; callback: UpdateCallback }
type UpdateCallback = (data: unknown, key: (string | null)[]) => void

let IdCounter = 0

function setupSyncState() {
	const [ws, setWs] = useState<WebSocket | null>(null)
	const [connected, setConnected] = useState(false)
	const cache = useRef<Record<string, unknown>>({}).current
	const callbacks = useRef<Record<string, UpdateCallback[]>>({}).current
	const callbackMap = useRef<Record<string, CallbackEntry>>({}).current
	const isRunning = useRef(false)

	useEffect(() => {
		if (isRunning.current) {
			return
		}

		isRunning.current = true
		const wsProtocol = location.protocol === 'http:' ? 'ws' : 'wss'
		const websocket = new WebSocket(`${wsProtocol}://${location.host}/sync`)

		websocket.onopen = () => {
			console.log('Connection established at', new Date().toISOString())
			setConnected(true)
		}

		websocket.onclose = () => {
			console.log('Connection closed at', new Date().toISOString())
			setConnected(false)
		}

		websocket.onerror = (error) => {
			console.error('Websocket error:', error)
		}

		websocket.onmessage = (event) => {
			// Only handle parseable messages
			if (typeof event.data !== 'string') {
				return
			}

			const payload = JSON.parse(event.data) as MessagePayload
			let response: MessagePayload | null = null

			switch (payload.type) {
				case 'ping':
					response = { data: undefined, type: 'pong' }
					break
				case 'update': {
					const { key, data } = payload
					const cleanKey = normalizeKey(key)

					// Ignore if data is undefined
					if (data === undefined) {
						break
					}

					// Broadcast the update to all callbacks
					if (callbacks[cleanKey]) {
						callbacks[cleanKey].forEach((callback) => {
							try {
								callback(data, key as string[])
							} catch (error) {
								console.error('Callback error:', error)
							}
						})
					}

					// Cache the data
					cache[cleanKey] = data
					break
				}
			}

			if (response) {
				websocket.send(JSON.stringify(response))
			}
		}

		setWs(websocket)
	}, [])

	const registerCallback = (key: (string | null)[], callback: UpdateCallback) => {
		const cleanKey = normalizeKey(key)
		const callbackId = '' + IdCounter++

		// Add the callback to indices
		if (!callbacks[cleanKey]) {
			callbacks[cleanKey] = []
		}

		callbacks[cleanKey].push(callback)
		callbackMap[callbackId] = {
			key: cleanKey,
			callback
		}

		// Listen for updates to the key if first callback
		if (callbacks[cleanKey].length === 1) {
			ws?.send(JSON.stringify({ key, type: 'on' }))
		} else {
			// Apply last known state to the new callback
			callback(cache[cleanKey], key)
		}

		return callbackId
	}

	const unregisterCallback = (callbackId: string) => {
		const cleanKey = callbackMap[callbackId]
		const index = callbacks[cleanKey.key].findIndex((cb) => cb === cleanKey.callback)

		// Remove the callback from indices
		if (index > -1) {
			callbacks[cleanKey.key].splice(index, 1)
		}
		delete callbackMap[callbackId]

		// Stop listening for updates to the key if last callback
		if (callbacks[cleanKey.key].length === 0) {
			ws?.send(JSON.stringify({ key: cleanKey.key.split('.'), type: 'off' }))
		}
	}

	return { cache, connected, registerCallback, unregisterCallback, ws }
}
