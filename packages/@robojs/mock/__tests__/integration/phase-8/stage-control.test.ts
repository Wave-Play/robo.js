/**
 * Phase 8: Stage Control Tests
 *
 * These tests verify the Stage Control endpoints for playback and navigation:
 * - HTTP → Stage WebSocket command proxying
 * - Error handling (NO_STAGE_CLIENT, TIMEOUT, bad request)
 * - Playback control actions (play, pause, step, seek, speed, mode)
 * - Navigation control actions (select_guild, select_channel, open_dm, open_thread)
 */
import WebSocket from 'ws'
import { createSession, controlAPI } from '../setup/control-api.js'
import { MOCK_CONFIG } from '../setup/constants.js'
import type { StageEvent, StageControlCommand, StageControlResponseData } from '../../../src/types/stage.js'

const STAGE_WS_URL = MOCK_CONFIG.WS_URL.replace('ws:', 'ws:') + '/stage/ws'

/**
 * Response types for control endpoints
 */
interface PlaybackControlResponse {
	success: boolean
	state?: {
		mode: 'live' | 'playback'
		isPlaying: boolean
		currentTime: number
		duration: number
		speed: number
		eventIndex: number
		totalEvents: number
		timestamp: number
	}
	error?: string
	code?: string
}

interface NavigationControlResponse {
	success: boolean
	state?: {
		guildId: string | null
		channelId: string | null
		timestamp: number
	}
	error?: string
	code?: string
}

/**
 * Event queue for WebSocket connections.
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
function connectStage(token: string): Promise<WebSocket> {
	return new Promise((resolve, reject) => {
		const url = `${STAGE_WS_URL}?token=${encodeURIComponent(token)}`
		const ws = new WebSocket(url)

		ws.once('open', () => {
			startEventCollection(ws)
			resolve(ws)
		})
		ws.once('error', reject)

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

		const idx = queue.findIndex((e) => e.type === eventType)
		if (idx !== -1) {
			const event = queue.splice(idx, 1)[0]
			resolve(event)
			return
		}

		const timer = setTimeout(() => {
			reject(new Error(`Timeout waiting for stage event: ${eventType}`))
		}, timeout)

		const checkInterval = setInterval(() => {
			const idx = queue.findIndex((e) => e.type === eventType)
			if (idx !== -1) {
				clearTimeout(timer)
				clearInterval(checkInterval)
				const event = queue.splice(idx, 1)[0]
				resolve(event)
			}
		}, 10)

		setTimeout(() => clearInterval(checkInterval), timeout)
	})
}

/**
 * Make a raw fetch request to control API (for testing error responses)
 */
async function rawControlFetch(endpoint: string, options: { method?: string; body?: unknown } = {}): Promise<Response> {
	const url = `${MOCK_CONFIG.CONTROL_URL}${endpoint}`
	return fetch(url, {
		method: options.method ?? 'GET',
		headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
		body: options.body ? JSON.stringify(options.body) : undefined
	})
}

/**
 * Set up a mock Stage UI client that responds to control commands
 */
function setupControlCommandHandler(
	ws: WebSocket,
	responseGenerator: (command: StageControlCommand) => Partial<StageControlResponseData>
): void {
	const queue = eventQueues.get(ws) ?? []

	// Poll for control_command events and respond
	const checkInterval = setInterval(() => {
		const idx = queue.findIndex((e) => e.type === 'control_command')
		if (idx !== -1) {
			const event = queue.splice(idx, 1)[0]
			const command = event.data as StageControlCommand

			// Generate response
			const responseData = responseGenerator(command)
			const response: StageControlResponseData = {
				commandId: command.commandId,
				success: responseData.success ?? true,
				result: responseData.result,
				error: responseData.error
			}

			// Send control_response command back
			ws.send(
				JSON.stringify({
					id: `resp_${Date.now()}`,
					type: 'control_response',
					data: response
				})
			)
		}
	}, 10)

	// Clean up on close
	ws.once('close', () => clearInterval(checkInterval))
}

describe('Phase 8: Stage Control', () => {
	let stageWs: WebSocket | null = null

	afterEach(async () => {
		if (stageWs && stageWs.readyState === WebSocket.OPEN) {
			stageWs.close()
			stageWs = null
		}
	})

	describe('Error Handling', () => {
		it('should return 409 NO_STAGE_CLIENT when no Stage UI connected (playback)', async () => {
			const session = await createSession({
				name: 'stage-control-no-client-test',
				config: {
					botUser: { username: 'ControlTestBot' },
					guilds: [{ name: 'Test Guild' }]
				}
			})

			// No Stage client connected - make control request
			const response = await rawControlFetch(`/sessions/${session.id}/stage/playback`, {
				method: 'POST',
				body: { action: 'pause' }
			})

			expect(response.status).toBe(409)
			const data = await response.json()
			expect(data.code).toBe('NO_STAGE_CLIENT')
			expect(data.error).toContain('No Stage UI')
		})

		it('should return 409 NO_STAGE_CLIENT when no Stage UI connected (navigate)', async () => {
			const session = await createSession({
				name: 'stage-control-no-client-nav-test',
				config: {
					botUser: { username: 'ControlTestBot' },
					guilds: [{ name: 'Test Guild' }]
				}
			})

			const response = await rawControlFetch(`/sessions/${session.id}/stage/navigate`, {
				method: 'POST',
				body: { action: 'select_guild', guildId: '123' }
			})

			expect(response.status).toBe(409)
			const data = await response.json()
			expect(data.code).toBe('NO_STAGE_CLIENT')
		})

		it('should return 400 for invalid playback action', async () => {
			const session = await createSession({
				name: 'stage-control-invalid-action-test',
				config: {
					botUser: { username: 'ControlTestBot' },
					guilds: [{ name: 'Test Guild' }]
				}
			})

			// Connect Stage client so we don't get 409
			stageWs = await connectStage(session.token)
			await waitForStageEvent(stageWs, 'connected')

			const response = await rawControlFetch(`/sessions/${session.id}/stage/playback`, {
				method: 'POST',
				body: { action: 'invalid_action' }
			})

			expect(response.status).toBe(400)
			const data = await response.json()
			expect(data.error).toContain('Invalid action')
		})

		it('should return 400 for missing required parameters', async () => {
			const session = await createSession({
				name: 'stage-control-missing-params-test',
				config: {
					botUser: { username: 'ControlTestBot' },
					guilds: [{ name: 'Test Guild' }]
				}
			})

			stageWs = await connectStage(session.token)
			await waitForStageEvent(stageWs, 'connected')

			// seek_to_event requires eventIndex
			const response = await rawControlFetch(`/sessions/${session.id}/stage/playback`, {
				method: 'POST',
				body: { action: 'seek_to_event' } // Missing eventIndex
			})

			expect(response.status).toBe(400)
			const data = await response.json()
			expect(data.error).toContain('eventIndex')
		})

		it('should return 404 for non-existent session', async () => {
			const response = await rawControlFetch('/sessions/nonexistent123/stage/playback', {
				method: 'POST',
				body: { action: 'pause' }
			})

			expect(response.status).toBe(404)
		})

		it('should return 405 for non-POST method', async () => {
			const session = await createSession({
				name: 'stage-control-method-test',
				config: {
					botUser: { username: 'ControlTestBot' },
					guilds: [{ name: 'Test Guild' }]
				}
			})

			const response = await rawControlFetch(`/sessions/${session.id}/stage/playback`, {
				method: 'GET'
			})

			expect(response.status).toBe(405)
		})
	})

	describe('Playback Control', () => {
		it('should handle pause action', async () => {
			const session = await createSession({
				name: 'stage-control-pause-test',
				config: {
					botUser: { username: 'ControlTestBot' },
					guilds: [{ name: 'Test Guild' }]
				}
			})

			stageWs = await connectStage(session.token)
			await waitForStageEvent(stageWs, 'connected')
			await waitForStageEvent(stageWs, 'state_sync')

			// Set up mock response handler
			setupControlCommandHandler(stageWs, (cmd) => ({
				success: true,
				result: {
					mode: 'playback',
					isPlaying: false,
					currentTime: 1000,
					duration: 5000,
					speed: 1,
					eventIndex: 5,
					totalEvents: 20,
					timestamp: Date.now()
				}
			}))

			const response = await controlAPI<PlaybackControlResponse>(`/sessions/${session.id}/stage/playback`, {
				method: 'POST',
				body: { action: 'pause' }
			})

			expect(response.success).toBe(true)
			expect(response.state).toBeDefined()
			expect(response.state?.isPlaying).toBe(false)
		})

		it('should handle play action', async () => {
			const session = await createSession({
				name: 'stage-control-play-test',
				config: {
					botUser: { username: 'ControlTestBot' },
					guilds: [{ name: 'Test Guild' }]
				}
			})

			stageWs = await connectStage(session.token)
			await waitForStageEvent(stageWs, 'connected')
			await waitForStageEvent(stageWs, 'state_sync')

			setupControlCommandHandler(stageWs, () => ({
				success: true,
				result: {
					mode: 'playback',
					isPlaying: true,
					currentTime: 1000,
					duration: 5000,
					speed: 1,
					eventIndex: 5,
					totalEvents: 20,
					timestamp: Date.now()
				}
			}))

			const response = await controlAPI<PlaybackControlResponse>(`/sessions/${session.id}/stage/playback`, {
				method: 'POST',
				body: { action: 'play' }
			})

			expect(response.success).toBe(true)
			expect(response.state?.isPlaying).toBe(true)
		})

		it('should handle step_forward action', async () => {
			const session = await createSession({
				name: 'stage-control-step-test',
				config: {
					botUser: { username: 'ControlTestBot' },
					guilds: [{ name: 'Test Guild' }]
				}
			})

			stageWs = await connectStage(session.token)
			await waitForStageEvent(stageWs, 'connected')
			await waitForStageEvent(stageWs, 'state_sync')

			setupControlCommandHandler(stageWs, () => ({
				success: true,
				result: {
					mode: 'playback',
					isPlaying: false,
					currentTime: 2000,
					duration: 5000,
					speed: 1,
					eventIndex: 10,
					totalEvents: 20,
					significantEventIndex: 3,
					totalSignificantEvents: 5,
					timestamp: Date.now()
				}
			}))

			const response = await controlAPI<PlaybackControlResponse>(`/sessions/${session.id}/stage/playback`, {
				method: 'POST',
				body: { action: 'step_forward' }
			})

			expect(response.success).toBe(true)
			expect(response.state?.eventIndex).toBe(10)
		})

		it('should handle seek_to_event action', async () => {
			const session = await createSession({
				name: 'stage-control-seek-event-test',
				config: {
					botUser: { username: 'ControlTestBot' },
					guilds: [{ name: 'Test Guild' }]
				}
			})

			stageWs = await connectStage(session.token)
			await waitForStageEvent(stageWs, 'connected')
			await waitForStageEvent(stageWs, 'state_sync')

			setupControlCommandHandler(stageWs, (cmd) => {
				const payload = cmd.payload as { eventIndex?: number }
				return {
					success: true,
					result: {
						mode: 'playback',
						isPlaying: false,
						currentTime: 3000,
						duration: 5000,
						speed: 1,
						eventIndex: payload.eventIndex ?? 0,
						totalEvents: 20,
						timestamp: Date.now()
					}
				}
			})

			const response = await controlAPI<PlaybackControlResponse>(`/sessions/${session.id}/stage/playback`, {
				method: 'POST',
				body: { action: 'seek_to_event', eventIndex: 15 }
			})

			expect(response.success).toBe(true)
			expect(response.state?.eventIndex).toBe(15)
		})

		it('should handle set_speed action', async () => {
			const session = await createSession({
				name: 'stage-control-speed-test',
				config: {
					botUser: { username: 'ControlTestBot' },
					guilds: [{ name: 'Test Guild' }]
				}
			})

			stageWs = await connectStage(session.token)
			await waitForStageEvent(stageWs, 'connected')
			await waitForStageEvent(stageWs, 'state_sync')

			setupControlCommandHandler(stageWs, (cmd) => {
				const payload = cmd.payload as { speed?: number }
				return {
					success: true,
					result: {
						mode: 'playback',
						isPlaying: true,
						currentTime: 1000,
						duration: 5000,
						speed: payload.speed ?? 1,
						eventIndex: 5,
						totalEvents: 20,
						timestamp: Date.now()
					}
				}
			})

			const response = await controlAPI<PlaybackControlResponse>(`/sessions/${session.id}/stage/playback`, {
				method: 'POST',
				body: { action: 'set_speed', speed: 2 }
			})

			expect(response.success).toBe(true)
			expect(response.state?.speed).toBe(2)
		})

		it('should handle set_mode action', async () => {
			const session = await createSession({
				name: 'stage-control-mode-test',
				config: {
					botUser: { username: 'ControlTestBot' },
					guilds: [{ name: 'Test Guild' }]
				}
			})

			stageWs = await connectStage(session.token)
			await waitForStageEvent(stageWs, 'connected')
			await waitForStageEvent(stageWs, 'state_sync')

			setupControlCommandHandler(stageWs, (cmd) => {
				const payload = cmd.payload as { mode?: string }
				return {
					success: true,
					result: {
						mode: (payload.mode as 'live' | 'playback') ?? 'playback',
						isPlaying: false,
						currentTime: 0,
						duration: 0,
						speed: 1,
						eventIndex: 0,
						totalEvents: 0,
						timestamp: Date.now()
					}
				}
			})

			const response = await controlAPI<PlaybackControlResponse>(`/sessions/${session.id}/stage/playback`, {
				method: 'POST',
				body: { action: 'set_mode', mode: 'live' }
			})

			expect(response.success).toBe(true)
			expect(response.state?.mode).toBe('live')
		})
	})

	describe('Navigation Control', () => {
		it('should handle select_guild action', async () => {
			const session = await createSession({
				name: 'stage-control-select-guild-test',
				config: {
					botUser: { username: 'ControlTestBot' },
					guilds: [{ name: 'Test Guild' }]
				}
			})

			stageWs = await connectStage(session.token)
			await waitForStageEvent(stageWs, 'connected')
			await waitForStageEvent(stageWs, 'state_sync')

			setupControlCommandHandler(stageWs, (cmd) => {
				const payload = cmd.payload as { guildId?: string }
				return {
					success: true,
					result: {
						guildId: payload.guildId ?? null,
						channelId: null,
						timestamp: Date.now()
					}
				}
			})

			const response = await controlAPI<NavigationControlResponse>(`/sessions/${session.id}/stage/navigate`, {
				method: 'POST',
				body: { action: 'select_guild', guildId: session.guildId }
			})

			expect(response.success).toBe(true)
			expect(response.state?.guildId).toBe(session.guildId)
		})

		it('should handle select_channel action', async () => {
			const session = await createSession({
				name: 'stage-control-select-channel-test',
				config: {
					botUser: { username: 'ControlTestBot' },
					guilds: [{ name: 'Test Guild', channels: [{ name: 'general' }] }]
				}
			})

			stageWs = await connectStage(session.token)
			await waitForStageEvent(stageWs, 'connected')
			await waitForStageEvent(stageWs, 'state_sync')

			const channelId = session.channels[0].id

			setupControlCommandHandler(stageWs, (cmd) => {
				const payload = cmd.payload as { channelId?: string }
				return {
					success: true,
					result: {
						guildId: session.guildId,
						channelId: payload.channelId ?? null,
						timestamp: Date.now()
					}
				}
			})

			const response = await controlAPI<NavigationControlResponse>(`/sessions/${session.id}/stage/navigate`, {
				method: 'POST',
				body: { action: 'select_channel', channelId }
			})

			expect(response.success).toBe(true)
			expect(response.state?.channelId).toBe(channelId)
		})

		it('should handle open_dm action', async () => {
			const session = await createSession({
				name: 'stage-control-open-dm-test',
				config: {
					botUser: { username: 'ControlTestBot' },
					guilds: [{ name: 'Test Guild' }]
				}
			})

			stageWs = await connectStage(session.token)
			await waitForStageEvent(stageWs, 'connected')
			await waitForStageEvent(stageWs, 'state_sync')

			const userId = 'user_123'

			setupControlCommandHandler(stageWs, (cmd) => {
				const payload = cmd.payload as { userId?: string }
				return {
					success: true,
					result: {
						guildId: null, // DMs are outside guilds
						channelId: payload.userId ?? null, // DM channel uses userId
						timestamp: Date.now()
					}
				}
			})

			const response = await controlAPI<NavigationControlResponse>(`/sessions/${session.id}/stage/navigate`, {
				method: 'POST',
				body: { action: 'open_dm', userId }
			})

			expect(response.success).toBe(true)
			expect(response.state?.guildId).toBeNull()
			expect(response.state?.channelId).toBe(userId)
		})

		it('should handle open_thread action', async () => {
			const session = await createSession({
				name: 'stage-control-open-thread-test',
				config: {
					botUser: { username: 'ControlTestBot' },
					guilds: [{ name: 'Test Guild' }]
				}
			})

			stageWs = await connectStage(session.token)
			await waitForStageEvent(stageWs, 'connected')
			await waitForStageEvent(stageWs, 'state_sync')

			const threadId = 'thread_456'

			setupControlCommandHandler(stageWs, (cmd) => {
				const payload = cmd.payload as { threadId?: string }
				return {
					success: true,
					result: {
						guildId: session.guildId,
						channelId: payload.threadId ?? null,
						timestamp: Date.now()
					}
				}
			})

			const response = await controlAPI<NavigationControlResponse>(`/sessions/${session.id}/stage/navigate`, {
				method: 'POST',
				body: { action: 'open_thread', threadId }
			})

			expect(response.success).toBe(true)
			expect(response.state?.channelId).toBe(threadId)
		})

		it('should return 400 for select_channel without channelId', async () => {
			const session = await createSession({
				name: 'stage-control-nav-missing-param-test',
				config: {
					botUser: { username: 'ControlTestBot' },
					guilds: [{ name: 'Test Guild' }]
				}
			})

			stageWs = await connectStage(session.token)
			await waitForStageEvent(stageWs, 'connected')

			const response = await rawControlFetch(`/sessions/${session.id}/stage/navigate`, {
				method: 'POST',
				body: { action: 'select_channel' } // Missing channelId
			})

			expect(response.status).toBe(400)
			const data = await response.json()
			expect(data.error).toContain('channelId')
		})
	})

	describe('Control Command Protocol', () => {
		it('should generate unique commandId for each request', async () => {
			const session = await createSession({
				name: 'stage-control-command-id-test',
				config: {
					botUser: { username: 'ControlTestBot' },
					guilds: [{ name: 'Test Guild' }]
				}
			})

			stageWs = await connectStage(session.token)
			await waitForStageEvent(stageWs, 'connected')
			await waitForStageEvent(stageWs, 'state_sync')

			const receivedCommandIds: string[] = []

			setupControlCommandHandler(stageWs, (cmd) => {
				receivedCommandIds.push(cmd.commandId)
				return {
					success: true,
					result: {
						mode: 'playback',
						isPlaying: false,
						currentTime: 0,
						duration: 0,
						speed: 1,
						eventIndex: 0,
						totalEvents: 0,
						timestamp: Date.now()
					}
				}
			})

			// Make two requests
			await controlAPI(`/sessions/${session.id}/stage/playback`, {
				method: 'POST',
				body: { action: 'pause' }
			})
			await controlAPI(`/sessions/${session.id}/stage/playback`, {
				method: 'POST',
				body: { action: 'play' }
			})

			// Command IDs should be unique
			expect(receivedCommandIds.length).toBe(2)
			expect(receivedCommandIds[0]).not.toBe(receivedCommandIds[1])
		})

		it('should include correct kind in control command', async () => {
			const session = await createSession({
				name: 'stage-control-kind-test',
				config: {
					botUser: { username: 'ControlTestBot' },
					guilds: [{ name: 'Test Guild' }]
				}
			})

			stageWs = await connectStage(session.token)
			await waitForStageEvent(stageWs, 'connected')
			await waitForStageEvent(stageWs, 'state_sync')

			let receivedKind: string | null = null

			setupControlCommandHandler(stageWs, (cmd) => {
				receivedKind = cmd.kind
				return {
					success: true,
					result: {
						guildId: null,
						channelId: null,
						timestamp: Date.now()
					}
				}
			})

			await controlAPI(`/sessions/${session.id}/stage/navigate`, {
				method: 'POST',
				body: { action: 'select_guild', guildId: null }
			})

			expect(receivedKind).toBe('navigation_control')
		})
	})
})
