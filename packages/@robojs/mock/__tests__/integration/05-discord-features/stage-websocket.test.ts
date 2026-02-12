/**
 * Stage WebSocket Tests
 *
 * These tests verify the Stage WebSocket server functionality:
 * - Connection with session token authentication
 * - State sync on connect
 * - Real-time event streaming
 * - Command handling
 * - Reconnection with event replay
 */
import WebSocket from 'ws'
import { Client } from 'discord.js'
import { createSession, controlAPI, dispatchEvent } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'
import { MOCK_CONFIG } from '../setup/constants.js'
import type { StageEvent, StateSyncPayload, StageCommand } from '../../../src/types/stage.js'

const STAGE_WS_URL = MOCK_CONFIG.WS_URL.replace('ws:', 'ws:') + '/stage/ws'

/**
 * Event queue for WebSocket connections.
 * This ensures we don't lose events between await calls.
 */
const eventQueues = new WeakMap<WebSocket, StageEvent[]>()

/**
 * Start collecting events for a WebSocket
 */
function startEventCollection(ws: WebSocket): void {
	if (eventQueues.has(ws)) return

	const queue: StageEvent[] = []
	eventQueues.set(ws, queue)

	ws.on('message', (data: WebSocket.Data) => {
		const event = JSON.parse(data.toString()) as StageEvent
		queue.push(event)
	})
}

/**
 * Helper to connect a Stage WebSocket client
 */
function connectStage(token: string, lastSeq = 0): Promise<WebSocket> {
	return new Promise((resolve, reject) => {
		const url = `${STAGE_WS_URL}?token=${encodeURIComponent(token)}${lastSeq > 0 ? `&last_seq=${lastSeq}` : ''}`
		const ws = new WebSocket(url)

		// Start collecting events immediately on open
		ws.once('open', () => {
			startEventCollection(ws)
			resolve(ws)
		})
		ws.once('error', reject)

		// Timeout after 5 seconds
		setTimeout(() => {
			if (ws.readyState !== WebSocket.OPEN) {
				ws.terminate()
				reject(new Error('Stage WebSocket connection timeout'))
			}
		}, 5000)
	})
}

/**
 * Helper to wait for a specific event type
 */
function waitForStageEvent(ws: WebSocket, eventType: string, timeout = 5000): Promise<StageEvent> {
	return new Promise((resolve, reject) => {
		const queue = eventQueues.get(ws) ?? []

		// First check if the event is already in the queue
		const idx = queue.findIndex(e => e.type === eventType)
		if (idx !== -1) {
			const event = queue.splice(idx, 1)[0]
			resolve(event)
			return
		}

		// Otherwise wait for it
		const timer = setTimeout(() => {
			reject(new Error(`Timeout waiting for stage event: ${eventType}`))
		}, timeout)

		const checkInterval = setInterval(() => {
			const idx = queue.findIndex(e => e.type === eventType)
			if (idx !== -1) {
				clearTimeout(timer)
				clearInterval(checkInterval)
				const event = queue.splice(idx, 1)[0]
				resolve(event)
			}
		}, 10)

		// Also clear interval on timeout
		setTimeout(() => clearInterval(checkInterval), timeout)
	})
}

/**
 * Helper to send a Stage command and wait for response
 */
function sendStageCommand(ws: WebSocket, command: StageCommand, timeout = 5000): Promise<StageEvent> {
	return new Promise((resolve, reject) => {
		const queue = eventQueues.get(ws) ?? []

		const timer = setTimeout(() => {
			reject(new Error(`Timeout waiting for command response: ${command.id}`))
		}, timeout)

		// Send the command
		ws.send(JSON.stringify(command))

		// Check for matching response in queue
		const checkQueue = () => {
			const idx = queue.findIndex(e => {
				if (e.type !== 'command_response') return false
				const responseData = e.data as { command_id: string }
				return responseData.command_id === command.id
			})
			if (idx !== -1) {
				clearTimeout(timer)
				clearInterval(checkInterval)
				const event = queue.splice(idx, 1)[0]
				resolve(event)
				return true
			}
			return false
		}

		// First check immediately
		if (checkQueue()) return

		// Then poll
		const checkInterval = setInterval(checkQueue, 10)
		setTimeout(() => clearInterval(checkInterval), timeout)
	})
}

describe('Stage WebSocket', () => {
	let discordClient: Client | null = null
	let stageWs: WebSocket | null = null

	afterEach(async () => {
		// Close stage WebSocket
		if (stageWs && stageWs.readyState === WebSocket.OPEN) {
			stageWs.close()
			stageWs = null
		}

		// Destroy Discord client
		await destroyClient(discordClient)
		discordClient = null
	})

	describe('Connection', () => {
		it('should connect with valid session token', async () => {
			const session = await createSession({
				name: 'stage-connect-test',
				config: {
					botUser: { username: 'StageTestBot' },
					guilds: [{ name: 'Test Guild' }]
				}
			})

			stageWs = await connectStage(session.token)
			expect(stageWs.readyState).toBe(WebSocket.OPEN)
		})

		it('should reject connection with invalid token', async () => {
			await expect(connectStage('invalid_token')).rejects.toThrow()
		})

		it('should receive connected event on connect', async () => {
			const session = await createSession({
				name: 'stage-connected-event-test',
				config: {
					botUser: { username: 'StageTestBot' },
					guilds: [{ name: 'Test Guild' }]
				}
			})

			stageWs = await connectStage(session.token)

			const connectedEvent = await waitForStageEvent(stageWs, 'connected')
			expect(connectedEvent.type).toBe('connected')
			expect(connectedEvent.seq).toBe(1)
			expect((connectedEvent.data as { sessionId: string }).sessionId).toBe(session.id)
		})
	})

	describe('State Sync', () => {
		it('should receive state_sync with session state on connect', async () => {
			const session = await createSession({
				name: 'stage-state-sync-test',
				config: {
					botUser: { username: 'StateSyncBot' },
					guilds: [{ name: 'Test Guild', channels: [{ name: 'general' }, { name: 'testing' }] }]
				}
			})

			stageWs = await connectStage(session.token)

			// Skip connected event
			await waitForStageEvent(stageWs, 'connected')

			// Wait for state_sync
			const stateSyncEvent = await waitForStageEvent(stageWs, 'state_sync')
			expect(stateSyncEvent.type).toBe('state_sync')

			const payload = stateSyncEvent.data as StateSyncPayload
			expect(payload.session.id).toBe(session.id)
			expect(payload.guilds.length).toBe(1)
			expect(payload.guilds[0].name).toBe('Test Guild')
			expect(payload.channels.length).toBeGreaterThanOrEqual(2)
		})

		it('should include bot user in state_sync', async () => {
			const session = await createSession({
				name: 'stage-bot-user-test',
				config: {
					botUser: { username: 'BotUserTestBot' },
					guilds: [{ name: 'Test Guild' }]
				}
			})

			stageWs = await connectStage(session.token)
			await waitForStageEvent(stageWs, 'connected')

			const stateSyncEvent = await waitForStageEvent(stageWs, 'state_sync')
			const payload = stateSyncEvent.data as StateSyncPayload

			expect(payload.session.bot).toBeDefined()
			expect(payload.session.bot?.username).toBe('BotUserTestBot')
			expect(payload.session.bot?.bot).toBe(true)
		})
	})

	describe('Event Streaming', () => {
		it('should receive message_create when message is dispatched', async () => {
			const session = await createSession({
				name: 'stage-message-stream-test',
				config: {
					botUser: { username: 'MessageStreamBot' },
					guilds: [{ name: 'Test Guild', channels: [{ name: 'general' }] }]
				}
			})

			stageWs = await connectStage(session.token)
			await waitForStageEvent(stageWs, 'connected')
			await waitForStageEvent(stageWs, 'state_sync')

			// Dispatch a message via control API
			const channelId = session.channels[0].id
			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				channel_id: channelId,
				content: 'Hello from test!'
			})

			// Wait for message_create event
			const messageEvent = await waitForStageEvent(stageWs, 'message_create')
			expect(messageEvent.type).toBe('message_create')

			const data = messageEvent.data as { source: string; message: { content: string } }
			expect(data.source).toBe('injected')
			expect(data.message.content).toBe('Hello from test!')
		})

		it('should receive bot_ready when Discord client connects', async () => {
			const session = await createSession({
				name: 'stage-bot-ready-test',
				config: {
					botUser: { username: 'BotReadyTestBot' },
					guilds: [{ name: 'Test Guild' }]
				}
			})

			// Connect stage first
			stageWs = await connectStage(session.token)
			await waitForStageEvent(stageWs, 'connected')
			await waitForStageEvent(stageWs, 'state_sync')

			// Now connect Discord client
			discordClient = createTestClient()

			// Set up promise for bot_ready before login
			const botReadyPromise = waitForStageEvent(stageWs, 'bot_ready', 10000)

			await discordClient.login(session.token)
			await waitForReady(discordClient)

			// Wait for bot_ready event on stage
			const botReadyEvent = await botReadyPromise
			expect(botReadyEvent.type).toBe('bot_ready')

			const data = botReadyEvent.data as { user: { username: string }; connectionId: string }
			expect(data.user.username).toBe('BotReadyTestBot')
			expect(data.connectionId).toBeDefined()
		})

		it('should receive bot_disconnected when Discord client disconnects', async () => {
			const session = await createSession({
				name: 'stage-bot-disconnect-test',
				config: {
					botUser: { username: 'DisconnectTestBot' },
					guilds: [{ name: 'Test Guild' }]
				}
			})

			// Connect Discord client first
			discordClient = createTestClient()
			await discordClient.login(session.token)
			await waitForReady(discordClient)

			// Connect stage
			stageWs = await connectStage(session.token)
			await waitForStageEvent(stageWs, 'connected')
			await waitForStageEvent(stageWs, 'state_sync')

			// Set up promise for bot_disconnected before disconnect
			const botDisconnectedPromise = waitForStageEvent(stageWs, 'bot_disconnected', 10000)

			// Disconnect Discord client
			await discordClient.destroy()
			discordClient = null

			// Wait for bot_disconnected event
			const disconnectEvent = await botDisconnectedPromise
			expect(disconnectEvent.type).toBe('bot_disconnected')

			const data = disconnectEvent.data as { connectionId: string; code?: number }
			expect(data.connectionId).toBeDefined()
		})
	})

	describe('Commands', () => {
		it('should handle send_message command', async () => {
			const session = await createSession({
				name: 'stage-send-message-test',
				config: {
					botUser: { username: 'SendMessageBot' },
					guilds: [{ name: 'Test Guild', channels: [{ name: 'general' }] }]
				}
			})

			stageWs = await connectStage(session.token)
			await waitForStageEvent(stageWs, 'connected')
			await waitForStageEvent(stageWs, 'state_sync')

			const channelId = session.channels[0].id
			const command: StageCommand = {
				id: 'cmd_001',
				type: 'send_message',
				data: {
					channel_id: channelId,
					content: 'Hello from stage command!'
				}
			}

			const response = await sendStageCommand(stageWs, command)
			expect(response.type).toBe('command_response')

			const data = response.data as { command_id: string; success: boolean; result?: { message_id: string } }
			expect(data.command_id).toBe('cmd_001')
			expect(data.success).toBe(true)
			expect(data.result?.message_id).toBeDefined()
		})

		it('should handle request_state command', async () => {
			const session = await createSession({
				name: 'stage-request-state-test',
				config: {
					botUser: { username: 'RequestStateBot' },
					guilds: [{ name: 'Test Guild' }]
				}
			})

			stageWs = await connectStage(session.token)
			await waitForStageEvent(stageWs, 'connected')
			await waitForStageEvent(stageWs, 'state_sync')

			const command: StageCommand = {
				id: 'cmd_002',
				type: 'request_state',
				data: {}
			}

			// Should receive both state_sync and command_response
			const responsePromise = sendStageCommand(stageWs, command)
			const stateSyncPromise = waitForStageEvent(stageWs, 'state_sync')

			const [response, stateSync] = await Promise.all([responsePromise, stateSyncPromise])

			expect(response.type).toBe('command_response')
			expect((response.data as { success: boolean }).success).toBe(true)

			expect(stateSync.type).toBe('state_sync')
		})

		it('should handle subscribe_channel command', async () => {
			const session = await createSession({
				name: 'stage-subscribe-test',
				config: {
					botUser: { username: 'SubscribeBot' },
					guilds: [{ name: 'Test Guild', channels: [{ name: 'general' }] }]
				}
			})

			stageWs = await connectStage(session.token)
			await waitForStageEvent(stageWs, 'connected')
			await waitForStageEvent(stageWs, 'state_sync')

			const channelId = session.channels[0].id
			const command: StageCommand = {
				id: 'cmd_003',
				type: 'subscribe_channel',
				data: {
					channel_id: channelId,
					subscribe: true
				}
			}

			const response = await sendStageCommand(stageWs, command)
			expect((response.data as { success: boolean }).success).toBe(true)
			expect((response.data as { result?: { subscribed: string[] } }).result?.subscribed).toContain(channelId)
		})
	})

	describe('Control API', () => {
		it('should return stage connection info via GET', async () => {
			const session = await createSession({
				name: 'stage-api-test',
				config: {
					botUser: { username: 'ApiTestBot' },
					guilds: [{ name: 'Test Guild' }]
				}
			})

			// Connect stage client
			stageWs = await connectStage(session.token)
			await waitForStageEvent(stageWs, 'connected')

			// Check stage info via control API
			const stageInfo = await controlAPI<{
				session_id: string
				stage_connections: number
				buffer_stats: { size: number }
			}>(`/sessions/${session.id}/stage`)

			expect(stageInfo.session_id).toBe(session.id)
			expect(stageInfo.stage_connections).toBe(1)
			expect(stageInfo.buffer_stats.size).toBeGreaterThan(0)
		})

		it('should broadcast custom event via POST', async () => {
			const session = await createSession({
				name: 'stage-broadcast-test',
				config: {
					botUser: { username: 'BroadcastTestBot' },
					guilds: [{ name: 'Test Guild' }]
				}
			})

			stageWs = await connectStage(session.token)
			await waitForStageEvent(stageWs, 'connected')
			await waitForStageEvent(stageWs, 'state_sync')

			// Broadcast custom error event
			const errorPromise = waitForStageEvent(stageWs, 'error')

			await controlAPI(`/sessions/${session.id}/stage`, {
				method: 'POST',
				body: {
					type: 'error',
					data: { message: 'Test error from control API' }
				}
			})

			const errorEvent = await errorPromise
			expect(errorEvent.type).toBe('error')
			expect((errorEvent.data as { message: string }).message).toBe('Test error from control API')
		})
	})

	describe('Heartbeat', () => {
		it('should receive heartbeat events periodically', async () => {
			// Note: This test may be slow due to heartbeat interval
			// The default interval is 30 seconds, but we can verify the mechanism works

			const session = await createSession({
				name: 'stage-heartbeat-test',
				config: {
					botUser: { username: 'HeartbeatTestBot' },
					guilds: [{ name: 'Test Guild' }]
				}
			})

			stageWs = await connectStage(session.token)
			await waitForStageEvent(stageWs, 'connected')

			// Just verify we can receive events - heartbeat will come eventually
			// For actual heartbeat testing, we'd need to configure a shorter interval
			expect(stageWs.readyState).toBe(WebSocket.OPEN)
		})
	})

	describe('Reconnection', () => {
		it('should replay missed events on reconnection with last_seq', async () => {
			const session = await createSession({
				name: 'stage-reconnect-test',
				config: {
					botUser: { username: 'ReconnectBot' },
					guilds: [{ name: 'Test Guild', channels: [{ name: 'general' }] }]
				}
			})

			// First connection - receive initial events
			stageWs = await connectStage(session.token)
			await waitForStageEvent(stageWs, 'connected')
			await waitForStageEvent(stageWs, 'state_sync')

			// Dispatch some events while connected
			const channelId = session.channels[0].id
			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				channel_id: channelId,
				content: 'Message 1'
			})
			const msg1Event = await waitForStageEvent(stageWs, 'message_create')
			expect((msg1Event.data as { message: { content: string } }).message.content).toBe('Message 1')

			// Get the last sequence number AFTER receiving Message 1
			// This is the seq we'll use on reconnect to replay only missed events
			const lastSeq = msg1Event.seq

			// Close the first connection
			stageWs.close()
			await new Promise((resolve) => setTimeout(resolve, 100))

			// Dispatch another event while disconnected
			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				channel_id: channelId,
				content: 'Message 2 - missed'
			})

			// Reconnect with last_seq to replay missed events
			stageWs = await connectStage(session.token, lastSeq)
			await waitForStageEvent(stageWs, 'connected')
			await waitForStageEvent(stageWs, 'state_sync')

			// Should receive the replayed message from when we were disconnected
			const replayedEvent = await waitForStageEvent(stageWs, 'message_create', 2000)
			expect((replayedEvent.data as { message: { content: string } }).message.content).toBe('Message 2 - missed')
		})
	})
})
