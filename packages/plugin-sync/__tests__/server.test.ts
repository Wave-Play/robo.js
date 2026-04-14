/**
 * Tests for @robojs/sync server
 *
 * Tests actual server logic with minimal mocking - only the WebSocket transport
 * layer is mocked to allow testing real message handling code.
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals'
import { EventEmitter } from 'events'
import type { MessagePayload } from '../src/core/types.js'

/**
 * Mock WebSocket that behaves like a real WebSocket but captures messages
 */
class MockWebSocket extends EventEmitter {
	static CONNECTING = 0
	static OPEN = 1
	static CLOSING = 2
	static CLOSED = 3

	readyState = MockWebSocket.OPEN
	sentMessages: string[] = []

	send = jest.fn((data: string) => {
		this.sentMessages.push(data)
	})

	close = jest.fn(() => {
		this.readyState = MockWebSocket.CLOSED
		this.emit('close')
	})

	terminate = jest.fn(() => {
		this.readyState = MockWebSocket.CLOSED
	})

	simulateMessage(payload: MessagePayload): void {
		this.emit('message', JSON.stringify(payload))
	}

	getSentPayloads(): MessagePayload[] {
		return this.sentMessages.map((msg) => JSON.parse(msg))
	}

	getSentPayloadsByType(type: string): MessagePayload[] {
		return this.getSentPayloads().filter((p) => p.type === type)
	}

	clearSentMessages(): void {
		this.sentMessages = []
		this.send.mockClear()
	}
}

function createPayload<T = unknown>(
	type: string,
	data?: T,
	key?: string[],
	extra?: Partial<MessagePayload>
): MessagePayload<T> {
	return { type, data, key, ...extra } as MessagePayload<T>
}

async function waitForDebounce(ms = 160): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, ms))
}

// Wait for async handler processing to complete
async function waitForAsyncProcessing(): Promise<void> {
	await new Promise((resolve) => setImmediate(resolve))
}

// Create a fresh mock WSS for each test
let mockWss: EventEmitter & { handleUpgrade: jest.Mock }
let idCounter = 0

// Mock modules before each test
beforeEach(async () => {
	// Reset state
	idCounter = 0
	mockWss = new EventEmitter() as EventEmitter & { handleUpgrade: jest.Mock }
	mockWss.handleUpgrade = jest.fn()

	// Reset module cache to get fresh server state
	jest.resetModules()

	// Re-mock modules with fresh state
	jest.unstable_mockModule('ws', () => ({
		default: { WebSocketServer: jest.fn(() => mockWss) },
		WebSocketServer: jest.fn(() => mockWss)
	}))

	jest.unstable_mockModule('nanoid', () => ({
		nanoid: jest.fn(() => `test-id-${++idCounter}`)
	}))
})

afterEach(() => {
	mockWss.removeAllListeners()
	jest.clearAllMocks()
})

describe('SyncServer', () => {
	async function getServer() {
		const { SyncServer } = await import('../src/core/server.js')
		SyncServer.start()
		return SyncServer
	}

	function createConnection(): MockWebSocket {
		const ws = new MockWebSocket()
		mockWss.emit('connection', ws)
		return ws
	}

	describe('Connection lifecycle', () => {
		test('new connection receives "connected" message with client ID', async () => {
			await getServer()
			const ws = createConnection()

			const connectedMsg = ws.getSentPayloadsByType('connected')[0]
			expect(connectedMsg).toBeDefined()
			expect(connectedMsg.data).toHaveProperty('clientId')
			expect(typeof (connectedMsg.data as { clientId: string }).clientId).toBe('string')
		})

		test('each connection gets unique ID', async () => {
			await getServer()
			const ws1 = createConnection()
			const ws2 = createConnection()

			const id1 = (ws1.getSentPayloadsByType('connected')[0].data as { clientId: string }).clientId
			const id2 = (ws2.getSentPayloadsByType('connected')[0].data as { clientId: string }).clientId

			expect(id1).not.toBe(id2)
		})

		test('connection close triggers cleanup', async () => {
			await getServer()
			const ws = createConnection()

			// Subscribe to a key
			ws.simulateMessage(createPayload('on', undefined, ['test-room']))

			// Close connection - should not throw
			ws.emit('close')
		})
	})

	describe('Subscribe (on) message', () => {
		test('first subscriber becomes host', async () => {
			await getServer()
			const ws = createConnection()
			ws.clearSentMessages()

			ws.simulateMessage(createPayload('on', undefined, ['game-room']))

			const clientsMsg = ws.getSentPayloadsByType('clients')[0]
			expect(clientsMsg).toBeDefined()
			expect(clientsMsg.data).toHaveProperty('hostId')
		})

		test('subsequent subscribers are not host', async () => {
			await getServer()
			const ws1 = createConnection()
			const ws2 = createConnection()

			ws1.simulateMessage(createPayload('on', undefined, ['game-room']))
			const ws1ClientId = (ws1.getSentPayloadsByType('connected')[0].data as { clientId: string }).clientId

			ws2.clearSentMessages()
			ws2.simulateMessage(createPayload('on', undefined, ['game-room']))

			const clientsMsg = ws2.getSentPayloadsByType('clients')[0]
			expect(clientsMsg).toBeDefined()

			const { clients, hostId } = clientsMsg.data as { clients: { id: string }[]; hostId: string }
			expect(clients.length).toBe(2)
			expect(hostId).toBe(ws1ClientId) // First client is host
		})

		test('existing subscriber receives join event when new client joins', async () => {
			await getServer()
			const ws1 = createConnection()
			const ws2 = createConnection()

			ws1.simulateMessage(createPayload('on', undefined, ['game-room']))
			ws1.clearSentMessages()

			ws2.simulateMessage(createPayload('on', undefined, ['game-room']))

			const joinMsg = ws1.getSentPayloadsByType('join')[0]
			expect(joinMsg).toBeDefined()
			expect(joinMsg.data).toHaveProperty('id')
		})

		test('subscriber receives current state if exists', async () => {
			await getServer()
			const ws1 = createConnection()

			ws1.simulateMessage(createPayload('on', undefined, ['game-room']))
			ws1.simulateMessage(createPayload('update', { count: 42 }, ['game-room']))
			await waitForAsyncProcessing()

			const ws2 = createConnection()
			ws2.clearSentMessages()
			ws2.simulateMessage(createPayload('on', undefined, ['game-room']))

			const updateMsg = ws2.getSentPayloadsByType('update')[0]
			expect(updateMsg).toBeDefined()
			expect(updateMsg.data).toEqual({ count: 42 })
		})
	})

	describe('Unsubscribe (off) message', () => {
		test('unsubscribe is debounced (150ms delay)', async () => {
			await getServer()
			const ws1 = createConnection()
			const ws2 = createConnection()

			ws1.simulateMessage(createPayload('on', undefined, ['game-room']))
			ws2.simulateMessage(createPayload('on', undefined, ['game-room']))
			ws2.clearSentMessages()

			ws1.simulateMessage(createPayload('off', undefined, ['game-room']))

			// Immediately - no leave event yet (debounced)
			expect(ws2.getSentPayloadsByType('leave').length).toBe(0)

			await waitForDebounce()

			// After debounce - leave event received
			expect(ws2.getSentPayloadsByType('leave').length).toBe(1)
		})

		test('rapid off->on cancels pending unsubscribe (StrictMode handling)', async () => {
			await getServer()
			const ws1 = createConnection()
			const ws2 = createConnection()

			ws1.simulateMessage(createPayload('on', undefined, ['game-room']))
			ws2.simulateMessage(createPayload('on', undefined, ['game-room']))
			ws2.clearSentMessages()

			// Rapid off -> on (StrictMode pattern)
			ws1.simulateMessage(createPayload('off', undefined, ['game-room']))
			ws1.simulateMessage(createPayload('on', undefined, ['game-room']))

			await waitForDebounce()

			// No leave event - cancelled by the 'on'
			expect(ws2.getSentPayloadsByType('leave').length).toBe(0)
		})

		test('host migration when host unsubscribes', async () => {
			await getServer()
			const ws1 = createConnection()
			const ws2 = createConnection()

			ws1.simulateMessage(createPayload('on', undefined, ['game-room']))
			ws2.simulateMessage(createPayload('on', undefined, ['game-room']))

			const ws1Id = (ws1.getSentPayloadsByType('connected')[0].data as { clientId: string }).clientId
			const ws2Id = (ws2.getSentPayloadsByType('connected')[0].data as { clientId: string }).clientId

			ws2.clearSentMessages()
			ws1.simulateMessage(createPayload('off', undefined, ['game-room']))

			await waitForDebounce()

			// ws2 receives clients update with new host
			const clientsMsg = ws2.getSentPayloadsByType('clients').pop()
			expect(clientsMsg).toBeDefined()
			expect((clientsMsg!.data as { hostId: string }).hostId).toBe(ws2Id)
		})
	})

	describe('Update message', () => {
		test('state update is broadcast to all subscribers', async () => {
			await getServer()
			const ws1 = createConnection()
			const ws2 = createConnection()

			ws1.simulateMessage(createPayload('on', undefined, ['game-room']))
			ws2.simulateMessage(createPayload('on', undefined, ['game-room']))
			ws1.clearSentMessages()
			ws2.clearSentMessages()

			ws1.simulateMessage(createPayload('update', { score: 100 }, ['game-room']))
			await waitForAsyncProcessing()

			expect(ws1.getSentPayloadsByType('update').length).toBe(1)
			expect(ws2.getSentPayloadsByType('update').length).toBe(1)
			expect(ws2.getSentPayloadsByType('update')[0].data).toEqual({ score: 100 })
		})

		test('state update is not sent to non-subscribers', async () => {
			await getServer()
			const ws1 = createConnection()
			const ws2 = createConnection()

			ws1.simulateMessage(createPayload('on', undefined, ['game-room']))
			ws2.clearSentMessages()

			ws1.simulateMessage(createPayload('update', { score: 100 }, ['game-room']))

			expect(ws2.getSentPayloadsByType('update').length).toBe(0)
		})

		test('state persists for new subscribers', async () => {
			await getServer()
			const ws1 = createConnection()

			ws1.simulateMessage(createPayload('on', undefined, ['game-room']))
			ws1.simulateMessage(createPayload('update', { level: 5 }, ['game-room']))
			await waitForAsyncProcessing()

			const ws2 = createConnection()
			ws2.clearSentMessages()
			ws2.simulateMessage(createPayload('on', undefined, ['game-room']))

			const updateMsg = ws2.getSentPayloadsByType('update')[0]
			expect(updateMsg).toBeDefined()
			expect(updateMsg.data).toEqual({ level: 5 })
		})
	})

	describe('Get message', () => {
		test('returns current state for key', async () => {
			await getServer()
			const ws1 = createConnection()

			ws1.simulateMessage(createPayload('on', undefined, ['game-room']))
			ws1.simulateMessage(createPayload('update', { health: 100 }, ['game-room']))
			await waitForAsyncProcessing()

			const ws2 = createConnection()
			ws2.clearSentMessages()
			ws2.simulateMessage(createPayload('get', undefined, ['game-room']))

			const response = ws2.getSentPayloadsByType('update')[0]
			expect(response).toBeDefined()
			expect(response.data).toEqual({ health: 100 })
		})

		test('returns undefined for non-existent key', async () => {
			await getServer()
			const ws = createConnection()
			ws.clearSentMessages()

			ws.simulateMessage(createPayload('get', undefined, ['unknown-room']))

			const response = ws.getSentPayloadsByType('update')[0]
			expect(response).toBeDefined()
			expect(response.data).toBeUndefined()
		})
	})

	describe('Broadcast message', () => {
		test('broadcast is sent to all subscribers except sender', async () => {
			await getServer()
			const ws1 = createConnection()
			const ws2 = createConnection()
			const ws3 = createConnection()

			ws1.simulateMessage(createPayload('on', undefined, ['game-room']))
			ws2.simulateMessage(createPayload('on', undefined, ['game-room']))
			ws3.simulateMessage(createPayload('on', undefined, ['game-room']))
			ws1.clearSentMessages()
			ws2.clearSentMessages()
			ws3.clearSentMessages()

			ws1.simulateMessage(createPayload('broadcast', { emoji: '🎉' }, ['game-room']))

			// Sender excluded
			expect(ws1.getSentPayloadsByType('broadcast').length).toBe(0)
			// Others receive
			expect(ws2.getSentPayloadsByType('broadcast').length).toBe(1)
			expect(ws3.getSentPayloadsByType('broadcast').length).toBe(1)
			expect(ws2.getSentPayloadsByType('broadcast')[0].data).toEqual({ emoji: '🎉' })
		})
	})

	describe('Send message (targeted)', () => {
		test('send delivers to specific client only', async () => {
			await getServer()
			const ws1 = createConnection()
			const ws2 = createConnection()
			const ws3 = createConnection()

			ws1.simulateMessage(createPayload('on', undefined, ['game-room']))
			ws2.simulateMessage(createPayload('on', undefined, ['game-room']))
			ws3.simulateMessage(createPayload('on', undefined, ['game-room']))

			const ws2ClientId = (ws2.getSentPayloadsByType('connected')[0].data as { clientId: string }).clientId

			ws1.clearSentMessages()
			ws2.clearSentMessages()
			ws3.clearSentMessages()

			ws1.simulateMessage(
				createPayload('send', { secret: 'message' }, ['game-room'], { targetClientId: ws2ClientId })
			)

			expect(ws1.getSentPayloadsByType('send').length).toBe(0)
			expect(ws2.getSentPayloadsByType('send').length).toBe(1)
			expect(ws3.getSentPayloadsByType('send').length).toBe(0)
			expect(ws2.getSentPayloadsByType('send')[0].data).toEqual({ secret: 'message' })
		})
	})

	describe('Metadata message', () => {
		test('metadata is stored and broadcast to subscribers', async () => {
			await getServer()
			const ws1 = createConnection()
			const ws2 = createConnection()

			ws1.simulateMessage(createPayload('on', undefined, ['game-room']))
			ws2.simulateMessage(createPayload('on', undefined, ['game-room']))
			ws1.clearSentMessages()
			ws2.clearSentMessages()

			ws1.simulateMessage(createPayload('metadata', { username: 'Player1' }))

			// Both receive updated clients list
			const ws1Clients = ws1.getSentPayloadsByType('clients')[0]
			const ws2Clients = ws2.getSentPayloadsByType('clients')[0]
			expect(ws1Clients).toBeDefined()
			expect(ws2Clients).toBeDefined()

			// Find client with metadata
			const { clients } = ws1Clients.data as { clients: { id: string; data?: unknown }[] }
			const clientWithMetadata = clients.find((c) => c.data !== undefined)
			expect(clientWithMetadata?.data).toEqual({ username: 'Player1' })
		})
	})

	describe('Multiple rooms', () => {
		test('clients in different rooms are isolated', async () => {
			await getServer()
			const ws1 = createConnection()
			const ws2 = createConnection()

			ws1.simulateMessage(createPayload('on', undefined, ['room-a']))
			ws2.simulateMessage(createPayload('on', undefined, ['room-b']))
			ws1.clearSentMessages()
			ws2.clearSentMessages()

			ws1.simulateMessage(createPayload('update', { data: 'room-a' }, ['room-a']))
			await waitForAsyncProcessing()

			expect(ws1.getSentPayloadsByType('update').length).toBe(1)
			expect(ws2.getSentPayloadsByType('update').length).toBe(0)
		})

		test('client can subscribe to multiple rooms', async () => {
			await getServer()
			const ws1 = createConnection()
			const ws2 = createConnection()

			ws1.simulateMessage(createPayload('on', undefined, ['room-a']))
			ws1.simulateMessage(createPayload('on', undefined, ['room-b']))
			ws2.simulateMessage(createPayload('on', undefined, ['room-a']))

			ws1.clearSentMessages()

			ws2.simulateMessage(createPayload('update', { data: 'from-ws2' }, ['room-a']))
			await waitForAsyncProcessing()

			expect(ws1.getSentPayloadsByType('update').length).toBe(1)
		})
	})

	describe('Connection close cleanup', () => {
		test('pending unsubscribes are cleared on connection close', async () => {
			await getServer()
			const ws1 = createConnection()
			const ws2 = createConnection()

			ws1.simulateMessage(createPayload('on', undefined, ['game-room']))
			ws2.simulateMessage(createPayload('on', undefined, ['game-room']))
			ws2.clearSentMessages()

			// Start off (debounce timer)
			ws1.simulateMessage(createPayload('off', undefined, ['game-room']))

			// Close before debounce completes
			ws1.emit('close')

			await waitForDebounce()

			// Leave event should fire (from close handler)
			expect(ws2.getSentPayloadsByType('leave').length).toBeGreaterThanOrEqual(1)
		})
	})

	describe('Ping/Pong', () => {
		test('pong marks connection as alive', async () => {
			await getServer()
			const ws = createConnection()
			ws.clearSentMessages()

			// Pong response - should not throw
			ws.simulateMessage(createPayload('pong', undefined))
		})
	})

	describe('Error handling', () => {
		test('message without type is ignored', async () => {
			await getServer()
			const ws = createConnection()
			ws.clearSentMessages()

			// Send invalid message without type
			ws.emit('message', JSON.stringify({ data: 'test', key: ['room'] }))

			// No response should be sent (message ignored)
			expect(ws.sentMessages.length).toBe(0)
		})

		test('message without key is ignored (except ping/pong/metadata)', async () => {
			await getServer()
			const ws = createConnection()
			ws.clearSentMessages()

			// Send update without key - should be ignored
			ws.emit('message', JSON.stringify({ type: 'update', data: { test: true } }))

			expect(ws.sentMessages.length).toBe(0)
		})

		test('unsupported message type is handled gracefully', async () => {
			await getServer()
			const ws = createConnection()
			ws.clearSentMessages()

			// Send unknown message type
			ws.simulateMessage(createPayload('unknown-type', { data: 'test' }, ['room']))

			// No response for unknown type
			expect(ws.sentMessages.length).toBe(0)
		})
	})

	describe('Edge cases', () => {
		test('duplicate subscribe to same key is handled', async () => {
			await getServer()
			const ws = createConnection()

			// Subscribe twice to same key
			ws.simulateMessage(createPayload('on', undefined, ['game-room']))
			ws.clearSentMessages()
			ws.simulateMessage(createPayload('on', undefined, ['game-room']))

			// Second subscribe should not add duplicate, no extra clients message
			// (isNewSubscriber = false path)
			const clientsMessages = ws.getSentPayloadsByType('clients')
			expect(clientsMessages.length).toBe(0)
		})

		test('send to non-existent client is handled gracefully', async () => {
			await getServer()
			const ws1 = createConnection()

			ws1.simulateMessage(createPayload('on', undefined, ['game-room']))
			ws1.clearSentMessages()

			// Send to non-existent client
			ws1.simulateMessage(
				createPayload('send', { data: 'test' }, ['game-room'], { targetClientId: 'fake-id' })
			)

			// Should not crash, no message sent
			expect(ws1.getSentPayloadsByType('send').length).toBe(0)
		})

		test('send to client not watching key is rejected', async () => {
			await getServer()
			const ws1 = createConnection()
			const ws2 = createConnection()

			ws1.simulateMessage(createPayload('on', undefined, ['room-a']))
			ws2.simulateMessage(createPayload('on', undefined, ['room-b'])) // Different room

			const ws2ClientId = (ws2.getSentPayloadsByType('connected')[0].data as { clientId: string }).clientId

			ws1.clearSentMessages()
			ws2.clearSentMessages()

			// Try to send to ws2 via room-a (ws2 is not in room-a)
			ws1.simulateMessage(
				createPayload('send', { data: 'test' }, ['room-a'], { targetClientId: ws2ClientId })
			)

			// ws2 should not receive it (not watching room-a)
			expect(ws2.getSentPayloadsByType('send').length).toBe(0)
		})

		test('broadcast includes fromClientId', async () => {
			await getServer()
			const ws1 = createConnection()
			const ws2 = createConnection()

			ws1.simulateMessage(createPayload('on', undefined, ['game-room']))
			ws2.simulateMessage(createPayload('on', undefined, ['game-room']))

			const ws1ClientId = (ws1.getSentPayloadsByType('connected')[0].data as { clientId: string }).clientId

			ws2.clearSentMessages()
			ws1.simulateMessage(createPayload('broadcast', { emoji: '🎉' }, ['game-room']))

			const broadcastMsg = ws2.getSentPayloadsByType('broadcast')[0]
			expect(broadcastMsg).toBeDefined()
			expect(broadcastMsg.fromClientId).toBe(ws1ClientId)
		})

		test('send includes fromClientId', async () => {
			await getServer()
			const ws1 = createConnection()
			const ws2 = createConnection()

			ws1.simulateMessage(createPayload('on', undefined, ['game-room']))
			ws2.simulateMessage(createPayload('on', undefined, ['game-room']))

			const ws1ClientId = (ws1.getSentPayloadsByType('connected')[0].data as { clientId: string }).clientId
			const ws2ClientId = (ws2.getSentPayloadsByType('connected')[0].data as { clientId: string }).clientId

			ws2.clearSentMessages()
			ws1.simulateMessage(
				createPayload('send', { data: 'hello' }, ['game-room'], { targetClientId: ws2ClientId })
			)

			const sendMsg = ws2.getSentPayloadsByType('send')[0]
			expect(sendMsg).toBeDefined()
			expect(sendMsg.fromClientId).toBe(ws1ClientId)
		})

		test('last subscriber leaving removes host', async () => {
			await getServer()
			const ws = createConnection()

			ws.simulateMessage(createPayload('on', undefined, ['game-room']))

			// Verify we're the host
			const clientsMsg = ws.getSentPayloadsByType('clients')[0]
			const wsClientId = (ws.getSentPayloadsByType('connected')[0].data as { clientId: string }).clientId
			expect((clientsMsg.data as { hostId: string }).hostId).toBe(wsClientId)

			// Leave the room
			ws.simulateMessage(createPayload('off', undefined, ['game-room']))

			await waitForDebounce()

			// Now if a new client joins, they should become host
			const ws2 = createConnection()
			const ws2ClientId = (ws2.getSentPayloadsByType('connected')[0].data as { clientId: string }).clientId
			ws2.clearSentMessages()
			ws2.simulateMessage(createPayload('on', undefined, ['game-room']))

			const ws2Clients = ws2.getSentPayloadsByType('clients')[0]
			expect((ws2Clients.data as { hostId: string }).hostId).toBe(ws2ClientId)
		})

		test('connection close while subscribed to multiple rooms', async () => {
			await getServer()
			const ws1 = createConnection()
			const ws2 = createConnection()

			// ws1 subscribes to multiple rooms
			ws1.simulateMessage(createPayload('on', undefined, ['room-a']))
			ws1.simulateMessage(createPayload('on', undefined, ['room-b']))
			ws2.simulateMessage(createPayload('on', undefined, ['room-a']))
			ws2.simulateMessage(createPayload('on', undefined, ['room-b']))

			ws2.clearSentMessages()

			// ws1 closes connection
			ws1.emit('close')

			// ws2 should receive leave events for both rooms
			const leaveEvents = ws2.getSentPayloadsByType('leave')
			expect(leaveEvents.length).toBe(2)
		})
	})

	describe('SyncServer.getZone() API', () => {
		test('getZone returns zone interface', async () => {
			const server = await getServer()
			const zone = server.getZone(['game', 'room1'])

			expect(zone).toBeDefined()
			expect(typeof zone.getState).toBe('function')
			expect(typeof zone.setState).toBe('function')
			expect(typeof zone.setHost).toBe('function')
			expect(typeof zone.getHost).toBe('function')
			expect(typeof zone.getClients).toBe('function')
			expect(typeof zone.broadcast).toBe('function')
			expect(typeof zone.send).toBe('function')
		})

		test('getState returns undefined for empty key', async () => {
			const server = await getServer()
			const zone = server.getZone(['empty', 'key'])

			expect(zone.getState()).toBeUndefined()
		})

		test('setState sets state and broadcasts to subscribers', async () => {
			const server = await getServer()
			const ws = createConnection()

			ws.simulateMessage(createPayload('on', undefined, ['game', 'room1']))
			ws.clearSentMessages()

			const zone = server.getZone(['game', 'room1'])
			zone.setState({ score: 100 })

			// Client should receive update
			const updateMsg = ws.getSentPayloadsByType('update')[0]
			expect(updateMsg).toBeDefined()
			expect(updateMsg.data).toEqual({ score: 100 })

			// State should be retrievable
			expect(zone.getState()).toEqual({ score: 100 })
		})

		test('getHost returns current host ID', async () => {
			const server = await getServer()
			const ws = createConnection()

			const wsClientId = (ws.getSentPayloadsByType('connected')[0].data as { clientId: string }).clientId

			ws.simulateMessage(createPayload('on', undefined, ['game', 'room1']))

			const zone = server.getZone(['game', 'room1'])
			expect(zone.getHost()).toBe(wsClientId)
		})

		test('setHost changes host to valid subscriber', async () => {
			const server = await getServer()
			const ws1 = createConnection()
			const ws2 = createConnection()

			const ws2ClientId = (ws2.getSentPayloadsByType('connected')[0].data as { clientId: string }).clientId

			ws1.simulateMessage(createPayload('on', undefined, ['game', 'room1']))
			ws2.simulateMessage(createPayload('on', undefined, ['game', 'room1']))
			ws1.clearSentMessages()
			ws2.clearSentMessages()

			const zone = server.getZone(['game', 'room1'])
			zone.setHost(ws2ClientId)

			expect(zone.getHost()).toBe(ws2ClientId)

			// Clients should receive setHost message
			const setHostMsg1 = ws1.getSentPayloadsByType('setHost')[0]
			const setHostMsg2 = ws2.getSentPayloadsByType('setHost')[0]
			expect(setHostMsg1).toBeDefined()
			expect(setHostMsg2).toBeDefined()
			expect((setHostMsg1.data as { hostId: string }).hostId).toBe(ws2ClientId)
		})

		test('setHost with null clears host', async () => {
			const server = await getServer()
			const ws = createConnection()

			ws.simulateMessage(createPayload('on', undefined, ['game', 'room1']))
			ws.clearSentMessages()

			const zone = server.getZone(['game', 'room1'])
			zone.setHost(null)

			expect(zone.getHost()).toBeUndefined()

			// Client should receive setHost with null
			const setHostMsg = ws.getSentPayloadsByType('setHost')[0]
			expect(setHostMsg).toBeDefined()
			expect((setHostMsg.data as { hostId: string | null }).hostId).toBeNull()
		})

		test('setHost rejects non-subscriber client', async () => {
			const server = await getServer()
			const ws = createConnection()

			const wsClientId = (ws.getSentPayloadsByType('connected')[0].data as { clientId: string }).clientId

			ws.simulateMessage(createPayload('on', undefined, ['game', 'room1']))
			ws.clearSentMessages()

			const zone = server.getZone(['game', 'room1'])

			// Try to set non-subscriber as host
			zone.setHost('fake-client-id')

			// Host should remain unchanged
			expect(zone.getHost()).toBe(wsClientId)

			// No setHost message should be sent
			expect(ws.getSentPayloadsByType('setHost').length).toBe(0)
		})

		test('getClients returns all subscribers', async () => {
			const server = await getServer()
			const ws1 = createConnection()
			const ws2 = createConnection()

			const ws1ClientId = (ws1.getSentPayloadsByType('connected')[0].data as { clientId: string }).clientId
			const ws2ClientId = (ws2.getSentPayloadsByType('connected')[0].data as { clientId: string }).clientId

			ws1.simulateMessage(createPayload('on', undefined, ['game', 'room1']))
			ws2.simulateMessage(createPayload('on', undefined, ['game', 'room1']))

			const zone = server.getZone(['game', 'room1'])
			const clients = zone.getClients()

			expect(clients.length).toBe(2)
			expect(clients.map((c: { id: string }) => c.id)).toContain(ws1ClientId)
			expect(clients.map((c: { id: string }) => c.id)).toContain(ws2ClientId)
		})

		test('broadcast sends to all subscribers with __server__ fromClientId', async () => {
			const server = await getServer()
			const ws1 = createConnection()
			const ws2 = createConnection()

			ws1.simulateMessage(createPayload('on', undefined, ['game', 'room1']))
			ws2.simulateMessage(createPayload('on', undefined, ['game', 'room1']))
			ws1.clearSentMessages()
			ws2.clearSentMessages()

			const zone = server.getZone(['game', 'room1'])
			zone.broadcast({ event: 'game-over' })

			// Both clients should receive
			const broadcast1 = ws1.getSentPayloadsByType('broadcast')[0]
			const broadcast2 = ws2.getSentPayloadsByType('broadcast')[0]
			expect(broadcast1).toBeDefined()
			expect(broadcast2).toBeDefined()
			expect(broadcast1.data).toEqual({ event: 'game-over' })
			expect(broadcast1.fromClientId).toBe('__server__')
		})

		test('send delivers to specific client with __server__ fromClientId', async () => {
			const server = await getServer()
			const ws1 = createConnection()
			const ws2 = createConnection()

			const ws2ClientId = (ws2.getSentPayloadsByType('connected')[0].data as { clientId: string }).clientId

			ws1.simulateMessage(createPayload('on', undefined, ['game', 'room1']))
			ws2.simulateMessage(createPayload('on', undefined, ['game', 'room1']))
			ws1.clearSentMessages()
			ws2.clearSentMessages()

			const zone = server.getZone(['game', 'room1'])
			zone.send(ws2ClientId, { message: 'hello' })

			// Only ws2 should receive
			expect(ws1.getSentPayloadsByType('send').length).toBe(0)
			const sendMsg = ws2.getSentPayloadsByType('send')[0]
			expect(sendMsg).toBeDefined()
			expect(sendMsg.data).toEqual({ message: 'hello' })
			expect(sendMsg.fromClientId).toBe('__server__')
		})

		test('send to non-subscriber is ignored', async () => {
			const server = await getServer()
			const ws1 = createConnection()
			const ws2 = createConnection()

			const ws2ClientId = (ws2.getSentPayloadsByType('connected')[0].data as { clientId: string }).clientId

			ws1.simulateMessage(createPayload('on', undefined, ['game', 'room1']))
			// ws2 subscribes to different room
			ws2.simulateMessage(createPayload('on', undefined, ['other', 'room']))
			ws2.clearSentMessages()

			const zone = server.getZone(['game', 'room1'])
			zone.send(ws2ClientId, { message: 'hello' })

			// ws2 should not receive (not in game.room1)
			expect(ws2.getSentPayloadsByType('send').length).toBe(0)
		})

		test('send to non-existent client is ignored', async () => {
			const server = await getServer()
			const ws = createConnection()

			ws.simulateMessage(createPayload('on', undefined, ['game', 'room1']))
			ws.clearSentMessages()

			const zone = server.getZone(['game', 'room1'])
			// Should not throw
			zone.send('fake-client-id', { message: 'hello' })

			expect(ws.getSentPayloadsByType('send').length).toBe(0)
		})

		test('zone operations work with normalized keys', async () => {
			const server = await getServer()
			const ws = createConnection()

			// Subscribe using array key
			ws.simulateMessage(createPayload('on', undefined, ['game', 'level', '1']))
			ws.clearSentMessages()

			// Get zone using same array key
			const zone = server.getZone(['game', 'level', '1'])
			zone.setState({ progress: 50 })

			const updateMsg = ws.getSentPayloadsByType('update')[0]
			expect(updateMsg).toBeDefined()
			expect(updateMsg.data).toEqual({ progress: 50 })
		})
	})
})
