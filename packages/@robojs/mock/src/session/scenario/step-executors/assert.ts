import type { Session } from '../../session.js'
import type { ScenarioAssertStep, ScenarioAssertionResult, RecordedAction } from '../../../types/index.js'
import type { StepExecutionContext, StepExecutorResult } from './dispatch.js'

/**
 * Execute an assert step by checking recorded actions against expectations.
 *
 * Supports:
 * - actionRecorded: Verify that an action of this type was recorded
 * - messageSent: Check that a message was sent matching criteria
 * - interactionResponse: Check that an interaction response was sent
 */
export async function executeAssertStep(
	session: Session,
	step: ScenarioAssertStep,
	context: StepExecutionContext
): Promise<StepExecutorResult> {
	const { assert } = step
	const recordedActionIds: string[] = []

	try {
		// Assert steps should be able to validate outputs from prior steps.
		// Use the run start timestamp when available (falls back to step start for safety).
		const runStartedAt = session.scenarioManager.getRunState().startedAt ?? context.startTimestamp
		const actions = session.recorder.getSince(runStartedAt)
		for (const action of actions) {
			recordedActionIds.push(action.id)
		}

		// Check actionRecorded assertion
		if (assert.actionRecorded !== undefined) {
			const result = checkActionRecorded(actions, assert.actionRecorded)
			if (!result.passed) {
				return {
					success: false,
					recordedActionIds,
					error: result.failureReason,
					assertionResult: result
				}
			}
		}

		// Check messageSent assertion
		if (assert.messageSent !== undefined) {
			const result = checkMessageSent(actions, assert.messageSent)
			if (!result.passed) {
				return {
					success: false,
					recordedActionIds,
					error: result.failureReason,
					assertionResult: result
				}
			}
		}

		// Check interactionResponse assertion
		if (assert.interactionResponse !== undefined) {
			const result = checkInteractionResponse(actions, assert.interactionResponse)
			if (!result.passed) {
				return {
					success: false,
					recordedActionIds,
					error: result.failureReason,
					assertionResult: result
				}
			}
		}

		// All assertions passed
		return {
			success: true,
			recordedActionIds,
			assertionResult: {
				passed: true,
				description: 'All assertions passed'
			}
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
 * Check if an action of the specified type was recorded.
 */
function checkActionRecorded(
	actions: RecordedAction[],
	expectedType: NonNullable<ScenarioAssertStep['assert']['actionRecorded']>
): ScenarioAssertionResult {
	const found = actions.find((a) => a.type === expectedType)

	if (found) {
		return {
			passed: true,
			description: `Action type '${expectedType}' was recorded`,
			expected: expectedType,
			actual: expectedType
		}
	}

	const recordedTypes = [...new Set(actions.map((a) => a.type))]
	return {
		passed: false,
		description: `Expected action type '${expectedType}' was not recorded`,
		expected: expectedType,
		actual: recordedTypes.length > 0 ? recordedTypes : 'no actions recorded',
		failureReason: `Expected action type '${expectedType}' was not found. Recorded types: ${
			recordedTypes.join(', ') || 'none'
		}`
	}
}

/**
 * Check if a message was sent matching the specified criteria.
 */
function checkMessageSent(
	actions: RecordedAction[],
	matcher: NonNullable<ScenarioAssertStep['assert']['messageSent']>
): ScenarioAssertionResult {
	// Find message_sent actions
	const messageActions = actions.filter((a) => a.type === 'message_sent')

	if (messageActions.length === 0) {
		return {
			passed: false,
			description: 'No messages were sent',
			expected: matcher,
			actual: 'no messages',
			failureReason: 'No message_sent actions were recorded'
		}
	}

	// Check each message against criteria
	for (const action of messageActions) {
		const data = action.data as { content?: string; embeds?: unknown[]; components?: unknown[]; channel_id?: string }

		// Check contentContains
		if (matcher.contentContains !== undefined) {
			if (!data.content || !data.content.includes(matcher.contentContains)) {
				continue // Try next message
			}
		}

		// Check contentMatches (regex)
		if (matcher.contentMatches !== undefined) {
			try {
				const regex = new RegExp(matcher.contentMatches)
				if (!data.content || !regex.test(data.content)) {
					continue // Try next message
				}
			} catch {
				return {
					passed: false,
					description: 'Invalid regex pattern',
					expected: matcher.contentMatches,
					failureReason: `Invalid regex pattern: ${matcher.contentMatches}`
				}
			}
		}

		// Check hasEmbeds
		if (matcher.hasEmbeds !== undefined) {
			const embedCount = Array.isArray(data.embeds) ? data.embeds.length : 0
			if (embedCount < matcher.hasEmbeds) {
				continue // Try next message
			}
		}

		// Check hasComponents
		if (matcher.hasComponents !== undefined) {
			const componentCount = Array.isArray(data.components) ? data.components.length : 0
			if (componentCount < matcher.hasComponents) {
				continue // Try next message
			}
		}

		// Check channelId
		if (matcher.channelId !== undefined) {
			if (data.channel_id !== matcher.channelId) {
				continue // Try next message
			}
		}

		// All criteria matched
		return {
			passed: true,
			description: 'Message matching criteria was sent',
			expected: matcher,
			actual: data
		}
	}

	// No message matched all criteria
	return {
		passed: false,
		description: 'No message matched all criteria',
		expected: matcher,
		actual: messageActions.map((a) => a.data),
		failureReason: `Found ${messageActions.length} message(s) but none matched all criteria`
	}
}

/**
 * Check if an interaction response was sent matching the specified criteria.
 */
function checkInteractionResponse(
	actions: RecordedAction[],
	matcher: NonNullable<ScenarioAssertStep['assert']['interactionResponse']>
): ScenarioAssertionResult {
	// Find interaction_response actions
	const responseActions = actions.filter((a) => a.type === 'interaction_response')

	if (responseActions.length === 0) {
		return {
			passed: false,
			description: 'No interaction responses were sent',
			expected: matcher,
			actual: 'no responses',
			failureReason: 'No interaction_response actions were recorded'
		}
	}

	// Check each response against criteria
	for (const action of responseActions) {
		const data = action.data as {
			type?: number
			data?: { content?: string; flags?: number }
		}

		// Check responseType
		if (matcher.responseType !== undefined) {
			if (data.type !== matcher.responseType) {
				continue // Try next response
			}
		}

		// Check contentContains
		if (matcher.contentContains !== undefined) {
			const content = data.data?.content
			if (!content || !content.includes(matcher.contentContains)) {
				continue // Try next response
			}
		}

		// Check isEphemeral (flag 64)
		if (matcher.isEphemeral !== undefined) {
			const isEphemeral = ((data.data?.flags ?? 0) & 64) !== 0
			if (isEphemeral !== matcher.isEphemeral) {
				continue // Try next response
			}
		}

		// All criteria matched
		return {
			passed: true,
			description: 'Interaction response matching criteria was sent',
			expected: matcher,
			actual: data
		}
	}

	// No response matched all criteria
	return {
		passed: false,
		description: 'No interaction response matched all criteria',
		expected: matcher,
		actual: responseActions.map((a) => a.data),
		failureReason: `Found ${responseActions.length} response(s) but none matched all criteria`
	}
}
