import { SyncContext } from './context.js'
import { useContext, useEffect, useState } from 'react'

export function useSyncState<T>(initialState: T, key: (string | null)[]) {
	const { cache, connected, registerCallback, unregisterCallback, ws } = useContext(SyncContext)
	const [state, setState] = useState(initialState)
	const [queuedState, setQueuedState] = useState<Partial<T> | null>(null)
	const hasWs = !!ws

	const setSyncState = (newState: Partial<T> | ((prevState: T) => T)) => {
		// Run updater function if provided that way
		const currentState = (cache[key.join('.')] as T) ?? initialState

		if (typeof newState === 'function') {
			newState = newState(currentState)
		}

		// Send the state update to the server
		if (connected && ws) {
			ws.send(JSON.stringify({ data: newState, key, type: 'update' }))
		} else {
			// Queue the state update
			setQueuedState(newState)
		}
	}

	useEffect(() => {
		// Send the queued state if the connection is established
		if (queuedState && connected && hasWs) {
			setSyncState(queuedState)
			setQueuedState(null)
		}

		if (connected && hasWs) {
			// Register the callback to update the state
			const callbackId = registerCallback(key, (data, key) => {
				if (key.join('.') === key.join('.')) {
					setState(data as T)
				}
			})

			// Unregister the callback when the component unmounts
			return () => {
				unregisterCallback(callbackId)
			}
		}
	}, [connected, hasWs])

	return [state, setSyncState] as const
}
