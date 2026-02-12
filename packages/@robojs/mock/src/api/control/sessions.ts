import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../core/manager.js'
import type { CreateSessionOptions, SessionConfig } from '../../types/index.js'
import { badRequest } from './utils.js'
import { serializeSessionState } from '../../session/state.js'

/**
 * GET /api/control/sessions - List all active sessions
 *
 * Query parameters:
 * - only_ready?: boolean  // If true, only return sessions with connections > 0
 *
 * Response:
 * {
 *   sessions: [{
 *     session_id: string,
 *     token: string,
 *     name?: string,
 *     created_at: number,
 *     expires_at: number,
 *     connections: number,
 *     is_mock_mode: boolean,  // true when ROBO_MOCK_MODE=true AND session matches ROBO_MOCK_SESSION_ID
 *     state: {
 *       botUser: { id, username },
 *       guilds: [{ id, name }],
 *       channels: [{ id, name, guildId?, type }]
 *     }
 *   }]
 * }
 *
 * POST /api/control/sessions - Create a new session
 *
 * Request body:
 * {
 *   name?: string,      // Optional friendly name for debugging
 *   ttl?: number,       // Time-to-live in milliseconds (default: 1 hour)
 *   config?: {
 *     guilds?: [...],   // Pre-configured guilds
 *     users?: [...],    // Pre-configured users
 *     botUser?: {...},  // Bot user configuration
 *     applicationId?: string
 *   }
 * }
 *
 * Response:
 * {
 *   session_id: string,
 *   token: string,      // Format: "mock:<session_id>"
 *   expires_at: number, // Unix timestamp
 *   state: SerializedSessionState  // Full session state
 * }
 */

interface CreateSessionBody {
	name?: string
	ttl?: number
	config?: SessionConfig
}

export async function GET(request: RoboRequest) {
	const url = new URL(request.url)
	const onlyReady = url.searchParams.get('only_ready') === 'true'
	const mockSessionId = process.env.ROBO_MOCK_SESSION_ID

	const sessions = sessionManager.getAll()
	const result = sessions
		.filter((session) => !onlyReady || session.connections.size > 0)
		.map((session) => {
			const guilds = Array.from(session.state.guilds.values()).map((g) => ({
				id: g.id,
				name: g.name
			}))

			const channels = Array.from(session.state.channels.values()).map((c) => ({
				id: c.id,
				name: c.name,
				guildId: c.guildId,
				type: c.type
			}))

			return {
				session_id: session.id,
				token: session.token,
				name: session.name,
				created_at: session.createdAt,
				expires_at: session.expiresAt,
				connections: session.connections.size,
				is_mock_mode: process.env.ROBO_MOCK_MODE === 'true' && session.id === mockSessionId,
				state: {
					botUser: {
						id: session.state.botUser.id,
						username: session.state.botUser.username
					},
					guilds,
					channels
				}
			}
		})

	return { sessions: result }
}

export async function POST(request: RoboRequest) {
	let body: CreateSessionBody = {}

	// Parse body if present
	try {
		const text = await request.text()
		if (text) {
			body = JSON.parse(text)
		}
	} catch {
		return badRequest('Invalid JSON body')
	}

	// Convert approvedPrivilegedIntents from string to bigint if present
	// (JSON serialization converts bigint to string)
	if (body.config?.approvedPrivilegedIntents !== undefined) {
		const intentsValue = body.config.approvedPrivilegedIntents
		if (typeof intentsValue === 'string') {
			try {
				body.config.approvedPrivilegedIntents = BigInt(intentsValue) as unknown as bigint
			} catch {
				return badRequest('approvedPrivilegedIntents must be a valid bigint value')
			}
		}
	}

	const options: CreateSessionOptions = {
		name: body.name,
		ttl: body.ttl,
		config: body.config
	}

	const session = await sessionManager.create(options)

	return {
		session_id: session.id,
		token: session.token,
		expires_at: session.expiresAt,
		state: serializeSessionState(session.state)
	}
}
