import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../../core/manager.js'
import { validateMethod, notFound } from '../../../utils.js'

/**
 * GET /api/control/sessions/:id/scenario/state - Get current scenario run state
 *
 * Returns the current state of the scenario run, useful for polling
 * by clients that cannot use WebSocket subscriptions.
 *
 * Response (when scenario loaded):
 * {
 *   runId: string,
 *   scenarioId: string,
 *   status: "idle" | "loaded" | "running" | "paused" | "completed" | "failed" | "stopped" | "error",
 *   currentStepIndex: number,
 *   totalSteps: number,
 *   stepResults: ScenarioStepResult[],
 *   successCount: number,
 *   failureCount: number,
 *   skippedCount: number,
 *   hasFailures: boolean,
 *   errors: ScenarioRunError[],
 *   startedAt?: number,
 *   endedAt?: number,
 *   lastStepAt?: number
 * }
 *
 * Response (when no scenario loaded):
 * {
 *   runId: "",
 *   scenarioId: "",
 *   status: "idle",
 *   currentStepIndex: 0,
 *   totalSteps: 0,
 *   stepResults: [],
 *   successCount: 0,
 *   failureCount: 0,
 *   skippedCount: 0,
 *   hasFailures: false,
 *   errors: []
 * }
 */
export default async (request: RoboRequest) => {
	validateMethod(request, ['GET'])

	const { id } = request.params as { id: string }

	if (!id) {
		return notFound('Session ID required')
	}

	const session = sessionManager.get(id)

	if (!session) {
		return notFound('Session not found')
	}

	// Return the run state (idle state if no scenario loaded)
	return session.scenarioManager.getRunState()
}
