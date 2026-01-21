/**
 * Prepare Hook - WebSocket Handler Registration Setup
 *
 * This hook runs during Robo.start() BEFORE start hooks. Since prepare hooks
 * run alphabetically (mock < server), the server engine won't exist yet.
 *
 * To solve this, we register a callback that @robojs/server's prepare hook
 * will call after creating the engine. This ensures WebSocket handlers are
 * registered before any start hooks run.
 *
 * Execution order:
 * 1. @robojs/mock prepare hook - registers engine callback (this file)
 * 2. @robojs/server prepare hook - creates engine, calls callback
 * 3. @robojs/discordjs start hook - connects to gateway (handlers ready!)
 * 4. @robojs/mock start hook - starts voice gateway, creates session
 * 5. @robojs/server start hook - starts listening
 */
import { getGatewayServer } from '../core/gateway.js'
import { getStageServer } from '../core/stage.js'
import { getControlEventsHub } from '../core/control-events.js'
import { mockLogger } from '../core/logger.js'
import { getMockPluginPrefix } from '../utils/server.js'
import type { BaseEngine } from '@robojs/server/engines'

// Type for the global callbacks array used by @robojs/server
type EngineCallbackArray = Array<(engine: BaseEngine) => void>

/**
 * Prepare hook - Registers a callback for when the server engine is ready
 */
export default async () => {
	const isStandalone = process.env.__ROBO_MOCK_STANDALONE === 'true'
	const isMockMode = process.env.ROBO_MOCK_MODE === 'true'

	// In standalone mode, always register handlers (CLI manages mock infrastructure)
	if (isStandalone) {
		mockLogger.debug('Standalone mode - registering WebSocket handler callback')
		registerEngineCallback()
		return
	}

	// For robo dev --mock: Only register WebSocket handlers if in mock mode
	if (!isMockMode) {
		mockLogger.debug('Not in mock mode, skipping prepare hook')
		return
	}

	// Skip local WebSocket registration if connecting to external mock server
	// (via --mock-session flag). The external server handles WebSockets.
	const connectingToExisting = process.env.__ROBO_MOCK_CONNECT_EXISTING === 'true'
	if (connectingToExisting) {
		mockLogger.debug('Connecting to external mock server, skipping local WebSocket registration')
		return
	}

	// Register callback for robo dev --mock mode
	registerEngineCallback()
}

/**
 * Register a callback that @robojs/server will call after creating the engine.
 * This ensures WebSocket handlers are registered before start hooks run.
 */
function registerEngineCallback(): void {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const globalAny = globalThis as any
	if (!globalAny.__roboServerEngineCallbacks) {
		globalAny.__roboServerEngineCallbacks = []
	}

	;(globalAny.__roboServerEngineCallbacks as EngineCallbackArray).push((engine: BaseEngine) => {
		mockLogger.debug('Server engine ready - registering WebSocket handlers')
		registerWebSocketHandlers(engine)
		markHandlersRegistered()
	})

	mockLogger.debug('Registered engine callback for WebSocket handler setup')
}

/**
 * Register WebSocket handlers on the server engine
 * Exported so start hook can call this as fallback
 */
export function registerWebSocketHandlers(engine: BaseEngine): void {
	const gatewayServer = getGatewayServer()
	const stageServer = getStageServer()

	// Get plugin prefix for WebSocket path registration
	const pluginPrefix = getMockPluginPrefix()

	// Register Discord Gateway WebSocket upgrade handler at root path
	// Discord clients connect to: ws://host/?v=10&encoding=json
	engine.registerWebsocket('/', (req, socket, head) => {
		gatewayServer.handleUpgrade(req, socket, head)
	})

	// Register Stage WebSocket upgrade handler
	// Stage clients connect to: ws://host/stage/ws?token=mock:session_xxx
	const stageWsHandler = (
		req: Parameters<typeof stageServer.handleUpgrade>[0],
		socket: Parameters<typeof stageServer.handleUpgrade>[1],
		head: Parameters<typeof stageServer.handleUpgrade>[2]
	) => {
		stageServer.handleUpgrade(req, socket, head)
	}
	engine.registerWebsocket('/stage/ws', stageWsHandler)

	// Also register at prefixed path for when plugin has a static prefix (e.g., /mock)
	if (pluginPrefix) {
		engine.registerWebsocket(`${pluginPrefix}/stage/ws`, stageWsHandler)
		mockLogger.debug(`Registered Stage WebSocket at prefixed path: ${pluginPrefix}/stage/ws`)
	}

	// Register Control Events WebSocket upgrade handler
	// SDK/Disgraph clients connect to: ws://host/api/control/events?session_id=sess_xxx
	const controlEventsHub = getControlEventsHub()
	const controlEventsHandler = (
		req: Parameters<typeof controlEventsHub.handleUpgrade>[0],
		socket: Parameters<typeof controlEventsHub.handleUpgrade>[1],
		head: Parameters<typeof controlEventsHub.handleUpgrade>[2]
	) => {
		controlEventsHub.handleUpgrade(req, socket, head)
	}
	engine.registerWebsocket('/api/control/events', controlEventsHandler)

	// Also register at prefixed path for plugin compatibility
	if (pluginPrefix) {
		engine.registerWebsocket(`${pluginPrefix}/api/control/events`, controlEventsHandler)
		mockLogger.debug(`Registered Control Events WebSocket at prefixed path: ${pluginPrefix}/api/control/events`)
	}

	mockLogger.debug('WebSocket handlers registered on server engine')
}

/**
 * Track whether handlers have been registered (to avoid double registration)
 */
let handlersRegistered = false

export function areHandlersRegistered(): boolean {
	return handlersRegistered
}

export function markHandlersRegistered(): void {
	handlersRegistered = true
}

export function resetHandlersRegistered(): void {
	handlersRegistered = false
}
