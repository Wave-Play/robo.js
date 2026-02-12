/**
 * Mock Voice Gateway WebSocket Server
 *
 * Handles voice WebSocket connections from @discordjs/voice library.
 * Implements the Discord Voice Gateway protocol to allow bots to establish
 * mock voice connections for testing.
 *
 * Uses TLS (wss://) because @discordjs/voice always connects via wss://.
 *
 * @see https://discord.com/developers/docs/topics/voice-connections
 */

import type { IncomingMessage } from 'node:http'
import https from 'node:https'
import type { Duplex } from 'node:stream'
import WebSocket, { WebSocketServer } from 'ws'
import { mockLogger } from './logger.js'
import { sessionManager } from './manager.js'
import { VoiceOpcode, type VoiceGatewayConnection, type VoiceServerState } from '../types/index.js'
import { generateSnowflake } from '../utils/snowflake.js'
import { generateSelfSignedCert } from '../utils/tls.js'

/** Default voice heartbeat interval (ms) */
const DEFAULT_VOICE_HEARTBEAT_INTERVAL = 41250

/** Voice gateway port */
export const VOICE_GATEWAY_PORT = 50001

/** Mock UDP port for voice data */
const MOCK_UDP_PORT = 50002

/** Supported encryption modes */
const SUPPORTED_MODES = ['xsalsa20_poly1305_lite', 'xsalsa20_poly1305', 'xsalsa20_poly1305_suffix']

/** SSRC counter for unique identifiers */
let ssrcCounter = 1

/**
 * Voice Gateway WebSocket Server
 * Handles voice connections from @discordjs/voice
 * Uses HTTPS/WSS because @discordjs/voice always connects via wss://
 */
export class VoiceGatewayServer {
	private wss: WebSocketServer | null = null
	private httpsServer: https.Server | null = null
	private connections: Map<WebSocket, VoiceGatewayConnection> = new Map()
	private heartbeatInterval: number = DEFAULT_VOICE_HEARTBEAT_INTERVAL
	private started = false

	constructor() {
		// Server will be started on demand
	}

	/**
	 * Start the voice gateway server with TLS
	 */
	async start(port: number = VOICE_GATEWAY_PORT): Promise<void> {
		if (this.started) {
			return
		}

		// Generate self-signed certificate for testing (async)
		const { key, cert } = await generateSelfSignedCert()

		return new Promise((resolve, reject) => {
			try {

				// Create HTTPS server
				this.httpsServer = https.createServer({ key, cert })

				// Create WebSocket server attached to HTTPS server
				this.wss = new WebSocketServer({ server: this.httpsServer })

				this.wss.on('connection', this.handleConnection.bind(this))

				this.wss.on('error', (error) => {
					mockLogger.error(`Voice Gateway WebSocket error: ${error.message}`)
				})

				this.httpsServer.on('error', (error) => {
					mockLogger.error(`Voice Gateway HTTPS error: ${error.message}`)
					reject(error)
				})

				this.httpsServer.listen(port, () => {
					this.started = true
					mockLogger.info(`Voice Gateway WSS server ready on port ${port}`)
					resolve()
				})
			} catch (error) {
				reject(error)
			}
		})
	}

	/**
	 * Stop the voice gateway server
	 */
	async stop(): Promise<void> {
		if (!this.started) {
			return
		}

		return new Promise((resolve) => {
			// Close all connections
			for (const ws of this.connections.keys()) {
				ws.close(1000, 'Server shutting down')
			}
			this.connections.clear()

			// Close WebSocket server
			if (this.wss) {
				this.wss.close()
				this.wss = null
			}

			// Close HTTPS server
			if (this.httpsServer) {
				this.httpsServer.close(() => {
					this.started = false
					this.httpsServer = null
					mockLogger.info('Voice Gateway server stopped')
					resolve()
				})
			} else {
				this.started = false
				resolve()
			}
		})
	}

	/**
	 * Check if server is running
	 */
	isRunning(): boolean {
		return this.started
	}

	/**
	 * Handle HTTP upgrade for voice gateway
	 * Called when connecting via URL like wss://localhost:50001/?v=4
	 */
	handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
		if (!this.wss) {
			socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n')
			socket.destroy()
			return
		}

		const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)

		// Voice gateway uses v4
		const version = url.searchParams.get('v')
		if (version !== '4') {
			mockLogger.warn(`Voice Gateway: Rejected connection - invalid version "${version}" (expected 4)`)
			socket.write('HTTP/1.1 400 Bad Request\r\n\r\nInvalid voice API version\r\n')
			socket.destroy()
			return
		}

		this.wss.handleUpgrade(req, socket, head, (ws) => {
			this.wss!.emit('connection', ws, req)
		})
	}

	/**
	 * Handle new WebSocket connection
	 */
	private handleConnection(ws: WebSocket, _req: IncomingMessage): void {
		const connectionId = generateSnowflake()

		// Create connection state
		const connection: VoiceGatewayConnection = {
			id: connectionId,
			sessionId: '',
			guildId: '',
			identified: false,
			ssrc: ssrcCounter++,
			lastHeartbeat: Date.now(),
			heartbeatInterval: this.heartbeatInterval
		}

		this.connections.set(ws, connection)

		mockLogger.debug(`Voice Gateway: New connection ${connectionId}`)

		// Send Hello immediately on connection
		this.sendHello(ws, connection)

		// Set up message handler
		ws.on('message', (data) => {
			this.handleMessage(ws, connection, data)
		})

		// Set up close handler
		ws.on('close', (code, reason) => {
			mockLogger.debug(`Voice Gateway: Connection ${connectionId} closed (${code}: ${reason.toString()})`)
			this.connections.delete(ws)
		})

		// Set up error handler
		ws.on('error', (error) => {
			mockLogger.error(`Voice Gateway: Connection ${connectionId} error: ${error.message}`)
		})
	}

	/**
	 * Send Hello opcode to client
	 */
	private sendHello(ws: WebSocket, connection: VoiceGatewayConnection): void {
		const payload = {
			op: VoiceOpcode.Hello,
			d: {
				heartbeat_interval: connection.heartbeatInterval
			}
		}

		this.send(ws, payload)
		mockLogger.debug(`Voice Gateway: Sent Hello to ${connection.id}`)
	}

	/**
	 * Handle incoming message
	 */
	private handleMessage(ws: WebSocket, connection: VoiceGatewayConnection, data: WebSocket.RawData): void {
		let payload: { op: number; d: unknown }

		try {
			payload = JSON.parse(data.toString())
		} catch {
			mockLogger.warn(`Voice Gateway: Invalid JSON from ${connection.id}`)
			return
		}

		const { op, d } = payload

		switch (op) {
			case VoiceOpcode.Identify:
				this.handleIdentify(ws, connection, d as IdentifyPayload)
				break

			case VoiceOpcode.SelectProtocol:
				this.handleSelectProtocol(ws, connection, d as SelectProtocolPayload)
				break

			case VoiceOpcode.Heartbeat:
				this.handleHeartbeat(ws, connection, d as number)
				break

			case VoiceOpcode.Resume:
				this.handleResume(ws, connection, d as ResumePayload)
				break

			case VoiceOpcode.Speaking:
				// Speaking opcode - just acknowledge, no response needed
				mockLogger.debug(`Voice Gateway: Speaking update from ${connection.id}`)
				break

			case VoiceOpcode.ClientDisconnect:
				// Client disconnecting - clean up
				mockLogger.debug(`Voice Gateway: Client disconnect from ${connection.id}`)
				ws.close(1000, 'Client requested disconnect')
				break

			default:
				mockLogger.warn(`Voice Gateway: Unknown opcode ${op} from ${connection.id}`)
		}
	}

	/**
	 * Handle Identify opcode (op 0)
	 */
	private handleIdentify(ws: WebSocket, connection: VoiceGatewayConnection, data: IdentifyPayload): void {
		const { server_id, user_id, session_id, token } = data

		mockLogger.debug(`Voice Gateway: Identify from ${connection.id} - guild=${server_id}, user=${user_id}`)

		// Validate the token against stored voice server state
		const session = this.findSessionByVoiceToken(token, server_id)

		if (!session) {
			mockLogger.warn(`Voice Gateway: Invalid token for guild ${server_id}`)
			ws.close(4004, 'Authentication failed')
			return
		}

		// Update connection state
		connection.sessionId = session_id
		connection.guildId = server_id
		connection.identified = true

		// Send Ready response
		const readyPayload = {
			op: VoiceOpcode.Ready,
			d: {
				ssrc: connection.ssrc,
				ip: '127.0.0.1',
				port: MOCK_UDP_PORT,
				modes: SUPPORTED_MODES,
				heartbeat_interval: connection.heartbeatInterval
			}
		}

		this.send(ws, readyPayload)
		mockLogger.debug(`Voice Gateway: Sent Ready to ${connection.id}`)
	}

	/**
	 * Handle Select Protocol opcode (op 1)
	 */
	private handleSelectProtocol(ws: WebSocket, connection: VoiceGatewayConnection, data: SelectProtocolPayload): void {
		if (!connection.identified) {
			mockLogger.warn(`Voice Gateway: SelectProtocol before Identify from ${connection.id}`)
			ws.close(4003, 'Not authenticated')
			return
		}

		const { protocol, data: protocolData } = data

		if (protocol !== 'udp') {
			mockLogger.warn(`Voice Gateway: Unsupported protocol "${protocol}" from ${connection.id}`)
			return
		}

		mockLogger.debug(`Voice Gateway: SelectProtocol from ${connection.id} - mode=${protocolData.mode}`)

		// Verify the mode is supported
		if (!SUPPORTED_MODES.includes(protocolData.mode)) {
			mockLogger.warn(`Voice Gateway: Unsupported mode "${protocolData.mode}"`)
			return
		}

		// Send Session Description
		const sessionDescPayload = {
			op: VoiceOpcode.SessionDescription,
			d: {
				mode: protocolData.mode,
				secret_key: new Array(32).fill(0) // Mock 32-byte key (all zeros for testing)
			}
		}

		this.send(ws, sessionDescPayload)
		mockLogger.debug(`Voice Gateway: Sent SessionDescription to ${connection.id}`)
	}

	/**
	 * Handle Heartbeat opcode (op 3)
	 */
	private handleHeartbeat(ws: WebSocket, connection: VoiceGatewayConnection, nonce: number): void {
		connection.lastHeartbeat = Date.now()

		// Send Heartbeat ACK
		const ackPayload = {
			op: VoiceOpcode.HeartbeatAck,
			d: nonce
		}

		this.send(ws, ackPayload)
	}

	/**
	 * Handle Resume opcode (op 7)
	 */
	private handleResume(ws: WebSocket, connection: VoiceGatewayConnection, _data: ResumePayload): void {
		mockLogger.debug(`Voice Gateway: Resume attempt from ${connection.id}`)

		// For mock purposes, just send Resumed
		const resumedPayload = {
			op: VoiceOpcode.Resumed,
			d: null
		}

		this.send(ws, resumedPayload)
		connection.identified = true
	}

	/**
	 * Send a payload to a WebSocket connection
	 */
	private send(ws: WebSocket, payload: unknown): void {
		if (ws.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify(payload))
		}
	}

	/**
	 * Find a session by voice token
	 */
	private findSessionByVoiceToken(token: string, guildId: string): { id: string } | null {
		// Look through all sessions to find one with a matching voice server state
		for (const session of sessionManager.getAll()) {
			const voiceState = (session as SessionWithVoiceServers).voiceServers?.get(guildId)
			if (voiceState && voiceState.token === token) {
				return { id: session.id }
			}
		}

		// Also check if token matches the expected format and guild exists
		// This is a fallback for simpler testing scenarios
		if (token.startsWith('mock-voice-')) {
			return { id: 'mock-session' }
		}

		return null
	}

	/**
	 * Send an error to a specific voice connection by guild ID
	 */
	sendError(guildId: string, message: string, code: number = 4000): void {
		for (const [ws, connection] of this.connections) {
			if (connection.guildId === guildId) {
				ws.close(code, message)
				mockLogger.debug(`Voice Gateway: Sent error to ${connection.id}: ${message}`)
			}
		}
	}

}

// Payload type definitions
interface IdentifyPayload {
	server_id: string
	user_id: string
	session_id: string
	token: string
}

interface SelectProtocolPayload {
	protocol: string
	data: {
		address: string
		port: number
		mode: string
	}
}

interface ResumePayload {
	server_id: string
	session_id: string
	token: string
}

// Extended session type for voice servers
interface SessionWithVoiceServers {
	voiceServers?: Map<string, VoiceServerState>
}

// Singleton instance
let voiceGatewayServer: VoiceGatewayServer | null = null

/**
 * Get the voice gateway server instance
 */
export function getVoiceGatewayServer(): VoiceGatewayServer {
	if (!voiceGatewayServer) {
		voiceGatewayServer = new VoiceGatewayServer()
	}
	return voiceGatewayServer
}

/**
 * Start the voice gateway server
 */
export async function startVoiceGateway(port?: number): Promise<VoiceGatewayServer> {
	const server = getVoiceGatewayServer()
	await server.start(port)
	return server
}

/**
 * Stop the voice gateway server
 */
export async function stopVoiceGateway(): Promise<void> {
	if (voiceGatewayServer) {
		await voiceGatewayServer.stop()
	}
}

/**
 * Send a voice error to a specific session/guild combination
 * @returns true if an error was sent, false if no connection found
 */
export function sendVoiceError(sessionId: string, guildId: string, code: number, message: string): boolean {
	const server = getVoiceGatewayServer()
	if (!server.isRunning()) {
		return false
	}

	// Find connections for this guild and send error
	let found = false
	// Access private connections via type assertion (necessary for test/error handling)
	const connections = (server as unknown as { connections: Map<WebSocket, VoiceGatewayConnection> }).connections
	for (const [ws, connection] of connections) {
		if (connection.guildId === guildId) {
			ws.close(code, message)
			mockLogger.debug(`Voice Gateway: Sent error to session=${sessionId}, guild=${guildId}: ${message}`)
			found = true
		}
	}

	return found
}
