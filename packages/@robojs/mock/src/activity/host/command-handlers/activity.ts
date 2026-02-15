import { buildCommandResponse } from '../rpc-envelope.js'
import type { InboundRpcMessage } from '../rpc-envelope.js'
import type { ActivitySessionRecord } from '../activity-session-record.js'
import type { ActivityHostManager, HandleInboundResult } from '../activity-host-manager.js'
import type { RpcCommandDefinition } from '../../schema/manifest-types.js'
import type { ActivityPresence } from '../activity-session-record.js'

/**
 * Activity commands: SET_ACTIVITY
 *
 * SET_ACTIVITY: Parse args.activity with presence fields and store in record.
 */
export function handleActivityCommands(
	parsed: InboundRpcMessage,
	record: ActivitySessionRecord,
	_manager: ActivityHostManager,
	_commandDef: RpcCommandDefinition
): HandleInboundResult {
	let responseActivity: Record<string, unknown> | null = null

	if (parsed.cmd === 'SET_ACTIVITY') {
		const activity = parsed.args?.activity as Record<string, unknown> | undefined
		if (activity) {
			record.activity_status = {
				details: activity.details as string | undefined,
				state: activity.state as string | undefined,
				timestamps: activity.timestamps as ActivityPresence['timestamps'],
				assets: activity.assets as ActivityPresence['assets'],
				buttons: activity.buttons as ActivityPresence['buttons']
			}
			// Response schema requires at minimum { name, type }.
			// SDK request payload omits name, so we synthesize it.
			responseActivity = {
				...activity,
				name: (typeof activity.name === 'string' && activity.name) ? activity.name : 'Mock Activity',
				type: typeof activity.type === 'number' ? activity.type : 0,
				application_id: record.application_id
			}
		} else {
			record.activity_status = null
			responseActivity = {
				name: 'Mock Activity',
				type: 0,
				application_id: record.application_id
			}
		}
	}

	return {
		outbound: [buildCommandResponse(parsed.cmd, parsed.nonce, responseActivity ?? {})]
	}
}
