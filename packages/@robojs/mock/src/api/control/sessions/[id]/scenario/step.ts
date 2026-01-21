import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../../core/manager.js'
import { validateMethod, notFound, badRequest } from '../../../utils.js'

/**
 * POST /api/control/sessions/:id/scenario/step - Execute a single step
 *
 * Request: {} (empty body)
 *
 * Response:
 * {
 *   state: ScenarioRunState,
 *   stepResult?: ScenarioStepResult
 * }
 *
 * Errors:
 * - 400: No scenario loaded or scenario not in 'loaded', 'paused', or 'failed' status
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

	// Execute a single step
	try {
		const result = await session.scenarioManager.getRunner().step()
		return result
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Failed to execute step'
		return badRequest(message)
	}
}
