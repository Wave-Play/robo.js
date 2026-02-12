import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../../core/manager.js'
import { validateMethod, notFound, badRequest } from '../../../utils.js'

type EnforcementLevel = 'none' | 'basic' | 'strict'

/**
 * GET/POST /api/control/sessions/:id/permissions/enforcement
 *
 * GET Response:
 * {
 *   level: 'none' | 'basic' | 'strict',
 *   is_runtime: boolean  // true if set at runtime, false if using config default
 * }
 *
 * POST Request body:
 * {
 *   level: 'none' | 'basic' | 'strict' | null  // null to reset to config default
 * }
 *
 * POST Response:
 * {
 *   success: true,
 *   level: 'none' | 'basic' | 'strict',
 *   is_runtime: boolean
 * }
 *
 * @see Permissions Admin UI
 */
export default async (request: RoboRequest) => {
	validateMethod(request, ['GET', 'POST'])

	const { id } = request.params as { id: string }

	if (!id) {
		return notFound('Session ID required')
	}

	const session = sessionManager.get(id) ?? sessionManager.getByToken(id)

	if (!session) {
		return notFound('Session not found')
	}

	// GET - Check current enforcement level
	if (request.method === 'GET') {
		// Access private field to check if runtime value is set
		const runtimeLevel = (session as unknown as { _permissionEnforcement: EnforcementLevel | null })._permissionEnforcement
		const isRuntime = runtimeLevel !== null

		return {
			level: session.permissionEnforcement,
			is_runtime: isRuntime
		}
	}

	// POST - Set enforcement level
	let body: {
		level?: EnforcementLevel | null
	}

	try {
		body = await request.json()
	} catch {
		return badRequest('Invalid JSON body')
	}

	// Validate level if provided and not null
	if (body.level !== undefined && body.level !== null) {
		const validLevels: EnforcementLevel[] = ['none', 'basic', 'strict']
		if (!validLevels.includes(body.level)) {
			return badRequest(`level must be one of: ${validLevels.join(', ')}, or null to reset`)
		}
	}

	// Set the enforcement level (null resets to config default)
	session.permissionEnforcement = body.level ?? null

	// Access private field to check if runtime value is set
	const runtimeLevel = (session as unknown as { _permissionEnforcement: EnforcementLevel | null })._permissionEnforcement
	const isRuntime = runtimeLevel !== null

	return {
		success: true,
		level: session.permissionEnforcement,
		is_runtime: isRuntime
	}
}
