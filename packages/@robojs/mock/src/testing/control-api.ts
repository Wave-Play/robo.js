/**
 * Control API Helpers
 *
 * Utilities for interacting with the mock server's control API during tests.
 */
import fs from 'node:fs'
import path from 'node:path'
import type {
	CreateTestSessionConfig,
	InteractionData,
	MockConfig,
	MockMessage,
	RecordedAction,
	SessionResponse,
	SessionState,
	TestSession
} from './types.js'
import { DEFAULT_MOCK_CONFIG } from './types.js'
import { registerTestFile } from '../session/registry.js'
import { getMockPluginPrefix } from '../utils/server.js'
import type { MockServerInfo } from '../utils/server-info.js'

// ============================================================================
// Configuration
// ============================================================================

let mockConfig: MockConfig = { ...DEFAULT_MOCK_CONFIG }

/** Cached server info to avoid repeated file reads */
let cachedServerInfo: MockServerInfo | null | undefined = undefined

/**
 * Read server info synchronously for use in getMockConfig()
 */
function readServerInfoSync(): MockServerInfo | null {
	if (cachedServerInfo !== undefined) {
		return cachedServerInfo
	}

	try {
		const serverInfoPath = path.join(process.cwd(), '.robo', 'mock', 'server.json')
		const content = fs.readFileSync(serverInfoPath, 'utf-8')
		cachedServerInfo = JSON.parse(content) as MockServerInfo
		return cachedServerInfo
	} catch {
		cachedServerInfo = null
		return null
	}
}

/**
 * Configure the mock server URLs
 */
export function configureMock(config: Partial<MockConfig>): void {
	mockConfig = { ...mockConfig, ...config }
}

/**
 * Get current mock configuration
 * Automatically uses ROBO_MOCK_PORT environment variable if set
 * and reads server info for correct URLs (standalone vs embedded mode)
 */
export function getMockConfig(): MockConfig {
	const port = process.env.ROBO_MOCK_PORT
	const prefix = getMockPluginPrefix()

	if (port) {
		const baseUrl = `http://localhost:${port}`

		// Try to read server info for the correct control URL
		// In standalone mode, control routes are at /api/control (no prefix)
		// In embedded mode, they would be at /mock/api/control (with prefix)
		const serverInfo = readServerInfoSync()
		const controlUrl = serverInfo?.controlUrl ?? `${baseUrl}${prefix}/api/control`

		return {
			...mockConfig,
			baseUrl,
			controlUrl,
			restUrl: `${baseUrl}${prefix}/api`,
			gatewayUrl: `ws://localhost:${port}${prefix}/gateway`
		}
	}

	// When no port specified, use prefix (embedded mode)
	return {
		...mockConfig,
		controlUrl: `${mockConfig.baseUrl}${prefix}/api/control`,
		restUrl: `${mockConfig.baseUrl}${prefix}/api`,
		gatewayUrl: `${mockConfig.gatewayUrl}${prefix}/gateway`
	}
}

/**
 * Reset mock configuration to defaults
 */
export function resetMockConfig(): void {
	mockConfig = { ...DEFAULT_MOCK_CONFIG }
}

// ============================================================================
// Control API Request Helper
// ============================================================================

/**
 * Custom JSON serializer that handles BigInt values
 */
function serializeBody(body: unknown): string {
	return JSON.stringify(body, (_key, value) => {
		if (typeof value === 'bigint') {
			return value.toString()
		}
		return value
	})
}

/**
 * Make a request to the control API
 */
export async function controlAPI<T = unknown>(
	endpoint: string,
	options: {
		method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
		body?: unknown
	} = {}
): Promise<T> {
	const config = getMockConfig()
	const url = `${config.controlUrl}${endpoint}`

	const headers: Record<string, string> = {}
	if (options.body) {
		headers['Content-Type'] = 'application/json'
	}

	// Add test run ID header if available
	const testRunId = process.env.ROBO_MOCK_TEST_RUN_ID
	if (testRunId) {
		headers['X-Mock-Test-Run'] = testRunId
	}

	const response = await fetch(url, {
		method: options.method ?? 'GET',
		headers,
		body: options.body ? serializeBody(options.body) : undefined
	})

	if (!response.ok) {
		const text = await response.text()
		throw new Error(`Control API error: ${response.status} - ${text}`)
	}

	return response.json() as Promise<T>
}

// ============================================================================
// Session Management
// ============================================================================

/**
 * Create a new test session
 */
export async function createSession(config: CreateTestSessionConfig = {}): Promise<{
	id: string
	token: string
	botUser: { id: string; username: string }
	guilds: Array<{ id: string; name: string }>
	channels: Array<{ id: string; name: string; guildId?: string; type: number }>
	guildId: string
}> {
	// Create the session - state is included in the response
	const response = await controlAPI<SessionResponse>('/sessions', {
		method: 'POST',
		body: config
	})

	const { state } = response
	const guilds = state.guilds.map((g) => ({ id: g.id, name: g.name }))

	return {
		id: response.session_id,
		token: response.token,
		botUser: {
			id: state.botUser.id,
			username: state.botUser.username
		},
		guilds,
		channels: state.channels.map((c) => ({ id: c.id, name: c.name, guildId: c.guildId, type: c.type })),
		guildId: guilds[0]?.id ?? ''
	}
}

/**
 * Delete a session
 */
export async function deleteSession(sessionId: string): Promise<void> {
	await controlAPI(`/sessions/${sessionId}`, { method: 'DELETE' })
}

/**
 * Reset a session to its initial state
 */
export async function resetSession(sessionId: string): Promise<void> {
	await controlAPI(`/sessions/${sessionId}/reset`, { method: 'POST' })
}

/**
 * Get session state
 */
export async function getSessionState(sessionId: string): Promise<SessionState> {
	return controlAPI(`/sessions/${sessionId}/state`)
}

/**
 * Get messages from a channel
 */
export async function getChannelMessages(
	sessionId: string,
	channelId: string,
	limit = 50
): Promise<MockMessage[]> {
	const response = (await controlAPI(
		`/sessions/${sessionId}/channels/${channelId}?include_messages=true&message_limit=${limit}`
	)) as { messages?: MockMessage[] }
	return response.messages || []
}

// ============================================================================
// Event Dispatch
// ============================================================================

/**
 * Dispatch a Discord event to a session
 */
export async function dispatchEvent(
	sessionId: string,
	event: string,
	data: Record<string, unknown>
): Promise<{ success: boolean; dispatched: number }> {
	return controlAPI(`/sessions/${sessionId}/dispatch`, {
		method: 'POST',
		body: { event, data }
	})
}

/**
 * Dispatch an interaction to a session
 */
export async function dispatchInteraction(
	sessionId: string,
	interaction: InteractionData
): Promise<{ success: boolean; interaction_id: string }> {
	return controlAPI(`/sessions/${sessionId}/interaction`, {
		method: 'POST',
		body: interaction
	})
}

// ============================================================================
// Action Recording
// ============================================================================

/**
 * Get recorded actions for a session
 */
export async function getSessionActions(
	sessionId: string,
	options?: {
		type?: string
		limit?: number
		since?: number
	}
): Promise<{ actions: RecordedAction[] }> {
	const params = new URLSearchParams()
	if (options?.type) params.set('type', options.type)
	if (options?.limit) params.set('limit', String(options.limit))
	if (options?.since) params.set('since', String(options.since))
	const query = params.toString()
	return controlAPI(`/sessions/${sessionId}/actions${query ? `?${query}` : ''}`)
}

/**
 * Clear recorded actions for a session
 */
export async function clearSessionActions(sessionId: string): Promise<void> {
	await controlAPI(`/sessions/${sessionId}/actions`, { method: 'DELETE' })
}

// ============================================================================
// Test Session Factory
// ============================================================================

/**
 * Get the shared session info from the environment
 * Set by `robo mock test` command
 */
async function getSharedSession(): Promise<{
	id: string
	token: string
	botUser: { id: string; username: string }
	guilds: Array<{ id: string; name: string }>
	channels: Array<{ id: string; name: string; guildId?: string; type: number }>
	guildId: string
} | null> {
	const sharedSessionId = process.env.ROBO_MOCK_SHARED_SESSION_ID
	if (!sharedSessionId) {
		return null
	}

	// Fetch session state from the control API
	try {
		const response = await controlAPI<{
			session_id: string
			token: string
			state: {
				botUser: { id: string; username: string }
				guilds: Array<{ id: string; name: string }>
				channels: Array<{ id: string; name: string; guildId?: string; type: number }>
			}
		}>(`/sessions/${sharedSessionId}`)

		const { state } = response
		const guilds = state.guilds.map((g) => ({ id: g.id, name: g.name }))

		return {
			id: sharedSessionId,
			token: response.token,
			botUser: {
				id: state.botUser.id,
				username: state.botUser.username
			},
			guilds,
			channels: state.channels.map((c) => ({ id: c.id, name: c.name, guildId: c.guildId, type: c.type })),
			guildId: guilds[0]?.id ?? ''
		}
	} catch {
		// Shared session not available, will create a new one
		return null
	}
}

/**
 * Create a test session with automatic registry tracking
 *
 * When running via `robo mock test`, this returns the shared session
 * that the bot is connected to. Otherwise, it creates a new session.
 *
 * @param testFilePath - Path to the test file (use __filename)
 * @param config - Session configuration
 */
export async function createTestSession(
	testFilePath: string,
	config: CreateTestSessionConfig = {}
): Promise<TestSession> {
	// Check if we should use the shared session
	const sharedSession = await getSharedSession()

	const session = sharedSession ?? (await createSession(config))

	// Register with the test registry
	registerTestFile(session.id, testFilePath)

	// Return wrapped session with convenience methods
	return {
		id: session.id,
		token: session.token,
		name: config.name,
		botUser: session.botUser,
		guilds: session.guilds,
		channels: session.channels,
		guildId: session.guildId,
		testFilePath,

		async destroy(): Promise<void> {
			// Don't destroy the shared session - it's managed by robo mock test
			if (!sharedSession) {
				await deleteSession(session.id)
			}
		}
	}
}

// ============================================================================
// REST API Helper
// ============================================================================

/**
 * Make a request to the mock server REST API
 * Useful for testing API endpoints directly
 */
export async function mockRestAPI<T = unknown>(
	token: string,
	endpoint: string,
	options: {
		method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
		body?: unknown
	} = {}
): Promise<T> {
	const url = `${mockConfig.restUrl}/v10${endpoint}`
	const response = await fetch(url, {
		method: options.method ?? 'GET',
		headers: {
			Authorization: `Bot ${token}`,
			...(options.body ? { 'Content-Type': 'application/json' } : {})
		},
		body: options.body ? serializeBody(options.body) : undefined
	})

	if (!response.ok) {
		const text = await response.text()
		throw new Error(`REST API error: ${response.status} - ${text}`)
	}

	return response.json() as Promise<T>
}
