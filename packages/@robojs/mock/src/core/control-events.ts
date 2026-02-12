/**
 * Control Events Hub - WebSocket Event Broadcasting for SDK/Disgraph Clients
 *
 * Provides a lightweight event streaming endpoint separate from the Stage WS.
 * Designed for external clients to subscribe to simulation and control events
 * without the full Stage protocol overhead.
 *
 * Features:
 * - Session-scoped connections via query params
 * - Monotonic sequence numbers for event ordering
 * - Event buffering for reconnection replay
 * - Automatic cleanup of stale connections/buffers
 */

import { WebSocket, WebSocketServer } from 'ws'
import type { IncomingMessage } from 'http'
import type { Duplex } from 'stream'
import { sessionManager } from './manager.js'
import { mockLogger } from './logger.js'
import { parseMockToken } from '../utils/id.js'

// ============================================================================
// Types
// ============================================================================

/** Connection state for each WebSocket client */
interface ControlEventConnection {
	/** Session ID this connection is subscribed to */
	sessionId: string
	/** Last sequence number sent to this client */
	lastSeq: number
	/** Connection timestamp */
	connectedAt: number
}

/** Buffered event for replay on reconnection */
interface BufferedControlEvent {
	/** Monotonic sequence number (per session) */
	seq: number
	/** Event timestamp (Unix ms) */
	timestamp: number
	/** Event type (e.g., "scenario.step.completed") */
	type: string
	/** Event-specific payload */
	data: unknown
}

/** Session buffer metadata for cleanup tracking */
interface SessionBufferMeta {
	/** Buffered events */
	events: BufferedControlEvent[]
	/** Last activity timestamp for cleanup */
	lastActivity: number
}

// ============================================================================
// ControlEventsHub Class
// ============================================================================

/**
 * WebSocket hub for broadcasting control/simulation events to SDK clients.
 *
 * Endpoint: /api/control/events?session_id=<session_id>
 *
 * Query params:
 * - session_id (required): Session to subscribe to
 * - token (optional): Alternative auth via "mock:session_id" format
 * - last_seq (optional): Resume from sequence number for replay
 */
export class ControlEventsHub {
	private wss: WebSocketServer
	private connections = new Map<WebSocket, ControlEventConnection>()
	private eventBuffers = new Map<string, SessionBufferMeta>()
	private sessionSequences = new Map<string, number>()

	/** Maximum events to buffer per session */
	private readonly MAX_BUFFER_SIZE = 500
	/** Cleanup interval for stale buffers (30 minutes) */
	private readonly BUFFER_CLEANUP_INTERVAL = 30 * 60 * 1000
	/** Buffer inactivity timeout (30 minutes) */
	private readonly BUFFER_INACTIVITY_TIMEOUT = 30 * 60 * 1000

	private cleanupTimer: ReturnType<typeof setInterval> | null = null

	constructor() {
		this.wss = new WebSocketServer({ noServer: true })
		this.setupCleanup()
		mockLogger.debug('ControlEventsHub initialized')
	}

	// ============================================================================
	// WebSocket Upgrade Handling
	// ============================================================================

	/**
	 * Handle HTTP upgrade to WebSocket connection.
	 * Called by the server engine when a client connects to /api/control/events
	 */
	handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
		// Parse query params from URL
		const url = new URL(req.url ?? '', `http://${req.headers.host ?? 'localhost'}`)
		const sessionId = this.extractSessionId(url)
		const lastSeq = parseInt(url.searchParams.get('last_seq') ?? '0', 10)

		// Validate session_id is provided
		if (!sessionId) {
			mockLogger.debug('Control events connection rejected: missing session_id')
			socket.write('HTTP/1.1 400 Bad Request\r\n\r\n')
			socket.destroy()
			return
		}

		// Validate session exists
		const session = sessionManager.get(sessionId)
		if (!session) {
			mockLogger.debug(`Control events connection rejected: session not found (${sessionId})`)
			socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
			socket.destroy()
			return
		}

		// Upgrade to WebSocket
		this.wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
			this.onConnection(ws, sessionId, lastSeq)
		})
	}

	/**
	 * Extract session ID from URL query params.
	 * Supports both session_id param and token param (mock:session_id format).
	 */
	private extractSessionId(url: URL): string | null {
		// Direct session_id param takes precedence
		const sessionId = url.searchParams.get('session_id')
		if (sessionId) {
			return sessionId
		}

		// Try token param (mock:session_id format)
		const token = url.searchParams.get('token')
		if (token) {
			return parseMockToken(token)
		}

		return null
	}

	// ============================================================================
	// Connection Management
	// ============================================================================

	/**
	 * Handle new WebSocket connection.
	 */
	private onConnection(ws: InstanceType<typeof WebSocket>, sessionId: string, lastSeq: number): void {
		// Track connection
		const connState: ControlEventConnection = {
			sessionId,
			lastSeq,
			connectedAt: Date.now()
		}
		this.connections.set(ws, connState)

		mockLogger.debug(`Control events client connected for session ${sessionId}`)

		// Replay buffered events if last_seq provided
		if (lastSeq > 0) {
			this.replayEvents(ws, sessionId, lastSeq)
		}

		// Handle client messages (ping/pong or future commands)
		ws.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
			this.onMessage(ws, data)
		})

		// Handle disconnection
		ws.on('close', () => {
			this.onClose(ws)
		})

		// Handle errors
		ws.on('error', (error: Error) => {
			mockLogger.debug(`Control events client error: ${error.message}`)
			this.onClose(ws)
		})
	}

	/**
	 * Handle client message.
	 * Currently minimal - just log for debugging.
	 */
	private onMessage(ws: InstanceType<typeof WebSocket>, data: Buffer | ArrayBuffer | Buffer[]): void {
		// Parse message
		let message: unknown
		try {
			message = JSON.parse(String(data))
		} catch {
			// Ignore invalid JSON
			return
		}

		// Handle ping (respond with pong)
		if (typeof message === 'object' && message !== null && 'type' in message) {
			const msg = message as { type: string }
			if (msg.type === 'ping') {
				ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }))
			}
		}
	}

	/**
	 * Handle WebSocket close.
	 */
	private onClose(ws: WebSocket): void {
		const conn = this.connections.get(ws)
		if (conn) {
			mockLogger.debug(`Control events client disconnected from session ${conn.sessionId}`)
		}
		this.connections.delete(ws)
	}

	// ============================================================================
	// Event Broadcasting
	// ============================================================================

	/**
	 * Broadcast an event to all clients subscribed to a session.
	 *
	 * @param sessionId - Session ID to broadcast to
	 * @param type - Event type (e.g., "scenario.step.completed")
	 * @param data - Event payload
	 */
	broadcast(sessionId: string, type: string, data: unknown): void {
		const seq = this.getNextSeq(sessionId)
		const event: BufferedControlEvent = {
			seq,
			timestamp: Date.now(),
			type,
			data
		}

		// Buffer for replay
		this.bufferEvent(sessionId, event)

		// Send to all connected clients for this session
		const payload = JSON.stringify(event)
		let sentCount = 0

		for (const [ws, conn] of this.connections) {
			if (conn.sessionId === sessionId && ws.readyState === WebSocket.OPEN) {
				conn.lastSeq = seq
				ws.send(payload)
				sentCount++
			}
		}

		if (sentCount > 0) {
			mockLogger.debug(`Control event broadcast: ${type} to ${sentCount} client(s) for session ${sessionId}`)
		}
	}

	/**
	 * Get the next sequence number for a session.
	 */
	private getNextSeq(sessionId: string): number {
		const current = this.sessionSequences.get(sessionId) ?? 0
		const next = current + 1
		this.sessionSequences.set(sessionId, next)
		return next
	}

	// ============================================================================
	// Event Buffering & Replay
	// ============================================================================

	/**
	 * Buffer an event for potential replay on reconnection.
	 */
	private bufferEvent(sessionId: string, event: BufferedControlEvent): void {
		let buffer = this.eventBuffers.get(sessionId)
		if (!buffer) {
			buffer = { events: [], lastActivity: Date.now() }
			this.eventBuffers.set(sessionId, buffer)
		}

		buffer.events.push(event)
		buffer.lastActivity = Date.now()

		// Enforce max buffer size (remove oldest events)
		if (buffer.events.length > this.MAX_BUFFER_SIZE) {
			const overflow = buffer.events.length - this.MAX_BUFFER_SIZE
			buffer.events.splice(0, overflow)
		}
	}

	/**
	 * Replay buffered events to a client that reconnected with last_seq.
	 */
	private replayEvents(ws: WebSocket, sessionId: string, lastSeq: number): void {
		const buffer = this.eventBuffers.get(sessionId)
		if (!buffer) {
			return
		}

		// Find events with seq > lastSeq
		const eventsToReplay = buffer.events.filter((e) => e.seq > lastSeq)

		if (eventsToReplay.length > 0) {
			mockLogger.debug(`Replaying ${eventsToReplay.length} events for session ${sessionId} (from seq ${lastSeq})`)

			for (const event of eventsToReplay) {
				if (ws.readyState === WebSocket.OPEN) {
					ws.send(JSON.stringify(event))
				}
			}

			// Update connection's lastSeq
			const conn = this.connections.get(ws)
			if (conn && eventsToReplay.length > 0) {
				conn.lastSeq = eventsToReplay[eventsToReplay.length - 1].seq
			}
		}
	}

	// ============================================================================
	// Cleanup
	// ============================================================================

	/**
	 * Setup periodic cleanup of stale buffers.
	 */
	private setupCleanup(): void {
		this.cleanupTimer = setInterval(() => {
			this.cleanupStaleBuffers()
		}, this.BUFFER_CLEANUP_INTERVAL)

		// Don't prevent process exit
		if (this.cleanupTimer.unref) {
			this.cleanupTimer.unref()
		}
	}

	/**
	 * Remove buffers that haven't had activity in BUFFER_INACTIVITY_TIMEOUT.
	 */
	private cleanupStaleBuffers(): void {
		const now = Date.now()
		let cleanedCount = 0

		for (const [sessionId, buffer] of this.eventBuffers) {
			if (now - buffer.lastActivity > this.BUFFER_INACTIVITY_TIMEOUT) {
				this.eventBuffers.delete(sessionId)
				this.sessionSequences.delete(sessionId)
				cleanedCount++
			}
		}

		if (cleanedCount > 0) {
			mockLogger.debug(`Cleaned up ${cleanedCount} stale control event buffer(s)`)
		}
	}

	/**
	 * Destroy the hub and close all connections.
	 */
	destroy(): void {
		if (this.cleanupTimer) {
			clearInterval(this.cleanupTimer)
			this.cleanupTimer = null
		}

		// Close all connections
		for (const ws of this.connections.keys()) {
			ws.close(1001, 'Server shutting down')
		}
		this.connections.clear()
		this.eventBuffers.clear()
		this.sessionSequences.clear()

		this.wss.close()
		mockLogger.debug('ControlEventsHub destroyed')
	}
}

// ============================================================================
// Singleton
// ============================================================================

let instance: ControlEventsHub | null = null

/**
 * Get the singleton ControlEventsHub instance.
 * Creates the instance on first call.
 */
export function getControlEventsHub(): ControlEventsHub {
	if (!instance) {
		instance = new ControlEventsHub()
	}
	return instance
}

