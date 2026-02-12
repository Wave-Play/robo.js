import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../core/manager.js'
import { badRequest, notFound } from './utils.js'
import { DEFAULT_APPROVED_PRIVILEGED_INTENTS, PRIVILEGED_INTENTS } from '../../core/intents.js'
import type { Session } from '../../session/session.js'

/**
 * GET /api/control/intents - Get intent configuration
 * POST /api/control/intents - Update intent configuration
 *
 * Intent Handling & Filtering
 *
 * Session is identified via Authorization header containing the mock token
 * e.g., Authorization: mock:sess_abc123
 */

interface SetIntentsConfigRequest {
	enforceIntents?: boolean
	approvedPrivilegedIntents?: string // Bitfield as string (bigint serialization)
}

/**
 * Extract session from Authorization header
 * Token format: mock:sess_xxx or just the token directly
 */
function getSessionFromRequest(request: RoboRequest): Session | undefined {
	const authHeader = request.headers.get('authorization')
	if (!authHeader) {
		return undefined
	}

	// Support both "mock:sess_xxx" and "Bearer mock:sess_xxx" formats
	let token = authHeader
	if (token.toLowerCase().startsWith('bearer ')) {
		token = token.slice(7)
	}

	return sessionManager.getByToken(token) as Session | undefined
}

function resolveSession(request: RoboRequest) {
	const session = getSessionFromRequest(request)
	if (!session) {
		return notFound('Session not found. Provide valid mock token in Authorization header.')
	}
	return { session }
}

export async function GET(request: RoboRequest) {
	const resolved = resolveSession(request)
	if (resolved instanceof Response) return resolved
	const { session } = resolved

	// Get connection intents if any connections exist
	let connectionIntents: string | null = null
	for (const conn of session.connections.values()) {
		if (conn.identified) {
			connectionIntents = conn.intents.toString()
			break
		}
	}

	return {
		enforceIntents: session.config?.enforceIntents ?? false,
		approvedPrivilegedIntents: (
			session.config?.approvedPrivilegedIntents ?? DEFAULT_APPROVED_PRIVILEGED_INTENTS
		).toString(),
		connectionIntents,
		privilegedIntentBits: {
			GuildMembers: (1n << 1n).toString(),
			GuildPresences: (1n << 8n).toString(),
			MessageContent: (1n << 15n).toString(),
			all: PRIVILEGED_INTENTS.toString()
		}
	}
}

export async function POST(request: RoboRequest) {
	const resolved = resolveSession(request)
	if (resolved instanceof Response) return resolved
	const { session } = resolved

	let body: SetIntentsConfigRequest = {}
	try {
		const text = await request.text()
		if (text) {
			body = JSON.parse(text)
		}
	} catch {
		return badRequest('Invalid JSON body')
	}

	// Initialize config if not exists (need to cast to mutable)
	const mutableSession = session as { config?: { enforceIntents?: boolean; approvedPrivilegedIntents?: bigint } }
	if (!mutableSession.config) {
		;(mutableSession as { config: object }).config = {}
	}

	// Update enforceIntents if provided
	if (body.enforceIntents !== undefined) {
		if (typeof body.enforceIntents !== 'boolean') {
			return badRequest('enforceIntents must be a boolean')
		}
		mutableSession.config!.enforceIntents = body.enforceIntents
	}

	// Update approvedPrivilegedIntents if provided
	if (body.approvedPrivilegedIntents !== undefined) {
		try {
			const value = BigInt(body.approvedPrivilegedIntents)
			mutableSession.config!.approvedPrivilegedIntents = value
		} catch {
			return badRequest('approvedPrivilegedIntents must be a valid bigint string')
		}
	}

	return {
		success: true,
		enforceIntents: mutableSession.config!.enforceIntents ?? false,
		approvedPrivilegedIntents: (
			mutableSession.config!.approvedPrivilegedIntents ?? DEFAULT_APPROVED_PRIVILEGED_INTENTS
		).toString()
	}
}
