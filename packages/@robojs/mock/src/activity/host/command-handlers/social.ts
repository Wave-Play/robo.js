import { buildCommandResponse } from '../rpc-envelope.js'
import type { InboundRpcMessage } from '../rpc-envelope.js'
import type { ActivitySessionRecord } from '../activity-session-record.js'
import type { ActivityHostManager, HandleInboundResult } from '../activity-host-manager.js'
import type { RpcCommandDefinition } from '../../schema/manifest-types.js'

/**
 * Social command handlers.
 * Reads from the session's relationship state store.
 */
export function handleSocialCommands(
	parsed: InboundRpcMessage,
	record: ActivitySessionRecord,
	_manager: ActivityHostManager,
	_commandDef: RpcCommandDefinition
): HandleInboundResult {
	switch (parsed.cmd) {
		case 'GET_RELATIONSHIPS':
			return {
				outbound: [
					buildCommandResponse(parsed.cmd, parsed.nonce, {
						relationships: record.relationship_state.relationships
					})
				]
			}

		case 'INVITE_USER_EMBEDDED':
			// Success -- actual invite handling is UI-only
			return { outbound: [buildCommandResponse(parsed.cmd, parsed.nonce, {})] }

		default:
			return { outbound: [buildCommandResponse(parsed.cmd, parsed.nonce, {})] }
	}
}
