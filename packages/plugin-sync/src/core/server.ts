import { syncLogger } from './logger.js'
import { normalizeKey } from './utils.js'
import { getServerEngine } from '@robojs/server'
import { NodeEngine } from '@robojs/server/engines.js'
import { nanoid } from 'nanoid'
import { color } from 'robo.js'
import WebSocket, { WebSocketServer } from 'ws'
import type { MessagePayload } from '../core/types.js'

export const SyncServer = { getSocketServer, start }

interface Connection {
	id: string
	isAlive: boolean
	watch: string[]
	ws: WebSocket
}

const _connections: Array<Connection> = []
const _state: Record<string, unknown> = {}
let _wss: WebSocketServer | undefined

function getSocketServer() {
	return _wss
}

/**
 * Utility function to handle broadcasting updates to connections.
 */
function broadcastUpdate(cleanKey: string, data: unknown, key?: string[]) {
	const broadcastCount = _connections
		.filter((c) => c.watch.includes(cleanKey))
		.forEach((c) => {
			syncLogger.debug(`Broadcasting ${color.bold(cleanKey)} state update to:`, c.id)
			const broadcast: MessagePayload = { data, key, type: 'update' }
			c.ws.send(JSON.stringify(broadcast))
		})
	syncLogger.debug(`Broadcasted ${color.bold(cleanKey)} state update to ${broadcastCount} connections.`)
}

/**
 * Handle incoming message from a WebSocket connection.
 */
function handleMessage(connection: Connection, message: string) {
	const payload: MessagePayload = JSON.parse(message)
	const { data, key, type } = payload
	syncLogger.debug(`Received from ${connection.id}:`, payload)

	if (!type) {
		syncLogger.error('Payload type is missing!')
		return
	}

	if (!['ping', 'pong'].includes(type) && !key) {
		syncLogger.error('Payload key is missing!')
		return
	}

	const cleanKey = key ? normalizeKey(key) : ''
	switch (type) {
		case 'pong':
			connection.isAlive = true
			break

		case 'get': {
			// Send the current state to the client
			const response: MessagePayload = { data: _state[cleanKey], key, type: 'update' }
			syncLogger.debug(`Sending to ${connection.id}:`, response)
			connection.ws.send(JSON.stringify(response))
			break
		}

		case 'on': {
			if (!connection.watch.includes(cleanKey)) {
				connection.watch.push(cleanKey)
				syncLogger.debug(`Connection ${connection.id} is now watching:`, connection.watch)
			}

			// Send the current state to the client if it exists
			if (_state[cleanKey]) {
				const response: MessagePayload = { data: _state[cleanKey], key, type: 'update' }
				syncLogger.debug(`Sending to ${connection.id}:`, response)
				connection.ws.send(JSON.stringify(response))
			}
			break
		}

		case 'off': {
			const index = connection.watch.indexOf(cleanKey)
			if (index > -1) {
				connection.watch.splice(index, 1)
				syncLogger.debug(`Connection ${connection.id} stopped watching:`, cleanKey)
			}
			break
		}

		case 'update': {
			_state[cleanKey] = data
			syncLogger.debug(`State updated for ${cleanKey}. Broadcasting...`)
			broadcastUpdate(cleanKey, data, key)
			break
		}

		default:
			syncLogger.warn(`Unsupported message type: ${type}`)
			break
	}
}

/**
 * Periodically ping connections to check if they are still alive.
 */
function monitorConnections() {
	const deadConnections: number[] = []

	_connections.forEach((conn, index) => {
		if (!conn.isAlive) {
			syncLogger.warn(`Connection ${conn.id} is dead. Terminating...`)
			conn.ws.terminate()
			deadConnections.push(index)
		} else {
			conn.isAlive = false
			const ping: MessagePayload = { data: undefined, type: 'ping' }
			conn.ws.send(JSON.stringify(ping))
		}
	})

	deadConnections.forEach((index) => _connections.splice(index, 1))
}

/**
 * Set up connection event handlers for WebSocket.
 */
function handleConnection(ws: WebSocket) {
	const connection: Connection = { id: nanoid(), isAlive: true, watch: [], ws }
	_connections.push(connection)
	syncLogger.debug('New connection established!', connection.id)

	ws.on('close', () => {
		syncLogger.debug(`Connection ${connection.id} closed. Removing...`)
		const index = _connections.findIndex((c) => c.id === connection.id)

		if (index > -1) {
			_connections.splice(index, 1)
		}
	})

	ws.on('message', (message) => handleMessage(connection, message.toString()))
}

/**
 * Create and start the WebSocket server.
 */
function start() {
	_wss = new WebSocketServer({ noServer: true })
	syncLogger.debug('WebSocket server created successfully.')

	setInterval(monitorConnections, 30_000)

	_wss.on('connection', handleConnection)

	const engine = getServerEngine<NodeEngine>()
	engine.registerWebsocket('/sync', (req, socket, head) => {
		const wss = getSocketServer()
		wss?.handleUpgrade(req, socket, head, (ws) => {
			wss?.emit('connection', ws, req)
		})
	})
}
