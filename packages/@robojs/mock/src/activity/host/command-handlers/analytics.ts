import { buildCommandResponse } from '../rpc-envelope.js'
import type { InboundRpcMessage } from '../rpc-envelope.js'
import type { ActivitySessionRecord } from '../activity-session-record.js'
import type { ActivityHostManager, HandleInboundResult } from '../activity-host-manager.js'
import type { RpcCommandDefinition } from '../../schema/manifest-types.js'

/**
 * Analytics command handlers. No-op, always accept.
 */
export function handleAnalyticsCommands(
	parsed: InboundRpcMessage,
	_record: ActivitySessionRecord,
	_manager: ActivityHostManager,
	_commandDef: RpcCommandDefinition
): HandleInboundResult {
	// SEND_ANALYTICS_EVENT and CAPTURE_LOG are both no-ops
	return {
		outbound: [buildCommandResponse(parsed.cmd, parsed.nonce, {})]
	}
}
