/**
 * Server Info Utilities
 *
 * Manages .robo/mock/server.json for port discovery between
 * standalone mock server and bots connecting via --mock-session.
 */
import fs from 'node:fs/promises'
import path from 'node:path'

/** Default port for standalone mock server (MOCK on phone keypad: M=6, O=6, C=2, K=5) */
export const STANDALONE_MOCK_PORT = 6625

/** Server info file path */
const SERVER_INFO_PATH = path.join(process.cwd(), '.robo', 'mock', 'server.json')

export interface MockServerInfo {
	/** Port the mock server is running on */
	port: number
	/** When the server started */
	startedAt: string
	/** Process ID of the server */
	pid: number
	/** Gateway WebSocket URL */
	gatewayUrl: string
	/** REST API URL */
	restApiUrl: string
	/** Control API URL (for session management, dispatching events, etc.) */
	controlUrl?: string
}

/**
 * Write server info file when starting standalone mock server.
 */
export async function writeServerInfo(info: MockServerInfo): Promise<void> {
	const dir = path.dirname(SERVER_INFO_PATH)
	await fs.mkdir(dir, { recursive: true })
	await fs.writeFile(SERVER_INFO_PATH, JSON.stringify(info, null, 2))
}

/**
 * Read server info file for port discovery.
 * Returns null if file doesn't exist or is invalid.
 */
export async function readServerInfo(): Promise<MockServerInfo | null> {
	try {
		const content = await fs.readFile(SERVER_INFO_PATH, 'utf-8')
		return JSON.parse(content) as MockServerInfo
	} catch {
		return null
	}
}

/**
 * Delete server info file on shutdown.
 */
export async function deleteServerInfo(): Promise<void> {
	try {
		await fs.unlink(SERVER_INFO_PATH)
	} catch {
		// Ignore if doesn't exist
	}
}

