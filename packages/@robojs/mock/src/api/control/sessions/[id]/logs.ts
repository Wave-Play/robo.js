import type { RoboRequest } from '@robojs/server'
import type { SessionLogEntry, SessionLogLevel } from '../../../../types/index.js'
import { sessionManager } from '../../../../core/manager.js'
import { notFound, badRequest } from '../../utils.js'

/**
 * GET /api/control/sessions/:id/logs - Get captured session logs
 *
 * Query params:
 * - level: Filter by log level (e.g., "debug", "info", "warn", "error")
 * - since: Filter logs after timestamp (ms)
 * - search: Search in message content
 * - connectionId: Filter by bot connection ID
 * - limit: Maximum number of logs to return (default: 100)
 * - offset: Offset for pagination (default: 0)
 *
 * Response:
 * {
 *   logs: SessionLogEntry[],
 *   total: number,
 *   limit: number,
 *   offset: number
 * }
 *
 * POST /api/control/sessions/:id/logs - Record a log entry from a connected bot
 *
 * Request body:
 * {
 *   timestamp: number,      // Unix timestamp in ms
 *   level: string,          // Log level
 *   message: string,        // Log message
 *   prefix?: string,        // Logger fork prefix
 *   data?: unknown[],       // Structured data
 *   source: {               // Source identification
 *     connectionId: string,
 *     botUserId?: string,
 *     botUsername?: string
 *   }
 * }
 *
 * Response:
 * {
 *   success: true,
 *   logId: string
 * }
 */

function resolveSession(request: RoboRequest) {
	const { id } = request.params as { id: string }
	if (!id) return notFound('Session ID required')
	const session = sessionManager.get(id)
	if (!session) return notFound('Session not found')
	return { session, id }
}

export async function POST(request: RoboRequest) {
	const resolved = resolveSession(request)
	if (resolved instanceof Response) return resolved
	const { session, id } = resolved

	try {
		const body = (await request.json()) as Omit<SessionLogEntry, 'id'>

		// Validate required fields
		if (!body.timestamp || !body.level || !body.message || !body.source?.connectionId) {
			return badRequest('Missing required fields: timestamp, level, message, source.connectionId')
		}

		// Ensure source.sessionId matches
		const entry: Omit<SessionLogEntry, 'id'> = {
			...body,
			source: {
				...body.source,
				sessionId: id
			}
		}

		// Record the log
		const logEntry = session.recordLog(entry)

		return {
			success: true,
			logId: logEntry.id
		}
	} catch (error) {
		return badRequest(`Invalid request body: ${(error as Error).message}`)
	}
}

export async function GET(request: RoboRequest) {
	const resolved = resolveSession(request)
	if (resolved instanceof Response) return resolved
	const { session } = resolved

	// Handle GET - retrieve logs
	const url = new URL(request.url, 'http://localhost')
	const level = url.searchParams.get('level') as SessionLogLevel | null
	const since = url.searchParams.get('since')
	const search = url.searchParams.get('search')
	const connectionId = url.searchParams.get('connectionId')
	const limit = parseInt(url.searchParams.get('limit') ?? '100', 10)
	const offset = parseInt(url.searchParams.get('offset') ?? '0', 10)

	let logs = session.getLogs()

	// Apply filters
	if (level) {
		logs = logs.filter((l) => l.level === level)
	}
	if (since) {
		const sinceTs = parseInt(since, 10)
		logs = logs.filter((l) => l.timestamp >= sinceTs)
	}
	if (search) {
		const searchLower = search.toLowerCase()
		logs = logs.filter(
			(l) =>
				l.message.toLowerCase().includes(searchLower) ||
				(l.prefix && l.prefix.toLowerCase().includes(searchLower))
		)
	}
	if (connectionId) {
		logs = logs.filter((l) => l.source.connectionId === connectionId)
	}

	// Get total before pagination
	const total = logs.length

	// Apply pagination
	logs = logs.slice(offset, offset + limit)

	return {
		logs,
		total,
		limit,
		offset
	}
}
