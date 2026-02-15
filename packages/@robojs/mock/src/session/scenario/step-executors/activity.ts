import type { Session } from '../../session.js'
import type {
	ScenarioActivityStep,
	ScenarioActivityLaunchPayload,
	ScenarioActivityRpcPayload,
	ScenarioActivityWaitEventPayload,
	ScenarioActivitySetMappingsPayload,
	ActionMetadata
} from '../../../types/index.js'
import type { StepExecutionContext, StepExecutorResult } from './dispatch.js'
import { getActivityHostManager } from '../../../activity/index.js'

/** Default timeout for wait_event (5 seconds) */
const DEFAULT_WAIT_TIMEOUT = 5000
const POLL_INTERVAL = 100

export async function executeActivityStep(
	session: Session,
	step: ScenarioActivityStep,
	context: StepExecutionContext
): Promise<StepExecutorResult> {
	const { activity } = step
	const recordedActionIds: string[] = []

	// Set action context
	const metadata: ActionMetadata = {
		scenarioId: context.scenarioId,
		runId: context.runId,
		stepIndex: context.stepIndex,
		nodeId: step.expectedNodeId
	}
	session.setActionContext({ metadata })

	try {
		switch (activity.kind) {
			case 'launch': {
				const payload = activity.payload as ScenarioActivityLaunchPayload
				const hostManager = getActivityHostManager()

				hostManager.launchActivity({
					session_id: session.id,
					application_id: payload.application_id,
					guild_id: payload.guild_id ?? null,
					channel_id: payload.channel_id ?? null,
					launch_url: payload.launch_url
				})

				// If URL mappings provided, apply them
				if (payload.url_mappings) {
					const { getProxyConfigStore } = await import('../../../core/activity-proxy/config-store.js')
					const configStore = getProxyConfigStore()
					configStore.updateMappings(session.id, payload.url_mappings)
				}

				break
			}

			case 'rpc': {
				const payload = activity.payload as ScenarioActivityRpcPayload
				const hostManager = getActivityHostManager()
				const record = hostManager.getRecord(session.id)

				if (!record) {
					throw new Error('No active Activity in session - launch an Activity first')
				}

				// Record inbound
				session.recorder.record('activity_rpc_inbound', {
					instance_id: record.instance_id,
					message: payload.message
				})

				const result = hostManager.handleInbound(session.id, payload.message)

				if (result.outbound.length > 0) {
					session.recorder.record('activity_rpc_outbound', {
						instance_id: record.instance_id,
						messages: result.outbound
					})
				}

				break
			}

			case 'wait_event': {
				const payload = activity.payload as ScenarioActivityWaitEventPayload
				const timeout = step.timeout ?? DEFAULT_WAIT_TIMEOUT
				const startTime = Date.now()

				while (Date.now() - startTime < timeout) {
					const actions = session.recorder.getSince(context.startTimestamp)
					const found = actions.find((a) => {
						if (a.type !== payload.action_type) return false

						if (payload.data_contains) {
							const actionData = a.data as Record<string, unknown> | undefined
							if (!actionData) return false
							for (const [key, value] of Object.entries(payload.data_contains)) {
								if (actionData[key] !== value) return false
							}
						}

						return true
					})

					if (found) {
						for (const action of actions) {
							recordedActionIds.push(action.id)
						}
						return { success: true, recordedActionIds }
					}

					await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL))
				}

				return {
					success: false,
					recordedActionIds,
					error: `Activity wait_event condition (${payload.action_type}) not met within ${timeout}ms`
				}
			}

			case 'set_mappings': {
				const payload = activity.payload as ScenarioActivitySetMappingsPayload
				const { getProxyConfigStore } = await import('../../../core/activity-proxy/config-store.js')
				const configStore = getProxyConfigStore()
				configStore.updateMappings(session.id, payload.url_mappings)
				break
			}

			default:
				throw new Error(`Unknown activity step kind: ${(activity as { kind: string }).kind}`)
		}

		// Collect recorded action IDs
		const actions = session.recorder.getSince(context.startTimestamp)
		for (const action of actions) {
			recordedActionIds.push(action.id)
		}

		return { success: true, recordedActionIds }
	} catch (error) {
		return {
			success: false,
			recordedActionIds,
			error: error instanceof Error ? error.message : String(error)
		}
	}
}
