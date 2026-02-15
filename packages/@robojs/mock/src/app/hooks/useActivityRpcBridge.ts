import { useEffect, useRef } from 'react'
import { useWebSocket } from '../stores/sessionStore'
import { useSessionDispatch } from '../stores/sessionStore'
import { useSession as useSessionState } from '../stores/sessionStore'

interface UseActivityRpcBridgeOptions {
	/** Ref to the Activity iframe element */
	iframeRef: React.RefObject<HTMLIFrameElement | null>
	/** frame_id assigned by backend on launch */
	frameId: string | null
	/** instance_id assigned by backend on launch */
	instanceId: string | null
	/** The origin of the iframe (computed from iframe src URL) */
	iframeOrigin: string | null
	/** Whether the bridge is active (Activity is launched and iframe is rendering) */
	enabled: boolean
	/** Callback when a message is rejected (for DevTools diagnostics) */
	onRejectedMessage?: (reason: string, event: MessageEvent) => void
	/** Origin check mode: 'strict' verifies event.origin, 'lenient' skips */
	originMode?: 'strict' | 'lenient'
}

interface UseActivityRpcBridgeReturn {
	/** Number of messages forwarded (for diagnostics) */
	forwardedCount: number
	/** Number of messages rejected (for diagnostics) */
	rejectedCount: number
}

export function useActivityRpcBridge(options: UseActivityRpcBridgeOptions): UseActivityRpcBridgeReturn {
	const { iframeRef, frameId, instanceId, iframeOrigin, enabled, onRejectedMessage, originMode = 'strict' } = options
	const { sendCommand } = useWebSocket()
	const dispatch = useSessionDispatch()
	const state = useSessionState()
	const forwardedCountRef = useRef(0)
	const rejectedCountRef = useRef(0)

	// Register message listener BEFORE iframe loads
	useEffect(() => {
		if (!enabled || !frameId || !instanceId) return

		const handleMessage = async (event: MessageEvent) => {
			// Security: filter by source
			if (!iframeRef.current?.contentWindow || event.source !== iframeRef.current.contentWindow) {
				// Not from our iframe -- ignore silently (other iframes, extensions, etc.)
				return
			}

			// Security: filter by origin
			if (iframeOrigin && event.origin !== iframeOrigin) {
				if (originMode === 'strict') {
					rejectedCountRef.current++
					onRejectedMessage?.(`Origin mismatch: expected ${iframeOrigin}, got ${event.origin}`, event)
					return
				} else {
					// Lenient mode: log warning but allow the message through
					onRejectedMessage?.(`Origin mismatch (lenient mode, allowing): expected ${iframeOrigin}, got ${event.origin}`, event)
				}
			}

			// Validate data is a plain object (RPC envelope)
			if (typeof event.data !== 'object' || event.data === null) {
				rejectedCountRef.current++
				onRejectedMessage?.('Message data is not an object', event)
				return
			}

			// Log inbound message for DevTools
			const inboundData = event.data as { cmd?: string; nonce?: string }
			dispatch({
				type: 'ADD_ACTIVITY_RPC_LOG',
				entry: {
					id: `rpc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
					timestamp: Date.now(),
					direction: 'inbound',
					cmd: inboundData.cmd,
					nonce: inboundData.nonce,
					data: event.data
				}
			})

			// Forward to backend via Stage WS
			try {
				const result = await sendCommand('activity_rpc', {
					message: event.data,
					frame_id: frameId,
					instance_id: instanceId
				})

				forwardedCountRef.current++

				// Post outbound messages back to iframe
				const outbound = (result as { outbound?: unknown[] })?.outbound
				if (Array.isArray(outbound) && iframeRef.current?.contentWindow) {
					const target = originMode === 'lenient' ? '*' : (iframeOrigin || '*')
					for (const msg of outbound) {
						iframeRef.current.contentWindow.postMessage(msg, target)

						// Log outbound message for DevTools
						const msgObj = msg as { cmd?: string; evt?: string; nonce?: string; data?: unknown }

						// Capture READY payload
						if (msgObj.evt === 'READY') {
							dispatch({ type: 'SET_ACTIVITY_LAST_READY', payload: msgObj.data as object })
						}

						// Track subscriptions
						if (msgObj.cmd === 'SUBSCRIBE' && msgObj.data) {
							const evtName = (msgObj.data as { evt?: string }).evt
							if (evtName) {
								dispatch({ type: 'ADD_ACTIVITY_SUBSCRIPTION', eventName: evtName })
							}
						}
						if (msgObj.cmd === 'UNSUBSCRIBE' && msgObj.data) {
							const evtName = (msgObj.data as { evt?: string }).evt
							if (evtName) {
								dispatch({ type: 'REMOVE_ACTIVITY_SUBSCRIPTION', eventName: evtName })
							}
						}

						dispatch({
							type: 'ADD_ACTIVITY_RPC_LOG',
							entry: {
								id: `rpc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
								timestamp: Date.now(),
								direction: 'outbound',
								cmd: msgObj.cmd,
								evt: msgObj.evt,
								nonce: msgObj.nonce,
								data: msgObj.data,
								error: msgObj.evt === 'ERROR'
							}
						})
					}
				}
			} catch (err) {
				rejectedCountRef.current++
				onRejectedMessage?.(`Failed to forward RPC: ${err instanceof Error ? err.message : String(err)}`, event)
			}
		}

		// Register EARLY -- must be before iframe sets its src
		window.addEventListener('message', handleMessage)
		return () => window.removeEventListener('message', handleMessage)
	}, [enabled, frameId, instanceId, iframeOrigin, iframeRef, sendCommand, onRejectedMessage, originMode, dispatch])

	// Handle async outbound messages from backend (via state)
	const asyncOutbound = state.activityAsyncOutbound
	useEffect(() => {
		if (!asyncOutbound?.length || !iframeRef.current?.contentWindow) return
		const target = originMode === 'lenient' ? '*' : (iframeOrigin || '*')
		for (const msg of asyncOutbound) {
			iframeRef.current.contentWindow.postMessage(msg, target)

			// Log async outbound message for DevTools
			const msgObj = msg as { cmd?: string; evt?: string; nonce?: string; data?: unknown }
			if (msgObj.evt === 'READY') {
				dispatch({ type: 'SET_ACTIVITY_LAST_READY', payload: msgObj.data as object })
			}
			dispatch({
				type: 'ADD_ACTIVITY_RPC_LOG',
				entry: {
					id: `rpc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
					timestamp: Date.now(),
					direction: 'outbound',
					cmd: msgObj.cmd,
					evt: msgObj.evt,
					nonce: msgObj.nonce,
					data: msgObj.data,
					error: msgObj.evt === 'ERROR'
				}
			})
		}
		// Clear after posting
		dispatch({ type: 'CLEAR_ACTIVITY_ASYNC_OUTBOUND' })
	}, [asyncOutbound, iframeRef, iframeOrigin, originMode, dispatch])

	return {
		forwardedCount: forwardedCountRef.current,
		rejectedCount: rejectedCountRef.current
	}
}
