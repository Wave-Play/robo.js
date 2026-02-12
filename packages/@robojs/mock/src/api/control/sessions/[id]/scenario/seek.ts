import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../../core/manager.js'
import { getControlEventsHub } from '../../../../../core/control-events.js'
import { getStageServer } from '../../../../../core/stage.js'
import { notFound, badRequest } from '../../../utils.js'
import type { StagePlaybackChangedData } from '../../../../../types/stage.js'

/**
 * POST /api/control/sessions/:id/scenario/seek - Seek to a specific step
 *
 * Navigate to a previously executed step (view navigation, not re-execution).
 * The stepIndex must be within the range of already-executed steps.
 *
 * Request:
 * {
 *   stepIndex: number  // Target step index (0-based, must be within executed range)
 * }
 *
 * Response: ScenarioRunState
 *
 * Errors:
 * - 400: No scenario loaded, stepIndex out of range, or invalid request
 * - 404: Session not found
 */
export async function POST(request: RoboRequest) {
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

	// Parse request body
	let stepIndex: number
	try {
		const body = await request.json()
		if (typeof body.stepIndex !== 'number') {
			return badRequest('stepIndex must be a number')
		}
		stepIndex = body.stepIndex
	} catch {
		return badRequest('Invalid JSON body')
	}

	// Validate stepIndex is a non-negative integer
	if (!Number.isInteger(stepIndex) || stepIndex < 0) {
		return badRequest('stepIndex must be a non-negative integer')
	}

	// Seek to the step
	try {
		const runner = session.scenarioManager.getRunner()
		const state = runner.seek(stepIndex)

		// If we have a Stage playback snapshot for this step, best-effort rewind the Stage UI
		// so consumers (e.g. Disgraph) can show the earlier boundary without re-executing the bot.
		const snapshot = runner.getSnapshotStore().get(stepIndex)
		if (snapshot?.playbackTime !== undefined) {
			try {
				const stageServer = getStageServer()
				if (stageServer.hasStageClients(id)) {
					// Ensure playback mode so the Stage UI uses the recorded event stream.
					await stageServer.sendControlCommand(id, 'playback_control', { action: 'set_mode', mode: 'playback' }, 1000)

					// Seek to the recorded boundary time (ms from first event).
					const response = await stageServer.sendControlCommand(
						id,
						'playback_control',
						{
							action: 'seek_to_time',
							time: snapshot.playbackTime
						},
						1000
					)

					if (response.success) {
						// Broadcast playback change for external subscribers.
						try {
							getControlEventsHub().broadcast(id, 'stage.playback.changed', response.result as StagePlaybackChangedData)
						} catch {
							// Control events hub may not be initialized in all contexts
						}
					}
				}
			} catch {
				// Ignore Stage rewind failures (no Stage client, timeout, etc.)
			}
		}

		return state
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Failed to seek'
		return badRequest(message)
	}
}
