import { useEffect, useRef, useCallback, useState } from 'react'
import { useSessionDispatch } from '../stores/sessionStore'
import type { StageEvent, StageCommand, StageMessageCreateData, StateSyncPayload } from '../types/stage'
import { buildStageWebSocketUrls } from '../utils'

interface UseStageWebSocketOptions {
	sessionId: string | null
	autoConnect?: boolean
}

interface UseStageWebSocketReturn {
	connect: () => void
	disconnect: () => void
	sendCommand: <T = unknown>(type: string, data: unknown) => Promise<T>
	isConnected: boolean
	isConnecting: boolean
	error: string | null
}

export function useStageWebSocket({
	sessionId,
	autoConnect = true
}: UseStageWebSocketOptions): UseStageWebSocketReturn {
	const dispatch = useSessionDispatch()
	const wsRef = useRef<WebSocket | null>(null)
	const reconnectTimeoutRef = useRef<number | null>(null)
	const reconnectAttempts = useRef(0)
	const pendingCommands = useRef<Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>>(
		new Map()
	)

	const [isConnected, setIsConnected] = useState(false)
	const [isConnecting, setIsConnecting] = useState(false)
	const [error, setError] = useState<string | null>(null)

	// Handle incoming events
	const handleEvent = useCallback(
		(event: StageEvent) => {
			switch (event.type) {
				case 'connected':
					dispatch({ type: 'SET_CONNECTED', payload: true })
					break

				case 'state_sync':
					dispatch({ type: 'HANDLE_STATE_SYNC', payload: event.data as StateSyncPayload })
					break

				case 'message_create':
					dispatch({ type: 'HANDLE_MESSAGE_CREATE', payload: event.data as StageMessageCreateData })
					break

				case 'message_update': {
					const updateData = event.data as { message: StageEvent['data'] }
					dispatch({
						type: 'HANDLE_MESSAGE_UPDATE',
						payload: {
							channelId: (updateData.message as { channel_id: string }).channel_id,
							message: updateData.message as Parameters<typeof dispatch>[0] extends { payload: infer P }
								? P extends { message: infer M }
									? M
									: never
								: never
						}
					})
					break
				}

				case 'message_delete': {
					const deleteData = event.data as { channel_id: string; message_id: string }
					dispatch({
						type: 'HANDLE_MESSAGE_DELETE',
						payload: { channelId: deleteData.channel_id, messageId: deleteData.message_id }
					})
					break
				}

				case 'command_response': {
					const responseData = event.data as { command_id: string; success: boolean; result?: unknown; error?: string }
					const pending = pendingCommands.current.get(responseData.command_id)
					if (pending) {
						pendingCommands.current.delete(responseData.command_id)
						if (responseData.success) {
							pending.resolve(responseData.result)
						} else {
							pending.reject(new Error(responseData.error || 'Command failed'))
						}
					}
					break
				}

				case 'heartbeat':
					dispatch({ type: 'SET_HEARTBEAT', payload: Date.now() })
					break

				case 'error': {
					const errorData = event.data as { message: string }
					setError(errorData.message)
					break
				}

				default:
					// Other events just increment the counter
					dispatch({ type: 'INCREMENT_EVENT_COUNT' })
			}
		},
		[dispatch]
	)

	// Connect to WebSocket
	const connect = useCallback(() => {
		if (!sessionId) {
			setError('No session ID provided')
			return
		}

		if (wsRef.current?.readyState === WebSocket.OPEN) {
			return // Already connected
		}

		setIsConnecting(true)
		setError(null)
		dispatch({ type: 'SET_CONNECTING', payload: true })

		const [url] = buildStageWebSocketUrls(sessionId)

		if (!url) {
			setError('Invalid Stage WebSocket URL')
			setIsConnecting(false)
			dispatch({ type: 'SET_ERROR', payload: 'Invalid Stage WebSocket URL' })
			return
		}

		const ws = new WebSocket(url)
		wsRef.current = ws

		ws.onopen = () => {
			setIsConnected(true)
			setIsConnecting(false)
			setError(null)
			reconnectAttempts.current = 0
			dispatch({ type: 'SET_CONNECTED', payload: true })
		}

		ws.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data) as StageEvent
				handleEvent(data)
			} catch (e) {
				console.error('[Stage] Failed to parse WebSocket message:', e)
			}
		}

		ws.onclose = (event) => {
			setIsConnected(false)
			wsRef.current = null
			dispatch({ type: 'SET_CONNECTED', payload: false })

			// Reconnect with exponential backoff unless intentionally closed
			if (event.code !== 1000 && sessionId) {
				const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000)
				reconnectAttempts.current++

				reconnectTimeoutRef.current = window.setTimeout(() => {
					connect()
				}, delay)
			}
		}

		ws.onerror = () => {
			setError('Connection failed')
			setIsConnecting(false)
			dispatch({ type: 'SET_ERROR', payload: 'Connection failed' })
		}
	}, [sessionId, dispatch, handleEvent])

	// Disconnect from WebSocket
	const disconnect = useCallback(() => {
		if (reconnectTimeoutRef.current) {
			clearTimeout(reconnectTimeoutRef.current)
			reconnectTimeoutRef.current = null
		}

		if (wsRef.current) {
			wsRef.current.close(1000, 'Client disconnected')
			wsRef.current = null
		}

		setIsConnected(false)
		setIsConnecting(false)
		dispatch({ type: 'SET_CONNECTED', payload: false })
	}, [dispatch])

	// Send command and wait for response
	const sendCommand = useCallback(<T = unknown>(type: string, data: unknown): Promise<T> => {
		return new Promise((resolve, reject) => {
			if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
				reject(new Error('Not connected'))
				return
			}

			const id = `cmd_${Date.now()}_${Math.random().toString(36).slice(2)}`

			const command: StageCommand = { id, type: type as StageCommand['type'], data }

			// Store pending command for response handling
			pendingCommands.current.set(id, {
				resolve: resolve as (value: unknown) => void,
				reject
			})

			// Send command
			wsRef.current.send(JSON.stringify(command))

			// Timeout after 30s
			setTimeout(() => {
				if (pendingCommands.current.has(id)) {
					pendingCommands.current.delete(id)
					reject(new Error('Command timeout'))
				}
			}, 30000)
		})
	}, [])

	// Auto-connect when session ID is set
	useEffect(() => {
		if (autoConnect && sessionId) {
			connect()
		}

		return () => {
			disconnect()
		}
	}, [sessionId, autoConnect, connect, disconnect])

	return {
		connect,
		disconnect,
		sendCommand,
		isConnected,
		isConnecting,
		error
	}
}
