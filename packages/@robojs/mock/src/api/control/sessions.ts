import { define } from '@robojs/server'
import { z } from 'zod'
import { sessionManager } from '../../core/manager.js'
import type { CreateSessionOptions, SessionConfig } from '../../types/index.js'
import { badRequest } from './utils.js'
import { serializeSessionState } from '../../session/state.js'

/**
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

const CreateSessionSchema = z.object({
	name: z.string().optional(),
	ttl: z.number().optional(),
	config: z.unknown().optional()
})

export const POST = define({ body: CreateSessionSchema }, async (request) => {
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
})
