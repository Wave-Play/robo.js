import type { Session } from '../../session.js'
import type { ScenarioWaitStep, ActionType, RecordedAction } from '../../../types/index.js'
import type { StepExecutionContext, StepExecutorResult } from './dispatch.js'

/** Default timeout for wait conditions (5 seconds) */
const DEFAULT_WAIT_TIMEOUT = 5000

/** Polling interval for action conditions (100ms) */
const POLL_INTERVAL = 100

/**
 * Execute a wait step by pausing for a duration or waiting for a condition.
 *
 * Supports:
 * - duration: Fixed wait time in milliseconds
 * - forActionType: Wait for a specific action type
 * - forAnyActionType: Wait for any of the specified action types
 * - forAction: Wait for an action matching custom criteria
 */
export async function executeWaitStep(
	session: Session,
	step: ScenarioWaitStep,
	context: StepExecutionContext
): Promise<StepExecutorResult> {
	const { wait } = step
	const timeout = step.timeout ?? DEFAULT_WAIT_TIMEOUT
	const recordedActionIds: string[] = []

	try {
		// Duration wait: simple sleep
		if (wait.duration !== undefined) {
			await sleep(wait.duration)
			return {
				success: true,
				recordedActionIds
			}
		}

		// Action-based waits: poll recorder until condition met or timeout
		const startTime = Date.now()

		while (Date.now() - startTime < timeout) {
			const actions = session.recorder.getSince(context.startTimestamp)

			// forActionType: wait for a specific action type
			if (wait.forActionType !== undefined) {
				const found = actions.find((a) => a.type === wait.forActionType)
				if (found) {
					for (const action of actions) {
						recordedActionIds.push(action.id)
					}
					return { success: true, recordedActionIds }
				}
			}

			// forAnyActionType: wait for any of the specified types
			if (wait.forAnyActionType !== undefined && wait.forAnyActionType.length > 0) {
				const found = actions.find((a) => wait.forAnyActionType!.includes(a.type as ActionType))
				if (found) {
					for (const action of actions) {
						recordedActionIds.push(action.id)
					}
					return { success: true, recordedActionIds }
				}
			}

			// forAction: wait for an action matching custom criteria
			if (wait.forAction !== undefined) {
				const found = actions.find((a) => matchesActionCriteria(a, wait.forAction!))
				if (found) {
					for (const action of actions) {
						recordedActionIds.push(action.id)
					}
					return { success: true, recordedActionIds }
				}
			}

			// No condition met yet, wait before polling again
			await sleep(POLL_INTERVAL)
		}

		// Timeout reached without condition being met
		return {
			success: false,
			recordedActionIds,
			error: `Wait condition not met within ${timeout}ms`
		}
	} catch (error) {
		return {
			success: false,
			recordedActionIds,
			error: error instanceof Error ? error.message : String(error)
		}
	}
}

/**
 * Check if an action matches the custom criteria.
 */
function matchesActionCriteria(
	action: RecordedAction,
	criteria: NonNullable<ScenarioWaitStep['wait']['forAction']>
): boolean {
	// Check type if specified
	if (criteria.type !== undefined && action.type !== criteria.type) {
		return false
	}

	// Check endpoint contains if specified
	if (criteria.endpointContains !== undefined) {
		if (!action.endpoint || !action.endpoint.includes(criteria.endpointContains)) {
			return false
		}
	}

	// Check data contains if specified (shallow equality)
	if (criteria.dataContains !== undefined) {
		const actionData = action.data as Record<string, unknown> | undefined
		if (!actionData) {
			return false
		}

		for (const [key, value] of Object.entries(criteria.dataContains)) {
			if (actionData[key] !== value) {
				return false
			}
		}
	}

	return true
}

/**
 * Sleep for the specified number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}
