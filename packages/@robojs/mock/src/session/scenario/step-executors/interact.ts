import type { Session } from '../../session.js'
import type {
	ScenarioInteractStep,
	ActionMetadata,
	DispatchButtonClickOptions,
	DispatchSelectMenuOptions,
	DispatchModalSubmitOptions,
	RecordedAction
} from '../../../types/index.js'
import type { StepExecutionContext, StepExecutorResult } from './dispatch.js'

/**
 * Execute an interact step by simulating component interactions.
 *
 * Supports:
 * - button: Click a button component
 * - select: Select option(s) from a select menu
 * - modal: Submit a modal form
 *
 * If no messageId is specified, attempts to find the most recent message
 * containing the specified custom_id.
 */
export async function executeInteractStep(
	session: Session,
	step: ScenarioInteractStep,
	context: StepExecutionContext
): Promise<StepExecutorResult> {
	const { interact } = step
	const recordedActionIds: string[] = []

	// Build metadata for action context
	const metadata: ActionMetadata = {
		scenarioId: context.scenarioId,
		runId: context.runId,
		stepIndex: context.stepIndex,
		nodeId: step.expectedNodeId
	}

	// Set action context before interaction
	session.setActionContext({ metadata })

	try {
		// Resolve message ID if not provided
		let messageId = interact.messageId
		if (!messageId) {
			messageId = findMessageWithComponent(session, interact.customId)
			if (!messageId) {
				return {
					success: false,
					recordedActionIds,
					error: `Could not find a message containing component with custom_id: ${interact.customId}`
				}
			}
		}

		switch (interact.componentType) {
			case 'button': {
				const options: DispatchButtonClickOptions = {
					customId: interact.customId,
					messageId
				}
				await session.dispatchButtonClick(options)
				break
			}

			case 'select': {
				if (!interact.selectValues || interact.selectValues.length === 0) {
					return {
						success: false,
						recordedActionIds,
						error: 'select interaction requires selectValues to be specified'
					}
				}
				const options: DispatchSelectMenuOptions = {
					customId: interact.customId,
					messageId,
					values: interact.selectValues
				}
				await session.dispatchSelectMenu(options)
				break
			}

			case 'modal': {
				if (!interact.modalFields || Object.keys(interact.modalFields).length === 0) {
					return {
						success: false,
						recordedActionIds,
						error: 'modal interaction requires modalFields to be specified'
					}
				}
				const options: DispatchModalSubmitOptions = {
					customId: interact.customId,
					fields: interact.modalFields,
					messageId
				}
				await session.dispatchModalSubmit(options)
				break
			}

			default:
				throw new Error(`Unknown component type: ${(interact as { componentType: string }).componentType}`)
		}

		// Collect action IDs recorded since step start
		const actions = session.recorder.getSince(context.startTimestamp)
		for (const action of actions) {
			recordedActionIds.push(action.id)
		}

		return {
			success: true,
			recordedActionIds
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
 * Find the most recent message containing a component with the specified custom_id.
 */
function findMessageWithComponent(session: Session, customId: string): string | undefined {
	// Get recent message_sent and interaction_response actions
	const actions = session.recorder.getAll()

	// Search from most recent to oldest
	for (let i = actions.length - 1; i >= 0; i--) {
		const action = actions[i]

		// Check message_sent actions
		if (action.type === 'message_sent') {
			if (messageContainsComponent(action, customId)) {
				const data = action.data as { id?: string }
				return data.id
			}
		}

		// Check interaction_response actions (for messages sent via interaction reply)
		if (action.type === 'interaction_response') {
			if (interactionResponseContainsComponent(action, customId)) {
				// For interaction responses, we need the message ID from the response data
				const data = action.data as { data?: { id?: string } }
				if (data.data?.id) {
					return data.data.id
				}
			}
		}
	}

	return undefined
}

/**
 * Check if a message_sent action contains a component with the specified custom_id.
 */
function messageContainsComponent(action: RecordedAction, customId: string): boolean {
	const data = action.data as { components?: unknown[] }
	return containsCustomId(data.components, customId)
}

/**
 * Check if an interaction_response action contains a component with the specified custom_id.
 */
function interactionResponseContainsComponent(action: RecordedAction, customId: string): boolean {
	const data = action.data as { data?: { components?: unknown[] } }
	return containsCustomId(data.data?.components, customId)
}

/**
 * Recursively check if a components array contains a component with the specified custom_id.
 */
function containsCustomId(components: unknown[] | undefined, customId: string): boolean {
	if (!Array.isArray(components)) {
		return false
	}

	for (const component of components) {
		if (typeof component !== 'object' || component === null) {
			continue
		}

		const comp = component as { custom_id?: string; components?: unknown[] }

		// Check this component
		if (comp.custom_id === customId) {
			return true
		}

		// Check nested components (action rows contain buttons/selects)
		if (comp.components && containsCustomId(comp.components, customId)) {
			return true
		}
	}

	return false
}
