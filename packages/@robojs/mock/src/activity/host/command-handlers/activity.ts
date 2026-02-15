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
		} else {
			record.activity_status = null
		}
	}

	return {
		outbound: [buildCommandResponse(parsed.cmd, parsed.nonce, {})]
	}
}
