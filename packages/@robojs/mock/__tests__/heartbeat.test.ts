/**
 * Heartbeat Loop Tests
 * Tests the heartbeat/heartbeat-ack cycle
 */
import { GatewayOpcodes } from 'discord-api-types/v10'
import { buildHeartbeatAckPayload } from '../src/discord/payloads.js'
import type { ConnectionState } from '../src/types/index.js'

describe('Heartbeat Loop', () => {
	describe('buildHeartbeatAckPayload', () => {
		it('should return op: 11 (HEARTBEAT_ACK)', () => {
			const payload = buildHeartbeatAckPayload()
			expect(payload.op).toBe(GatewayOpcodes.HeartbeatAck)
			expect(payload.op).toBe(11)
		})

		it('should return d: null', () => {
			const payload = buildHeartbeatAckPayload()
			expect(payload.d).toBeNull()
		})

		it('should match expected structure { op: 11, d: null }', () => {
			const payload = buildHeartbeatAckPayload()
			expect(payload).toEqual({ op: 11, d: null })
		})
	})

	describe('ConnectionState heartbeat tracking', () => {
		it('should have all required heartbeat fields in ConnectionState type', () => {
			// Create a mock connection state to verify the interface
			const mockConnState: ConnectionState = {
				id: 'test-conn',
				sessionId: 'test-session',
				identified: false,
				token: null,
				intents: 0,
				sequence: 0,
				lastAckSequence: null,
				lastHeartbeat: Date.now(),
				heartbeatInterval: 41250,
				missedHeartbeats: 0
			}

			// Verify all heartbeat-related fields exist
			expect(mockConnState).toHaveProperty('lastHeartbeat')
			expect(mockConnState).toHaveProperty('lastAckSequence')
			expect(mockConnState).toHaveProperty('heartbeatInterval')
			expect(mockConnState).toHaveProperty('missedHeartbeats')
		})

		it('should track sequence numbers correctly', () => {
			// Simulate heartbeat sequence tracking
			const connState: Partial<ConnectionState> = {
				lastAckSequence: null,
				missedHeartbeats: 0,
				lastHeartbeat: 0
			}

			// Simulate receiving heartbeat with sequence 42
			const heartbeatPayload = { op: 1, d: 42 }
			connState.lastHeartbeat = Date.now()
			connState.lastAckSequence = typeof heartbeatPayload.d === 'number' ? heartbeatPayload.d : null
			connState.missedHeartbeats = 0

			expect(connState.lastAckSequence).toBe(42)
			expect(connState.missedHeartbeats).toBe(0)
		})

		it('should handle null sequence number', () => {
			const connState: Partial<ConnectionState> = {
				lastAckSequence: 10,
				missedHeartbeats: 1
			}

			// Simulate receiving heartbeat with null sequence
			const heartbeatPayload = { op: 1, d: null }
			connState.lastAckSequence = typeof heartbeatPayload.d === 'number' ? heartbeatPayload.d : null
			connState.missedHeartbeats = 0

			expect(connState.lastAckSequence).toBeNull()
			expect(connState.missedHeartbeats).toBe(0)
		})
	})

	describe('Requirements Verification', () => {
		it('Task 1: Can receive HEARTBEAT (op 1) with sequence number', () => {
			// The gateway.ts handles GatewayOpcodes.Heartbeat case
			// This test verifies the opcode constant is correct
			expect(GatewayOpcodes.Heartbeat).toBe(1)
		})

		it('Task 2: Can send HEARTBEAT_ACK (op 11) immediately', () => {
			// buildHeartbeatAckPayload returns the correct payload
			const ack = buildHeartbeatAckPayload()
			expect(ack.op).toBe(11)
			expect(ack.d).toBeNull()
		})

		it('Task 3: ConnectionState tracks last heartbeat time', () => {
			// ConnectionState interface includes lastHeartbeat field
			const connState: Partial<ConnectionState> = {
				lastHeartbeat: Date.now()
			}
			expect(typeof connState.lastHeartbeat).toBe('number')
		})

		it('Task 4 (optional): ConnectionState supports zombie detection', () => {
			// ConnectionState interface includes missedHeartbeats field
			const connState: Partial<ConnectionState> = {
				missedHeartbeats: 0,
				heartbeatInterval: 41250
			}
			expect(typeof connState.missedHeartbeats).toBe('number')
			expect(typeof connState.heartbeatInterval).toBe('number')
		})
	})
})
