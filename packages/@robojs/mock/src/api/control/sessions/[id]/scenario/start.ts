import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../../core/manager.js'
import { validateMethod, notFound, badRequest } from '../../../utils.js'

/**
 * POST /api/control/sessions/:id/scenario/start - Start scenario execution
 *
 * Request:
 * {
 *   mode?: "continuous" | "step"  // Default: "continuous"
 * }
 *
 * Response: ScenarioRunState
 *
 * Errors:
 * - 400: No scenario loaded or scenario not in 'loaded' status
 * - 404: Session not found
 */
export default async (request: RoboRequest) => {
	validateMethod(request, ['POST'])

	const { id } = request.params as { id: string }

	if (!id) {
		return notFound('Session ID required')
	}

	const session = sessionManager.get(id)

	if (!session) {
		return notFound('Session not found')
	}

	// Check if scenario is loaded
	if (!session.scenarioManager.hasScenario()) {
		return badRequest('No scenario loaded')
	}

	// Check if runner is available
	if (!session.scenarioManager.hasRunner()) {
		return badRequest('Scenario runner not available')
	}

	// Parse request body for mode
	let mode: 'continuous' | 'step' = 'continuous'
	try {
		const body = await request.json()
		if (body.mode === 'step') {
			mode = 'step'
		}
	} catch {
		// Empty body is OK, use default mode
	}

	// Start the scenario
	try {
		const state = await session.scenarioManager.getRunner().start(mode)
		return state
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Failed to start scenario'
		return badRequest(message)
	}
}
