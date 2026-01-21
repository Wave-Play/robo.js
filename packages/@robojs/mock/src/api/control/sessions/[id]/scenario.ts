import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../core/manager.js'
import { validateMethod, notFound, badRequest } from '../../utils.js'
import type { ScenarioDefinition } from '../../../../types/index.js'
import { getStageServer } from '../../../../core/stage.js'
import { getControlEventsHub } from '../../../../core/control-events.js'

/**
 * POST /api/control/sessions/:id/scenario - Load a scenario into the session
 *
 * Request body: ScenarioDefinition
 * {
 *   version: 1,
 *   id: string,
 *   metadata: { name: string, ... },
 *   steps: ScenarioStep[],
 *   compatibility?: ScenarioCompatibility,
 *   mockConfig?: ScenarioMockConfig
 * }
 *
 * Response:
 * {
 *   run_id: string,
 *   scenario_id: string,
 *   step_count: number,
 *   warnings?: string[]
 * }
 *
 * DELETE /api/control/sessions/:id/scenario - Clear the loaded scenario
 *
 * Response:
 * { success: true }
 */
export default async (request: RoboRequest) => {
	validateMethod(request, ['POST', 'DELETE'])

	const { id } = request.params as { id: string }

	if (!id) {
		return notFound('Session ID required')
	}

	const session = sessionManager.get(id)

	if (!session) {
		return notFound('Session not found')
	}

	// Handle DELETE - clear scenario
	if (request.method === 'DELETE') {
		session.scenarioManager.clear()

		// Emit scenario idle event (Phase 7) so external clients can react immediately.
		const idleState = session.scenarioManager.getRunState()
		const idleEventData = {
			runId: idleState.runId,
			scenarioId: idleState.scenarioId,
			status: 'idle' as const,
			currentStepIndex: idleState.currentStepIndex,
			totalSteps: idleState.totalSteps,
			successCount: idleState.successCount,
			failureCount: idleState.failureCount,
			skippedCount: idleState.skippedCount,
			timestamp: Date.now()
		}

		try {
			getStageServer().broadcastToSession(session.id, {
				type: 'scenario.run.idle',
				data: idleEventData
			})
		} catch {
			// Stage server may not be initialized in all contexts
		}

		try {
			getControlEventsHub().broadcast(session.id, 'scenario.run.idle', idleEventData)
		} catch {
			// Control events hub may not be initialized in all contexts
		}

		return { success: true }
	}

	// Handle POST - load scenario
	let scenario: ScenarioDefinition
	try {
		scenario = await request.json()
	} catch {
		return badRequest('Invalid JSON body')
	}

	// Validate required top-level fields exist
	if (!scenario || typeof scenario !== 'object') {
		return badRequest('Request body must be a scenario object')
	}

	// Load the scenario (validation happens inside ScenarioManager)
	try {
		const result = session.scenarioManager.load(scenario)

		// Apply mockConfig to session state if provided
		if (scenario.mockConfig) {
			applyMockConfig(session, scenario.mockConfig)
		}

		// Emit scenario loaded event (Phase 7) so clients can react without polling.
		const loadedState = session.scenarioManager.getRunState()
		const loadedEventData = {
			runId: loadedState.runId,
			scenarioId: loadedState.scenarioId,
			status: 'loaded' as const,
			currentStepIndex: loadedState.currentStepIndex,
			totalSteps: loadedState.totalSteps,
			successCount: loadedState.successCount,
			failureCount: loadedState.failureCount,
			skippedCount: loadedState.skippedCount,
			timestamp: Date.now()
		}

		try {
			getStageServer().broadcastToSession(session.id, {
				type: 'scenario.run.loaded',
				data: loadedEventData
			})
		} catch {
			// Stage server may not be initialized in all contexts
		}

		try {
			getControlEventsHub().broadcast(session.id, 'scenario.run.loaded', loadedEventData)
		} catch {
			// Control events hub may not be initialized in all contexts
		}

		return {
			run_id: result.runId,
			scenario_id: result.scenarioId,
			step_count: result.stepCount,
			...(result.warnings.length > 0 ? { warnings: result.warnings } : {})
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown validation error'
		return badRequest(message)
	}
}

/**
 * Apply mock configuration from scenario to session state.
 * Sets up users, guilds, channels as specified in the scenario.
 */
function applyMockConfig(
	session: import('../../../../types/index.js').Session,
	mockConfig: NonNullable<ScenarioDefinition['mockConfig']>
): void {
	// Apply user configuration (update current user properties)
	if (mockConfig.user) {
		const userConfig = mockConfig.user
		if (userConfig.username || userConfig.avatar || userConfig.globalName) {
			session.state.updateCurrentUser({
				username: userConfig.username,
				avatar: userConfig.avatar,
				globalName: userConfig.globalName
			})
		}
	}

	// Note: Guild and channel creation would require more complex logic
	// and is primarily handled by scenario steps. For MVP, we focus on
	// user configuration which is most commonly needed.

	// Time configuration (fixedTime, timeScale) would require hooking into
	// Date.now() which is deferred for now. The mockConfig is stored in the
	// scenario definition and can be accessed by the runner in Phase 5.
}
