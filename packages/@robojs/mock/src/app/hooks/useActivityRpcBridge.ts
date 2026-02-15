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

	type RpcTuple = [number, unknown]
	const isRpcTuple = (value: unknown): value is RpcTuple =>
		Array.isArray(value) && value.length >= 2 && typeof value[0] === 'number'

	const getPayload = (message: unknown): unknown => {
		if (isRpcTuple(message)) return message[1]
		return message
	}

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

			// Validate data matches Embedded SDK transport (tuple) or legacy object payload
			const data = event.data as unknown
			const payload = getPayload(data)

			// Diagnostic channel from proxy-injected scripts (non-RPC).
			if (!isRpcTuple(data) && typeof payload === 'object' && payload !== null) {
				const diag = payload as { __robo_mock?: unknown }
				if (diag.__robo_mock === 'csp_violation') {
					dispatch({
						type: 'ADD_ACTIVITY_RPC_LOG',
						entry: {
							id: `rpc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
							timestamp: Date.now(),
							direction: 'inbound',
							cmd: 'CSP_VIOLATION',
							data: payload,
							error: true
						}
					})
					onRejectedMessage?.('CSP violation reported by Activity iframe', event)
					return
				}
			}

			if (isRpcTuple(data)) {
				const opcode = data[0]
				if (![0, 1, 2, 3].includes(opcode)) {
					rejectedCountRef.current++
					onRejectedMessage?.(`Unknown RPC opcode: ${opcode}`, event)
					return
				}
				if (typeof payload !== 'object' || payload === null) {
					rejectedCountRef.current++
					onRejectedMessage?.('RPC payload is not an object', event)
					return
				}
			} else if (typeof payload !== 'object' || payload === null) {
				rejectedCountRef.current++
				onRejectedMessage?.('Message data is not an RPC tuple or object', event)
				return
			}

			// Log inbound message for DevTools
			const inboundData = payload as { cmd?: string; evt?: string | null; nonce?: string | null }
			dispatch({
				type: 'ADD_ACTIVITY_RPC_LOG',
				entry: {
					id: `rpc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
					timestamp: Date.now(),
					direction: 'inbound',
					cmd: inboundData.cmd ?? (isRpcTuple(data) ? `OP_${data[0]}` : undefined),
					evt: inboundData.evt ?? undefined,
					nonce: (typeof inboundData.nonce === 'string' ? inboundData.nonce : undefined),
					data
				}
			})

			// If Activity requests CLOSE, treat it as a close_activity action.
			if (isRpcTuple(data) && data[0] === 2) {
				try {
					await sendCommand('close_activity', {})
				} catch {
					// Ignore close failures (may already be closed)
				}
				return
			}

			// Forward to backend via Stage WS
			try {
				const result = await sendCommand('activity_rpc', {
					message: data,
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
						const outPayload = getPayload(msg)
						const msgObj = outPayload as { cmd?: string; evt?: string | null; nonce?: string | null; data?: unknown }

						// Capture READY payload
						if (msgObj.cmd === 'DISPATCH' && msgObj.evt === 'READY') {
							dispatch({ type: 'SET_ACTIVITY_LAST_READY', payload: msgObj.data as object })
						}

						// Track auth state from AUTHENTICATE response (success only)
						if (msgObj.cmd === 'AUTHENTICATE' && msgObj.evt === null) {
							const data = msgObj.data as { access_token?: unknown } | undefined
							if (data && typeof data.access_token === 'string') {
								dispatch({ type: 'SET_ACTIVITY_AUTH_STATE', payload: 'AUTHENTICATED' })
							}
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
								evt: (typeof msgObj.evt === 'string' ? msgObj.evt : undefined),
								nonce: (typeof msgObj.nonce === 'string' ? msgObj.nonce : undefined),
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
			const outPayload = getPayload(msg)
			const msgObj = outPayload as { cmd?: string; evt?: string | null; nonce?: string | null; data?: unknown }
			if (msgObj.cmd === 'DISPATCH' && msgObj.evt === 'READY') {
				dispatch({ type: 'SET_ACTIVITY_LAST_READY', payload: msgObj.data as object })
			}
			if (msgObj.cmd === 'AUTHENTICATE' && msgObj.evt === null) {
				const data = msgObj.data as { access_token?: unknown } | undefined
				if (data && typeof data.access_token === 'string') {
					dispatch({ type: 'SET_ACTIVITY_AUTH_STATE', payload: 'AUTHENTICATED' })
				}
			}
			dispatch({
				type: 'ADD_ACTIVITY_RPC_LOG',
				entry: {
					id: `rpc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
					timestamp: Date.now(),
					direction: 'outbound',
					cmd: msgObj.cmd,
					evt: (typeof msgObj.evt === 'string' ? msgObj.evt : undefined),
					nonce: (typeof msgObj.nonce === 'string' ? msgObj.nonce : undefined),
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
