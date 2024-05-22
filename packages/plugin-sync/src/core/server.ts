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
 * Create and start the WebSocket server.
 */
function start() {
	// Create WebSocket server piggybacking on the HTTP server
	_wss = new WebSocketServer({
		noServer: true
	})
	syncLogger.debug('WebSocket server created successfully.')

	// Keep track of the connection liveness
	setInterval(() => {
		if (_connections.length === 0) {
			return
		}

		syncLogger.debug(`Pinging ${_connections.length} connections...`)
		const deadIndices: number[] = []
		_connections.forEach((conn, index) => {
			if (!conn.isAlive) {
				syncLogger.warn(`Connection ${conn.id} is dead. Terminating...`)
				conn.ws.terminate()
				deadIndices.push(index)
				return
			}

			conn.isAlive = false
			const ping: MessagePayload = { data: undefined, type: 'ping' }
			conn.ws.send(JSON.stringify(ping))
		})

		// Remove dead connections
		deadIndices.forEach((index) => {
			_connections.splice(index, 1)
		})
	}, 30_000)

	// Handle incoming connections
	_wss.on('connection', (ws) => {
		// Register the connection
		const connection: Connection = { id: nanoid(), isAlive: true, watch: [], ws }
		_connections.push(connection)
		syncLogger.debug('New connection established! Registered as', connection.id)

		// Detect disconnections
		ws.on('close', () => {
			const index = _connections.findIndex((c) => c.id === connection.id)
			syncLogger.debug(`Connection ${connection.id} closed. Removing...`)

			if (index > -1) {
				_connections.splice(index, 1)
			}
		})

		ws.on('message', (message) => {
			// Handle incoming messages
			const payload: MessagePayload = JSON.parse(message.toString())
			const { data, key, type } = payload
			syncLogger.debug(`Received from ${connection.id}:`, payload)

			if (!type) {
				syncLogger.error('Payload type is missing!')
				return
			} else if (!['ping', 'pong'].includes(type) && !key) {
				syncLogger.error('Payload key is missing!')
				return
			}

			// Ping responses are... unique
			if (type === 'pong') {
				const conn = _connections.find((c) => c.id === connection.id)

				if (conn) {
					conn.isAlive = true
				}
				return
			}

			// Handle the message based on the type
			const cleanKey = normalizeKey(key)
			let response: MessagePayload | undefined

			switch (type) {
				case 'get':
					// Send the current state to the client
					response = {
						data: _state[cleanKey],
						key: key,
						type: 'update'
					}
					break
				case 'off': {
					// Remove the key from the watch list
					const index = connection.watch.findIndex((k) => k === cleanKey)
					if (index > -1) {
						connection.watch.splice(index, 1)
					}
					syncLogger.debug(`Connection ${connection.id} is now watching:`, connection.watch)
					break
				}
				case 'on': {
					// Add the key to the watch list
					if (!connection.watch.includes(cleanKey)) {
						connection.watch.push(cleanKey)
					}
					syncLogger.debug(`Connection ${connection.id} is now watching:`, connection.watch)

					// Send the current state to the client (if it exists)
					if (_state[cleanKey]) {
						response = {
							data: _state[cleanKey],
							key: key,
							type: 'update'
						}
					}
					break
				}
				case 'ping':
					syncLogger.warn('Should not send pings to the server!')
					break
				case 'update': {
					// Update the state
					_state[cleanKey] = data

					// Broadcast the new state to all connections watching this key
					const broadcastResult = _connections
						.filter((c) => c.watch.includes(cleanKey))
						.map((c) => {
							syncLogger.debug(`Broadcasting ${color.bold(cleanKey)} state update to:`, c.id)
							const broadcast: MessagePayload = { data, key, type: 'update' }
							c.ws.send(JSON.stringify(broadcast))
						})
					syncLogger.debug(`Broadcasted ${color.bold(cleanKey)} state update to ${broadcastResult.length} connections.`)
					break
				}
			}

			if (response) {
				syncLogger.debug(`Sending to ${connection.id}:`, response)
				ws.send(JSON.stringify(response))
			}
		})
	})

	// Handle upgrade requests
	const engine = getServerEngine<NodeEngine>()
	engine.registerWebsocket('/sync', (req, socket, head) => {
		const wss = SyncServer.getSocketServer()
		wss?.handleUpgrade(req, socket, head, function done(ws) {
			wss?.emit('connection', ws, req)
		})
	})
}
